import { useState, useEffect } from 'react';
import { History, RotateCcw, User, Bot, Clock, Tag, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { generateYaml, parseGraphFromYaml } from '../lib/yamlGenerator';
import DiffViewer from './DiffViewer';

interface Version {
  id: string;
  version_number: number;
  author: string;
  change_description: string;
  config_snapshot: Record<string, unknown>;
  yaml_snapshot: string;
  tags: string[];
  created_at: string;
}

export default function VersionHistory() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [diffBase, setDiffBase] = useState<number | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  const { nodes, edges, agentName, agentDescription, loadGraph, setAgentName, setAgentDescription } = useFlowStore();

  // Auto-save on graph changes (debounced 2s)
  useEffect(() => {
    if (!autoSaveEnabled || nodes.length === 0) return;
    const timer = setTimeout(() => {
      saveVersion();
    }, 2000);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const fetchVersions = async (id: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/v1/agents/${id}/versions`);
      if (resp.ok) {
        const data = await resp.json();
        setVersions(data.versions || data || []);
      }
    } catch {
      // Versions not yet available — expected during dev
    } finally {
      setLoading(false);
    }
  };

  const saveVersion = async () => {
    if (!agentId || nodes.length === 0) return;
    try {
      const yaml = generateYaml(nodes, edges, agentName, agentDescription);
      await fetch(`/v1/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { nodes, edges, agentName, agentDescription },
          yaml_str: yaml,
          author: 'human',
          change_description: `${nodes.length} nodes, ${edges.length} edges`,
        }),
      });
      // Refresh list
      await fetchVersions(agentId);
    } catch {
      // Silent fail during auto-save
    }
  };

  const handleRestore = async (version: Version) => {
    const config = version.config_snapshot;
    const graphConfig = (config as any)?.graph || config;

    // Try parsing from YAML snapshot first
    if (version.yaml_snapshot) {
      // For now, load the stored config directly
    }

    if (config.nodes && config.edges) {
      loadGraph(config.nodes as any, config.edges as any);
      setAgentName((config.agentName as string) || '');
      setAgentDescription((config.agentDescription as string) || '');
    } else if (graphConfig?.nodes) {
      const parsed = parseGraphFromYaml({ graph: graphConfig } as any);
      if (parsed) {
        loadGraph(parsed.nodes, parsed.edges);
      }
    }

    // Save a new version marking the restore
    if (agentId) {
      await fetch(`/v1/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: config,
          yaml_str: version.yaml_snapshot || '',
          author: 'human',
          change_description: `Restored from version ${version.version_number}`,
          tags: ['restore'],
        }),
      });
      await fetchVersions(agentId);
    }
  };

  const handleDeployAndTrack = async () => {
    const yaml = generateYaml(nodes, edges, agentName, agentDescription);
    try {
      const resp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          description: agentDescription,
          config_yaml: yaml,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.id) {
        setAgentId(data.id);
        await saveVersion();
        await fetchVersions(data.id);
        alert(`Agent deployed! ID: ${data.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const isAiAuthor = (author: string) => author.startsWith('ai:') || author.startsWith('ai_');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Version History</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Every change is tracked. Roll back to any version.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="rounded bg-slate-800 border-slate-600"
            />
            Auto-save
          </label>
          <button
            onClick={handleDeployAndTrack}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            <History size={12} /> Deploy & Track
          </button>
        </div>
      </div>

      {!agentId && (
        <div className="px-4 py-3 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400">
          Click "Deploy & Track" to start versioning. Versions are saved automatically as you edit.
        </div>
      )}

      {error && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={12} className="animate-spin" />
          Loading versions…
        </div>
      )}

      <div className="space-y-2">
        {versions.map((v, i) => {
          const isExpanded = expanded === i;
          return (
            <div
              key={v.id}
              className={`bg-slate-900 border rounded-lg overflow-hidden transition-colors ${
                isExpanded ? 'border-indigo-700' : 'border-slate-700'
              }`}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-800/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-slate-300">v{v.version_number}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isAiAuthor(v.author) ? (
                      <Bot size={10} className="text-purple-400" />
                    ) : (
                      <User size={10} className="text-blue-400" />
                    )}
                    <span className="text-xs text-slate-400">
                      {isAiAuthor(v.author) ? v.author.replace('ai:', 'AI: ') : 'Human'}
                    </span>
                    <span className="text-[10px] text-slate-600">·</span>
                    <span className="text-[10px] text-slate-500">
                      <Clock size={10} className="inline mr-0.5" />
                      {formatDate(v.created_at)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {v.change_description}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {v.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400"
                    >
                      {tag}
                    </span>
                  ))}
                  {isExpanded ? (
                    <ChevronDown size={12} className="text-slate-500" />
                  ) : (
                    <ChevronRight size={12} className="text-slate-500" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
                  {/* YAML preview */}
                  {v.yaml_snapshot && (
                    <div>
                      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        YAML Snapshot
                      </div>
                      <pre className="bg-slate-950 rounded p-2 text-[10px] text-slate-400 font-mono max-h-40 overflow-y-auto">
                        {v.yaml_snapshot.slice(0, 1000)}
                        {v.yaml_snapshot.length > 1000 && '\n…'}
                      </pre>
                    </div>
                  )}

                  {/* Diff with previous */}
                  {diffBase === i && i + 1 < versions.length && (
                    <DiffViewer
                      oldYaml={versions[i + 1].yaml_snapshot || ''}
                      newYaml={v.yaml_snapshot || ''}
                    />
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(v)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-yellow-700 hover:bg-yellow-600 text-white rounded transition-colors"
                    >
                      <RotateCcw size={10} /> Restore
                    </button>
                    {i + 1 < versions.length && (
                      <button
                        onClick={() => setDiffBase(diffBase === i ? null : i)}
                        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                          diffBase === i
                            ? 'bg-indigo-700 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                      >
                        Diff with v{versions[i + 1].version_number}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {versions.length === 0 && !loading && agentId && (
          <div className="text-xs text-slate-500 text-center py-4">
            No versions yet. Make a change and it'll be auto-saved.
          </div>
        )}
      </div>
    </div>
  );
}
