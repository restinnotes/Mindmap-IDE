import { useState, useEffect, useRef } from 'react'
import ReactFlow, { Background, useNodesState, useEdgesState, ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'
import { FolderNode, FileGroupNode } from './components/CustomNodes'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'dark' });
const nodeTypes = { folder: FolderNode, fileGroup: FileGroupNode };

function Flow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [story, setStory] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const mermaidRef = useRef<HTMLDivElement>(null);

  // 📐 布局控制
  const [leftW, setLeftW] = useState(window.innerWidth * 0.35);
  const [topH, setTopH] = useState(window.innerHeight * 0.45);
  const resizer = useRef<string | null>(null);
  
  // 🔍 图表缩放平移
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);

  useEffect(() => {
    window.api.onProgress((_, d) => setProgress(d.percent));
    const onMove = (e: MouseEvent) => {
      if (resizer.current === 'V') setLeftW(e.clientX);
      if (resizer.current === 'H') setTopH(e.clientY - 50);
      if (isPanning.current) setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
    };
    const onUp = () => { resizer.current = null; isPanning.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const handleOpen = async () => {
    const root = await window.api.openFolder();
    if (!root) return;
    const { n, e } = layout(root);
    setNodes(n); setEdges(e);
    setLoading(true);
    const res = await window.api.summarizeFolder(root.id);
    setStory(res.story);
    const { svg } = await mermaid.render('m-svg', res.mermaid);
    if (mermaidRef.current) mermaidRef.current.innerHTML = svg;
    setLoading(false); setProgress(0);
  };

  const layout = (root: any) => {
    const n: any[] = []; const e: any[] = []; let y = 0;
    const walk = (node: any, d: number, pId: string | null) => {
      if (node.type === 'folder') {
        n.push({ id: node.id, type: 'folder', position: { x: d * 180, y: y * 45 }, data: { label: node.name } });
        if (pId) e.push({ id: `${pId}-${node.id}`, source: pId, target: node.id, animated: true });
        y++;
        const sFolders = node.children?.filter(c => c.type === 'folder') || [];
        const sFiles = node.children?.filter(c => c.type === 'file') || [];
        if (sFiles.length > 0) {
          const gId = `${node.id}-g`;
          n.push({ id: gId, type: 'fileGroup', position: { x: (d+1)*180, y: y*45 }, data: { count: sFiles.length } });
          e.push({ id: `${node.id}-${gId}`, source: node.id, target: gId, style: { strokeDasharray: '3 3' } });
          y++;
        }
        sFolders.forEach(sf => walk(sf, d + 1, node.id));
      }
    };
    walk(root, 0, null); return { n, e };
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#050505', color: '#eee' }}>
      <div style={{ height: 50, borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', px: 20, background: '#111' }}>
        <b style={{ color: '#646cff', padding: '0 20px' }}>LOGIC HORIZON</b>
        <button onClick={handleOpen} style={{ background: '#222', border: '1px solid #333', color: '#fff', padding: '4px 10px', borderRadius: 4 }}>📂 Open</button>
        {progress > 0 && <div style={{ flex: 1, height: 2, background: '#111', marginLeft: 20 }}><div style={{ width: `${progress}%`, height: '100%', background: '#646cff' }} /></div>}
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: leftW, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: topH, position: 'relative' }}>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView><Background color="#111" /></ReactFlow>
          </div>
          <div onMouseDown={() => (resizer.current = 'H')} style={{ height: 4, cursor: 'row-resize', background: '#222' }} />
          <div style={{ flex: 1, padding: 15, overflowY: 'auto', background: '#0c0c0e', fontSize: 13, color: '#999', whiteSpace: 'pre-wrap' }}>{story || 'Waiting...'}</div>
        </div>
        <div onMouseDown={() => (resizer.current = 'V')} style={{ width: 4, cursor: 'col-resize', background: '#222' }} />
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} onMouseDown={() => (isPanning.current = true)}>
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, display: 'flex', gap: 5 }}>
            <button onClick={() => setScale(s => s + 0.1)}>+</button>
            <button onClick={() => setScale(s => s - 0.1)}>-</button>
          </div>
          <div ref={mermaidRef} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: 'center', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
        </div>
      </div>
    </div>
  );
}

export default () => <ReactFlowProvider><Flow /></ReactFlowProvider>