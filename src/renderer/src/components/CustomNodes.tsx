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

// === 2. 文件节点 (集成 AI 总结逻辑) ===
export const FileNode = ({ data }: NodeProps) => {
  const [expanded, setExpanded] = useState(false)
  const [code, setCode] = useState('// Loading...')
  const [loading, setLoading] = useState(false)

  // 🚨 新增 AI 状态：存储总结结果和加载状态
  const [summary, setSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // 处理节点展开/折叠的逻辑
  const handleToggle = async () => {
    if (!expanded && code === '// Loading...') {
      setLoading(true)
      try {
        const content = await window.api.readFile(data.fullPath)
        setCode(content)
      } catch (err) {
        setCode('Error loading file.')
      }
      setLoading(false)
    }
    setExpanded(!expanded)
  }

  // 🚨 新增：调用 AI 总结的函数
  const handleSummarize = async () => {
    // 检查代码是否已加载且内容有效，并防止重复点击
    if (!code || code.length < 10 || aiLoading) return

    setAiLoading(true)
    setSummary(null) // 清空旧总结
    try {
      // 调用我们在 preload 中暴露的 IPC 处理器
      const result = await window.api.summarize(code)
      setSummary(result)
    } catch (error) {
      setSummary("AI 响应失败，请检查网络或 Key。")
    }
    setAiLoading(false)
  }

  return (
    <div
      style={{
        border: expanded ? '2px solid #646cff' : '1px solid #777',
        borderRadius: '8px',
        background: '#1e1e1e',
        color: '#ddd',
        minWidth: expanded ? '600px' : '200px', // 展开变宽
        transition: 'all 0.3s ease',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
        zIndex: expanded ? 1000 : undefined // 动态 zIndex 修复遮挡
      }}
    >
      <Handle type="target" position={Position.Left} style={{ top: 20 }} />

      {/* 头部标题栏 */}
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
        <div className="nodrag"> {/* 阻止在编辑器内拖拽 */}
          <div style={{ height: '400px', position: 'relative' }}>
             {loading ? (
                <div style={{ padding: 20 }}>Reading file...</div>
             ) : (
               <Editor
                  height="100%"
                  defaultLanguage={data.label.endsWith('json') ? 'json' : 'typescript'} // 简单判断下语言
                  theme="vs-dark"
                  value={code}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    automaticLayout: true
                  }}
               />
             )}
          </div>

          {/* 🚨 AI 总结功能区 (核心) */}
          <div style={{
            padding: '12px',
            borderTop: '1px solid #444',
            background: '#252526',
            borderRadius: '0 0 6px 6px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#aaa', fontSize: '12px' }}>AI INSIGHTS</span>
                <button
                  onClick={handleSummarize} // 绑定新的处理函数
                  disabled={aiLoading} // 禁用防止多次提交
                  style={{
                    background: aiLoading ? '#555' : 'linear-gradient(to right, #646cff, #9f5afd)',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    cursor: aiLoading ? 'default' : 'pointer',
                    opacity: aiLoading ? 0.7 : 1
                  }}
                >
                  {aiLoading ? '✨ Thinking...' : '✨ AI Summarize'} {/* 根据状态显示文本 */}
                </button>
            </div>

            {/* 🚨 总结结果显示区域 */}
            {summary && (
              <div style={{
                marginTop: '10px',
                padding: '10px',
                background: '#333',
                borderRadius: '4px',
                fontSize: '13px',
                lineHeight: '1.6',
                color: '#e0e0e0',
                borderLeft: '3px solid #9f5afd', // 紫色左边框
                whiteSpace: 'pre-wrap' // 保持 LLM 的换行格式
              }}>
                {summary}
              </div>
            )}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ top: 20 }} />
    </div>
  )
}