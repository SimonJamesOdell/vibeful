import { useMemo } from 'react';
import { Code, X } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { generateYaml } from '../lib/yamlGenerator';

export default function CodePreview() {
  const { nodes, edges, agentName, agentDescription, codePreviewVisible, toggleCodePreview } = useFlowStore();

  const yaml = useMemo(
    () => generateYaml(nodes, edges, agentName, agentDescription),
    [nodes, edges, agentName, agentDescription]
  );

  if (!codePreviewVisible) return null;

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-700 overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Code size={14} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200">YAML Preview</h2>
        </div>
        <button
          onClick={toggleCodePreview}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <pre className="p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap overflow-x-auto">
        {yaml || (
          <span className="text-slate-600 italic">
            # Drag nodes onto the canvas to generate YAML
          </span>
        )}
      </pre>

      {nodes.length > 0 && (
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={() => {
              navigator.clipboard.writeText(yaml);
            }}
            className="w-full py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            Copy YAML
          </button>
        </div>
      )}
    </div>
  );
}
