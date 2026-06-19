import { useState } from 'react';
import { FlaskConical, Play, Square, TrendingUp, Loader2 } from 'lucide-react';
import { computeABTestStats, type VariantStats, type ABTestStats } from '../lib/statistics';

interface ABTestResult {
  id: string;
  test_id: string;
  variant: string;
  success: boolean;
  latency_ms: number;
  tokens_used: number;
  cost_usd: string;
}

interface ABTest {
  id: string;
  agent_id: string;
  name: string;
  status: string;
  primary_metric: string;
  min_sample_size: number;
  variant_a_config: Record<string, unknown>;
  variant_b_config: Record<string, unknown>;
  winner: string | null;
}

export default function ABTestDashboard({ agentId }: { agentId?: string | null }) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [results, setResults] = useState<ABTestResult[]>([]);
  const [stats, setStats] = useState<ABTestStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);

  // Create wizard state
  const [wizardName, setWizardName] = useState('');
  const [wizardDesc, setWizardDesc] = useState('');
  const [wizardAgentId, setWizardAgentId] = useState('');

  const fetchTests = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/v1/ab-tests');
      const data = await resp.json();
      setTests(data.tests || data || []);
    } catch {
      // Expected during dev
    } finally {
      setLoading(false);
    }
  };

  const fetchResults = async (testId: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/v1/ab-tests/${testId}/results`);
      const data = await resp.json();
      const rawResults = data.results || data || [];
      setResults(rawResults);

      // Compute stats
      const aResults = rawResults.filter((r: ABTestResult) => r.variant === 'a');
      const bResults = rawResults.filter((r: ABTestResult) => r.variant === 'b');

      const variantA: VariantStats = {
        variant: 'a',
        sampleSize: aResults.length,
        successes: aResults.filter((r: ABTestResult) => r.success).length,
        successRate: aResults.length > 0
          ? aResults.filter((r: ABTestResult) => r.success).length / aResults.length
          : 0,
        avgLatencyMs: aResults.length > 0
          ? aResults.reduce((s: number, r: ABTestResult) => s + (r.latency_ms || 0), 0) / aResults.length
          : 0,
        avgCost: aResults.length > 0
          ? aResults.reduce((s: number, r: ABTestResult) => s + parseFloat(r.cost_usd || '0'), 0) / aResults.length
          : 0,
      };

      const variantB: VariantStats = {
        variant: 'b',
        sampleSize: bResults.length,
        successes: bResults.filter((r: ABTestResult) => r.success).length,
        successRate: bResults.length > 0
          ? bResults.filter((r: ABTestResult) => r.success).length / bResults.length
          : 0,
        avgLatencyMs: bResults.length > 0
          ? bResults.reduce((s: number, r: ABTestResult) => s + (r.latency_ms || 0), 0) / bResults.length
          : 0,
        avgCost: bResults.length > 0
          ? bResults.reduce((s: number, r: ABTestResult) => s + parseFloat(r.cost_usd || '0'), 0) / bResults.length
          : 0,
      };

      setStats(computeABTestStats(variantA, variantB));
    } catch {
      setError('Failed to load results');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!wizardName || !wizardAgentId) return;
    setLoading(true);
    try {
      const resp = await fetch('/v1/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wizardName,
          description: wizardDesc,
          agent_id: wizardAgentId,
          primary_metric: 'successRate',
          min_sample_size: 30,
        }),
      });
      if (resp.ok) {
        setShowWizard(false);
        setWizardName('');
        setWizardDesc('');
        await fetchTests();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (testId: string) => {
    await fetch(`/v1/ab-tests/${testId}/start`, { method: 'POST' });
    await fetchTests();
  };

  const handleStop = async (testId: string) => {
    await fetch(`/v1/ab-tests/${testId}/stop`, { method: 'POST' });
    await fetchTests();
  };

  const selectTest = async (test: ABTest) => {
    setSelectedTest(test);
    if (test.status === 'running' || test.status === 'completed') {
      await fetchResults(test.id);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">A/B Testing</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Scientific comparison of agent config variants
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTests}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
            Refresh
          </button>
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            New Test
          </button>
        </div>
      </div>

      {/* Create Wizard */}
      {showWizard && (
        <div className="bg-slate-900 border border-indigo-700 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-slate-200">New A/B Test</h4>
          <input
            value={wizardName}
            onChange={(e) => setWizardName(e.target.value)}
            placeholder="Test name…"
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
          />
          <input
            value={wizardAgentId}
            onChange={(e) => setWizardAgentId(e.target.value)}
            placeholder="Agent ID…"
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200"
          />
          <textarea
            value={wizardDesc}
            onChange={(e) => setWizardDesc(e.target.value)}
            placeholder="Description…"
            rows={2}
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded">
              Create
            </button>
            <button onClick={() => setShowWizard(false)} className="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Test list */}
      <div className="space-y-2">
        {tests.map((test) => (
          <button
            key={test.id}
            onClick={() => selectTest(test)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedTest?.id === test.id ? 'border-indigo-500 bg-slate-800' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-200">{test.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                test.status === 'running' ? 'bg-green-900/50 text-green-400' :
                test.status === 'completed' ? 'bg-blue-900/50 text-blue-400' :
                'bg-slate-800 text-slate-400'
              }`}>{test.status}</span>
            </div>
            {test.winner && <div className="text-[10px] text-green-400 mt-1">Winner: Variant {test.winner}</div>}
          </button>
        ))}
      </div>

      {/* Stats for selected test */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 border border-slate-700 rounded p-3">
              <div className="text-[10px] text-slate-500 mb-1">Variant A</div>
              <div className="text-sm font-bold text-slate-200">{(stats.variantA.successRate * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-slate-500">{stats.variantA.sampleSize} samples</div>
            </div>
            <div className="bg-slate-900 border border-slate-700 rounded p-3">
              <div className="text-[10px] text-slate-500 mb-1">Variant B</div>
              <div className="text-sm font-bold text-slate-200">{(stats.variantB.successRate * 100).toFixed(1)}%</div>
              <div className="text-[10px] text-slate-500">{stats.variantB.sampleSize} samples</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">P-value</span>
              <span className={stats.significant ? 'text-green-400 font-bold' : 'text-slate-300'}>
                {stats.pValue.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Lift</span>
              <span className={stats.lift > 0 ? 'text-green-400' : 'text-red-400'}>
                {stats.lift > 0 ? '+' : ''}{stats.lift.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Significant at {stats.confidenceLevel * 100}%</span>
              <span className={stats.significant ? 'text-green-400' : 'text-yellow-400'}>
                {stats.significant ? 'YES ✓' : 'Not yet'}
              </span>
            </div>
            {stats.winner && (
              <div className="text-xs font-bold text-green-400">
                Winner: Variant {stats.winner.toUpperCase()} (p={stats.pValue.toFixed(4)})
              </div>
            )}
          </div>

          {selectedTest && selectedTest.status === 'running' && (
            <button
              onClick={() => handleStop(selectedTest.id)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded"
            >
              <Square size={10} /> Stop Test
            </button>
          )}
        </div>
      )}
    </div>
  );
}
