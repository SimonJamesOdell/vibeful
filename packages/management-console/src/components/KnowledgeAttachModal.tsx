import { useState, useEffect, useRef } from 'react';
import { X, BookOpen, Loader2 } from 'lucide-react';

interface Context {
  id: string;
  name: string;
}

interface KnowledgeAttachModalProps {
  activeAgentId: string | null;
  contextList: Context[];
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
}

export default function KnowledgeAttachModal({
  activeAgentId,
  contextList,
  onClose,
  onNavigate,
  onRefresh,
}: KnowledgeAttachModalProps) {
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const snapshotRef = useRef<string[]>([]);

  // Fetch current agent's context_ids on mount
  useEffect(() => {
    if (!activeAgentId) {
      setLoading(false);
      return;
    }
    fetch(`/v1/agents/${activeAgentId}`)
      .then((r) => r.json())
      .then((data) => {
        const ids = Array.isArray(data.context_ids) ? data.context_ids : [];
        setAttachedIds(ids);
        snapshotRef.current = [...ids];
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeAgentId]);

  const handleRevert = async () => {
    if (!activeAgentId) return;
    const restored = [...snapshotRef.current];
    setAttachedIds(restored);
    await fetch(`/v1/agents/${activeAgentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_ids: restored }),
    });
    onRefresh();
  };

  const toggleContext = async (ctxId: string) => {
    if (!activeAgentId) return;
    setSaving(ctxId);

    const isAttached = attachedIds.includes(ctxId);
    const newIds = isAttached
      ? attachedIds.filter((id) => id !== ctxId)
      : [...attachedIds, ctxId];

    // Optimistic update
    setAttachedIds(newIds);

    try {
      const resp = await fetch(`/v1/agents/${activeAgentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_ids: newIds }),
      });
      if (!resp.ok) throw new Error('Failed to update');
      onRefresh();
    } catch {
      // Revert on failure
      setAttachedIds(attachedIds);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="absolute inset-0 z-[9998] flex bg-slate-950">
      <div className="w-[500px] flex-shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-indigo-400" />
            <span className="text-sm font-medium text-slate-200">Knowledge Bases</span>
            {activeAgentId && (
              <span className="text-[10px] text-slate-500">
                ({attachedIds.length} attached)
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!activeAgentId ? (
            <div className="text-center py-8">
              <BookOpen size={24} className="text-slate-600 mx-auto mb-3" />
              <p className="text-xs text-slate-500">Select an agent first to attach knowledge bases.</p>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
          ) : contextList.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-700 rounded-xl">
              <BookOpen size={24} className="text-slate-600 mx-auto mb-3" />
              <p className="text-xs text-slate-500 mb-2">No knowledge bases yet</p>
              <p className="text-[11px] text-slate-600 mb-3">
                Add documents and FAQs for your agents to reference
              </p>
              <button
                onClick={() => {
                  onNavigate('contexts');
                  onClose();
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs"
              >
                Create a Knowledge Base
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {contextList.map((ctx) => {
                const isAttached = attachedIds.includes(ctx.id);
                const isSaving = saving === ctx.id;
                return (
                  <label
                    key={ctx.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isAttached
                        ? 'bg-indigo-900/20 border border-indigo-800/40'
                        : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'
                    }`}
                  >
                    {isSaving ? (
                      <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={isAttached}
                        onChange={() => toggleContext(ctx.id)}
                        className="rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-500 shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200 truncate">{ctx.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {isAttached ? 'Attached — agent can reference this knowledge' : 'Not attached'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30 flex justify-between items-center">
          <span className="text-[10px] text-slate-600">
            Changes are saved immediately
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRevert}
              className="px-3 py-1 text-[11px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 hover:text-indigo-200 rounded"
              title="Undo changes, restore knowledge bases from when you opened this panel"
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
