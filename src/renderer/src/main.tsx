import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// 🚨 修复点 1：引入 monaco 实例
// 这个导入提供了 monaco 对象，解决了 loader.config({ monaco: monaco }) 的红标问题
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

// ----------------------------------------------------
// Monaco Editor 离线配置
// ----------------------------------------------------

// 2. 导入所有需要的 Worker (使用 Vite 的 ?worker 语法)
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// 3. 配置 Monaco 全局环境，指定 Worker 的获取方式
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new JsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HtmlWorker()
    }
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker()
    }
    // 默认返回核心编辑器 Worker
    return new EditorWorker()
  },
}

// 4. 告诉 @monaco-editor/react 库我们正在使用本地的 monaco-editor 实例
//    现在 monaco 变量已经定义，不再报错
loader.config({ monaco: monaco })

// ----------------------------------------------------
// 渲染 React App
// ----------------------------------------------------

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)