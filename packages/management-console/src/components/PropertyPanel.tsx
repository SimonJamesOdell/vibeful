import { useState, useMemo } from 'react';
import { FileCode } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { VIBEFUL_NODE_TYPES, type ConfigField } from '../const';
import { generateYaml } from '../lib/yamlGenerator';

export default function PropertyPanel() {
  const { nodes, selectedNodeId, updateNodeConfig, selectNode, edges, agentName, agentDescription } = useFlowStore();
  const [yamlDialogOpen, setYamlDialogOpen] = useState(false);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const nodeTypeInfo = VIBEFUL_NODE_TYPES.find((nt) => nt.type === selectedNode?.data?.nodeType);

  const yaml = useMemo(
    () => generateYaml(nodes, edges, agentName, agentDescription),
    [nodes, edges, agentName, agentDescription]
  );

  return (
    <div className="h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Properties</h2>
        <button
          onClick={() => setYamlDialogOpen(true)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          title="View YAML"
        >
          <FileCode size={12} /> YAML
        </button>
      </div>

      {/* Node properties */}
      <div className="flex-1 overflow-y-auto">

      {!selectedNode ? (
        <div className="p-4 text-xs text-slate-500 text-center">
          Click a node to edit its properties
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {/* Node info */}
          <div className="flex items-center gap-2 pb-3 border-b border-slate-700">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: nodeTypeInfo?.color || '#6b7280' }}
            />
            <div>
              <div className="text-sm font-medium text-slate-200">{selectedNode.data.label}</div>
              <div className="text-[10px] text-slate-500">{nodeTypeInfo?.type}</div>
            </div>
          </div>

          {/* Config fields */}
          {nodeTypeInfo?.configSchema && nodeTypeInfo.configSchema.length > 0 ? (
            nodeTypeInfo.configSchema.map((field: ConfigField) => (
              <ConfigFieldEditor
                key={field.key}
                field={field}
                value={selectedNode.data.config?.[field.key]}
                onChange={(val) => {
                  updateNodeConfig(selectedNode.id, {
                    ...selectedNode.data.config,
                    [field.key]: val,
                  });
                }}
              />
            ))
          ) : (
            <div className="text-xs text-slate-600 py-4 text-center">
              No configurable properties for this node type
            </div>
          )}
        </div>
      )}
      </div>

      {/* YAML Preview Dialog */}
      {yamlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileCode size={14} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-slate-200">YAML Preview</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(yaml);
                  }}
                  className="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => setYamlDialogOpen(false)}
                  className="text-slate-500 hover:text-slate-300 text-lg leading-none"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{yaml}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigFieldEditor({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const currentValue = value ?? field.defaultValue;

  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
        {field.label}
      </label>
      {field.type === 'number' ? (
        <input
          type="number"
          value={currentValue as number}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      ) : field.type === 'text' ? (
        <input
          type="text"
          value={(currentValue as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      ) : field.type === 'textarea' ? (
        <textarea
          value={(currentValue as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
        />
      ) : field.type === 'boolean' ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!currentValue}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded bg-slate-800 border-slate-600"
          />
          <span className="text-xs text-slate-400">Enabled</span>
        </label>
      ) : field.type === 'select' && field.options ? (
        <select
          value={(currentValue as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
