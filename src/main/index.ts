import { app, shell, BrowserWindow, ipcMain, dialog, session } from 'electron' // 👈 关键：引入 session
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs/promises'
import * as path from 'path'

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
      // 忽略不需要的文件夹
      if (['node_modules', '.git', 'out', 'dist', '.vscode', '.idea'].includes(name) || name.startsWith('.')) {
        return null
      }

      const childrenNames = await fs.readdir(dirPath)
      const childrenPromises = childrenNames.map(childName =>
        readDirectory(path.join(dirPath, childName))
      )

      const children = (await Promise.all(childrenPromises))
        .filter((node): node is FileNode => node !== null)

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
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })
    if (canceled || filePaths.length === 0) return null
    return await readDirectory(filePaths[0])
  })

  // 2. 读取文件内容 (带日志，方便你调试)
  ipcMain.handle('fs:readFile', async (_, filePath) => {
    console.log(`正在读取文件: ${filePath}`) // 👈 调试点
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (e) {
      console.error(`读取失败: ${e}`)
      return `Error reading file: ${e}`
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // === 🚨 核心修复：允许 Monaco Editor 下载 CDN 资源 ===
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; img-src 'self' data:;"
]
      }
    })
  })
  // =================================================

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})