import { useState } from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, Activity, Loader2, Shield, Zap, DollarSign } from 'lucide-react';

interface RegressionAlert {
  node_id: string;
  node_name: string;
  metric: string;
  severity: 'warning' | 'critical';
  pct_change: number;
  message: string;
}

interface NodeBaseline {
  node_type: string;
  success_rate: number;
  mean_latency_ms: number;
  mean_tokens: number;
  sample_count: number;
}

interface PerformanceSummary {
  agent_id: string;
  nodes_tracked: number;
  baseline_established: boolean;
  alerts: RegressionAlert[];
  baselines: Record<string, NodeBaseline>;
}

export default function RegressionMonitor() {
  const [agentId, setAgentId] = useState('');
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/v1/agents/${agentId}/performance`);
      if (resp.ok) {
        const data = await resp.json();
        setSummary(data);
      } else {
        setError('Agent not found or no performance data yet.');
      }
    } catch {
      setError('Failed to fetch performance data.');
    } finally {
      setLoading(false);
    }
  };

  const handleEstablishBaseline = async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      await fetch(`/v1/agents/${agentId}/baseline`, { method: 'POST' });
      await handleCheck();
    } catch {
      setError('Failed to establish baseline.');
    } finally {
      setLoading(false);
    }
  };

  const criticalAlerts = summary?.alerts.filter((a) => a.severity === 'critical') || [];
  const warningAlerts = summary?.alerts.filter((a) => a.severity === 'warning') || [];

  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'latency_ms': return <Zap size={10} />;
      case 'success_rate': return <Shield size={10} />;
      case 'tokens_used': return <DollarSign size={10} />;
      default: return <Activity size={10} />;
    }
  };

  const getChangeColor = (metric: string, pctChange: number) => {
    // For success_rate, negative pct_change is bad. For others, positive is bad.
    if (metric === 'success_rate') {
      return pctChange < 0 ? 'text-red-400' : 'text-green-400';
    }
    return pctChange > 0 ? 'text-red-400' : 'text-green-400';
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Regression Monitor</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Detect performance degradation across agent versions
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="Agent ID…"
            className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 w-40"
          />
          <button
            onClick={handleCheck}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Activity size={12} />}
            Check
          </button>
          <button
            onClick={handleEstablishBaseline}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          >
            Baseline
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400">
          {error}
        </div>
      )}

      {/* Alerts */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-red-400 uppercase tracking-wider">
            Critical Alerts ({criticalAlerts.length})
          </div>
          {criticalAlerts.map((alert, i) => (
            <div key={i} className="bg-red-950/30 border border-red-800 rounded p-3 flex items-start gap-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-red-300">{alert.node_name || alert.node_id}</span>
                  <span className="text-[10px] text-red-500">{alert.metric}</span>
                </div>
                <div className="text-xs text-red-200 mt-0.5">{alert.message}</div>
              </div>
              <div className="flex items-center gap-1 text-red-400 text-xs flex-shrink-0">
                <TrendingUp size={10} />
                {alert.pct_change > 0 ? '+' : ''}{alert.pct_change}%
              </div>
            </div>
          ))}
        </div>
      )}

      {warningAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-yellow-400 uppercase tracking-wider">
            Warnings ({warningAlerts.length})
          </div>
          {warningAlerts.map((alert, i) => (
            <div key={i} className="bg-yellow-950/30 border border-yellow-800 rounded p-3 flex items-start gap-3">
              <AlertTriangle size={14} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-yellow-300">{alert.node_name || alert.node_id}</span>
                  <span className="text-[10px] text-yellow-500">{alert.metric}</span>
                </div>
                <div className="text-xs text-yellow-200 mt-0.5">{alert.message}</div>
              </div>
              <div className="flex items-center gap-1 text-yellow-400 text-xs flex-shrink-0">
                {getMetricIcon(alert.metric)}
                {alert.pct_change > 0 ? '+' : ''}{alert.pct_change}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Baselines */}
      {summary?.baselines && Object.keys(summary.baselines).length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            Node Baselines ({summary.nodes_tracked} tracked)
          </div>
          <div className="grid gap-2">
            {Object.entries(summary.baselines).map(([nodeId, bl]) => (
              <div key={nodeId} className="bg-slate-900 border border-slate-700 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-200">{nodeId}</span>
                  <span className="text-[10px] text-slate-500">{bl.node_type}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <div className="text-slate-500">Success</div>
                    <div className={`font-medium ${bl.success_rate >= 95 ? 'text-green-400' : bl.success_rate >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {bl.success_rate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Latency</div>
                    <div className="text-slate-300 font-medium">{bl.mean_latency_ms}ms</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Tokens</div>
                    <div className="text-slate-300 font-medium">{bl.mean_tokens}</div>
                  </div>
                </div>
                <div className="text-[9px] text-slate-600 mt-1">{bl.sample_count} samples</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All clear */}
      {summary && summary.alerts.length === 0 && Object.keys(summary.baselines || {}).length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-950/30 border border-green-800 rounded text-xs text-green-300">
          <Shield size={14} />
          All metrics within normal range. No regressions detected.
        </div>
      )}
    </div>
  );
}
