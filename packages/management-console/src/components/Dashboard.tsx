import { useState } from 'react';
import { Brain, FileText, Edit3, Trash2, TestTube, Plus } from 'lucide-react';

interface Agent {
  id: string; name: string; description?: string; system_prompt?: string;
}
interface Context {
  id: string; name: string;
}

interface Props {
  onNavigate: (tab: any) => void;
  agents: Agent[];
  contexts: Context[];
  onSelectAgent: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: () => void;
}

export default function Dashboard({ onNavigate, agents, contexts, onSelectAgent, onDelete, onTest }: Props) {
  const pages: any[] = []; // placeholder for future Page builder

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* ── Agents ────────────────────────────────────── */}
        <Section
          icon={<Brain size={16} className="text-purple-400" />}
          title="Agents"
          subtitle=""
          count={agents.length}
          actionLabel="New Agent"
          onAction={() => window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', { detail: { template: 'minimal' } }))}
          emptyTitle="No agents yet"
          emptyDesc="Create your first agent — it takes seconds. You'll get a ready-to-embed script for any website."
        >
          {agents.map((agent) => (
            <AssetCard
              key={agent.id}
              name={agent.name}
              subtitle={agent.description || agent.system_prompt?.slice(0, 80) || ''}
              onEdit={() => onSelectAgent(agent.id)}
              onTest={onTest}
              onDelete={() => onDelete(agent.id)}
            />
          ))}
        </Section>

        {/* ── Pages ─────────────────────────────────────── */}
        <Section
          icon={<FileText size={16} className="text-amber-400" />}
          title="Pages"
          subtitle=""
          count={pages.length}
          actionLabel="New Page"
          onAction={() => onNavigate('designer')}
          emptyTitle="No pages yet"
          emptyDesc=""
        >
          {pages.length === 0 ? null : <p className="text-xs text-slate-500">Pages coming soon.</p>}
        </Section>

        {/* ── Knowledge ─────────────────────────────────── */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <FileText size={14} className="text-emerald-400" /> Knowledge Bases
            </h2>
            <button onClick={() => onNavigate('contexts')} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Plus size={10} /> New
            </button>
          </div>
          {contexts.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl">
              <p className="text-xs text-slate-500 mb-2">No knowledge bases yet</p>
              <p className="text-[11px] text-slate-600 mb-3">Add documents and FAQs for your agents to reference</p>
              <button onClick={() => onNavigate('contexts')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs">
                Set up Knowledge Base
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {contexts.map((ctx) => (
                <div key={ctx.id} onClick={() => onNavigate('contexts')} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                  <span className="text-sm text-slate-300">{ctx.name}</span>
                  <span className="text-[10px] text-slate-600">{ctx.id.slice(0, 8)}…</span>
                </div>
              ))}
            </div>
          )}
        </div>


      </div>
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────────── */

function Section({ icon, title, subtitle, count, actionLabel, onAction, emptyTitle, emptyDesc, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  actionLabel: string;
  onAction: () => void;
  emptyTitle: string;
  emptyDesc: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            {icon} {title}
          </h2>
          <p className="text-[10px] text-slate-600 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onAction} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          <Plus size={10} /> {actionLabel}
        </button>
      </div>
      {count === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-700 rounded-xl">
          <p className="text-sm text-slate-400 mb-1">{emptyTitle}</p>
          <p className="text-xs text-slate-600 mb-4">{emptyDesc}</p>
          <button onClick={onAction} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium">
            {actionLabel}
          </button>
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

/* ── Asset card ───────────────────────────────────────── */

function AssetCard({ name, subtitle, onEdit, onTest, onDelete }: {
  name: string;
  subtitle: string;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
     <div onClick={onEdit} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors group cursor-pointer">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-200 font-medium truncate">{name}</div>
        {subtitle && <div className="text-[10px] text-slate-500 truncate">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded" title="Edit">
          <Edit3 size={11} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onTest(); }} className="px-2 py-1 text-[10px] text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded" title="Test">
          <TestTube size={11} />
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); setConfirming(false); }} className="px-2 py-1 text-[10px] text-red-400 hover:bg-red-900/30 rounded">Delete</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirming(false); }} className="px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 rounded">Cancel</button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirming(true); }} className="px-2 py-1 text-[10px] text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded" title="Delete">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}