import { useState, useEffect } from 'react';
import { Bot, Trash2, Copy, Pencil, Check, X, Plus } from 'lucide-react';

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export default function AgentList({ onSelect }: { onSelect: (id: string) => void }) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    fetch('/v1/agents')
      .then((r) => r.json())
      .then((data) => {
        setAgents(Array.isArray(data) ? data : data.agents || []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const handleSelect = (agent: AgentSummary) => {
    onSelect(agent.id);
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) { setRenaming(null); return; }
    if (agents.some((a) => a.id !== id && a.name === name)) {
      alert(`An agent named "${name}" already exists.`);
      return;
    }
    try {
      const resp = await fetch(`/v1/agents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (resp.ok) {
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
      } else if (resp.status === 409) {
        const data = await resp.json();
        alert(data.detail || `An agent named "${name}" already exists.`);
      } else {
        alert(`Rename failed (${resp.status})`);
      }
    } catch (e: any) {
      alert(`Rename failed: ${e.message}`);
    } finally {
      setRenaming(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await fetch(`/v1/agents/${id}`, { method: 'DELETE' });
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleClone = async (id: string, name: string) => {
    setCloning(id);
    try {
      const resp = await fetch(`/v1/agents/${id}`);
      const agent = await resp.json();
      const resp2 = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${name} (copy)`,
          description: agent.description || '',
          system_prompt: agent.system_prompt || '',
          config_yaml: agent.config_json || '',
          styling: agent.styling_json || '',
        }),
      });
      if (resp2.ok) {
        const clone = await resp2.json();
        setAgents((prev) => [...prev, { id: clone.id, name: clone.name, description: clone.description || '', model: clone.model || 'deepseek-chat', created_at: clone.created_at || '', updated_at: clone.created_at || '' }]);
      }
    } catch (e: any) {
      alert(`Clone failed: ${e.message}`);
    } finally {
      setCloning(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" data-tour="agents-list">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Agents</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage your AI agents — click to edit, rename, clone, or delete
          </p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', { detail: { template: 'minimal' } }))}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
        >
          <Plus size={14} />
          Add Agent
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>Failed to load agents: {error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <p className="text-slate-500 text-sm">Loading agents…</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12">
          <Bot size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-1">No agents yet</p>
          <p className="text-xs text-slate-600">Create one in the Designer tab</p>
        </div>
      ) : (
      <>
      <div className="space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-4 bg-slate-900 border border-slate-700 rounded-xl hover:border-indigo-500 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {renaming === agent.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(agent.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-200 w-full focus:outline-none"
                    />
                    <button onClick={() => handleRename(agent.id)} className="p-0.5 text-green-400 hover:text-green-300 flex-shrink-0" title="Save"><Check size={14} /></button>
                    <button onClick={() => setRenaming(null)} className="p-0.5 text-slate-500 hover:text-slate-400 flex-shrink-0" title="Cancel"><X size={14} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelect(agent)}
                    className="text-sm font-medium text-slate-200 hover:text-indigo-400 text-left truncate block w-full"
                  >
                    {agent.name || 'Unnamed Agent'}
                  </button>
                )}
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {agent.description || 'No description'}
                </p>
              </div>
              <div className="flex items-center gap-0.5 ml-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setRenaming(agent.id); setRenameValue(agent.name); }}
                  className="p-1 text-slate-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Rename agent"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleClone(agent.id, agent.name); }}
                  disabled={cloning === agent.id}
                  className="p-1 text-slate-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Clone agent"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(agent.id, agent.name); }}
                  disabled={deleting === agent.id}
                  className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Delete agent"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-600">
              <span>{agent.model || 'deepseek-chat'}</span>
              <span>•</span>
              <span>Updated {new Date(agent.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
      </>
      )}
    </div>
  );
}
