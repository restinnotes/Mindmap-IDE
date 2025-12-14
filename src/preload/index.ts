import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 API
const api = {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  summarize: (code: string) => ipcRenderer.invoke('ai:summarize', code),
  // 🚨 新增接口：文件夹总结
  summarizeFolder: (structure: string) => ipcRenderer.invoke('ai:summarizeFolder', structure)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api) // 暴露我们的 api 到 window.api
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}