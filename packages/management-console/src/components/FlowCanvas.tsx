import { useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, type Node, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore, type VibefulNodeData } from '../lib/flowStore';
import VibefulNode from './VibefulNode';
// NodeTooltip moved to App.tsx to avoid overflow-hidden clipping

const nodeTypes = {
  vibefulNode: VibefulNode,
};

export default function FlowCanvas() {
  const {
    nodes, edges, lastAddedNodeId,
    onNodesChange, onEdgesChange, onConnect,
  } = useFlowStore();

  const { fitView } = useReactFlow();
  const prevAddedRef = useRef<string | null>(null);

  // Auto-scroll viewport to newly added nodes
  useEffect(() => {
    if (lastAddedNodeId && lastAddedNodeId !== prevAddedRef.current) {
      prevAddedRef.current = lastAddedNodeId;
      // Small delay so React Flow has rendered the new node
      const t = setTimeout(() => {
        fitView({ nodes: [{ id: lastAddedNodeId }], duration: 300, padding: 0.3 });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [lastAddedNodeId, fitView]);

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
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        store.autoAlign();
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
        defaultEdgeOptions={{
          style: { stroke: '#475569', strokeWidth: 2 },
          animated: false,
          deletable: true,
          selectable: true,
          interactionWidth: 20,
        }}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
        className="bg-slate-900"
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700" />
      </ReactFlow>
    </div>
  );
}
