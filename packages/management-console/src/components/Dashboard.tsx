import { useState, useEffect, useCallback } from 'react';
import { Brain, FileText, Trash2, TestTube, Plus, Pencil, Check, X, Server, Info, ArrowRight, Play, Square, Loader2, Circle } from 'lucide-react';

interface Agent {
  id: string; name: string; description?: string; system_prompt?: string;
}
interface Context {
  id: string; name: string;
}

interface Props {
  onNavigate: (tab: any) => void;
  agents: Agent[];
  contexts: Context[];
  mcpServers: Array<{ id: string; name: string; url: string }>;
  onSelectAgent: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: () => void;
  onRename: (id: string, name: string) => Promise<boolean>;
}

export default function Dashboard({ onNavigate, agents, contexts, mcpServers, onSelectAgent, onDelete, onTest, onRename }: Props) {
  const pages: any[] = []; // placeholder for future Page builder
  const namedContexts = contexts.filter((c) => c.name && c.name.trim());
  const [showMcpInfo, setShowMcpInfo] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const handleMcpStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActingOn(id);
    try { await fetch(`/v1/mcp-servers/${id}/start`, { method: 'POST' }); } catch {}
    setTimeout(() => fetchMcpHealth(), 3000);
    setActingOn(null);
  };

  const handleMcpStop = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActingOn(id);
    try { await fetch(`/v1/mcp-servers/${id}/stop`, { method: 'POST' }); } catch {}
    await fetchMcpHealth();
    setActingOn(null);
  };

  const isBuiltin = (id: string) => id.startsWith('builtin-');

  const [mcpHealth, setMcpHealth] = useState<Record<string, boolean>>({});

  const fetchMcpHealth = useCallback(async () => {
    try {
      const resp = await fetch('/v1/mcp-servers/health');
      if (resp.ok) {
        const data: Array<{ id: string; healthy: boolean }> = await resp.json();
        const map: Record<string, boolean> = {};
        data.forEach((s) => { map[s.id] = s.healthy; });
        setMcpHealth(map);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (mcpServers.length > 0) fetchMcpHealth();
  }, [mcpServers.length, fetchMcpHealth]);

  return (
    <div className="flex-1 overflow-hidden bg-slate-950">
      <div className="h-full p-4 grid grid-cols-2 gap-4">
        {/* ── Agents ────────────────────────────────────── */}
        <Section
          icon={<Brain size={16} className="text-purple-400" />}
          title="Agents"
          subtitle=""
          count={agents.length}
          actionLabel="New Agent"
          onAction={() => window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', { detail: { template: 'minimal' } }))}
          emptyTitle="No agents yet"
          emptyDesc="Create your first agent — it takes seconds. You'll get a ready-to-embed script for any website."
          maxItems={5}
          viewAllLabel="View all agents"
          onViewAll={() => onNavigate('agents')}
        >
          {agents.map((agent) => (
            <AssetCard
              key={agent.id}
              name={agent.name}
              subtitle={agent.description || agent.system_prompt?.slice(0, 80) || ''}
              onEdit={() => onSelectAgent(agent.id)}
              onTest={onTest}
              onDelete={() => onDelete(agent.id)}
              onRename={async (name: string) => onRename(agent.id, name)}
            />
          ))}
        </Section>

        {/* ── Knowledge ─────────────────────────────────── */}
        <Section
          icon={<FileText size={16} className="text-emerald-400" />}
          title="Knowledge Bases"
          subtitle=""
          count={namedContexts.length}
          actionLabel="New"
          onAction={() => onNavigate('contexts')}
          emptyTitle="No knowledge bases yet"
          emptyDesc="Add documents and FAQs for your agents to reference"
          emptyActionLabel="Set up Knowledge Base"
          maxItems={5}
          viewAllLabel="View all"
          onViewAll={() => onNavigate('contexts')}
        >
          {namedContexts.map((ctx) => (
            <div key={ctx.id} onClick={() => onNavigate('contexts')} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
              <span className="text-sm text-slate-300">{ctx.name}</span>
              <span className="text-[10px] text-slate-600">{ctx.id.slice(0, 8)}…</span>
            </div>
          ))}
        </Section>

        {/* ── MCP Servers ────────────────────────────────── */}
        <Section
          icon={<Server size={16} className="text-cyan-400" />}
          title="MCP Servers"
          subtitle="Connect agents to external tools"
          count={mcpServers.length}
          actionLabel="Add Server"
          onAction={() => onNavigate('mcp')}
          emptyTitle="No MCP servers yet"
          emptyDesc="Connect agents to external APIs, databases, and tools via the Model Context Protocol"
          maxItems={5}
          viewAllLabel="View all servers"
          onViewAll={() => onNavigate('mcp')}
          headerExtra={
            <button
              onClick={(e) => { e.stopPropagation(); setShowMcpInfo(true); }}
              className="p-1 text-slate-500 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
              title="Built-in servers info"
            >
              <Info size={13} />
            </button>
          }
        >
          {mcpServers.map((srv) => (
            <div key={srv.id} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer transition-colors group">
              <div className="min-w-0 flex-1" onClick={() => onNavigate('mcp')}>
                <div className="flex items-center gap-1.5">
                  <Circle
                    size={7}
                    className={`flex-shrink-0 ${
                      mcpHealth[srv.id] === undefined
                        ? 'text-slate-600'
                        : mcpHealth[srv.id]
                          ? 'text-emerald-400 fill-emerald-400'
                          : 'text-red-400 fill-red-400'
                    }`}
                  />
                  <span className="text-sm text-slate-200 font-medium">{srv.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{srv.url}</div>
              </div>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                {isBuiltin(srv.id) && mcpHealth[srv.id] !== undefined && (
                  mcpHealth[srv.id] ? (
                    <button
                      onClick={(e) => handleMcpStop(srv.id, e)}
                      disabled={actingOn === srv.id}
                      className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                      title="Stop server"
                    >
                      {actingOn === srv.id ? <Loader2 size={11} className="animate-spin" /> : <Square size={11} />}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => handleMcpStart(srv.id, e)}
                      disabled={actingOn === srv.id}
                      className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-30"
                      title="Start server"
                    >
                      {actingOn === srv.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                    </button>
                  )
                )}
                <span className="text-[10px] text-slate-600">{srv.id.slice(0, 8)}…</span>
              </div>
            </div>
          ))}
        </Section>

        {/* ── Pages ─────────────────────────────────────── */}
        <Section
          icon={<FileText size={16} className="text-amber-400" />}
          title="Pages"
          subtitle=""
          count={pages.length}
          actionLabel="New Page"
          onAction={() => onNavigate('designer')}
          emptyTitle="No pages yet"
          emptyDesc=""
          maxItems={5}
          viewAllLabel="View all pages"
          onViewAll={() => onNavigate('pages')}
        >
          {pages.length === 0 ? null : <p className="text-xs text-slate-500">Pages coming soon.</p>}
        </Section>


      </div>
      {showMcpInfo && <McpInfoPanel onClose={() => setShowMcpInfo(false)} />}
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────────── */

function Section({ icon, title, subtitle, count, actionLabel, onAction, emptyTitle, emptyDesc, emptyActionLabel, headerExtra, maxItems, viewAllLabel, onViewAll, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  actionLabel: string;
  onAction: () => void;
  emptyTitle: string;
  emptyDesc: string;
  emptyActionLabel?: string;
  headerExtra?: React.ReactNode;
  maxItems?: number;
  viewAllLabel?: string;
  onViewAll?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-0 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            {icon} {title}
          </h2>
          <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          {headerExtra}
          <button onClick={onAction} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <Plus size={10} /> {actionLabel}
          </button>
        </div>
      </div>
      {count === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 border border-dashed border-slate-700 rounded-xl">
          <p className="text-sm text-slate-400 mb-1">{emptyTitle}</p>
          <p className="text-xs text-slate-600 mb-4">{emptyDesc}</p>
          <button onClick={onAction} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">
            {emptyActionLabel || actionLabel}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {Array.isArray(children)
            ? (maxItems != null ? (children as React.ReactNode[]).slice(0, maxItems) : children)
            : children}
        </div>
      )}
      {maxItems != null && count > maxItems && viewAllLabel && onViewAll && (
        <button
          onClick={onViewAll}
          className="flex-shrink-0 mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-500 hover:text-indigo-400 flex items-center justify-center gap-1 transition-colors w-full"
        >
          {viewAllLabel} ({count - maxItems} more) <ArrowRight size={10} />
        </button>
      )}
    </div>
  );
}

/* ── MCP built-in info popup ─────────────────────────── */

const BUILTIN_MCP_SERVERS = [
  { name: 'web-search', port: '3100', desc: 'DuckDuckGo web search — returns snippets and URLs for any query.', icon: '🌐' },
  { name: 'file-read', port: '3101', desc: 'Workspace file reader — reads file contents for agents to reference.', icon: '📄' },
  { name: 'calculator', port: '3102', desc: 'Math expression evaluator — computes arithmetic for accurate answers.', icon: '🔢' },
];

function McpInfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Server size={15} className="text-cyan-400" /> Built-in MCP Servers
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Vibeful ships with three MCP servers ready to use. They run as Docker
          services alongside the platform — just add them below and they're
          available to any agent with zero configuration.
        </p>
        <div className="space-y-3">
          {BUILTIN_MCP_SERVERS.map((s) => (
            <div key={s.name} className="flex gap-3 p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <span className="text-lg flex-shrink-0 mt-0.5">{s.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-cyan-300 font-mono">{s.name}</code>
                  <span className="text-[10px] text-slate-600">:{s.port}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-800">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            <strong className="text-slate-400">No extra config needed.</strong> These are standard
            JSON-RPC MCP servers — just provide the URL (<code className="text-cyan-400/70">http://host:port</code>)
            and the agent engine handles discovery, tool listing, and execution automatically.
            Run <code className="text-cyan-400/70">npm run stack</code> to start them with Docker.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Asset card ───────────────────────────────────────── */

function AssetCard({ name, subtitle, onEdit, onTest, onDelete, onRename }: {
  name: string;
  subtitle: string;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
  onRename?: (newName: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenaming(false); return; }
    if (onRename) {
      const ok = await onRename(trimmed);
      if (!ok) return;
    }
    setRenaming(false);
  };

  return (
      <div onClick={!renaming ? onEdit : undefined} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(e as any);
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-200 w-full focus:outline-none"
            />
            <button onClick={handleRename} className="p-0.5 text-green-400 hover:text-green-300 flex-shrink-0" title="Save"><Check size={14} /></button>
            <button onClick={(e) => { e.stopPropagation(); setRenaming(false); }} className="p-0.5 text-slate-500 hover:text-slate-400 flex-shrink-0" title="Cancel"><X size={14} /></button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-200 font-medium">{name}</span>
              {onRename && (
                <button onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(name); }} className="p-0.5 text-slate-600 hover:text-yellow-400 transition-colors" title="Rename">
                  <Pencil size={11} />
                </button>
              )}
            </div>
            {subtitle && <div className="text-[10px] text-slate-500 truncate mt-0.5">{subtitle}</div>}
          </>
        )}
      </div>
      <div className="flex items-center gap-1 ml-3">
        <button onClick={(e) => { e.stopPropagation(); onTest(); }} className="px-2 py-1 text-[10px] text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded" title="Test">
          <TestTube size={11} />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); setConfirming(false); }} className="px-2 py-1 text-[10px] text-red-400 hover:bg-red-900/30 rounded">Delete</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirming(false); }} className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 rounded">Cancel</button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirming(true); }} className="px-2 py-1 text-[10px] text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded" title="Delete">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}