import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Sparkles, Save } from 'lucide-react';

interface Glyph {
  id?: string;
  name: string;
  symbol: string;
  description: string;
  glyphset: string;
}

export default function GlyphManager() {
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Glyph>({ name: '', symbol: '', description: '', glyphset: '' });

  const fetchGlyphs = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/v1/glyphs');
      if (resp.ok) {
        const data = await resp.json();
        setGlyphs(data.glyphs || data || []);
      }
    } catch { /* expected during dev */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGlyphs(); }, []);

  const handleSave = async () => {
    if (!editing.name || !editing.symbol) return;
    try {
      await fetch('/v1/glyphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      setEditing({ name: '', symbol: '', description: '', glyphset: '' });
      await fetchGlyphs();
    } catch (err: any) { setError(err.message); }
  };

  const handleDelete = async (name: string) => {
    await fetch(`/v1/glyphs/${encodeURIComponent(name)}`, { method: 'DELETE' });
    await fetchGlyphs();
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Glyph Manager</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Symbolic visual representations for concepts</p>
        </div>
        <button onClick={fetchGlyphs} disabled={loading} className="p-1.5 text-slate-400 hover:text-slate-200">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        </button>
      </div>

      {/* Add form */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
        <div className="flex gap-2">
          <input value={editing.symbol} onChange={(e) => setEditing({ ...editing, symbol: e.target.value })}
            placeholder="Symbol (e.g. 🌀)" className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-center" />
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Name" className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
          <button onClick={handleSave} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs flex items-center gap-1">
            <Save size={10} /> Add
          </button>
        </div>
        <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
          placeholder="Description" className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200" />
      </div>

      {/* Glyph grid */}
      <div className="grid grid-cols-2 gap-2">
        {glyphs.map((g) => (
          <div key={g.name} className="bg-slate-900 border border-slate-700 rounded p-3 flex items-center gap-3 group">
            <div className="text-2xl">{g.symbol}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-200">{g.name}</div>
              <div className="text-[10px] text-slate-500 truncate">{g.description}</div>
              {g.glyphset && <div className="text-[9px] text-indigo-400 mt-0.5">{g.glyphset}</div>}
            </div>
            <button onClick={() => handleDelete(g.name)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {glyphs.length === 0 && !loading && (
          <div className="col-span-2 text-xs text-slate-500 text-center py-6">No glyphs yet. Add one above.</div>
        )}
      </div>
    </div>
  );
}
