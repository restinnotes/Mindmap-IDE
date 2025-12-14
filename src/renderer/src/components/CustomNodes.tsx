import { useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import Editor from '@monaco-editor/react'

// 定义辅助函数：递归构建文件夹结构字符串
const buildStructureString = (children, depth = 0) => {
  let structure = '';
  const indent = '  '.repeat(depth); // 2个空格缩进

  if (!children || children.length === 0) {
    return `${indent} (空)\n`;
  }

  children.forEach(child => {
    // 假设 FileNode 已经有了 summary 字段 (MapReduce 的 Map 结果)
    const summaryText = child.summary ? ` - 职责: ${child.summary.split('\n')[0]}` : '';

    if (child.type === 'file') {
      structure += `${indent}📄 ${child.name}${summaryText}\n`;
    } else if (child.type === 'folder') {
      structure += `${indent}📁 ${child.name}/\n`;
      // 递归调用，获取子文件夹内容
      structure += buildStructureString(child.children, depth + 1);
    }
  });
  return structure;
};


// === 1. 文件夹节点 (新的智能组件) ===
export const FolderNode = ({ data }: NodeProps) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 文件夹总结逻辑
  const handleSummarize = async () => {
    setAiLoading(true);
    setSummary(null);

    // 1. 收集结构信息 (作为 Reduce 阶段的输入)
    // 注意：这里只发送名称和结构，不发送代码内容
    const structureString = buildStructureString(data.children);

    try {
      // 2. 调用新的 IPC 接口
      const result = await window.api.summarizeFolder(
        `模块名称: ${data.label}\n\n文件结构:\n${structureString}`
      );
      setSummary(result);
    } catch (error) {
      setSummary("AI 文件夹总结失败。");
    }
    setAiLoading(false);
  };

  return (
    <div style={{
      padding: '10px',
      border: '2px solid #646cff', // 文件夹使用亮色边框突出
      borderRadius: '8px',
      background: '#2b2b2b',
      color: '#fff',
      minWidth: '250px',
      textAlign: 'left',
      boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
      // 文件夹节点默认保持在中间层级
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#777' }} />

      {/* 头部标题 */}
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '10px' }}>
        📁 {data.label}
      </div>

      {/* 结构预览 (可选，显示孩子数量) */}
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>
        包含 {data.children ? data.children.length : 0} 个子项
      </div>

      {/* AI 总结功能区 */}
      <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
        <button
          onClick={handleSummarize}
          disabled={aiLoading}
          style={{
            background: aiLoading ? '#555' : 'linear-gradient(to right, #646cff, #9f5afd)',
            color: 'white', border: 'none', padding: '6px 12px',
            borderRadius: '4px', fontWeight: 'bold', cursor: aiLoading ? 'default' : 'pointer',
            opacity: aiLoading ? 0.9 : 1
          }}>
          {aiLoading ? '✨ Reducing...' : '✨ Summarize Folder'}
        </button>
      </div>

      {/* 总结结果展示 */}
      {summary && (
        <div style={{
          marginTop: '10px', padding: '10px', background: '#333',
          borderRadius: '4px', fontSize: '13px', lineHeight: '1.6',
          color: '#e0e0e0', borderLeft: '3px solid #9f5afd', whiteSpace: 'pre-wrap'
        }}>
          {summary}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#777' }} />
    </div>
  )
}

// === 2. 文件节点 (保持不变) ===
export const FileNode = ({ data }: NodeProps) => {
  const [expanded, setExpanded] = useState(false)
  const [code, setCode] = useState('// Loading...')
  const [loading, setLoading] = useState(false)

  // AI 状态
  const [summary, setSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

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

  const handleSummarize = async () => {
    if (!code || code.length < 10 || aiLoading) return

    setAiLoading(true)
    setSummary(null)
    try {
      const result = await window.api.summarize(code)
      setSummary(result)
      // ⚠️ 理想情况下，这里应该更新 React Flow 的节点数据，把 summary 存到 data 里
      // 但由于涉及复杂的 React Flow 状态管理，我们在 MVP 阶段暂不实现持久化
    } catch (error) {
      setSummary("AI 响应失败，请检查网络或 Key。")
    }
    setAiLoading(false)
  }

  return (
    <div
      style={{
        border: expanded ? '2px solid #646cff' : '1px solid #777',
        borderRadius: '8px', background: '#1e1e1e', color: '#ddd',
        minWidth: expanded ? '600px' : '200px',
        transition: 'all 0.3s ease',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
        zIndex: expanded ? 1000 : undefined
      }}
    >
      <Handle type="target" position={Position.Left} style={{ top: 20 }} />

      {/* 头部标题栏 */}
      <div
        onClick={handleToggle}
        style={{
          padding: '10px 15px', background: '#2d2d2d',
          borderBottom: expanded ? '1px solid #444' : 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', borderRadius: expanded ? '6px 6px 0 0' : '6px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📄</span>
          <span style={{ fontWeight: 'bold' }}>{data.label}</span>
        </div>
        <button style={{
          fontSize: '12px', padding: '4px 8px', borderRadius: '4px',
          border: '1px solid #555', background: 'transparent', color: '#aaa', cursor: 'pointer'
        }}>
          {expanded ? 'Collapse' : 'Code'}
        </button>
      </div>

      {/* 展开区域 */}
      {expanded && (
        <div className="nodrag">
          {/* 代码编辑器区域 */}
          <div style={{ height: '400px', position: 'relative' }}>
             {loading ? <div style={{ padding: 20 }}>Reading file...</div> : (
               <Editor
                  height="100%"
                  defaultLanguage={data.label.endsWith('json') ? 'json' : 'typescript'}
                  theme="vs-dark"
                  value={code}
                  options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
               />
             )}
          </div>

          {/* AI 总结功能区 */}
          <div style={{ padding: '12px', borderTop: '1px solid #444', background: '#252526', borderRadius: '0 0 6px 6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#aaa', fontSize: '12px' }}>AI INSIGHTS</span>
                <button
                  onClick={handleSummarize}
                  disabled={aiLoading}
                  style={{
                    background: aiLoading ? '#555' : 'linear-gradient(to right, #646cff, #9f5afd)',
                    color: 'white', border: 'none', padding: '6px 12px',
                    borderRadius: '4px', fontWeight: 'bold', cursor: aiLoading ? 'default' : 'pointer',
                    opacity: aiLoading ? 0.7 : 1
                  }}
                >
                  {aiLoading ? '✨ Thinking...' : '✨ AI Summarize'}
                </button>
            </div>

            {summary && (
              <div style={{
                marginTop: '10px', padding: '10px', background: '#333',
                borderRadius: '4px', fontSize: '13px', lineHeight: '1.6',
                color: '#e0e0e0', borderLeft: '3px solid #9f5afd', whiteSpace: 'pre-wrap'
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