import { useState, useEffect, useRef } from 'react';
import { X, Server, Loader2, ExternalLink, Sparkles } from 'lucide-react';

interface McpServer {
  id: string;
  name: string;
  url: string;
}

interface Props {
  activeAgentId: string | null;
  mcpServers: McpServer[];
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
}

const BUILTIN_URLS = [
  { name: 'web-search', port: '3100', desc: 'DuckDuckGo web search — snippets and URLs' },
  { name: 'file-read', port: '3101', desc: 'Workspace file reader for agents' },
  { name: 'calculator', port: '3102', desc: 'Math expression evaluator' },
];

function isBuiltin(url: string): boolean {
  return BUILTIN_URLS.some((b) => url.includes(`:${b.port}`) || url.includes(`/${b.name}`));
}

export default function McpAttachModal({
  activeAgentId,
  mcpServers,
  onClose,
  onNavigate,
  onRefresh,
}: Props) {
  const [attachedUrls, setAttachedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const snapshotRef = useRef<string[]>([]);

  // Fetch current agent's mcp_server_urls on mount
  useEffect(() => {
    if (!activeAgentId) {
      setLoading(false);
      return;
    }
    fetch(`/v1/agents/${activeAgentId}`)
      .then((r) => r.json())
      .then((data) => {
        const urls = Array.isArray(data.mcp_server_urls) ? data.mcp_server_urls : [];
        setAttachedUrls(urls);
        snapshotRef.current = [...urls];
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeAgentId]);

  const handleRevert = async () => {
    if (!activeAgentId) return;
    const restored = [...snapshotRef.current];
    setAttachedUrls(restored);
    await fetch(`/v1/agents/${activeAgentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcp_server_urls: restored }),
    });
    onRefresh();
  };

  const toggleServer = async (url: string) => {
    if (!activeAgentId) return;
    setSaving(url);

    const isAttached = attachedUrls.includes(url);
    const newUrls = isAttached
      ? attachedUrls.filter((u) => u !== url)
      : [...attachedUrls, url];

    // Optimistic update
    setAttachedUrls(newUrls);

    try {
      const resp = await fetch(`/v1/agents/${activeAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp_server_urls: newUrls }),
      });
      if (!resp.ok) throw new Error('Failed to update');
      onRefresh();
    } catch {
      // Revert on failure
      setAttachedUrls(attachedUrls);
    } finally {
      setSaving(null);
    }
  };

  const userServers = mcpServers.filter((s) => !isBuiltin(s.url));
  const builtinServers = mcpServers.filter((s) => isBuiltin(s.url));

  return (
    <div className="absolute inset-0 z-[9998] flex bg-slate-950">
      <div className="w-[500px] flex-shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-cyan-400" />
            <span className="text-sm font-medium text-slate-200">MCP Servers</span>
            {activeAgentId && (
              <span className="text-[10px] text-slate-500">
                ({attachedUrls.length} attached)
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeAgentId ? (
            <div className="text-center py-8">
              <Server size={24} className="text-slate-600 mx-auto mb-3" />
              <p className="text-xs text-slate-500">Select an agent first to attach MCP servers.</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
          ) : (
            <>
              {/* ── Built-in servers ──────────────────────── */}
              {builtinServers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles size={11} className="text-amber-400" />
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Built-in
                    </span>
                    <span className="text-[10px] text-slate-600">
                      (ships with Vibeful — no extra config)
                    </span>
                  </div>
                  <div className="space-y-1">
                    {builtinServers.map((srv) => {
                      const isAttached = attachedUrls.includes(srv.url);
                      const isSaving = saving === srv.url;
                      const builtin = BUILTIN_URLS.find((b) => srv.url.includes(`:${b.port}`));
                      return (
                        <label
                          key={srv.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isAttached
                              ? 'bg-cyan-900/20 border border-cyan-800/40'
                              : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isAttached}
                              onChange={() => toggleServer(srv.url)}
                              className="rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-500 shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-200 font-medium">{srv.name}</span>
                              {builtin && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/30 text-amber-400 font-mono">
                                  :{builtin.port}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">
                              {builtin?.desc || srv.url}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onNavigate('mcp');
                              onClose();
                            }}
                            className="text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 shrink-0"
                            title="Configure in MCP tab"
                          >
                            <ExternalLink size={10} />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── User-defined servers ──────────────────── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Server size={11} className="text-slate-500" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    User-defined
                  </span>
                  <span className="text-[10px] text-slate-600">({userServers.length})</span>
                </div>
                {userServers.length === 0 ? (
                  <div className="text-center py-4 border border-dashed border-slate-700 rounded-lg">
                    <p className="text-[11px] text-slate-500 mb-2">No user-defined servers</p>
                    <button
                      onClick={() => { onNavigate('mcp'); onClose(); }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300"
                    >
                      ＋ Add one in the MCP tab
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {userServers.map((srv) => {
                      const isAttached = attachedUrls.includes(srv.url);
                      const isSaving = saving === srv.url;
                      return (
                        <label
                          key={srv.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isAttached
                              ? 'bg-indigo-900/20 border border-indigo-800/40'
                              : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isAttached}
                              onChange={() => toggleServer(srv.url)}
                              className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-200 font-medium truncate">{srv.name}</div>
                            <div className="text-[10px] text-slate-500 truncate mt-0.5">{srv.url}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onNavigate('mcp');
                              onClose();
                            }}
                            className="text-[10px] text-slate-500 hover:text-cyan-400 flex items-center gap-1 shrink-0"
                            title="Configure in MCP tab"
                          >
                            <ExternalLink size={10} />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30 flex justify-between items-center">
          <span className="text-[10px] text-slate-600">
            Changes are saved immediately
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRevert}
              className="px-3 py-1 text-[11px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 hover:text-indigo-200 rounded"
              title="Undo changes, restore MCP servers from when you opened this panel"
            >
              Revert
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
