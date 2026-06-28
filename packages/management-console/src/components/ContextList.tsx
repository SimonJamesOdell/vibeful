import { useState, useEffect } from 'react';
import { BookOpen, Trash2, Pencil, Check, X, Plus, FileText, ArrowLeft, Save, Upload, Loader2 } from 'lucide-react';

interface Context {
  id: string;
  name: string;
  agent_id: string | null;
  created_at: string;
}

interface ContextFile {
  id: string;
  context_id: string;
  filename: string;
  content_type: string;
  content: string;
  created_at: string;
}

export default function ContextList({ defaultSelectedId }: { defaultSelectedId?: string | null }) {
  // ── List state ──────────────────────────────────────
  const [contexts, setContexts] = useState<Context[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Editor state ────────────────────────────────────
  const [editingCtxId, setEditingCtxId] = useState<string | null>(null);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // New entry
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryFilename, setNewEntryFilename] = useState('entry.md');
  const [newEntryContent, setNewEntryContent] = useState('');

  // Inline file editing
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editFilename, setEditFilename] = useState('');

  const [saving, setSaving] = useState(false);

  // ── Open editor from dashboard click ────────────────
  useEffect(() => {
    if (defaultSelectedId) {
      setEditingCtxId(defaultSelectedId);
    }
  }, [defaultSelectedId]);

  const editingCtx = contexts.find((c) => c.id === editingCtxId);

  // ── Fetch contexts ──────────────────────────────────
  const fetchContexts = () => {
    setLoading(true);
    fetch('/v1/contexts')
      .then((r) => r.json())
      .then((data) => { setContexts(Array.isArray(data) ? data : []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  };
  useEffect(() => { fetchContexts(); }, []);

  // ── Fetch files when editor opens ───────────────────
  useEffect(() => {
    if (!editingCtxId) { setFiles([]); return; }
    setFilesLoading(true);
    fetch(`/v1/contexts/${editingCtxId}/files`)
      .then((r) => r.json())
      .then((data) => { setFiles(Array.isArray(data) ? data : []); setFilesLoading(false); })
      .catch(() => { setFiles([]); setFilesLoading(false); });
  }, [editingCtxId]);

  // ── List actions ────────────────────────────────────
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const resp = await fetch('/v1/contexts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (resp.ok) { setNewName(''); fetchContexts(); }
    } catch { /* silent */ }
    finally { setCreating(false); }
  };

  const handleRename = async (id: string) => {
    const name = renameValue.trim();
    if (!name) { setRenaming(null); return; }
    try {
      const resp = await fetch(`/v1/contexts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (resp.ok) setContexts((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    } catch { /* silent */ }
    finally { setRenaming(null); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" and all its entries?`)) return;
    setDeleting(id);
    try {
      await fetch(`/v1/contexts/${id}`, { method: 'DELETE' });
      setContexts((prev) => prev.filter((c) => c.id !== id));
      if (editingCtxId === id) setEditingCtxId(null);
    } catch { /* silent */ }
    finally { setDeleting(null); }
  };

  // ── Editor actions ──────────────────────────────────
  const handleAddEntry = async () => {
    if (!editingCtxId || !newEntryContent.trim()) return;
    setSaving(true);
    try {
      await fetch(`/v1/contexts/${editingCtxId}/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newEntryContent, filename: newEntryFilename, content_type: 'text/plain' }),
      });
      setNewEntryContent('');
      setNewEntryFilename('entry.md');
      setShowNewEntry(false);
      const resp = await fetch(`/v1/contexts/${editingCtxId}/files`);
      setFiles(Array.isArray(await resp.json()) ? await resp.json() : []);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleStartEdit = (f: ContextFile) => {
    setEditingFileId(f.id);
    setEditContent(f.content);
    setEditFilename(f.filename);
  };

  const handleSaveEdit = async (fileId: string) => {
    if (!editingCtxId) return;
    setSaving(true);
    try {
      await fetch(`/v1/contexts/${editingCtxId}/files/${fileId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, filename: editFilename }),
      });
      setEditingFileId(null);
      const resp = await fetch(`/v1/contexts/${editingCtxId}/files`);
      setFiles(Array.isArray(await resp.json()) ? await resp.json() : []);
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!editingCtxId || !confirm('Delete this entry?')) return;
    try {
      await fetch(`/v1/contexts/${editingCtxId}/files/${fileId}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch { /* silent */ }
  };

  // ══════════════════════════════════════════════════════
  // Editor sub-page
  // ══════════════════════════════════════════════════════
  if (editingCtxId && editingCtx) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* Back button + header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setEditingCtxId(null)}
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
            title="Back to list"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-200">{editingCtx.name || 'Unnamed'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Knowledge base entries
              <span className="text-slate-600 mx-1.5">·</span>
              <span className="font-mono">{editingCtxId.slice(0, 8)}…</span>
            </p>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowNewEntry(!showNewEntry)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs transition-colors"
            >
              <Plus size={14} />
              New Entry
            </button>
          </div>
        </div>

        {/* New entry form */}
        {showNewEntry && (
          <div className="mb-6 bg-slate-900 border border-slate-700 rounded-xl p-4">
            <input
              value={newEntryFilename}
              onChange={(e) => setNewEntryFilename(e.target.value)}
              placeholder="Filename"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 mb-3 focus:outline-none focus:border-indigo-500"
            />
            <textarea
              value={newEntryContent}
              onChange={(e) => setNewEntryContent(e.target.value)}
              placeholder="Write or paste entry content… Markdown supported."
              rows={8}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-y mb-3"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddEntry}
                disabled={saving || !newEntryContent.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs transition-colors"
              ><Save size={13} /> Save</button>
              <button onClick={() => setShowNewEntry(false)} className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Files */}
        {filesLoading ? (
          <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-500" /></div>
        ) : files.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-700 rounded-xl">
            <FileText size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-1">No entries yet</p>
            <p className="text-xs text-slate-600">Add documents, FAQs, or any text content your agents should reference</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                {editingFileId === f.id ? (
                  <div className="p-4 space-y-3">
                    <input
                      value={editFilename}
                      onChange={(e) => setEditFilename(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={10}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-y"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveEdit(f.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs transition-colors"
                      ><Save size={13} /> Save</button>
                      <button onClick={() => setEditingFileId(null)} className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-emerald-400 flex-shrink-0" />
                        <span className="text-sm text-slate-200 font-medium truncate">{f.filename}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 ml-6 truncate">{f.content.slice(0, 120)}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                      <button onClick={() => handleStartEdit(f)} className="p-1.5 text-slate-600 hover:text-yellow-400 hover:bg-slate-800 rounded transition-colors" title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => handleDeleteFile(f.id)} className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-slate-800 rounded transition-colors" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // List view
  // ══════════════════════════════════════════════════════
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Knowledge Bases</h2>
          <p className="text-xs text-slate-500 mt-1">Manage your knowledge bases — rename, delete, or open to edit entries</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Knowledge base name…"
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs transition-colors"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>Failed to load: {error}</span>
          <button onClick={() => { setError(''); fetchContexts(); }} className="text-red-400 hover:text-red-300"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><p className="text-slate-500 text-sm">Loading…</p></div>
      ) : contexts.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-1">No knowledge bases yet</p>
          <p className="text-xs text-slate-600">Create one to store documents and FAQs for your agents</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contexts.map((ctx) => (
            <div
              key={ctx.id}
              onClick={() => { if (renaming !== ctx.id) setEditingCtxId(ctx.id); }}
              className="p-4 bg-slate-900 border border-slate-700 rounded-xl hover:border-indigo-500 transition-colors group cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {renaming === ctx.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(ctx.id); if (e.key === 'Escape') setRenaming(null); }}
                        className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-slate-200 w-full focus:outline-none"
                      />
                      <button onClick={() => handleRename(ctx.id)} className="p-0.5 text-green-400 hover:text-green-300 flex-shrink-0"><Check size={14} /></button>
                      <button onClick={() => setRenaming(null)} className="p-0.5 text-slate-500 hover:text-slate-400 flex-shrink-0"><X size={14} /></button>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-slate-200 group-hover:text-indigo-400 text-left truncate block w-full">
                      {ctx.name || 'Unnamed'}
                    </span>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {ctx.agent_id ? 'Linked to agent' : 'No agent linked'}
                    <span className="mx-1.5">·</span>
                    Created {ctx.created_at ? new Date(ctx.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 ml-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRenaming(ctx.id); setRenameValue(ctx.name); }}
                    className="p-1 text-slate-500 hover:text-yellow-400 transition-colors flex-shrink-0" title="Rename"
                  ><Pencil size={14} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(ctx.id, ctx.name); }}
                    disabled={deleting === ctx.id}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors flex-shrink-0" title="Delete"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
