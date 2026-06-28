import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, Clock, Loader2 } from 'lucide-react';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  agent_id: string | null;
  scopes: string;
  revoked: number;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyData, setNewKeyData] = useState<{ raw_key: string } | null>(null);

  const fetchKeys = () => {
    setLoading(true);
    fetch('/v1/api-keys')
      .then((r) => r.json())
      .then((data) => setKeys(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load API keys'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const resp = await fetch('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      setNewKeyData({ raw_key: data.raw_key });
      setNewKeyName('');
      fetchKeys();
    } catch {
      setError('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    await fetch(`/v1/api-keys/${id}`, { method: 'DELETE' });
    fetchKeys();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">Dismiss</button>
        </div>
      )}

      {/* New key form */}
      <div className="p-4 bg-slate-900 border border-slate-700 rounded-xl">
        <label className="text-xs text-slate-400 font-medium mb-2 block">Create API Key</label>
        <div className="flex gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Key name (e.g. production, staging)"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newKeyName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            Generate
          </button>
        </div>

        {/* Show raw key once */}
        {newKeyData && (
          <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700/30 rounded-lg">
            <p className="text-[10px] text-amber-400 mb-2 font-medium">Copy this key now — it won't be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-slate-950 px-3 py-1.5 rounded text-xs text-amber-300 font-mono break-all">
                {newKeyData.raw_key}
              </code>
              <button
                onClick={() => handleCopy(newKeyData.raw_key)}
                className="p-1.5 text-slate-400 hover:text-white rounded transition-colors"
                title="Copy"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={16} className="animate-spin text-slate-500" />
        </div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl">
          <Key size={24} className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">No API keys yet</p>
          <p className="text-[10px] text-slate-600 mt-1">Create one above to authenticate API requests</p>
        </div>
      ) : (
        <div>
          <label className="text-xs text-slate-400 font-medium mb-2 block">Active Keys</label>
          <div className="space-y-2">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between p-3 bg-slate-900 border rounded-lg ${
                  key.revoked ? 'border-red-800/30 opacity-50' : 'border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Key size={12} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200">
                        {key.name || 'Unnamed'}
                      </span>
                      <code className="text-[10px] text-slate-500 font-mono">{key.key_prefix}...</code>
                      {key.revoked ? (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-red-900/30 text-red-400">Revoked</span>
                      ) : (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-900/30 text-emerald-400">Active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                      {key.agent_id ? <span>Agent: {key.agent_id.slice(0, 8)}…</span> : <span>Global</span>}
                      {key.last_used_at && (
                        <>
                          <span>·</span>
                          <Clock size={9} />
                          <span>Used {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'never'}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>Created {key.created_at ? new Date(key.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                </div>
                {!key.revoked && (
                  <button
                    onClick={() => handleRevoke(key.id)}
                    className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"
                    title="Revoke key"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}