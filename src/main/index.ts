import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs/promises'
import * as path from 'path'
import OpenAI from 'openai'
require('dotenv').config()

// 定义文件节点结构
interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

// AI 分析结果结构
interface AIAnalysisResult {
  overview: string;
  technical_depth?: string;
  exports?: string;
  symbols: Array<any>;
}

// 🧠 全局内存缓存
const fileAnalysisCache = new Map<string, AIAnalysisResult>();
const SILICONFLOW_API_BASE = "https://api.siliconflow.cn/v1";

// === 辅助：递归获取所有子文件 (Flatten) ===
async function getAllFilesRecursively(dirPath: string): Promise<string[]> {
  let results: string[] = [];
  try {
    const list = await fs.readdir(dirPath);
    for (const file of list) {
      // 过滤掉无关文件夹，防止无限递归爆炸
      if (['node_modules', '.git', 'dist', 'out', '.vscode', 'build'].includes(file)) continue;

      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat && stat.isDirectory()) {
        // 递归钻取
        const res = await getAllFilesRecursively(filePath);
        results = results.concat(res);
      } else {
        // 只关心代码文件
        const ext = path.extname(file).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.java', '.go'].includes(ext)) {
          results.push(filePath);
        }
      }
    }
  } catch (e) {
    console.error(`无法读取目录 ${dirPath}:`, e);
  }
  return results;
}

// === 核心工具函数：分析单个文件 ===
async function generateFileSummary(codeContent: string, apiKey: string): Promise<AIAnalysisResult | null> {
  try {
    const openai = new OpenAI({ apiKey, baseURL: SILICONFLOW_API_BASE })
    // 使用通用指令模型，避免 Coder 模型的 400 问题
    const modelToUse = "Qwen/Qwen2.5-7B-Instruct"

    const systemPrompt = `
      你是一个代码分析引擎。请深度分析代码。
      必须输出纯 JSON 格式。严禁使用 Markdown (不要用 \`\`\`json)。
      JSON 格式要求：
      {
        "overview": "一句话概括功能",
        "technical_depth": "核心实现逻辑",
        "exports": "导出的主要接口",
        "symbols": []
      }
    `
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `代码:\n${codeContent.substring(0, 15000)}` }
      ],
      temperature: 0.1,
    })

    let content = response.choices[0].message.content || "{}";
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(content);
  } catch (e) {
    console.error("❌ 单文件分析失败:", e);
    return null;
  }
}

// 递归读取目录 (UI 树状结构用)
async function readDirectory(dirPath: string): Promise<FileNode | null> {
  const name = path.basename(dirPath)
  const id = dirPath
  try {
    const stats = await fs.stat(dirPath)
    if (stats.isDirectory()) {
      if (['node_modules', '.git', 'out', 'dist', '.vscode', '.idea'].includes(name) || name.startsWith('.')) {
        return null
      }
      const childrenNames = await fs.readdir(dirPath)
      const childrenPromises = childrenNames.map(childName => readDirectory(path.join(dirPath, childName)))
      const children = (await Promise.all(childrenPromises)).filter((node): node is FileNode => node !== null)
      children.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1
        if (a.type === 'file' && b.type === 'folder') return 1
        return a.name.localeCompare(b.name)
      })
      return { id, name, type: 'folder', children }
    } else if (stats.isFile()) {
      const ext = path.extname(name).toLowerCase()
      if (['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.py', '.java', '.go', '.rs'].includes(ext)) {
        return { id, name, type: 'file' }
      }
    }
  } catch (error) { console.error(error) }
  return null
}

