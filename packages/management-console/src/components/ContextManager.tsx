import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Upload, BookOpen, FileText, Image, Loader2, Brain, X } from 'lucide-react';

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

export default function ContextManager() {
  const [contexts, setContexts] = useState<Context[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [files, setFiles] = useState<ContextFile[]>([]);
  const [newName, setNewName] = useState('');
  const [newAgentId, setNewAgentId] = useState('');
  const [ingestText, setIngestText] = useState('');
  const [ingestFilename, setIngestFilename] = useState('notes.txt');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Multimodal: image upload + DeepSeek vision analysis
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchContexts = useCallback(async () => {
    try {
      const resp = await fetch('/v1/contexts');
      const data = await resp.json();
      setContexts(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load contexts');
    }
  }, []);

  const fetchFiles = useCallback(async (contextId: string) => {
    try {
      const resp = await fetch(`/v1/contexts/${contextId}/files`);
      const data = await resp.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
  }, []);

  useEffect(() => { fetchContexts(); }, [fetchContexts]);

  useEffect(() => {
    if (selectedId) fetchFiles(selectedId);
    else setFiles([]);
  }, [selectedId, fetchFiles]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/v1/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), agent_id: newAgentId.trim() }),
      });
      if (!resp.ok) throw new Error('Failed to create context');
      setNewName('');
      setNewAgentId('');
      await fetchContexts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this context and all its content?')) return;
    try {
      await fetch(`/v1/contexts/${id}`, { method: 'DELETE' });
      if (selectedId === id) setSelectedId(null);
      await fetchContexts();
    } catch {
      setError('Failed to delete context');
    }
  };

  const handleIngest = async () => {
    if (!selectedId || !ingestText.trim()) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/v1/contexts/${selectedId}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ingestText, filename: ingestFilename, content_type: 'text/plain' }),
      });
      if (!resp.ok) throw new Error('Failed to ingest');
      setIngestText('');
      await fetchFiles(selectedId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Multimodal: image upload ──────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setAnalysisResult('');
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAnalyzeImage = async () => {
    if (!imageFile) return;
    setAnalyzing(true);
    setError('');
    try {
      // Read as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data:image/...;base64, prefix
          const b64 = result.split(',')[1];
          resolve(b64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const resp = await fetch('/v1/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Analysis failed');
      setAnalysisResult(data.analysis || '');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleIngestAnalysis = async () => {
    if (!selectedId || !analysisResult) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`/v1/contexts/${selectedId}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysisResult,
          filename: imageFile?.name || 'image-analysis.txt',
          content_type: 'text/plain',
        }),
      });
      if (!resp.ok) throw new Error('Failed to ingest');
      setAnalysisResult('');
      setImageFile(null);
      setImagePreview(null);
      await fetchFiles(selectedId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">Knowledge Base</h2>
          <p className="text-xs text-slate-500 mt-1">
            Upload documents, notes, and images to give agents contextual knowledge
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={14} /></button>
        </div>
      )}

      <div className="flex bg-slate-900 border border-slate-700 rounded-xl overflow-hidden" style={{ minHeight: '480px' }}>
        {/* Sidebar: context list */}
        <div className="w-64 min-w-[256px] border-r border-slate-700 flex flex-col">
          <div className="p-3 border-b border-slate-700">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <BookOpen size={12} className="text-indigo-400" />
              Contexts
            </h3>
          </div>

        {/* Create form */}
        <div className="p-3 border-b border-slate-700 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Context name..."
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <input
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value)}
            placeholder="Agent ID (optional)"
            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleCreate}
            disabled={loading || !newName.trim()}
            className="w-full px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs flex items-center justify-center gap-1"
          >
            <Plus size={12} /> Create
          </button>
        </div>

        {/* Context list */}
        <div className="flex-1 overflow-y-auto">
          {contexts.map((ctx) => (
            <div
              key={ctx.id}
              onClick={() => setSelectedId(ctx.id)}
              className={`px-3 py-2 cursor-pointer border-l-2 transition-colors flex items-center justify-between group ${
                selectedId === ctx.id
                  ? 'border-indigo-500 bg-indigo-900/20 text-slate-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{ctx.name}</div>
                <div className="text-[10px] text-slate-500">
                  {ctx.agent_id ? `Agent: ${ctx.agent_id.slice(0, 8)}…` : 'No agent'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(ctx.id); }}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {contexts.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-6">No contexts yet</p>
          )}
        </div>
      </div>

      {/* Main: ingest area */}
      <div className="flex-1 flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select a context to manage</p>
              <p className="text-xs mt-1">or create a new one on the left</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-3 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-200">
                  {contexts.find((c) => c.id === selectedId)?.name}
                </h3>
                <p className="text-[10px] text-slate-500">{files.length} file(s) ingested</p>
              </div>
            </div>

            {/* Ingest panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && (
                <div className="p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
                  {error}
                  <button onClick={() => setError('')} className="float-right text-red-400 hover:text-red-200"><X size={12} /></button>
                </div>
              )}

              {/* Text ingest */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <FileText size={12} /> Ingest Text
                </label>
                <input
                  value={ingestFilename}
                  onChange={(e) => setIngestFilename(e.target.value)}
                  placeholder="Filename"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <textarea
                  value={ingestText}
                  onChange={(e) => setIngestText(e.target.value)}
                  placeholder="Paste or type knowledge content here..."
                  rows={6}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-y font-mono"
                />
                <button
                  onClick={handleIngest}
                  disabled={loading || !ingestText.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1"
                >
                  <Upload size={12} /> Ingest
                </button>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <label className="text-xs text-slate-400 font-medium flex items-center gap-1 mb-2">
                  <Image size={12} /> Multimodal — Analyze image with DeepSeek Vision
                </label>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full px-3 py-6 border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded text-xs text-slate-400 hover:text-slate-200 transition-colors flex flex-col items-center gap-2"
                    >
                      <Image size={20} />
                      {imageFile ? imageFile.name : 'Click to upload image (PNG, JPEG)'}
                    </button>

                    {imagePreview && (
                      <div className="mt-2 relative">
                        <img src={imagePreview} alt="Preview" className="max-h-32 rounded border border-slate-700" />
                        <button
                          onClick={() => { setImageFile(null); setImagePreview(null); setAnalysisResult(''); }}
                          className="absolute top-1 right-1 p-0.5 bg-slate-900/80 rounded text-slate-400 hover:text-white"
                        ><X size={12} /></button>
                      </div>
                    )}

                    {imageFile && !analysisResult && (
                      <button
                        onClick={handleAnalyzeImage}
                        disabled={analyzing}
                        className="mt-2 w-full px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs flex items-center justify-center gap-1"
                      >
                        {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                        {analyzing ? 'Analyzing...' : 'Analyze with DeepSeek Vision'}
                      </button>
                    )}
                  </div>
                </div>

                {analysisResult && (
                  <div className="mt-3 space-y-2">
                    <div className="p-3 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {analysisResult}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleIngestAnalysis}
                        disabled={loading}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded text-xs flex items-center gap-1"
                      >
                        <Upload size={12} /> Ingest into '{contexts.find((c) => c.id === selectedId)?.name}'
                      </button>
                      <button
                        onClick={() => { setAnalysisResult(''); setImageFile(null); setImagePreview(null); }}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Files list */}
            <div className="border-t border-slate-700 p-3 max-h-40 overflow-y-auto">
              <h4 className="text-xs text-slate-500 font-medium mb-2">Ingested Files</h4>
              {files.length === 0 ? (
                <p className="text-xs text-slate-600">Nothing ingested yet</p>
              ) : (
                <div className="space-y-1">
                  {files.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-xs text-slate-400">
                      <FileText size={10} className="text-slate-600" />
                      <span className="truncate flex-1">{f.filename}</span>
                      <span className="text-[10px] text-slate-600">
                        {new Date(f.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}