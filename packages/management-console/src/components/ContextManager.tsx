import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Upload, BookOpen, FileText, Loader2, X, Edit3, Eye, Save, Image } from 'lucide-react';

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

export default function ContextManager({ defaultSelectedId }: { defaultSelectedId?: string | null }) {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId || null);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sync selectedId when defaultSelectedId changes (e.g., dashboard click
  // navigating to this already-mounted component)
  useEffect(() => {
    if (defaultSelectedId) setSelectedId(defaultSelectedId);
  }, [defaultSelectedId]);

  // Inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Entry editor
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editFilename, setEditFilename] = useState('');

  // Viewing entry
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);

  // New entry
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryFilename, setNewEntryFilename] = useState('entry.md');
  const [newEntryContent, setNewEntryContent] = useState('');

  // Image analysis
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 2500); };

  const fetchContexts = useCallback(async () => {
    try {
      const resp = await fetch('/v1/contexts');
      const data = await resp.json();
      setContexts(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load contexts'); }
  }, []);

  const fetchFiles = useCallback(async (contextId: string) => {
    try {
      const resp = await fetch(`/v1/contexts/${contextId}/files`);
      const data = await resp.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch { setFiles([]); }
  }, []);

  useEffect(() => { fetchContexts(); }, [fetchContexts]);
  useEffect(() => {
    if (selectedId) { fetchFiles(selectedId); setShowNewEntry(false); }
    else setFiles([]);
  }, [selectedId, fetchFiles]);

  // ── Context CRUD ──────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true); setError('');
    try {
      const resp = await fetch('/v1/contexts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!resp.ok) throw new Error('Failed');
      setNewName('');
      await fetchContexts();
      flash('Context created');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    try {
      await fetch(`/v1/contexts/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenamingId(null);
      await fetchContexts();
      flash('Renamed');
    } catch { setError('Failed to rename'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this context and all its entries?')) return;
    try {
      await fetch(`/v1/contexts/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      await fetchContexts();
      flash('Context deleted');
    } catch { setError('Failed to delete'); }
  };

  // ── File CRUD ─────────────────────────────────

  const handleViewFile = async (fileId: string) => {
    if (viewingFileId === fileId) { setViewingFileId(null); return; }
    setViewingFileId(fileId);
  };

  const handleStartEdit = (f: ContextFile) => {
    setEditingFileId(f.id);
    setEditContent(f.content);
    setEditFilename(f.filename);
  };

  const handleSaveEdit = async (fileId: string) => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await fetch(`/v1/contexts/${selectedId}/files/${fileId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, filename: editFilename }),
      });
      setEditingFileId(null);
      await fetchFiles(selectedId);
      flash('Entry saved');
    } catch { setError('Failed to save'); }
    finally { setLoading(false); }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!selectedId || !confirm('Delete this entry?')) return;
    try {
      await fetch(`/v1/contexts/${selectedId}/files/${fileId}`, { method: 'DELETE' });
      if (viewingFileId === fileId) setViewingFileId(null);
      await fetchFiles(selectedId);
      flash('Entry deleted');
    } catch { setError('Failed to delete'); }
  };

  const handleAddEntry = async () => {
    if (!selectedId || !newEntryContent.trim()) return;
    setLoading(true); setError('');
    try {
      await fetch(`/v1/contexts/${selectedId}/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newEntryContent, filename: newEntryFilename, content_type: 'text/plain' }),
      });
      setNewEntryContent('');
      setNewEntryFilename('entry.md');
      setShowNewEntry(false);
      await fetchFiles(selectedId);
      flash('Entry added');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Image analysis ────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file); setAnalysisResult('');
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAnalyzeImage = async () => {
    if (!imageFile) return;
    setAnalyzing(true); setError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => { const b64 = (reader.result as string).split(',')[1]; resolve(b64); };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const resp = await fetch('/v1/analyze-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Analysis failed');
      setAnalysisResult(data.analysis || '');
    } catch (e: any) { setError(e.message); }
    finally { setAnalyzing(false); }
  };

  const handleIngestAnalysis = async () => {
    if (!selectedId || !analysisResult) return;
    setLoading(true);
    try {
      await fetch(`/v1/contexts/${selectedId}/ingest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysisResult, filename: imageFile?.name || 'image-analysis.txt', content_type: 'text/plain' }),
      });
      setAnalysisResult(''); setImageFile(null); setImagePreview(null);
      await fetchFiles(selectedId);
      flash('Image analysis ingested');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const selectedCtx = contexts.find(c => c.id === selectedId);

  return (
    <div className="p-6 max-w-5xl mx-auto" data-tour="knowledge-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Knowledge Base</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage knowledge contexts and their entries — inspect, edit, and organise content
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="hover:text-red-300"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">{successMsg}</div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* ── Left: Context List ──────────────────── */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 h-fit">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <BookOpen size={14} /> Contexts
          </h3>

          <div className="space-y-1 mb-4">
            {contexts.length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">No contexts yet</p>
            )}
            {contexts.map((ctx) => (
              <div key={ctx.id} className="group">
                {renamingId === ctx.id ? (
                  <div className="flex gap-1">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(ctx.id)}
                      onBlur={() => handleRename(ctx.id)}
                      autoFocus
                      className="flex-1 px-2 py-1 text-xs bg-slate-700 border border-indigo-500/50 rounded text-slate-200 outline-none"
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => setSelectedId(ctx.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                      selectedId === ctx.id
                        ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-300'
                        : 'hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <span className="truncate flex-1">{ctx.name}</span>
                    <div className="hidden group-hover:flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setRenamingId(ctx.id); setRenameValue(ctx.name); }}
                        className="p-0.5 hover:text-indigo-400 text-slate-600"
                        title="Rename"
                      ><Edit3 size={12} /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(ctx.id); }}
                        className="p-0.5 hover:text-red-400 text-slate-600"
                        title="Delete"
                      ><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="New context name"
              className="flex-1 px-2 py-1.5 text-xs bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-1"
            ><Plus size={12} /> New</button>
          </div>
        </div>

        {/* ── Right: Context Detail ───────────────── */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 min-h-[400px]">
          {!selectedCtx ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
              <BookOpen size={32} className="mb-3 opacity-40" />
              <p className="text-sm">Select a context to inspect its entries</p>
              <p className="text-xs mt-1 opacity-60">Or create a new one from the left panel</p>
            </div>
          ) : (
            <>
              {/* Context header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/50">
                <div>
                  <h3 className="text-base font-semibold text-slate-200">{selectedCtx.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {files.length} {files.length === 1 ? 'entry' : 'entries'} · Created {new Date(selectedCtx.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewEntry(!showNewEntry)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-1"
                  ><Plus size={13} /> Add Entry</button>
                </div>
              </div>

              {/* New entry form */}
              {showNewEntry && (
                <div className="mb-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600/30">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      value={newEntryFilename}
                      onChange={(e) => setNewEntryFilename(e.target.value)}
                      placeholder="Filename"
                      className="px-2 py-1 text-xs bg-slate-800 border border-slate-600/50 rounded text-slate-200 w-48"
                    />
                    <span className="text-xs text-slate-500 flex-1">New entry in {selectedCtx.name}</span>
                    <button onClick={() => setShowNewEntry(false)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
                  </div>
                  <textarea
                    value={newEntryContent}
                    onChange={(e) => setNewEntryContent(e.target.value)}
                    placeholder="Write or paste your entry content here... Markdown supported."
                    rows={8}
                    className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-500 font-mono outline-none focus:border-indigo-500/50 resize-y mb-3"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAddEntry}
                      disabled={loading || !newEntryContent.trim()}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-white text-xs font-medium transition-colors flex items-center gap-1"
                    ><Save size={13} /> Save Entry</button>
                    {/* Image analysis shortcut */}
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-xs transition-colors flex items-center gap-1">
                      <Image size={13} /> Analyse Image
                    </button>
                  </div>
                  {imagePreview && (
                    <div className="mt-3 p-3 bg-slate-800 rounded-lg border border-slate-600/30">
                      <img src={imagePreview} alt="Preview" className="max-h-48 rounded mb-2" />
                      <div className="flex gap-2">
                        <button onClick={handleAnalyzeImage} disabled={analyzing} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-white text-xs">
                          {analyzing ? 'Analyzing...' : 'Analyze'}
                        </button>
                        {analysisResult && (
                          <button onClick={handleIngestAnalysis} disabled={loading} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded text-white text-xs">
                            Ingest Result
                          </button>
                        )}
                        <button onClick={() => { setImageFile(null); setImagePreview(null); setAnalysisResult(''); }} className="px-3 py-1 text-slate-400 hover:text-slate-200 text-xs">Clear</button>
                      </div>
                      {analysisResult && (
                        <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 max-h-32 overflow-auto">{analysisResult}</pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* File list */}
              {files.length === 0 && !showNewEntry ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <FileText size={28} className="mb-2 opacity-40" />
                  <p className="text-sm">No entries yet</p>
                  <button onClick={() => setShowNewEntry(true)} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">
                    + Add your first entry
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map((f) => (
                    <div key={f.id} className="bg-slate-700/20 rounded-lg border border-slate-700/40 overflow-hidden">
                      {/* File header */}
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <FileText size={14} className="text-slate-500 flex-shrink-0" />
                          <span className="text-sm text-slate-300 truncate">{f.filename}</span>
                          <span className="text-xs text-slate-600 flex-shrink-0">{f.content_type}</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleViewFile(f.id)}
                            className={`p-1 rounded transition-colors ${viewingFileId === f.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                            title="View"
                          ><Eye size={14} /></button>
                          <button
                            onClick={() => handleStartEdit(f)}
                            className={`p-1 rounded transition-colors ${editingFileId === f.id ? 'text-amber-400 bg-amber-500/10' : 'text-slate-500 hover:text-slate-300'}`}
                            title="Edit"
                          ><Edit3 size={14} /></button>
                          <button
                            onClick={() => handleDeleteFile(f.id)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded"
                            title="Delete"
                          ><Trash2 size={14} /></button>
                        </div>
                      </div>

                      {/* View mode */}
                      {viewingFileId === f.id && editingFileId !== f.id && (
                        <div className="px-3 pb-3 border-t border-slate-700/30 pt-2">
                          <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono bg-slate-800/50 rounded p-2 max-h-64 overflow-auto">{f.content}</pre>
                        </div>
                      )}

                      {/* Edit mode */}
                      {editingFileId === f.id && (
                        <div className="px-3 pb-3 border-t border-slate-700/30 pt-2 space-y-2">
                          <input
                            value={editFilename}
                            onChange={(e) => setEditFilename(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600/50 rounded text-slate-200"
                            placeholder="Filename"
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={10}
                            className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600/50 rounded-lg text-slate-200 font-mono outline-none focus:border-amber-500/50 resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(f.id)}
                              disabled={loading}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg text-white text-xs font-medium flex items-center gap-1"
                            ><Save size={13} /> Save</button>
                            <button
                              onClick={() => setEditingFileId(null)}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-xs"
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
