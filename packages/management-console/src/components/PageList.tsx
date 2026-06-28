import { useState, useEffect } from 'react';
import { FileText, Plus, Globe, Clock, ExternalLink } from 'lucide-react';

interface PageSummary {
  id: string;
  agent_id: string;
  slug: string;
  title: string;
  content_markdown: string;
  published: number;
  created_at: string;
  updated_at: string;
}

export default function PageList({ activeAgentId, onEdit }: { activeAgentId: string | null; onEdit?: (pageId: string) => void }) {
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPages = () => {
    setLoading(true);
    const url = activeAgentId
      ? `/v1/pages?agent_id=${activeAgentId}`
      : '/v1/pages';
    fetch(url)
      .then((r) => r.json())
      .then((data) => setPages(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load pages'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPages(); }, [activeAgentId]);

  return (
    <div>
      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => { setError(''); fetchPages(); }} className="text-red-400 hover:text-red-300">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <FileText size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-sm text-slate-400 mb-1">No pages yet</p>
          <p className="text-xs text-slate-600 max-w-xs mx-auto">
            {activeAgentId
              ? 'Create pages for this agent to publish content, dashboards, and forms.'
              : 'Select an agent or use the Guide to create your first page.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <div
              key={page.id}
              onClick={() => onEdit?.(page.id)}
              className={`flex items-center justify-between p-4 bg-slate-900 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors group ${onEdit ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  page.published ? 'bg-emerald-500/20' : 'bg-slate-700/50'
                }`}>
                  {page.published ? (
                    <Globe size={14} className="text-emerald-400" />
                  ) : (
                    <FileText size={14} className="text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">
                      {page.title || page.slug}
                    </span>
                    {!page.published && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/30 text-amber-400 font-medium flex-shrink-0">
                        Draft
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span className="font-mono">/{page.slug}</span>
                    <span>·</span>
                    <Clock size={10} />
                    <span>{page.updated_at ? new Date(page.updated_at).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                  className="p-1.5 text-slate-500 hover:text-slate-300 rounded transition-colors"
                  title="View page"
                >
                  <ExternalLink size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}