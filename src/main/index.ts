import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs/promises'
import * as path from 'path'
import OpenAI from 'openai' // 确保安装了 openai: npm install openai
require('dotenv').config()  // 确保安装了 dotenv: npm install dotenv

// 定义文件节点结构
interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

// 递归读取目录的函数
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

  // === 3. 文件原子分析处理器 (Gemini Fix 版) ===
  ipcMain.handle('ai:summarize', async (_, codeContent) => {
    try {
      const apiKey = process.env.SILICONFLOW_API_KEY
      if (!apiKey) return JSON.stringify({ overview: "❌ 错误: 未配置 .env Key", symbols: [] })

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.siliconflow.cn/v1",
        // 🚨 关键修复：OpenRouter 免费模型必须带这两个 Header，否则报 Provider Error
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/LogicHorizon/Desktop", // 任意 URL 均可
          "X-Title": "Logic Horizon IDE", // 你的应用名
        }
      })

      // 使用 Gemini 2.0 Flash 免费版
      const modelToUse = "Qwen/Qwen2.5-Coder-7B-Instruct"

      const systemPrompt = `
        你是一个代码分析引擎。请分析用户提供的代码，并输出严格的 JSON 格式。

        输出结构要求如下 (不要包含 Markdown 标记，只返回纯 JSON):
        {
          "overview": "一句话概括文件功能，接着列出2个关键点。",
          "symbols": [
            {
              "name": "函数或类名 (例如 processData)",
              "type": "Function" 或 "Class" 或 "Interface",
              "description": "简短的一句话中文描述，说明它的作用"
            }
          ]
        }
      `

      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `代码内容：\n${codeContent.substring(0, 30000)}` } // Gemini 支持超长上下文
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })

      return response.choices[0].message.content || "{}"

    } catch (error) {
      console.error("AI Error:", error)
      return JSON.stringify({ overview: `AI 请求失败: ${error}`, symbols: [] })
    }
  })

  // === 4. 文件夹总结处理器 ===
  ipcMain.handle('ai:summarizeFolder', async (_, folderStructure: string) => {
    try {
      const apiKey = process.env.SILICONFLOW_API_KEY
      if (!apiKey) return "❌ 错误: 未配置 API Key。"

      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://api.siliconflow.cn/v1",
        // 🚨 同样加上 Headers
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/LogicHorizon/Desktop",
          "X-Title": "Logic Horizon IDE",
        }
      })

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