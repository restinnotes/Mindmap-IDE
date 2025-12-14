import { useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  NodeTypes
} from 'reactflow'
import 'reactflow/dist/style.css'

// 引入我们创建的工具和组件
import { getLayoutedElements } from './utils/graphUtils'
import { FolderNode, FileNode } from './components/CustomNodes'

// 注册自定义节点
const nodeTypes: NodeTypes = {
  folderNode: FolderNode,
  fileNode: FileNode
}

function App(): JSX.Element {
  // React Flow 状态
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const handleOpenFolder = useCallback(async () => {
    try {
      // 1. 调用主进程打开文件夹
      // window.api 是我们在 src/preload/index.ts 里定义的
      const tree = await window.api.openFolder()

      if (tree) {
        // 2. 计算布局
        console.log('File Tree:', tree)
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(tree)

        // 3. 更新画布
        setNodes(layoutedNodes)
        setEdges(layoutedEdges)
      }
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }, [setNodes, setEdges])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', display: 'flex', flexDirection: 'column' }}>

      {/* 顶部简单的 Toolbar */}
      <div style={{
        height: '50px',
        background: '#1e1e1e',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        zIndex: 10
      }}>
        <div style={{ fontWeight: 'bold', color: '#fff', marginRight: '20px' }}>
          Logic Horizon
        </div>
        <button
          onClick={handleOpenFolder}
          style={{
            padding: '6px 12px',
            background: '#444',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          📂 Open Project
        </button>
      </div>

      {/* 画布区域 */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.1}
          style={{ background: '#111' }}
        >
          <Background color="#333" gap={20} />
          <Controls style={{ fill: '#fff' }} />
        </ReactFlow>
      </div>
    </div>
  )
}

export default App