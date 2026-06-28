import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, History, Loader2, Plus, RefreshCw } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

export default function TokenDashboard() {
  const [userIdentity, setUserIdentity] = useState('');
  const [agentId, setAgentId] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creditAmount, setCreditAmount] = useState(10000);

  const fetchBalance = async () => {
    if (!userIdentity) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ user_identity: userIdentity });
      if (agentId) params.set('agent_id', agentId);
      const resp = await fetch(`/v1/tokens/balance?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setBalance(data.balance);
        setTransactions(data.transactions || []);
      } else {
        setError('User not found');
      }
    } catch {
      setError('Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  const handleCredit = async () => {
    if (!userIdentity || creditAmount <= 0) return;
    setLoading(true);
    try {
      await fetch('/v1/tokens/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_identity: userIdentity,
          agent_id: agentId || undefined,
          amount: creditAmount,
          transaction_type: 'purchase',
          description: 'Manual credit',
        }),
      });
      await fetchBalance();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Token Credits</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Per-user token budget and transaction history</p>
        </div>
      </div>

      {/* Lookup */}
      <div className="flex gap-2">
        <input value={userIdentity} onChange={(e) => setUserIdentity(e.target.value)}
          placeholder="User identity…" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
        <input value={agentId} onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent ID (optional)" className="w-36 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
        <button onClick={fetchBalance} disabled={loading || !userIdentity}
          className="px-2 py-1 bg-indigo-600 text-white rounded text-xs flex items-center gap-1">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Lookup
        </button>
      </div>

      {error && <div className="px-3 py-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">{error}</div>}

      {/* Balance card */}
      {balance !== null && (
        <div className="bg-slate-900 border border-slate-700 rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-indigo-900/50 flex items-center justify-center">
                <DollarSign size={18} className="text-indigo-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-100">{balance.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">tokens remaining</div>
              </div>
            </div>
          </div>

          {/* Quick credit */}
          <div className="flex items-center gap-2 p-2 bg-slate-800 rounded">
            <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(Number(e.target.value))}
              className="w-24 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
            <button onClick={handleCredit} disabled={loading}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded">
              <Plus size={10} /> Credit
            </button>
          </div>
        </div>
      )}

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Transaction History</div>
          <div className="space-y-1">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 px-3 bg-slate-900 border border-slate-800 rounded">
                <div className="flex items-center gap-2">
                  {tx.transaction_type === 'usage' ? (
                    <TrendingDown size={12} className="text-red-400" />
                  ) : (
                    <TrendingUp size={12} className="text-green-400" />
                  )}
                  <div>
                    <div className="text-xs text-slate-300">{tx.description || tx.transaction_type}</div>
                    <div className="text-[9px] text-slate-600">{tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}</div>
                  </div>
                </div>
                <span className={`text-xs font-medium ${tx.transaction_type === 'usage' ? 'text-red-400' : 'text-green-400'}`}>
                  {tx.transaction_type === 'usage' ? '-' : '+'}{tx.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
