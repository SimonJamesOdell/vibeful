import { useState } from 'react';
import { Puzzle, ExternalLink, FileText } from 'lucide-react';

interface InlineWidget {
  widget_id: string;
  type: string;
  pageTitle: string;
  pageSlug: string;
  agentName: string;
}

interface Props {
  widgets: InlineWidget[];
  templates?: Array<{ id: string; agent_id: string; name: string; type: string; props: Record<string, unknown> }>;
  onNavigate: (tab: string) => void;
}

export default function WidgetList({ widgets, templates, onNavigate }: Props) {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const templateList = templates || [];
  const allTypes = [...new Set([...widgets.map((w) => w.type), ...templateList.map((t) => t.type)])].sort();
  const totalCount = widgets.length + templateList.length;
  const filtered = selectedType
    ? { templates: templateList.filter((t) => t.type === selectedType), widgets: widgets.filter((w) => w.type === selectedType) }
    : { templates: templateList, widgets };

  return (
    <>
        {/* Type filter pills */}
        {allTypes.length > 1 && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            <button
              onClick={() => setSelectedType(null)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedType === null ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({totalCount})
            </button>
            {allTypes.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedType === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t} ({templateList.filter((w) => w.type === t).length + widgets.filter((w) => w.type === t).length})
              </button>
            ))}
          </div>
        )}

        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 border border-dashed border-slate-700 rounded-xl">
            <Puzzle size={32} className="text-slate-600 mb-3" />
            <p className="text-sm text-slate-400 mb-1">No widgets found</p>
            <p className="text-xs text-slate-600 mb-4">
              Widgets are embedded in page content using <code className="text-indigo-400/70">data-vibeful-widget</code> attributes
            </p>
            <button
              onClick={() => onNavigate('pages')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
            >
              Browse Pages
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Saved Templates */}
            {filtered.templates.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-pink-400">Saved Templates</span>
                  <span className="text-[10px] text-slate-600">({filtered.templates.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {filtered.templates.map((wt) => (
                    <div key={wt.id} className="p-4 bg-slate-900 border border-pink-500/20 rounded-lg hover:border-pink-500/40 transition-colors group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                              wt.type === 'button' ? 'bg-indigo-500/20 text-indigo-300' :
                              wt.type === 'card' ? 'bg-emerald-500/20 text-emerald-300' :
                              wt.type === 'form' ? 'bg-amber-500/20 text-amber-300' :
                              wt.type === 'chart' ? 'bg-cyan-500/20 text-cyan-300' :
                              wt.type === 'table' ? 'bg-pink-500/20 text-pink-300' :
                              'bg-slate-500/20 text-slate-400'
                            }`}>{wt.type}</span>
                            <span className="text-xs text-slate-200 font-medium">{wt.name}</span>
                          </div>
                          <div className="text-[10px] text-pink-400/70 font-medium">saved template</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inline Widgets */}
            {filtered.widgets.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Inline Widgets</span>
                  <span className="text-[10px] text-slate-600">({filtered.widgets.length})</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {filtered.widgets.map((w, i) => (
                    <div key={`${w.widget_id}-${i}`} className="p-4 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase ${
                              w.type === 'button' ? 'bg-indigo-500/20 text-indigo-300' :
                              w.type === 'card' ? 'bg-emerald-500/20 text-emerald-300' :
                              w.type === 'form' ? 'bg-amber-500/20 text-amber-300' :
                              w.type === 'chart' ? 'bg-cyan-500/20 text-cyan-300' :
                              w.type === 'table' ? 'bg-pink-500/20 text-pink-300' :
                              'bg-slate-500/20 text-slate-400'
                            }`}>{w.type}</span>
                            <span className="text-xs text-slate-400 font-mono">{w.widget_id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mb-1">
                            Agent: <span className="text-slate-300">{w.agentName}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] text-slate-600">
                            <FileText size={10} />
                            <span>{w.pageTitle}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => onNavigate('pages')}
                          className="p-1.5 text-slate-600 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="View page"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
}
