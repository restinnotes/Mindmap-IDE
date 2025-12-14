import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs/promises'
import * as path from 'path'

// 定义文件节点结构
interface FileNode {
  id: string; // 绝对路径
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

      // 等待所有子节点读取完毕，并过滤掉 null
      const children = (await Promise.all(childrenPromises))
        .filter((node): node is FileNode => node !== null)

      // 排序：文件夹在前，文件在后
      children.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1
        if (a.type === 'file' && b.type === 'folder') return 1
        return a.name.localeCompare(b.name)
      })

      return { id, name, type: 'folder', children }

    } else if (stats.isFile()) {
      // 只显示常见代码文件
      const ext = path.extname(name).toLowerCase()
      // 如果你想支持更多格式，在这里添加
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
  // 1. 打开文件夹对话框
  ipcMain.handle('dialog:openFolder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })

    if (canceled || filePaths.length === 0) return null

    // 开始读取
    return await readDirectory(filePaths[0])
  })

  // 2. 读取文件内容
  ipcMain.handle('fs:readFile', async (_, filePath) => {
    try {
      return await fs.readFile(filePath, 'utf-8')
    } catch (e) {
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

  // !!! 必须在这里调用，注册 IPC !!!
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