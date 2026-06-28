import { useState, useEffect } from 'react';
import { MessageSquare, Loader2, Clock, Bot, User, ChevronRight } from 'lucide-react';

interface SessionItem {
  session_id: string;
  agent_config: { agent_id?: string; agent_name?: string };
  messages_count: number;
  created_at: string;
  updated_at: string;
}

export default function Conversations() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/v1/sessions?limit=200')
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (ts: string) => {
    try {
      const d = new Date(ts + (ts.includes('T') ? '' : 'Z'));
      return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">Conversations</h2>
            <p className="text-xs text-slate-500 mt-1">
              {loading ? 'Loading…' : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-slate-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-slate-700 rounded-xl">
            <MessageSquare size={32} className="text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 mb-1">No conversations yet</p>
            <p className="text-xs text-slate-600">
              Conversations appear here once agents start handling user sessions
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.session_id}
                className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(expanded === s.session_id ? null : s.session_id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <MessageSquare size={16} className="text-indigo-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">{s.session_id.slice(0, 12)}…</span>
                        <span className="text-[10px] text-slate-600">{s.messages_count} msgs</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                        <Clock size={9} />
                        <span>{formatDate(s.updated_at || s.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-slate-600 transition-transform flex-shrink-0 ${expanded === s.session_id ? 'rotate-90' : ''}`}
                  />
                </button>
                {expanded === s.session_id && (
                  <div className="px-4 pb-4 pt-0 border-t border-slate-800">
                    <div className="mt-3 pt-3">
                      <div className="text-[11px] text-slate-500 space-y-1">
                        <div>Session: <span className="text-slate-300 font-mono">{s.session_id}</span></div>
                        {s.agent_config?.agent_id && (
                          <div>Agent: <span className="text-slate-300 font-mono">{s.agent_config.agent_id.slice(0, 12)}…</span></div>
                        )}
                        <div>Messages: <span className="text-slate-300">{s.messages_count}</span></div>
                        <div>Created: <span className="text-slate-300">{formatDate(s.created_at)}</span></div>
                        <div>Updated: <span className="text-slate-300">{formatDate(s.updated_at)}</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
