import { useState, useEffect } from 'react';
import { Server, Plus, Check, ExternalLink, Package, Star, Download, Loader2 } from 'lucide-react';

interface CatalogServer {
  id: string;
  name: string;
  description: string;
  url: string;
  port: number;
  category: string;
  tools: string[];
  installed: boolean;
}

const BUILTIN_CATALOG: CatalogServer[] = [
  {
    id: 'builtin-web-search',
    name: 'Web Search',
    description: 'Search the web via DuckDuckGo. Returns snippets and URLs.',
    url: 'http://localhost:3100',
    port: 3100,
    category: 'Search',
    tools: ['web_search'],
    installed: false,
  },
  {
    id: 'builtin-file-read',
    name: 'File Reader',
    description: 'Read files from the workspace. Sandboxed with path sanitization.',
    url: 'http://localhost:3101',
    port: 3101,
    category: 'Files',
    tools: ['file_read'],
    installed: false,
  },
  {
    id: 'builtin-calculator',
    name: 'Calculator',
    description: 'Evaluate mathematical expressions safely.',
    url: 'http://localhost:3102',
    port: 3102,
    category: 'Utility',
    tools: ['calculate'],
    installed: false,
  },
];

export default function McpCatalog({ installedIds, onInstall, onRefresh }: {
  installedIds: string[];
  onInstall: (server: CatalogServer) => void;
  onRefresh: () => void;
}) {
  const [catalog] = useState<CatalogServer[]>(BUILTIN_CATALOG);
  const [installing, setInstalling] = useState<string | null>(null);

  const servers = catalog.map((s) => ({
    ...s,
    installed: installedIds.includes(s.id),
  }));

  return (
    <div>
      <div className="grid grid-cols-1 gap-3">
        {servers.map((srv) => {
          const isInstalling = installing === srv.id;
          return (
            <div
              key={srv.id}
              className={`p-4 bg-slate-900 border rounded-xl transition-colors ${
                srv.installed
                  ? 'border-emerald-700/50 bg-emerald-500/5'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    srv.installed ? 'bg-emerald-500/20' : 'bg-cyan-500/20'
                  }`}>
                    {srv.installed ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Package size={14} className="text-cyan-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{srv.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">
                        :{srv.port}
                      </span>
                      {srv.installed && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-900/30 text-emerald-400 font-medium">
                          Installed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{srv.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-slate-600 uppercase tracking-wide">{srv.category}</span>
                      <span className="text-[10px] text-slate-600">
                        {srv.tools.length} tool{srv.tools.length !== 1 ? 's' : ''}: {srv.tools.join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!srv.installed) {
                      setInstalling(srv.id);
                      onInstall(srv);
                      setTimeout(() => {
                        setInstalling(null);
                        onRefresh();
                      }, 1500);
                    }
                  }}
                  disabled={srv.installed || isInstalling}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                    srv.installed
                      ? 'bg-slate-800 text-slate-600 cursor-default'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50'
                  }`}
                >
                  {isInstalling ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : srv.installed ? (
                    <Check size={12} />
                  ) : (
                    <Download size={12} />
                  )}
                  {srv.installed ? 'Installed' : isInstalling ? 'Installing…' : 'Install'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Community note */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-5 text-center">
        <Star size={20} className="text-slate-600 mx-auto mb-2" />
        <p className="text-xs text-slate-500">Community MCP servers coming soon</p>
        <p className="text-[10px] text-slate-600 mt-1">
          Publish your own MCP servers to the catalog using <span className="text-slate-500 font-mono">create-vibeful-mcp</span>
        </p>
      </div>
    </div>
  );
}