function setupIpcHandlers() {
  ipcMain.handle('dialog:openFolder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    if (canceled || filePaths.length === 0) return null
    return await readDirectory(filePaths[0])
  })

  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try { return await fs.readFile(filePath, 'utf-8') } catch (e) { return `Error: ${e}` }
  })

  // === 3. 文件原子分析 ===
  ipcMain.handle('ai:summarize', async (_, payload: { code: string, filePath: string }) => {
    const { code, filePath } = payload;
    const apiKey = process.env.SILICONFLOW_API_KEY
    if (!apiKey) return JSON.stringify({ overview: "❌ 未配置 Key", symbols: [] })

    const result = await generateFileSummary(code, apiKey);

    if (result) {
      if (filePath) fileAnalysisCache.set(filePath, result);
      return JSON.stringify(result);
    } else {
      return JSON.stringify({ overview: "AI 分析失败", symbols: [] });
    }
  })

  // === 4. 文件夹总结 (深度递归 Map -> Reduce) ===
  ipcMain.handle('ai:summarizeFolder', async (_, folderPath: string) => {
    try {
      const apiKey = process.env.SILICONFLOW_API_KEY
      if (!apiKey) return "❌ 错误: 未配置 SILICONFLOW_API_KEY。"

      // 🚨 1. 递归获取所有子文件 (Flatten Tree)
      // 以前这里只读一层，现在会把底下所有层级的文件都挖出来
      let allFiles = await getAllFilesRecursively(folderPath);

      // 安全限制：如果文件太多，只取前 30 个，防止 tokens 爆炸
      if (allFiles.length > 30) {
        console.log(`⚠️ 文件过多 (${allFiles.length})，截取前 30 个分析`);
        allFiles = allFiles.slice(0, 30);
      }

      if (allFiles.length === 0) return "⚠️ 该文件夹下没有可分析的代码文件。";

      let contextPrompt = `模块路径: ${path.basename(folderPath)}\n包含了以下文件的深度分析:\n\n`;
      let debugLog = "";

      // 🚨 2. 并发分析 (Map)
      const analysisPromises = allFiles.map(async (fullPath) => {
        // 计算相对路径 (例如: renderer/src/App.tsx)，这对 AI 理解架构至关重要
        const relativePath = path.relative(folderPath, fullPath);

        // A. 查缓存
        if (fileAnalysisCache.has(fullPath)) {
          return { fileName: relativePath, data: fileAnalysisCache.get(fullPath), source: 'cache' };
        }

        // B. 现场分析
        try {
          const fileContent = await fs.readFile(fullPath, 'utf-8');
          // 再次过滤大文件
          if (fileContent.length > 30000) return { fileName: relativePath, data: null, error: 'Too large' };

          const data = await generateFileSummary(fileContent, apiKey);
          if (data) {
            fileAnalysisCache.set(fullPath, data);
            return { fileName: relativePath, data, source: 'fresh' };
          }
        } catch (e) {
          return { fileName: relativePath, data: null, error: e.message };
        }
        return { fileName: relativePath, data: null, error: 'Unknown' };
      });

      const results = await Promise.all(analysisPromises);

      // 3. 构建 Prompt (Reduce Input)
      let validCount = 0;
      for (const res of results) {
        if (res.data) {
          validCount++;
          contextPrompt += `=== 文件: ${res.fileName} ===\n`; // 注意这里用的是相对路径
          contextPrompt += `功能: ${res.data.overview}\n`;
          contextPrompt += `导出: ${res.data.exports}\n`;
          contextPrompt += `细节: ${res.data.technical_depth}\n\n`;
        } else {
          debugLog += `- ${res.fileName}: 分析失败 (${res.error})\n`;
        }
      }

      if (validCount === 0) {
        return `⚠️ 递归分析失败，无法获取任何子文件信息。\n${debugLog}`;
      }

      // 4. 发送给 AI (Reduce)
      const openai = new OpenAI({ apiKey, baseURL: SILICONFLOW_API_BASE })
      const modelToUse = "THUDM/glm-4-9b-chat"

      const systemPrompt = `
        你是一位高级架构师。请根据提供的项目文件元数据（文件名均为相对于模块根目录的路径），生成模块架构说明书。

        【要求】
        1. 使用纯文本格式 (不要用 Markdown 符号)。
        2. 重点分析目录结构层级和文件间的协作关系。

        回答结构：
        [模块核心定位]
        ...
        [目录结构与职责] (分析子文件夹的作用)
        ...
        [关键调用链]
        ...
      `

      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contextPrompt.substring(0, 30000) }
        ],
        temperature: 0.1,
      })

      return response.choices[0].message.content || "总结失败。";

    } catch (error) {
      console.error("Folder Summary Error:", error)
      return `总结失败: ${error.message}`
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800, show: false, autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"] } })
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' } })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  setupIpcHandlers()
  createWindow()
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })