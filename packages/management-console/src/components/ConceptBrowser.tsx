import { useState, useEffect } from 'react';
import { Search, BookOpen, Loader2, RefreshCw } from 'lucide-react';

interface Concept {
  id?: string;
  name: string;
  domain: string;
  description: string;
  glyphset: string;
}

const DOMAINS = ['general', 'technology', 'philosophy', 'science', 'art', 'business', 'meta'];

export default function ConceptBrowser() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [domain, setDomain] = useState('');
  const [search, setSearch] = useState('');

  const fetchConcepts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (domain) params.set('domain', domain);
      if (search) params.set('search', search);
      const resp = await fetch(`/v1/concepts?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setConcepts(data.concepts || data || []);
      }
    } catch { /* expected */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchConcepts(); }, [domain]);

  const filtered = concepts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Concept Browser</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Named conceptual frameworks with glyphsets</p>
        </div>
        <button onClick={fetchConcepts} className="p-1.5 text-slate-400 hover:text-slate-200">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search concepts..." className="w-full bg-slate-800 border border-slate-600 rounded pl-7 pr-2 py-1 text-xs text-slate-200" />
        </div>
        <select value={domain} onChange={(e) => setDomain(e.target.value)}
          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200">
          <option value="">All domains</option>
          {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Concept list */}
      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.id || c.name} className="bg-slate-900 border border-slate-700 rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BookOpen size={12} className="text-indigo-400" />
                <span className="text-xs font-medium text-slate-200">{c.name}</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">{c.domain}</span>
            </div>
            <p className="text-[10px] text-slate-400">{c.description}</p>
            {c.glyphset && (
              <div className="text-[9px] text-indigo-400 mt-1 font-mono">{c.glyphset}</div>
            )}
          </div>
        ))}
        {filtered.length === 0 && !loading && (
          <div className="text-xs text-slate-500 text-center py-6">
            No concepts found{domain ? ` in "${domain}"` : ''}.
          </div>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-slate-400 mx-auto" />}
      </div>
    </div>
  );
}
