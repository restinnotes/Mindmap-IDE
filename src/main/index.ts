import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron'
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

// 硅基流动 Base URL (国内稳定服务商)
const SILICONFLOW_API_BASE = "https://api.siliconflow.cn/v1";

// 递归读取目录的函数 (保持不变)
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
  } catch (error) {
    console.error(`Error reading ${dirPath}:`, error)
  }
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
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (e) {
      return `Error reading file: ${e}`
    }
  })

  // === 3. 文件原子分析处理器 (Level 3: 深度技术画像 + 清洗) ===
  ipcMain.handle('ai:summarize', async (_, codeContent) => {
    try {
      const apiKey = process.env.SILICONFLOW_API_KEY
      if (!apiKey) return JSON.stringify({ overview: "❌ 错误: 未配置 SILICONFLOW_API_KEY", symbols: [] })

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: SILICONFLOW_API_BASE,
      })

      // Qwen Coder 免费模型
      const modelToUse = "Qwen/Qwen2.5-Coder-7B-Instruct"

      // 🚨 深度 Prompt：提取用于上层架构分析的元数据
      const systemPrompt = `
        你是一位资深架构师。请深度分析用户提供的代码，并提取关键的架构元数据。
        请输出严格的纯 JSON 格式（不要Markdown标记）。

        JSON 结构要求：
        {
          "overview": "一句话概括文件功能（用于UI展示，通俗易懂）。",
          "technical_depth": "详细描述实现原理、关键算法或使用的设计模式（用于上层架构分析）。",
          "exports": "列出该文件对外导出的核心能力或接口（简要列表字符串）。",
          "symbols": [
            {
              "name": "函数/类名",
              "type": "Function/Class/Const",
              "description": "技术性描述：输入什么，处理什么，输出什么。"
            }
          ]
        }

        注意：
        1. overview 给小白看，technical_depth 给CTO看。
        2. 不要包含 markdown 代码块标记。
      `

      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `代码内容:\n${codeContent.substring(0, 20000)}` }
        ],
        temperature: 0.1,
      })

      let content = response.choices[0].message.content || "{}";

      // 🚨 核心修复：自动清洗 Markdown 代码块标记 (解决 JSON 解析失败)
      content = content.replace(/^```json\s*/g, "").replace(/^```\s*/g, "").replace(/\s*```$/g, "").trim();

      // 验证 JSON
      try {
        JSON.parse(content);
      } catch (e) {
        console.error("AI 返回了非 JSON 内容:", content);
        return JSON.stringify({
            overview: `AI 分析结果格式异常，无法解析。原始内容开头: ${content.substring(0, 50)}...`,
            technical_depth: "解析失败",
            exports: "无",
            symbols: []
        });
      }

      return content;

    } catch (error) {
      console.error("AI Error:", error)
      // 返回结构化的错误信息，确保前端能解析
      return JSON.stringify({ overview: `AI 请求失败: ${error.message}`, symbols: [] })
    }
  })

  // === 4. 文件夹总结处理器 (Level 2: 架构总结) ===
  ipcMain.handle('ai:summarizeFolder', async (_, folderStructure: string) => {
    try {
      const apiKey = process.env.SILICONFLOW_API_KEY
      if (!apiKey) return "❌ 错误: 未配置 SILICONFLOW_API_KEY。"

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: SILICONFLOW_API_BASE,
      })

      // 使用 GLM-4 免费模型，专注于架构推理
      const modelToUse = "THUDM/glm-4-9b-chat"

      const systemPrompt = `
        你是一位资深软件架构师。你正在分析一个项目模块的结构。
        根据提供的文件和子文件夹的名称列表，请推断并总结这个模块的核心功能。
        要求：
        1. 第一行用一句话概括模块功能（作为标题）。
        2. 接着用 Bullet Points 列出 2-3 个关键职责或组件。
        3. 用中文回答。
      `

      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `模块结构：\n${folderStructure}` }
        ],
        temperature: 0.1,
      })

      return response.choices[0].message.content || "总结失败。"

    } catch (error) {
      console.error("AI Folder Summary Error:", error)
      return `AI 文件夹总结请求失败: ${error}`
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200, height: 800, show: false, autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 恢复严格 CSP
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"]
      }
    })
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  setupIpcHandlers()
  createWindow()
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })