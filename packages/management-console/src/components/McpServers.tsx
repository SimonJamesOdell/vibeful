import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Trash2, Server, Key, Globe, RefreshCw, Loader2, Wrench, Shield, Play, Square, Circle } from 'lucide-react';

interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_type: string;
  auth_header: string;
  agent_id: string | null;
  enabled: number;
  created_at: string;
}

interface McpTool {
  name: string;
  description: string;
  server_name: string;
  parameters?: Record<string, unknown>;
}

interface HealthStatus {
  id: string;
  name: string;
  url: string;
  healthy: boolean;
  error: string | null;
}

const BUILTIN_IDS = ['builtin-web-search', 'builtin-file-read', 'builtin-calculator'];
const BUILTIN_PORTS: Record<string, string> = {
  'builtin-web-search': '3100',
  'builtin-file-read': '3101',
  'builtin-calculator': '3102',
};
const BUILTIN_DESCS: Record<string, string> = {
  'builtin-web-search': 'DuckDuckGo web search',
  'builtin-file-read': 'Workspace file reader',
  'builtin-calculator': 'Math expression evaluator',
};

export default function McpServers() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', auth_type: 'none', auth_header: '', agent_id: '' });
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [tools, setTools] = useState<Record<string, McpTool[]>>({});
  const [toolsExpanded, setToolsExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchServers = () => {
    setLoading(true);
    fetch('/v1/mcp-servers')
      .then((r) => r.json())
      .then((data) => setServers(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load MCP servers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchServers(); }, []);

  const fetchHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const resp = await fetch('/v1/mcp-servers/health');
      if (resp.ok) {
        const data: HealthStatus[] = await resp.json();
        const map: Record<string, HealthStatus> = {};
        data.forEach((s) => { map[s.id] = s; });
        setHealth(map);
      }
    } catch { /* health check is best-effort */ }
    finally { setCheckingHealth(false); }
  }, []);

  // Auto-check health on first load
  useEffect(() => {
    if (!loading && servers.length > 0) fetchHealth();
  }, [loading, servers.length, fetchHealth]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    const resp = await fetch('/v1/mcp-servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        url: form.url.trim(),
        auth_type: form.auth_type,
        auth_header: form.auth_header,
        agent_id: form.agent_id || null,
      }),
    });
    if (resp.ok) {
      setShowForm(false);
      setForm({ name: '', url: '', auth_type: 'none', auth_header: '', agent_id: '' });
      fetchServers();
    }
  };

  const handleDelete = async (id: string) => {
    // Prevent deleting built-in servers
    if (BUILTIN_IDS.includes(id)) return;
    await fetch(`/v1/mcp-servers/${id}`, { method: 'DELETE' });
    fetchServers();
  };

  const handleDiscover = async (serverUrl: string, serverId: string) => {
    setDiscovering(serverId);
    try {
      const mcpResp = await fetch(`${serverUrl.replace(/\/$/, '')}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'discover-1',
          method: 'tools/list',
          params: {},
        }),
      });
      if (mcpResp.ok) {
        const data = await mcpResp.json();
        const discoveredTools: McpTool[] = (data.result?.tools || []).map((t: any) => ({
          name: t.name,
          description: t.description || '',
          server_name: serverId,
          parameters: t.inputSchema,
        }));
        setTools((prev) => ({ ...prev, [serverId]: discoveredTools }));
        setToolsExpanded((prev) => ({ ...prev, [serverId]: true }));
      }
    } catch (e) {
      setError(`Could not discover tools on ${serverUrl}`);
    } finally {
      setDiscovering(null);
    }
  };

  const handleStartAll = async () => {
    setStarting(true);
    setError(null);
    try {
      const resp = await fetch('/v1/mcp-servers/builtin/start', { method: 'POST' });
      if (!resp.ok) {
        let msg = `Server error (HTTP ${resp.status})`;
        try { const err = await resp.json(); msg = err.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      if (data.status === 'started') {
        setTimeout(() => fetchHealth(), 2000);
      } else {
        setError(data.error || 'Failed to start servers');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const handleStopAll = async () => {
    setStopping(true);
    setError(null);
    try {
      const resp = await fetch('/v1/mcp-servers/builtin/stop', { method: 'POST' });
      if (!resp.ok) {
        let msg = `Server error (HTTP ${resp.status})`;
        try { const err = await resp.json(); msg = err.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      if (data.status === 'stopped') {
        setTimeout(() => fetchHealth(), 1000);
      } else {
        setError(data.error || 'Failed to stop servers');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStopping(false);
    }
  };

  const handleStartOne = async (id: string) => {
    setActingOn(id);
    setError(null);
    try {
      const resp = await fetch(`/v1/mcp-servers/${id}/start`, { method: 'POST' });
      if (!resp.ok) {
        let msg = `Server error (HTTP ${resp.status})`;
        try { const err = await resp.json(); msg = err.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      if (data.status === 'ok') {
        setTimeout(() => fetchHealth(), 2000);
      } else {
        setError(data.error || 'Failed to start server');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActingOn(null);
    }
  };

  const handleStopOne = async (id: string) => {
    setActingOn(id);
    setError(null);
    try {
      const resp = await fetch(`/v1/mcp-servers/${id}/stop`, { method: 'POST' });
      if (!resp.ok) {
        let msg = `Server error (HTTP ${resp.status})`;
        try { const err = await resp.json(); msg = err.detail || msg; } catch {}
        throw new Error(msg);
      }
      const data = await resp.json();
      if (data.status === 'ok') {
        setTimeout(() => fetchHealth(), 1000);
      } else {
        setError(data.error || 'Failed to stop server');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActingOn(null);
    }
  };

  const builtinServers = servers.filter((s) => BUILTIN_IDS.includes(s.id));
  const userServers = servers.filter((s) => !BUILTIN_IDS.includes(s.id));
  const builtinHealthyCount = builtinServers.filter((s) => health[s.id]?.healthy).length;
  const AUTH_TYPES = ['none', 'api_key', 'bearer'];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">MCP Servers</h2>
          <p className="text-xs text-slate-500 mt-1">
            Connect agents to external tools via the Model Context Protocol
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            disabled={checkingHealth}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors disabled:opacity-50"
          >
            {checkingHealth ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Check Health
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
          >
            <Plus size={14} />
            {showForm ? 'Cancel' : 'Add Server'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. GitHub API"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">URL</label>
              <input
                value={form.url}
                onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
                placeholder="http://localhost:3100"
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">Auth Type</label>
              <select
                value={form.auth_type}
                onChange={(e) => setForm((p) => ({ ...p, auth_type: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {AUTH_TYPES.map((t) => (
                  <option key={t} value={t}>{t === 'none' ? 'None' : t === 'api_key' ? 'API Key' : 'Bearer Token'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block">
                {form.auth_type === 'api_key' ? 'API Key' : form.auth_type === 'bearer' ? 'Bearer Token' : 'Auth Header'}
              </label>
              <input
                value={form.auth_header}
                onChange={(e) => setForm((p) => ({ ...p, auth_header: e.target.value }))}
                placeholder={form.auth_type === 'none' ? 'No auth needed' : 'Enter credential...'}
                disabled={form.auth_type === 'none'}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || !form.url.trim()}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
            >
              Register Server
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Built-in servers ─────────────────────────── */}
          {builtinServers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Built-in</span>
                  <span className="text-[10px] text-slate-600">
                    ({builtinHealthyCount}/{builtinServers.length} healthy)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleStartAll}
                    disabled={starting}
                    className="flex items-center gap-1 px-2.5 py-1 bg-emerald-900/30 hover:bg-emerald-900/50 text-emerald-400 rounded text-[10px] transition-colors disabled:opacity-50"
                  >
                    {starting ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                    Start All
                  </button>
                  <button
                    onClick={handleStopAll}
                    disabled={stopping}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded text-[10px] transition-colors disabled:opacity-50"
                  >
                    {stopping ? <Loader2 size={10} className="animate-spin" /> : <Square size={10} />}
                    Stop All
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {builtinServers.map((srv) => {
                  const hs = health[srv.id];
                  const isHealthy = hs?.healthy;
                  return (
                    <div key={srv.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                              <Server size={14} className="text-cyan-400" />
                            </div>
                            <Circle
                              size={8}
                              className={`absolute -bottom-0.5 -right-0.5 ${
                                hs === undefined ? 'text-slate-500' : isHealthy ? 'text-emerald-400 fill-emerald-400' : 'text-red-400 fill-red-400'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-200">{srv.name}</span>
                              <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">
                                :{BUILTIN_PORTS[srv.id]}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {BUILTIN_DESCS[srv.id] || srv.url}
                              {hs && !isHealthy && hs.error && (
                                <span className="text-red-400/70 ml-2">— {hs.error}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isHealthy ? (
                            <button
                              onClick={() => handleStopOne(srv.id)}
                              disabled={actingOn === srv.id}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                              title="Stop server"
                            >
                              {actingOn === srv.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Square size={13} />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStartOne(srv.id)}
                              disabled={actingOn === srv.id}
                              className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                              title="Start server"
                            >
                              {actingOn === srv.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Play size={13} />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDiscover(srv.url, srv.id)}
                            disabled={discovering === srv.id || !isHealthy}
                            className="p-1.5 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                            title="Discover tools"
                          >
                            {discovering === srv.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Discovered tools */}
                      {tools[srv.id] && toolsExpanded[srv.id] && (
                        <div className="border-t border-slate-700 px-4 py-3 bg-slate-800/30">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Wrench size={12} className="text-cyan-400" />
                            <span className="text-[11px] text-slate-400 font-medium">
                              {tools[srv.id].length} tool{tools[srv.id].length !== 1 ? 's' : ''} discovered
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {tools[srv.id].map((tool) => (
                              <div key={tool.name} className="flex items-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-200 font-medium font-mono">{tool.name}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">{tool.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── User-defined servers ─────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">User-defined</span>
              <span className="text-[10px] text-slate-600">({userServers.length})</span>
            </div>
            {userServers.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl">
                <Server size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 mb-1">No user-defined servers</p>
                <p className="text-[10px] text-slate-600 mb-3">
                  Add external MCP servers for APIs, databases, and more
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs"
                >
                  Add Your First Server
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {userServers.map((srv) => {
                  const hs = health[srv.id];
                  const isHealthy = hs?.healthy;
                  return (
                    <div key={srv.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                              <Server size={14} className="text-indigo-400" />
                            </div>
                            <Circle
                              size={8}
                              className={`absolute -bottom-0.5 -right-0.5 ${
                                hs === undefined ? 'text-slate-500' : isHealthy ? 'text-emerald-400 fill-emerald-400' : 'text-red-400 fill-red-400'
                              }`}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-200 truncate">{srv.name}</div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                              <Globe size={10} />
                              <span className="truncate">{srv.url}</span>
                              {srv.auth_type !== 'none' && (
                                <>
                                  <span>·</span>
                                  <Shield size={10} />
                                  <span>{srv.auth_type === 'api_key' ? 'API Key' : 'Bearer'}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleDiscover(srv.url, srv.id)}
                            disabled={discovering === srv.id || !isHealthy}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                            title="Discover tools"
                          >
                            {discovering === srv.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(srv.id)}
                            className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                            title="Delete server"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Discovered tools */}
                      {tools[srv.id] && toolsExpanded[srv.id] && (
                        <div className="border-t border-slate-700 px-4 py-3 bg-slate-800/30">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Wrench size={12} className="text-indigo-400" />
                            <span className="text-[11px] text-slate-400 font-medium">
                              {tools[srv.id].length} tool{tools[srv.id].length !== 1 ? 's' : ''} discovered
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {tools[srv.id].map((tool) => (
                              <div key={tool.name} className="flex items-start gap-2 px-3 py-2 bg-slate-800/50 rounded-lg">
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-200 font-medium font-mono">{tool.name}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">{tool.description}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
