import { useState, useEffect } from 'react';
import { Globe, Loader2, RefreshCw, Shield, Users, Lightbulb } from 'lucide-react';

interface GlobalMemory {
  id?: string;
  name: string;
  domain: string;
  description: string;
  glyphset: string;
  memory_type: string;
}

const MEMORY_TYPES = [
  { key: 'system_ontology', label: 'System Ontology', icon: Shield, color: 'text-blue-400' },
  { key: 'concept_synthesis', label: 'Concept Synthesis', icon: Lightbulb, color: 'text-purple-400' },
  { key: 'collective_truth', label: 'Collective Truth', icon: Users, color: 'text-green-400' },
  { key: 'general', label: 'General', icon: Globe, color: 'text-slate-400' },
];

export default function GlobalMemoryExplorer() {
  const [memories, setMemories] = useState<GlobalMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('');

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType) params.set('type', selectedType);
      const resp = await fetch(`/v1/global-memories?${params}`);
      if (resp.ok) {
        const data = await resp.json();
        setMemories(data.memories || data || []);
      }
    } catch { /* expected */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMemories(); }, [selectedType]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Global Memory Explorer</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Cross-user knowledge — patterns and insights for all users</p>
        </div>
        <button onClick={fetchMemories} className="p-1.5 text-slate-400 hover:text-slate-200">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setSelectedType('')}
          className={`px-2 py-1 text-[10px] rounded transition-colors ${!selectedType ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
          All
        </button>
        {MEMORY_TYPES.map((mt) => (
          <button key={mt.key} onClick={() => setSelectedType(mt.key)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${selectedType === mt.key ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
            <mt.icon size={10} />
            {mt.label}
          </button>
        ))}
      </div>

      {/* Memory cards */}
      <div className="space-y-2">
        {memories.map((m) => {
          const typeInfo = MEMORY_TYPES.find((mt) => mt.key === m.memory_type);
          return (
            <div key={m.id || m.name} className="bg-slate-900 border border-slate-700 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {typeInfo && <typeInfo.icon size={12} className={typeInfo.color} />}
                  <span className="text-xs font-medium text-slate-200">{m.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-500">{m.domain}</span>
                  {typeInfo && <span className={`text-[9px] ${typeInfo.color}`}>{typeInfo.label}</span>}
                </div>
              </div>
              <p className="text-[10px] text-slate-400">{m.description}</p>
              {m.glyphset && <div className="text-[9px] text-indigo-400 mt-1 font-mono">{m.glyphset}</div>}
            </div>
          );
        })}
        {memories.length === 0 && !loading && (
          <div className="text-xs text-slate-500 text-center py-6">
            No global memories yet. They're generated when the analysis pipeline detects cross-user patterns.
          </div>
        )}
        {loading && <Loader2 size={14} className="animate-spin text-slate-400 mx-auto" />}
      </div>
    </div>
  );
}
