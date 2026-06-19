import { useEffect } from 'react';
import { ReactFlow, Background, Controls, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore, type VibefulNodeData } from '../lib/flowStore';
import VibefulNode from './VibefulNode';
// NodeTooltip moved to App.tsx to avoid overflow-hidden clipping

const nodeTypes = {
  vibefulNode: VibefulNode,
};

export default function FlowCanvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
  } = useFlowStore();

  // Handle keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = useFlowStore.getState();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        store.removeSelectedNodes();
      }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        store.duplicateSelectedNodes();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex-1 h-full" style={{ height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        multiSelectionKeyCode="Shift"
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="bg-slate-900"
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700" />
      </ReactFlow>
    </div>
  );
}
