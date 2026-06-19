import { useCallback, useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore, type VibefulNodeData } from '../lib/flowStore';
import VibefulNode from './VibefulNode';
import NodeTooltip from './NodeTooltip';

const nodeTypes = {
  vibefulNode: VibefulNode,
};

export default function FlowCanvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    selectNode,
  } = useFlowStore();

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

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
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        className="bg-slate-900"
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700" />
        <NodeTooltip />
        <MiniMap
          nodeColor={(n) => {
            const data = (n as Node<VibefulNodeData>).data;
            const colors: Record<string, string> = {
              'builtin.attack_guard': '#ef4444',
              'builtin.react_agent': '#6366f1',
              'builtin.analysis_pipeline': '#ec4899',
              'builtin.output_router': '#d946ef',
              'builtin.rag': '#10b981',
              'builtin.stream_completion': '#22c55e',
            };
            return colors[data?.nodeType || ''] || '#6b7280';
          }}
          className="!bg-slate-900 !border-slate-700"
        />
      </ReactFlow>
    </div>
  );
}
