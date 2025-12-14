import { useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import Editor from '@monaco-editor/react'

// === 1. 文件夹节点 (简单的深色方块) ===
export const FolderNode = ({ data }: NodeProps) => {
  return (
    <div style={{
      padding: '10px 20px',
      border: '2px solid #555',
      borderRadius: '6px',
      background: '#2b2b2b',
      color: '#fff',
      minWidth: '150px',
      textAlign: 'center',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#777' }} />
      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>📂 {data.label}</div>
      <Handle type="source" position={Position.Right} style={{ background: '#777' }} />
    </div>
  )
}

// === 2. 文件节点 (核心交互组件) ===
export const FileNode = ({ data }: NodeProps) => {
  const [expanded, setExpanded] = useState(false)
  const [code, setCode] = useState('// Loading...')
  const [loading, setLoading] = useState(false)

  // 处理节点展开/折叠的逻辑
  const handleToggle = async () => {
    // 如果是展开操作，且代码还没加载过，则从主进程读取文件内容
    if (!expanded && code === '// Loading...') {
      setLoading(true)
      try {
        // 调用我们之前在 preload 里写的 window.api.readFile
        const content = await window.api.readFile(data.fullPath)
        setCode(content)
      } catch (err) {
        setCode('Error loading file.')
      }
      setLoading(false)
    }
    setExpanded(!expanded)
  }

  return (
    <div className="nodrag" style={{
      border: expanded ? '2px solid #646cff' : '1px solid #777',
      borderRadius: '8px',
      background: '#1e1e1e',
      color: '#ddd',
      minWidth: expanded ? '600px' : '200px', // 展开变宽
      transition: 'all 0.3s ease',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
    }}>
      <Handle type="target" position={Position.Left} style={{ top: 20 }} />

      {/* 头部标题栏 - 点击展开 */}
      <div
        onClick={handleToggle}
        style={{
          padding: '10px 15px',
          background: '#2d2d2d',
          borderBottom: expanded ? '1px solid #444' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          borderRadius: expanded ? '6px 6px 0 0' : '6px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📄</span>
          <span style={{ fontWeight: 'bold' }}>{data.label}</span>
        </div>
        <button style={{
          fontSize: '12px',
          padding: '4px 8px',
          borderRadius: '4px',
          border: '1px solid #555',
          background: 'transparent',
          color: '#aaa',
          cursor: 'pointer'
        }}>
          {expanded ? 'Collapse' : 'Code'}
        </button>
      </div>

      {/* 展开区域：代码编辑器 + AI 按钮 */}
      {expanded && (
        <div>
          <div style={{ height: '400px', position: 'relative' }}>
             {loading ? (
                <div style={{ padding: 20 }}>Reading file...</div>
             ) : (
               <Editor
                  height="100%"
                  defaultLanguage={data.label.endsWith('json') ? 'json' : 'typescript'} // 简单判断下语言
                  theme="vs-dark"
                  value={code}
                  // Monaco Editor 的配置，防止它干扰 React Flow 的缩放
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    automaticLayout: true
                  }}
               />
             )}
          </div>

          {/* AI 总结功能区 (MVP 阶段，点击只是弹窗提示) */}
          <div style={{
            padding: '12px',
            borderTop: '1px solid #444',
            background: '#252526',
            borderRadius: '0 0 6px 6px',
            textAlign: 'right'
          }}>
            <button style={{
              background: 'linear-gradient(to right, #646cff, #9f5afd)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} onClick={() => alert("AI Summarize logic goes here!")}>
              ✨ AI Summarize
            </button>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ top: 20 }} />
    </div>
  )
}