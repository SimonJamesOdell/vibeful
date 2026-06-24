import { useState } from 'react';
import { ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';
import { VIBEFUL_NODE_TYPES, NODE_CATEGORIES } from '../const';
import { useFlowStore } from '../lib/flowStore';

export default function NodePalette() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const addNode = useFlowStore((s) => s.addNode);

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-60 bg-slate-900 border-r border-slate-700 overflow-y-auto flex-shrink-0 h-full">
      <div className="p-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-200">Node Palette</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">Drag a node onto the canvas, or click to add</p>
      </div>

      {NODE_CATEGORIES.map((cat) => {
        const nodes = VIBEFUL_NODE_TYPES.filter((n) => n.category === cat.key);
        if (nodes.length === 0) return null;
        const isCollapsed = collapsed[cat.key] || false;

        return (
          <div key={cat.key}>
            <button
              onClick={() => toggleSection(cat.key)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight size={12} className="text-slate-500" />
              ) : (
                <ChevronDown size={12} className="text-slate-500" />
              )}
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                {cat.label}
              </span>
              <span className="text-[10px] text-slate-600 ml-auto">{nodes.length}</span>
            </button>

            {!isCollapsed && (
              <div className="px-2 pb-1 space-y-0.5">
                {nodes.map((nodeType) => (
                  <button
                    key={nodeType.type}
                    onClick={() => addNode(nodeType.type, nodeType.label)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/vibeful-node-type', nodeType.type);
                      e.dataTransfer.setData('application/vibeful-node-label', nodeType.label);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 transition-colors text-left group"
                  >
                    <GripHorizontal size={10} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: nodeType.color }}
                    />
                    <span className="text-xs text-slate-300 truncate">{nodeType.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
