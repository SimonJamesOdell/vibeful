import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Type, Layout, FormInput, BarChart3, Table2, Save, Loader2 } from 'lucide-react';

type WidgetType = 'button' | 'card' | 'form' | 'chart' | 'table';

interface Props {
  agentId: string | null;
  editWidgetId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

const TYPE_OPTIONS: { type: WidgetType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'button', label: 'Button', icon: <Type size={16} />, desc: 'Clickable action — open chat, navigate, submit' },
  { type: 'card', label: 'Card', icon: <Layout size={16} />, desc: 'Content card with title, description, image, and action' },
  { type: 'form', label: 'Form', icon: <FormInput size={16} />, desc: 'Data collection with text fields, selects, and checkboxes' },
  { type: 'chart', label: 'Chart', icon: <BarChart3 size={16} />, desc: 'Bar, line, or pie chart from agent-generated data' },
  { type: 'table', label: 'Table', icon: <Table2 size={16} />, desc: 'Structured data table with sortable columns' },
];

export default function WidgetCreatorModal({ agentId, editWidgetId, onClose, onSaved, showToast }: Props) {
  const [step, setStep] = useState<'type' | 'props'>(editWidgetId ? 'props' : 'type');
  const [widgetType, setWidgetType] = useState<WidgetType>('button');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editWidgetId);

  // Per-type property state
  const [label, setLabel] = useState('Click Me');
  const [variant, setVariant] = useState('primary');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [actionLabel, setActionLabel] = useState('');
  const [chartType, setChartType] = useState('bar');

  const handleTypeSelect = (type: WidgetType) => {
    setWidgetType(type);
    setStep('props');
    // Set defaults per type
    const defaults: Record<WidgetType, { name: string; label: string; title: string }> = {
      button: { name: 'My Button', label: 'Click Me', title: '' },
      card: { name: 'My Card', label: '', title: 'Card Title' },
      form: { name: 'My Form', label: '', title: 'Feedback Form' },
      chart: { name: 'My Chart', label: '', title: 'Data Chart' },
      table: { name: 'My Table', label: '', title: 'Data Table' },
    };
    const d = defaults[type];
    if (!name) setName(d.name);
    if (d.label) setLabel(d.label);
    if (d.title) setTitle(d.title);
  };

  const buildProps = (): Record<string, unknown> => {
    switch (widgetType) {
      case 'button': return { label, variant, disabled: false };
      case 'card': return { title, content, image_url: imageUrl || undefined, action: actionLabel ? { label: actionLabel, value: 'click' } : undefined };
      case 'form': return { title, fields: [{ key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'you@example.com' }, { key: 'message', label: 'Message', type: 'textarea', required: false }], submit_label: label || 'Submit' };
      case 'chart': return { title, chart_type: chartType, data: [{ label: 'A', value: 10 }, { label: 'B', value: 20 }] };
      case 'table': return { title, columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }], rows: [{ name: 'Item 1', value: '100' }, { name: 'Item 2', value: '200' }] };
      default: return {};
    }
  };

  // ── Edit mode: fetch existing widget data ──────────────
  useEffect(() => {
    if (!editWidgetId) return;
    setLoading(true);
    fetch(`/v1/widget-templates/${editWidgetId}`)
      .then((r) => r.json())
      .then((data) => {
        setWidgetType(data.type as WidgetType);
        setName(data.name || '');
        const p = data.props || {};
        setLabel(p.label || '');
        setVariant(p.variant || 'primary');
        setTitle(p.title || '');
        setContent(p.content || '');
        setImageUrl(p.image_url || '');
        setActionLabel(p.action?.label || '');
        setChartType(p.chart_type || 'bar');
        setLoading(false);
      })
      .catch(() => {
        showToast('Failed to load widget', 'error');
        onClose();
      });
  }, [editWidgetId]);

  const handleSave = async () => {
    if (!agentId && !editWidgetId) { showToast('Select an agent first', 'error'); return; }
    setSaving(true);
    try {
      const isEdit = !!editWidgetId;
      const url = isEdit ? `/v1/widget-templates/${editWidgetId}` : '/v1/widget-templates';
      const body: Record<string, unknown> = { name: name || `Untitled ${widgetType}`, type: widgetType, props: buildProps() };
      if (!isEdit) body.agent_id = agentId;

      const resp = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      showToast(`Widget "${name || widgetType}" ${isEdit ? 'updated' : 'created'}`, 'success');
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(`Save failed: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            {editWidgetId ? <Pencil size={16} className="text-pink-400" /> : <Plus size={16} className="text-pink-400" />}
            {loading ? 'Loading…' : editWidgetId
              ? `Edit ${widgetType.charAt(0).toUpperCase() + widgetType.slice(1)}`
              : step === 'type' ? 'New Widget' : `New ${widgetType.charAt(0).toUpperCase() + widgetType.slice(1)}`}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
          ) : step === 'type' ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 mb-3">Choose a widget type:</p>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleTypeSelect(opt.type)}
                  className="w-full flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-pink-400 group-hover:bg-pink-500/10 transition-colors">
                    {opt.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Template Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`My ${widgetType}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Type-specific props */}
              {widgetType === 'button' && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Label</label>
                    <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Variant</label>
                    <div className="flex gap-2">
                      {['primary', 'secondary', 'danger'].map((v) => (
                        <button key={v} onClick={() => setVariant(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${variant === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{v}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(widgetType === 'card' || widgetType === 'form' || widgetType === 'chart' || widgetType === 'table') && (
                <>
                  <div>
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Title</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Widget title" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                  </div>
                  {widgetType === 'card' && (
                    <>
                      <div>
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Content</label>
                        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="Card description..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Image URL (optional)</label>
                        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Action Button Label (optional)</label>
                        <input value={actionLabel} onChange={(e) => setActionLabel(e.target.value)} placeholder="Learn More" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                      </div>
                    </>
                  )}
                  {widgetType === 'chart' && (
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Chart Type</label>
                      <div className="flex gap-2">
                        {['bar', 'line', 'pie'].map((v) => (
                          <button key={v} onClick={() => setChartType(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${chartType === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{v}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {widgetType === 'form' && (
                    <div>
                      <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Submit Button Label</label>
                      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Submit" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                  )}
                </>
              )}

              <button onClick={() => setStep('type')} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                ← Change widget type
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'props' && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700 bg-slate-800/50">
            <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || !agentId}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Widget
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
