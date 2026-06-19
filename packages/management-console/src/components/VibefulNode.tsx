import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VibefulNodeData } from '../lib/flowStore';
import { VIBEFUL_NODE_TYPES } from '../const';

function VibefulNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as VibefulNodeData;
  const nodeTypeInfo = VIBEFUL_NODE_TYPES.find((nt) => nt.type === nodeData.nodeType);
  const color = nodeTypeInfo?.color || '#6b7280';

  return (
    <div
      className={`
        px-3 py-2 rounded-md border-2 shadow-lg text-xs min-w-[140px]
        transition-colors duration-150
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : ''}
      `}
      style={{
        backgroundColor: `${color}15`,
        borderColor: color,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500" />
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium text-slate-100 truncate">{nodeData.label}</span>
      </div>
      <div className="text-[10px] text-slate-400 mt-1 truncate">
        {nodeTypeInfo?.description?.slice(0, 50)}…
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500" />
    </div>
  );
}

export default memo(VibefulNode);
