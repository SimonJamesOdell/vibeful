import { useState } from 'react';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, Check, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { generateProposals, type WorkflowProposal } from '../lib/proposalGenerator';
const _unused = null; // Was applyAICommand — now using useFlowStore directly

export default function ProposalCard() {
  const [proposals, setProposals] = useState<WorkflowProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { nodes, edges, loadGraph } = useFlowStore();

  const handleGenerate = async () => {
    if (nodes.length === 0) {
      setError('Add some nodes to the canvas first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const results = await generateProposals(nodes, edges);
      setProposals(results);
      if (results.length === 0) {
        setError('No optimization suggestions found. Your agent graph looks good!');
      }
    } catch {
      setError('Failed to generate proposals. Is the agent engine running?');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyProposal = (proposal: WorkflowProposal, index: number) => {
    const { addNode, nodes: currentNodes } = useFlowStore.getState();
    for (const change of proposal.changes) {
      if (change.type === 'add_node') {
        const nodeType = `builtin.${change.target}`;
        const label = change.target.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
        // Position at end of current nodes
        const y = currentNodes.length * 120 + 50;
        addNode(nodeType, label, { x: 250, y });
      }
      if (change.type === 'enable_phase' || change.type === 'disable_phase') {
        window.dispatchEvent(
          new CustomEvent('vibeful:configure-analysis', {
            detail: { [change.target]: { enabled: change.type === 'enable_phase' } },
          })
        );
      }
    }
    setDismissed((prev) => new Set([...prev, index]));
  };

  const handleDismiss = (index: number) => {
    setDismissed((prev) => new Set([...prev, index]));
  };

  const visibleProposals = proposals.filter((_, i) => !dismissed.has(i));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Optimization Proposals</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            AI-powered suggestions to improve your agent
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded transition-colors"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Lightbulb size={12} />
          )}
          Analyze
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-slate-400">
          {error}
        </div>
      )}

      {visibleProposals.length === 0 && !loading && !error && proposals.length > 0 && (
        <div className="text-xs text-slate-500 text-center py-4">
          All proposals reviewed. Click "Analyze" to regenerate.
        </div>
      )}

      <div className="space-y-3">
        {visibleProposals.map((proposal, i) => {
          const isExpanded = expanded.has(i);
          return (
            <div
              key={i}
              className={`bg-slate-900 border rounded-lg overflow-hidden transition-colors ${
                proposal.confidence >= 80
                  ? 'border-green-800'
                  : proposal.confidence >= 60
                  ? 'border-yellow-800'
                  : 'border-slate-700'
              }`}
            >
              {/* Header */}
              <button
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    proposal.confidence >= 80
                      ? 'bg-green-900/30 text-green-400'
                      : proposal.confidence >= 60
                      ? 'bg-yellow-900/30 text-yellow-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Lightbulb size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200">{proposal.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">{proposal.problem}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      proposal.confidence >= 80
                        ? 'bg-green-900/50 text-green-400'
                        : proposal.confidence >= 60
                        ? 'bg-yellow-900/50 text-yellow-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {proposal.confidence}%
                  </span>
                  {isExpanded ? (
                    <ChevronDown size={12} className="text-slate-500" />
                  ) : (
                    <ChevronRight size={12} className="text-slate-500" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
                  <div>
                    <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                      Solution
                    </div>
                    <p className="text-xs text-slate-300">{proposal.solution}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-medium text-green-400 uppercase tracking-wider mb-1">
                        Benefits
                      </div>
                      <p className="text-xs text-slate-400">{proposal.benefits}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-yellow-400 uppercase tracking-wider mb-1">
                        Risks
                      </div>
                      <p className="text-xs text-slate-400">{proposal.risks}</p>
                    </div>
                  </div>

                  {/* Impact */}
                  <div className="flex gap-3 text-[10px]">
                    <div className="flex items-center gap-1 text-green-400">
                      <TrendingUp size={10} />
                      {proposal.estimatedImpact.costChange}
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      ⏱ {proposal.estimatedImpact.latencyChange}
                    </div>
                  </div>

                  {/* Changes */}
                  {proposal.changes.length > 0 && (
                    <div>
                      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                        Changes ({proposal.changes.length})
                      </div>
                      <div className="space-y-1">
                        {proposal.changes.map((change, ci) => (
                          <div key={ci} className="flex items-center gap-2 text-xs text-slate-400">
                            <div className="w-1 h-1 rounded-full bg-indigo-400" />
                            {change.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => handleApplyProposal(proposal, i)}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                    >
                      <Check size={12} /> Apply
                    </button>
                    <button
                      onClick={() => handleDismiss(i)}
                      className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
