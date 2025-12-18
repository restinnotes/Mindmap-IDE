import { Handle, Position } from 'reactflow'

// 1. 文件夹节点：展示层级，作为核心骨架
export const FolderNode = ({ data }: any) => (
  <div style={{ 
    padding: '4px 10px', 
    border: '1px solid #646cff', 
    background: '#111', 
    color: '#fff', 
    fontSize: '11px', 
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
  }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <span style={{ marginRight: '6px' }}>📁</span>
    <span style={{ fontWeight: 500 }}>{data.label}</span>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
)

// 2. 文件收纳盒节点 (...)：将文件夹下所有文件折叠在此，点击可逻辑展开
export const FileGroupNode = ({ data }: any) => (
  <div style={{ 
    padding: '2px 8px', 
    background: '#222', 
    color: '#666', 
    borderRadius: '10px', 
    fontSize: '10px', 
    border: '1px solid #333',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }}
  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#646cff')}
  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#333')}
  >
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <span style={{ letterSpacing: '1px' }}>...</span> 
    <span style={{ marginLeft: '4px', fontSize: '9px', opacity: 0.8 }}>
      ({data.count} files)
    </span>
    <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
  </div>
)

// 3. 基础文件节点：虽然目前被收纳，但展开逻辑仍需此组件渲染
export const FileNode = ({ data }: any) => (
  <div style={{ 
    padding: '2px 6px', 
    border: '1px solid #222', 
    borderRadius: '3px', 
    background: '#1a1a1a', 
    color: '#666', 
    fontSize: '10px',
    whiteSpace: 'nowrap'
  }}>
    <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    <span style={{ marginRight: '4px' }}>📄</span>
    {data.label}
  </div>
)