import { useState, useEffect } from 'react';
import { FileText, Globe, Loader2 } from 'lucide-react';
import { parseCommands } from '../lib/commandProtocol';

// Inline WidgetRenderer + types (avoid depending on @vibeful/sdk + @vibeful/shared)

type WidgetType = 'button' | 'card' | 'form' | 'chart' | 'table' | 'custom';

interface WidgetSpec {
  widget_id: string;
  type: WidgetType;
  props: Record<string, unknown>;
}

interface WidgetEvent {
  widget_id: string;
  event_type: 'click' | 'change' | 'submit';
  value?: unknown;
  form_data?: Record<string, unknown>;
}

function WidgetRenderer({ widgets, onWidgetEvent }: {
  widgets: WidgetSpec[];
  onWidgetEvent?: (event: WidgetEvent) => void;
}) {
  if (!widgets || widgets.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {widgets.map((w) => (
        <Widget key={w.widget_id} spec={w} onEvent={onWidgetEvent} />
      ))}
    </div>
  );
}

function Widget({ spec, onEvent }: { spec: WidgetSpec; onEvent?: (e: WidgetEvent) => void }) {
  const fire = (event_type: 'click' | 'change' | 'submit', value?: unknown, form_data?: Record<string, unknown>) => {
    onEvent?.({ widget_id: spec.widget_id, event_type, value, form_data });
  };

  switch (spec.type) {
    case 'button': {
      const p = spec.props as { label?: string; variant?: string; disabled?: boolean };
      return (
        <button disabled={p.disabled} onClick={() => fire('click', p.label)}
          style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: p.disabled ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, background: p.variant === 'danger' ? '#ef4444' : p.variant === 'secondary' ? '#374151' : '#6366f1', color: '#fff', opacity: p.disabled ? 0.5 : 1 }}>
          {p.label || 'Button'}
        </button>
      );
    }
    case 'card': {
      const p = spec.props as { title?: string; content?: string; image_url?: string; action?: { label: string; value: string } };
      return (
        <div style={{ padding: '1rem', border: '1px solid #374151', borderRadius: '8px', background: '#1e293b' }}>
          {p.title && <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>{p.title}</h3>}
          {p.image_url && <img src={p.image_url} alt="" style={{ maxWidth: '100%', borderRadius: '4px', marginBottom: '0.5rem' }} />}
          {p.content && <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{p.content}</p>}
          {p.action && (
            <button onClick={() => fire('click', p.action!.value)}
              style={{ marginTop: '0.75rem', padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', background: '#6366f1', color: '#fff' }}>
              {p.action.label}
            </button>
          )}
        </div>
      );
    }
    case 'chart': {
      const p = spec.props as { title?: string; chart_type?: string; data?: Array<{ label: string; value: number }> };
      const items = p.data || [];
      const maxVal = Math.max(...items.map((i) => i.value), 1);
      return (
        <div style={{ padding: '0.75rem', border: '1px solid #374151', borderRadius: '8px', background: '#1e293b' }}>
          {p.title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#e2e8f0' }}>{p.title}</h3>}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '120px' }}>
            {items.map((item, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', maxWidth: '50px', height: `${(item.value / maxVal) * 100}px`, background: `hsl(${(i * 40) % 360}, 70%, 60%)`, borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.65rem', marginTop: '0.2rem', textAlign: 'center', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60px' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'table': {
      const p = spec.props as { title?: string; columns?: Array<{ key: string; label: string }>; rows?: Array<Record<string, unknown>> };
      const cols = p.columns || (p.rows?.length ? Object.keys(p.rows[0]).map((k) => ({ key: k, label: k })) : []);
      return (
        <div style={{ overflow: 'auto', maxHeight: '300px', border: '1px solid #374151', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>{cols.map((c) => <th key={c.key} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #374151', background: '#1e293b', color: '#e2e8f0' }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {p.rows?.map((row, i) => (
                <tr key={i}>{cols.map((c) => <td key={c.key} style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b', color: '#cbd5e1' }}>{String(row[c.key] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return (
        <div style={{ padding: '1rem', border: '1px solid #374151', borderRadius: '8px', background: '#1e293b', color: '#94a3b8' }}>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(spec.props, null, 2)}</pre>
        </div>
      );
  }
}

interface PageData {
  id: string;
  agent_id: string;
  slug: string;
  title: string;
  content_markdown: string;
  published: number;
  created_at: string;
  updated_at: string;
}

export default function PageViewer({ slug }: { slug: string }) {
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    setLoading(true);
    fetch(`/v1/pages/slug/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Page not found' : 'Failed to load page');
        return r.json();
      })
      .then((data: PageData) => {
        if (!data.published) throw new Error('This page is not published');
        setPage(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <FileText size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-sm text-slate-400 mb-1">{error}</p>
          <p className="text-xs text-slate-600">The page you're looking for doesn't exist or isn't published.</p>
        </div>
      </div>
    );
  }

  if (!page) return null;

  // Extract widgets from vibeful-command blocks
  const commands = parseCommands(page.content_markdown);
  const widgets: WidgetSpec[] = commands
    .filter((c) => c.action === 'render_widget')
    .map((c) => ({
      widget_id: (c.details.widget_id as string) || `widget-${Math.random().toString(36).slice(2, 8)}`,
      type: (c.details.type as WidgetSpec['type']) || 'card',
      props: (c.details.props as Record<string, unknown>) || c.details,
    }));

  // Strip command blocks for clean markdown rendering
  const cleanContent = page.content_markdown.replace(/```vibeful-command\s*[\s\S]*?```/g, '').trim();

  const [responding, setResponding] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [responseWidgets, setResponseWidgets] = useState<WidgetSpec[]>([]);

  const handleWidgetEvent = async (event: WidgetEvent) => {
    if (!page?.id) return;
    setResponding(true);
    setResponseText('');
    setResponseWidgets([]);
    try {
      const resp = await fetch(`/v1/pages/${page.id}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widget_id: event.widget_id,
          event_type: event.event_type,
          value: event.value as string,
          form_data: event.form_data as Record<string, string>,
        }),
      });
      if (!resp.ok) throw new Error(`Agent error (${resp.status})`);
      const data = await resp.json();
      const fullResponse = data.response || '';

      // Parse new vibeful-command blocks from agent's response
      const newCommands = parseCommands(fullResponse);
      const newWidgets: WidgetSpec[] = newCommands
        .filter((c) => c.action === 'render_widget')
        .map((c) => ({
          widget_id: (c.details.widget_id as string) || `widget-${Math.random().toString(36).slice(2, 8)}`,
          type: (c.details.type as WidgetSpec['type']) || 'card',
          props: (c.details.props as Record<string, unknown>) || c.details,
        }));

      // Strip commands for clean text display
      const cleanText = fullResponse.replace(/```vibeful-command\s*[\s\S]*?```/g, '').trim();
      setResponseText(cleanText);
      setResponseWidgets(newWidgets);
    } catch (e: unknown) {
      setResponseText(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">{page.title || page.slug}</h1>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Globe size={12} className="text-emerald-400" />
          <span>Published {page.updated_at ? new Date(page.updated_at).toLocaleDateString() : '—'}</span>
          <span>·</span>
          <span className="font-mono text-slate-600">/{page.slug}</span>
        </div>
      </div>

      {/* Widgets at top if they exist */}
      {widgets.length > 0 && (
        <div className="mb-8">
          <WidgetRenderer widgets={widgets} onWidgetEvent={handleWidgetEvent} />
        </div>
      )}

      {/* Markdown content */}
      {cleanContent && (
        <div className="prose prose-invert prose-sm max-w-none">
          <MarkdownContent content={cleanContent} />
        </div>
      )}

      {/* Agent response area (shown after widget interaction) */}
      {(responding || responseText || responseWidgets.length > 0) && (
        <div className="mt-6 pt-6 border-t border-indigo-500/30">
          {responding && (
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
              <Loader2 size={12} className="animate-spin text-indigo-400" />
              <span>Agent is processing your interaction…</span>
            </div>
          )}
          {responseText && (
            <div className="prose prose-invert prose-sm max-w-none mb-4">
              <MarkdownContent content={responseText} />
            </div>
          )}
          {responseWidgets.length > 0 && (
            <div className="mb-4">
              <WidgetRenderer widgets={responseWidgets} onWidgetEvent={handleWidgetEvent} />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-600">
          Powered by <span className="text-slate-500">Vibeful</span>
        </p>
      </div>
    </div>
  );
}

/** Simple markdown → HTML renderer (headings, paragraphs, lists, code) */
function MarkdownContent({ content }: { content: string }) {
  // Very basic markdown-to-HTML for the common cases
  const html = content
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-slate-900 rounded-lg p-4 overflow-x-auto text-xs font-mono"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1 py-0.5 rounded text-xs font-mono text-amber-400">$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-slate-200 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-slate-100 mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-slate-100 mt-8 mb-4">$1</h1>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="text-sm text-slate-300 ml-4">$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr class="border-slate-700 my-6" />')
    // Paragraphs (lines not already wrapped in tags)
    .replace(/^(?!<[a-z]|\s*$)(.+)$/gm, '<p class="text-sm text-slate-300 leading-relaxed mb-3">$1</p>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li[^>]*>[\s\S]*?<\/li>)\n(?=<li)/g, '$1\n')
    .replace(/((?:<li[^>]*>[\s\S]*?<\/li>\n?)+)/g, '<ul class="list-disc mb-4">$1</ul>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}