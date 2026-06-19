// Widget Renderer — renders WidgetSpec[] arrays from agent vibeful-commands.
// Supports both legacy {type, data, title} and new WidgetSpec formats.

import type { WidgetSpec, WidgetEvent } from '@vibeful/shared';

export interface WidgetRendererProps {
  widgets: WidgetSpec[];
  /** Called when a widget interaction occurs (click, change, submit) */
  onWidgetEvent?: (event: WidgetEvent) => void;
}

export function WidgetRenderer({ widgets, onWidgetEvent }: WidgetRendererProps) {
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
  const fire = (event_type: WidgetEvent['event_type'], value?: unknown, form_data?: Record<string, unknown>) => {
    onEvent?.({ widget_id: spec.widget_id, event_type, value, form_data });
  };

  switch (spec.type) {
    case 'button': {
      const p = spec.props as { label?: string; variant?: string; disabled?: boolean };
      return (
        <button
          disabled={p.disabled}
          onClick={() => fire('click', p.label)}
          style={{
            padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', cursor: p.disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.85rem', fontWeight: 600,
            background: p.variant === 'danger' ? '#ef4444' : p.variant === 'secondary' ? '#e5e7eb' : '#6366f1',
            color: p.variant === 'secondary' ? '#1f2937' : '#fff',
            opacity: p.disabled ? 0.5 : 1,
          }}
        >
          {p.label || 'Button'}
        </button>
      );
    }
    case 'card': {
      const p = spec.props as { title?: string; content?: string; image_url?: string; action?: { label: string; value: string } };
      return (
        <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
          {p.title && <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>{p.title}</h3>}
          {p.image_url && <img src={p.image_url} alt="" style={{ maxWidth: '100%', borderRadius: '4px', marginBottom: '0.5rem' }} />}
          {p.content && <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563' }}>{p.content}</p>}
          {p.action && (
            <button
              onClick={() => fire('click', p.action!.value)}
              style={{ marginTop: '0.75rem', padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', background: '#6366f1', color: '#fff' }}
            >
              {p.action.label}
            </button>
          )}
        </div>
      );
    }
    case 'form': {
      const p = spec.props as { title?: string; fields?: Array<{ key: string; label: string; type: string; required?: boolean; placeholder?: string; options?: Array<{ value: string; label: string }>; default_value?: unknown }>; submit_label?: string };
      return (
        <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
          {p.title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{p.title}</h3>}
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const data: Record<string, unknown> = {}; fd.forEach((v, k) => { data[k] = v; }); fire('submit', undefined, data); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {p.fields?.map((f) => (
              <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'textarea' ? (
                  <textarea name={f.key} required={f.required} placeholder={f.placeholder} rows={3} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }} />
                ) : f.type === 'select' ? (
                  <select name={f.key} required={f.required} defaultValue={String(f.default_value ?? '')} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }}>
                    {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === 'boolean' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <input type="checkbox" name={f.key} />
                    {f.label}
                  </label>
                ) : (
                  <input name={f.key} type={f.type === 'number' ? 'number' : 'text'} required={f.required} placeholder={f.placeholder} defaultValue={String(f.default_value ?? '')} style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem' }} />
                )}
              </div>
            ))}
            <button type="submit" style={{ padding: '0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', background: '#6366f1', color: '#fff', marginTop: '0.25rem' }}>{p.submit_label || 'Submit'}</button>
          </form>
        </div>
      );
    }
    case 'chart': {
      const p = spec.props as { title?: string; chart_type?: string; data?: Array<{ label: string; value: number }> };
      const items = p.data || [];
      const maxVal = Math.max(...items.map((i) => i.value), 1);
      return (
        <div style={{ padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
          {p.title && <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>{p.title}</h3>}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '120px' }}>
            {items.map((item, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', maxWidth: '50px', height: `${(item.value / maxVal) * 100}px`, background: `hsl(${(i * 40) % 360}, 70%, 60%)`, borderRadius: '4px 4px 0 0' }} />
                <span style={{ fontSize: '0.65rem', marginTop: '0.2rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60px' }}>{item.label}</span>
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
        <div style={{ overflow: 'auto', maxHeight: '300px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          {p.title && <h3 style={{ padding: '0.75rem 0.75rem 0', margin: 0, fontSize: '0.9rem' }}>{p.title}</h3>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>{cols.map((c) => <th key={c.key} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {p.rows?.map((row, i) => (
                <tr key={i}>{cols.map((c) => <td key={c.key} style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>{String(row[c.key] ?? '')}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return (
        <div style={{ padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(spec.props, null, 2)}</pre>
        </div>
      );
  }
}

// Legacy wrapper for backward compatibility
export function LegacyWidgetRenderer({ type, data, title }: { type: string; data: any; title?: string }) {
  const spec: WidgetSpec = {
    widget_id: `legacy-${Date.now()}`,
    type: type as WidgetSpec['type'] || 'card',
    props: { ...(data || {}), title },
  };
  return <Widget spec={spec} />;
}
