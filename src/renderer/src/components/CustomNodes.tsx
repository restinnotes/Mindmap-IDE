import { useState, useRef } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import Editor, { OnMount } from '@monaco-editor/react'

// 定义 AI 返回的数据结构 (用于 Level 3 文件总结)
interface AIAnalysisResult {
  overview: string;
  technical_depth?: string; // 技术深度
  exports?: string;         // 导出能力
  symbols: Array<{
    name: string;
    type: string;
    description: string;
  }>;
}

// 🚨 注意：原来的 buildStructureString 函数已被删除，因为它不再用于 MapReduce 架构

// === 1. 文件夹节点 (Level 2: Reduce 消费者) ===
export const FolderNode = ({ data }: NodeProps) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const handleSummarize = async () => {
    setAiLoading(true);
    setSummary(null);

    try {
      // 🚨 关键：发送文件夹路径 (data.id 即是后端用于缓存和文件读取的路径 Key)
      const folderPath = data.id;

      const result = await window.api.summarizeFolder(folderPath);
      setSummary(result);
    } catch (error) {
      setSummary("AI 文件夹总结失败。");
    }
    setAiLoading(false);
  };

  return (
    <div style={{
      padding: '10px',
      border: '2px solid #646cff', borderRadius: '8px', background: '#2b2b2b', color: '#fff',
      minWidth: '300px', textAlign: 'left', boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#777' }} />

      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '5px' }}>📁 {data.label}</div>
      <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '10px' }}>包含 {data.children?.length || 0} 个子项</div>

      <div style={{ borderTop: '1px solid #444', paddingTop: '10px' }}>
        <button onClick={handleSummarize} disabled={aiLoading} style={{
            background: aiLoading ? '#555' : 'linear-gradient(to right, #646cff, #9f5afd)',
            color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: aiLoading ? 'default' : 'pointer', width: '100%'
          }}>
          {aiLoading ? '✨ Reducing (Global Analysis)...' : '✨ Summarize Module'}
        </button>
      </div>

      {summary && (
        <div style={{
          marginTop: '10px', padding: '10px', background: '#333', borderRadius: '4px',
          fontSize: '13px', lineHeight: '1.6', color: '#e0e0e0', borderLeft: '3px solid #9f5afd',
          whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto'
        }}>
          {summary}
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#777' }} />
    </div>
  )
}

// === 2. 文件节点 (Level 3: Map 生产者) ===
export const FileNode = ({ data }: NodeProps) => {
  const [expanded, setExpanded] = useState(false)
  const [code, setCode] = useState('// Loading...')
  const [loading, setLoading] = useState(false)

  // AI 状态
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Monaco Editor 实例引用 (用于控制滚动)
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  }

  const jumpToSymbol = (symbolName: string) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();

    // 使用 Monaco 内置查找功能找到匹配项
    const matches = model.findMatches(symbolName, true, false, true, null, true);

    if (matches && matches.length > 0) {
      const range = matches[0].range;
      editor.setSelection(range);
      editor.revealRangeInCenter(range);
    }
  };


  const handleToggle = async () => {
    if (!expanded && code === '// Loading...') {
      setLoading(true)
      try {
        // data.id 作为文件路径
        const content = await window.api.readFile(data.id)
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
    setAnalysis(null)
    setErrorMsg(null)

    try {
      // 🚨 关键：传入对象 { code, filePath }，filePath 用于后端缓存 Key
      const resultString = await window.api.summarize({
        code: code,
        filePath: data.id
      })

      const parsed = JSON.parse(resultString) as AIAnalysisResult;

      if (parsed.overview || (parsed.symbols && parsed.symbols.length > 0)) {
         setAnalysis(parsed);
         setErrorMsg(null);
      } else {
         setErrorMsg(parsed.overview || "AI 返回的结构化数据无效或内容为空。")
      }
    } catch (error) {
      console.error(error);
      setErrorMsg(`JSON 解析失败: ${error.message || String(error)}，请确认 AI 是否返回了纯 JSON。`);
    }
    setAiLoading(false)
  }

  return (
    <div
      style={{
        border: expanded ? '2px solid #646cff' : '1px solid #777',
        borderRadius: '8px', background: '#1e1e1e', color: '#ddd',
        minWidth: expanded ? '800px' : '200px',
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
        <div className="nodrag" style={{ display: 'flex', flexDirection: 'column' }}>

          {/* 主体区域：左边编辑器，右边大纲 (如果已分析) */}
          <div style={{ display: 'flex', height: '500px' }}>
            {/* 左侧：代码编辑器 */}
            <div style={{ flex: 1, borderRight: (analysis?.symbols?.length) ? '1px solid #444' : 'none' }}>
               {loading ? <div style={{ padding: 20 }}>Reading file...</div> : (
                 <Editor
                    height="100%" theme="vs-dark" value={code}
                    defaultLanguage={data.label.endsWith('json') ? 'json' : 'typescript'}
                    onMount={handleEditorDidMount}
                    options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
                 />
               )}
            </div>

            {/* 右侧：智能大纲面板 (仅当有结构化结果时显示) */}
            {analysis?.symbols?.length > 0 && (
              <div style={{ width: '250px', background: '#252526', overflowY: 'auto', padding: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#aaa', marginBottom: '10px' }}>
                  STRUCTURE
                </div>
                {analysis.symbols.map((sym, idx) => (
                  <div
                    key={idx}
                    onClick={() => jumpToSymbol(sym.name)}
                    style={{
                      marginBottom: '12px', cursor: 'pointer',
                      padding: '8px', background: '#333', borderRadius: '4px',
                      borderLeft: '2px solid #646cff'
                    }}
                    title="点击跳转"
                  >
                    <div style={{ color: '#646cff', fontWeight: 'bold', fontSize: '13px' }}>
                      {sym.name}
                    </div>
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                      {sym.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部：AI 面板 (展示深度画像) */}
          <div style={{ padding: '12px', borderTop: '1px solid #444', background: '#252526', borderRadius: '0 0 6px 6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
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
                  {aiLoading ? '✨ Analyzing...' : '✨ Deep Analyze'}
                </button>
            </div>

            {errorMsg && <div style={{ color: '#ff6b6b', marginTop: '10px', fontSize: '13px' }}>{errorMsg}</div>}

            {/* 展示更丰富的信息 */}
            {analysis && (
              <div style={{ marginTop: '10px', fontSize: '13px', lineHeight: '1.6', color: '#e0e0e0' }}>

                {/* 1. 概览 (UI用) */}
                <div style={{ marginBottom: '8px', padding: '8px', background: '#333', borderRadius: '4px', borderLeft: '3px solid #646cff' }}>
                  <strong>Overview:</strong> {analysis.overview}
                </div>

                {/* 2. 技术深度 (给架构师看，未来给上层AI看) */}
                {analysis.technical_depth && (
                  <div style={{ marginBottom: '8px', padding: '8px', background: '#2d2d2d', borderRadius: '4px', borderLeft: '3px solid #42b883' }}>
                    <div style={{ fontWeight: 'bold', color: '#42b883', marginBottom: '4px' }}>Technical Context:</div>
                    {analysis.technical_depth}
                  </div>
                )}

                {/* 3. 核心能力 (给架构师看) */}
                {analysis.exports && (
                  <div style={{ padding: '8px', background: '#2d2d2d', borderRadius: '4px', borderLeft: '3px solid #e13ec7', fontSize: '12px', color: '#ccc' }}>
                    <strong>Exports:</strong> {analysis.exports}
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ top: 20 }} />
    </div>
  )
}