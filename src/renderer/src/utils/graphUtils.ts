import dagre from 'dagre'
import { Node, Edge, Position } from 'reactflow'

// 这里的结构要跟 preload.d.ts 里定义的一致
export interface FileNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileNode[]
}

const nodeWidth = 220
const nodeHeight = 60

export const getLayoutedElements = (tree: FileNode) => {
  const position = { x: 0, y: 0 }
  const nodes: Node[] = []
  const edges: Edge[] = []

  // 1. 递归遍历，生成 Nodes 和 Edges
  const traverse = (node: FileNode, parentId?: string) => {
    nodes.push({
      id: node.id,
      // 根据类型使用我们在 CustomNodes.tsx 里注册的组件
      type: node.type === 'folder' ? 'folderNode' : 'fileNode',
      data: { label: node.name, fullPath: node.id, ...node },
      position
    })

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        type: 'smoothstep', // 漂亮的直角折线
        animated: true,
        style: { stroke: '#555' }
      })
    }

    if (node.children) {
      node.children.forEach((child) => traverse(child, node.id))
    }
  }

  traverse(tree)

  // 2. 使用 Dagre 计算自动布局
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))

  // 'LR' = Left to Right (从左到右布局)
  dagreGraph.setGraph({ rankdir: 'LR' })

  nodes.forEach((node) => {
    // 告诉 dagre 每个节点大概多大，方便计算间距
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  // 3. 把计算好的 x, y 赋值回 Node
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)

    // React Flow 需要的具体位置对象
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2
    }

    // 指定连线端口位置：左进右出
    node.targetPosition = Position.Left
    node.sourcePosition = Position.Right

    return node
  })

  return { nodes: layoutedNodes, edges }
}