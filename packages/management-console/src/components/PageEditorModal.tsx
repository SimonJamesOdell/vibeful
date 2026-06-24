import { useState, useEffect, useRef, useCallback } from 'react';
import { X, FileText, Globe, Eye, EyeOff } from 'lucide-react';

interface PageData {
  id: string;
  agent_id: string;
  slug: string;
  title: string;
  content_markdown: string;
  layout_json: string;
  published: number;
  created_at: string;
  updated_at: string;
}

interface Props {
  pageId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function PageEditorModal({ pageId, onClose, onSaved }: Props) {
  const [page, setPage] = useState<PageData | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const snapshotRef = useRef<{ title: string; content: string; published: boolean } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(true);

  // Fetch page on mount
  useEffect(() => {
    if (!pageId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/v1/pages/${pageId}`)
      .then((r) => r.json())
      .then((data) => {
        setPage(data);
        setTitle(data.title || '');
        setContent(data.content_markdown || '');
        setPublished(!!data.published);
        snapshotRef.current = {
          title: data.title || '',
          content: data.content_markdown || '',
          published: !!data.published,
        };
      })
      .catch(() => setError('Failed to load page'))
      .finally(() => setLoading(false));
  }, [pageId]);

  // Auto-save on change (debounced)
  const doSave = useCallback((t: string, c: string, p: boolean) => {
    if (!pageId) return;
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/v1/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: t, content_markdown: c, published: p ? 1 : 0 }),
        });
        setSaved(true);
        onSaved();
      } catch { /* silently ignore */ }
    }, 800);
  }, [pageId, onSaved]);

  useEffect(() => {
    if (!page || loading) return;
    doSave(title, content, published);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, content, published]);

  const handleRevert = () => {
    if (!snapshotRef.current) return;
    const snap = snapshotRef.current;
    setTitle(snap.title);
    setContent(snap.content);
    setPublished(snap.published);
  };

  if (!pageId) {
    return (
      <div className="absolute inset-0 z-[9998] flex bg-slate-950">
        <div className="w-[500px] flex-shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-amber-400" />
              <span className="text-sm font-medium text-slate-200">Page Editor</span>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
          </div>
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
            Select a page to edit
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-[9998] flex bg-slate-950">
      <div className="w-[500px] flex-shrink-0 border-r border-slate-700 bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-amber-400" />
            <span className="text-sm font-medium text-slate-200 truncate">Edit Page</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}>
              {saved ? (published ? 'Published' : 'Draft') : 'Saving…'}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-red-400 text-xs">{error}</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Title */}
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                placeholder="Page title"
              />
            </div>

            {/* Slug (read-only) */}
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Slug</label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 font-mono">/</span>
                <input
                  value={page?.slug || ''}
                  disabled
                  className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono cursor-not-allowed"
                />
              </div>
            </div>

            {/* Publish toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-medium">Published</label>
              <button
                onClick={() => setPublished(!published)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  published
                    ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 border border-slate-600 text-slate-500'
                }`}
              >
                {published ? <Globe size={12} /> : <EyeOff size={12} />}
                {published ? 'Published' : 'Draft'}
              </button>
            </div>

            {/* Markdown content */}
            <div className="flex-1">
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                Content (Markdown)
                <span className="text-slate-600 font-normal ml-1">— supports vibeful-command widgets</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none font-mono leading-relaxed"
                placeholder={`# Welcome\n\nWrite your page content here using Markdown.\n\n## Widget Example\n\n\`\`\`vibeful-command\n{"action":"render_widget","details":{"widget_id":"chart1","type":"chart","props":{"title":"Sales","data":[{"label":"Q1","value":100}]}}}\n\`\`\``}
              />
            </div>

            {/* Preview hint */}
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3">
              <p className="text-[10px] text-slate-500">
                Preview this page at <span className="text-slate-400 font-mono">/p/{page?.slug}</span> when published.
                Widgets use the same <span className="text-slate-400 font-mono">vibeful-command</span> protocol as chat messages.
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-slate-700 bg-slate-800/30">
          <span className="text-[10px] text-slate-600">
            Auto-saves after typing stops
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRevert}
              disabled={loading}
              className="px-3 py-1.5 text-[11px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 hover:text-indigo-200 rounded disabled:opacity-30"
              title="Undo changes since opening"
            >
              Revert
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}