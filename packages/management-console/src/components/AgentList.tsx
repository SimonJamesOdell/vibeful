import { useState, useEffect } from 'react';
import { Bot, Trash2, Copy } from 'lucide-react';

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
    // Delegate entirely to the parent — switchToAgent handles save, fetch, load, and naming.
    // Must NOT set agentName/loadGraph here: doing so before the parent's saveNow()
    // would corrupt the previous agent's name in the database.
    onSelect(agent.id);
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading agents…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">Failed to load agents: {error}</p>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Bot size={32} className="text-slate-600" />
        <p className="text-slate-500 text-sm">No agents yet</p>
        <p className="text-slate-600 text-xs">Create one in the Designer tab</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-lg font-semibold text-slate-200 mb-4">Agents</h2>
      <div className="grid grid-cols-2 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-4 bg-slate-900 border border-slate-700 rounded-lg hover:border-indigo-500 transition-colors group"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => handleSelect(agent)}
                  className="text-sm font-medium text-slate-200 hover:text-indigo-400 text-left truncate block w-full"
                >
                  {agent.name || 'Unnamed Agent'}
                </button>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {agent.description || 'No description'}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleClone(agent.id, agent.name); }}
                disabled={cloning === agent.id}
                className="ml-2 p-1 text-slate-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
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
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-600">
              <span>{agent.model || 'deepseek-chat'}</span>
              <span>•</span>
              <span>Updated {new Date(agent.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
