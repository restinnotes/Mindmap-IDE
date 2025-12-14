import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs/promises'
import * as path from 'path'
// 1. 引入 OpenRouter 依赖
import OpenAI from 'openai'
require('dotenv').config() // 用于加载 .env 文件

// 定义文件节点结构
interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

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

  // === 2. 核心：AI 总结处理器 (使用 OpenRouter) ===
  ipcMain.handle('ai:summarize', async (_, codeContent) => {
    try {
      const apiKey = process.env.OPENROUTER_API_KEY

      if (!apiKey) {
        return "❌ 错误: 未在 .env 文件中配置 OPENROUTER_API_KEY。"
      }

      const openai = new OpenAI({
        apiKey: apiKey,
        // 🚨 关键配置：指定 OpenRouter 的 Base URL
        baseURL: "https://openrouter.ai/api/v1",
      })

      // 使用 OpenRouter 上的模型，例如 gpt-4o-mini 或 Llama
      const modelToUse = "openai/gpt-4o-mini"

      const systemPrompt = `
        你是一位资深架构师。请简要总结以下代码的核心逻辑。
        要求：
        1. 第一行用一句话概括功能。
        2. 接着用 Bullet Points 列出 2-3 个关键技术点或逻辑流程。
        3. 用中文回答。
      `

      const response = await openai.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `代码：\n${codeContent.substring(0, 8000)}` }
        ],
        temperature: 0.1, // 降低温度，获取更稳定的总结
      })

      return response.choices[0].message.content || "总结失败。"

    } catch (error) {
      console.error("AI Error:", error)
      return `AI 请求失败: ${error}`
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

  // 恢复严格 CSP (离线化后不再需要 CDN 权限)
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