import { useState, useEffect } from 'react';
import { BarChart3, Bot, BookOpen, Server, FileText, Globe, Loader2 } from 'lucide-react';

interface AgentStats {
  id: string;
  name: string;
  model: string;
  pages: number;
  published: number;
  mcp_attached: number;
}

interface AnalyticsSummary {
  agents: number;
  contexts: number;
  mcp_servers: number;
  pages: number;
  published_pages: number;
  mcp_healthy: number;
  conversations_today: number;
  tokens_used_today: number;
  cost_estimate_usd: number;
  guardrail_triggers: number;
  per_agent: AgentStats[];
}

export default function AnalyticsDashboard({ activeAgentId }: { activeAgentId: string | null }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/v1/analytics')
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [activeAgentId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={20} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300">
        {error}
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    { label: 'Agents', value: summary.agents, icon: Bot, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Knowledge Bases', value: summary.contexts, icon: BookOpen, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'MCP Servers', value: summary.mcp_servers, icon: Server, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Pages', value: summary.pages, icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Published', value: summary.published_pages, icon: Globe, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Conversations', value: summary.conversations_today, icon: BarChart3, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div>
        <label className="text-xs text-slate-400 font-medium mb-3 block">Platform Overview</label>
        <div className="grid grid-cols-3 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="p-4 bg-slate-900 border border-slate-700 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <c.icon size={14} className={c.color} />
                </div>
                <span className="text-[11px] text-slate-500">{c.label}</span>
              </div>
              <p className="text-2xl font-semibold text-slate-200">{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-agent table */}
      {summary.per_agent && summary.per_agent.length > 0 && (
        <div>
          <label className="text-xs text-slate-400 font-medium mb-3 block">Per-Agent Breakdown</label>
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-3 text-slate-500 font-medium">Agent</th>
                  <th className="text-left p-3 text-slate-500 font-medium">Model</th>
                  <th className="text-right p-3 text-slate-500 font-medium">Pages</th>
                  <th className="text-right p-3 text-slate-500 font-medium">MCP</th>
                </tr>
              </thead>
              <tbody>
                {summary.per_agent.map((a) => (
                  <tr key={a.id} className="border-b border-slate-800 last:border-0">
                    <td className="p-3 text-slate-300">{a.name}</td>
                    <td className="p-3 text-slate-500 font-mono">{a.model}</td>
                    <td className="p-3 text-slate-300 text-right">{a.pages} <span className="text-slate-600">({a.published} pub)</span></td>
                    <td className="p-3 text-slate-300 text-right">{a.mcp_attached}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Placeholder metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl">
          <span className="text-[10px] text-slate-500">Est. Cost (USD)</span>
          <p className="text-lg font-semibold text-slate-200">${summary.cost_estimate_usd.toFixed(2)}</p>
        </div>
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl">
          <span className="text-[10px] text-slate-500">Guardrail Triggers</span>
          <p className="text-lg font-semibold text-slate-200">{summary.guardrail_triggers}</p>
        </div>
        <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl">
          <span className="text-[10px] text-slate-500">Tokens Today</span>
          <p className="text-lg font-semibold text-slate-200">{summary.tokens_used_today.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}