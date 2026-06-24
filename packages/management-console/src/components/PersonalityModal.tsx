import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Smile, Zap, Briefcase, Lightbulb, Sparkles, Sliders } from 'lucide-react';

export interface PersonalityConfig {
  tone: string;           // 'professional' | 'friendly' | 'creative' | 'technical' | 'playful' | 'custom'
  temperature: number;    // 0.0 - 2.0
  formality: number;      // 0 (casual) - 100 (formal)
  verbosity: number;      // 0 (concise) - 100 (detailed)
  humor: number;          // 0 (serious) - 100 (playful)
  empathy: number;        // 0 (detached) - 100 (empathetic)
  system_prompt: string;
}

export const PRESETS: Record<string, Partial<PersonalityConfig>> = {
  professional: { tone: 'professional', temperature: 0.3, formality: 90, verbosity: 50, humor: 10, empathy: 30,
    system_prompt: 'You are a professional, business-oriented assistant. Be concise, accurate, and formal. Use clear language and avoid casual expressions.' },
  friendly: { tone: 'friendly', temperature: 0.6, formality: 20, verbosity: 60, humor: 60, empathy: 80,
    system_prompt: 'You are a warm, friendly assistant. Be approachable, supportive, and conversational. Use casual language and show genuine interest.' },
  creative: { tone: 'creative', temperature: 1.2, formality: 30, verbosity: 70, humor: 70, empathy: 60,
    system_prompt: 'You are a creative, imaginative assistant. Be inventive, expressive, and think outside the box. Use vivid language and metaphors.' },
  technical: { tone: 'technical', temperature: 0.2, formality: 70, verbosity: 80, humor: 5, empathy: 20,
    system_prompt: 'You are a technical, precise assistant. Be accurate, thorough, and analytical. Use proper technical terminology and provide detailed explanations.' },
  playful: { tone: 'playful', temperature: 1.0, formality: 10, verbosity: 50, humor: 95, empathy: 70,
    system_prompt: 'You are a playful, fun assistant. Be witty, humorous, and energetic. Use emoji, jokes, and a light-hearted tone.' },
};

const TONE_ICONS: Record<string, React.ReactNode> = {
  professional: <Briefcase size={16} />,
  friendly: <Smile size={16} />,
  creative: <Lightbulb size={16} />,
  technical: <Zap size={16} />,
  playful: <Sparkles size={16} />,
  custom: <Sliders size={16} />,
};

const LS_KEY = (agentId: string) => `vibeful:personality:snapshot:${agentId}`;

interface Props {
  onClose: () => void;
  agentId: string | null;
  initialSystemPrompt?: string;
}

export default function PersonalityModal({ onClose, agentId, initialSystemPrompt }: Props) {
  const [config, setConfig] = useState<PersonalityConfig>({
    tone: 'professional',
    temperature: 0.7,
    formality: 50,
    verbosity: 50,
    humor: 30,
    empathy: 50,
    system_prompt: initialSystemPrompt || '',
  });
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>('');

  // ── Auto-save helper ──────────────────────────────────────────
  const savePersonality = useCallback((cfg: PersonalityConfig) => {
    if (!agentId) return;
    const payload = JSON.stringify({ system_prompt: cfg.system_prompt });
    if (payload === lastSaved.current) return;
    lastSaved.current = payload;
    fetch(`/v1/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {});
  }, [agentId]);

  // Debounced auto-save on config change
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePersonality(config), 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [config, loaded, savePersonality]);

  // ── Load saved personality + snapshot on mount ─────────────────
  useEffect(() => {
    if (!agentId) return;
    fetch(`/v1/agents/${agentId}`)
      .then((r) => r.json())
      .then((agent) => {
        const next: PersonalityConfig = {
          tone: 'professional',
          temperature: 0.7,
          formality: 50,
          verbosity: 50,
          humor: 30,
          empathy: 50,
          system_prompt: agent.system_prompt || initialSystemPrompt || '',
        };
        // Detect preset from existing system prompt
        if (agent.system_prompt) {
          for (const [key, preset] of Object.entries(PRESETS)) {
            if (agent.system_prompt === preset.system_prompt) {
              next.tone = key;
              Object.assign(next, preset);
              break;
            }
          }
          if (next.tone === 'professional' && agent.system_prompt !== PRESETS.professional?.system_prompt) {
            next.tone = 'custom';
          }
        }
        setConfig(next);
        // Store snapshot in localStorage
        try { localStorage.setItem(LS_KEY(agentId), JSON.stringify(next)); } catch {}
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

    return () => {
      // Cleanup on close — clear localStorage snapshot
      if (agentId) {
        try { localStorage.removeItem(LS_KEY(agentId)); } catch {}
      }
    };
  }, [agentId]);

  // ── Apply preset ──────────────────────────────────────────────
  const applyPreset = (key: string) => {
    const preset = PRESETS[key];
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      ...preset,
      tone: key,
      temperature: preset.temperature ?? prev.temperature,
      formality: preset.formality ?? prev.formality,
      verbosity: preset.verbosity ?? prev.verbosity,
      humor: preset.humor ?? prev.humor,
      empathy: preset.empathy ?? prev.empathy,
    }));
  };

  // ── Revert to snapshot stored in localStorage ─────────────────
  const handleRevert = () => {
    if (!agentId) return;
    try {
      const raw = localStorage.getItem(LS_KEY(agentId));
      if (raw) {
        const snap = JSON.parse(raw) as PersonalityConfig;
        setConfig(snap);
        savePersonality(snap);
      }
    } catch {}
  };

  // ── Mutate a slider (marks tone as custom) ────────────────────
  const setSlider = (field: keyof PersonalityConfig, value: number) => {
    setConfig((p) => ({ ...p, [field]: value, tone: 'custom' }));
  };

  const renderSlider = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    leftLabel: string,
    rightLabel: string
  ) => (
    <div className="mb-3">
      <div className="flex justify-between text-[10px] text-slate-500 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
      />
      <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 z-[9998] flex bg-slate-950">
      <div className="w-[500px] flex-shrink-0 border-r border-slate-700 overflow-y-auto bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {TONE_ICONS[config.tone] || TONE_ICONS.custom}
            <span className="text-sm font-medium text-slate-200">Personality</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              config.tone === 'custom'
                ? 'bg-amber-500/15 text-amber-400'
                : 'bg-purple-500/15 text-purple-400'
            }`}>
              {config.tone === 'custom' ? 'Custom' : config.tone.charAt(0).toUpperCase() + config.tone.slice(1)}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-5">
          {/* Presets */}
          <div>
            <label className="text-xs text-slate-400 font-medium mb-2 block">Presets</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PRESETS).map(([key]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors capitalize ${
                    config.tone === key
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-slate-700 hover:border-indigo-500 text-slate-300'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Temperature</span>
              <span>{config.temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setSlider('temperature', Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>Precise (0.0)</span>
              <span>Creative (2.0)</span>
            </div>
          </div>

          {/* Sliders */}
          {renderSlider('Formality', config.formality, (v) => setSlider('formality', v), 'Casual', 'Formal')}
          {renderSlider('Verbosity', config.verbosity, (v) => setSlider('verbosity', v), 'Concise', 'Detailed')}
          {renderSlider('Humor', config.humor, (v) => setSlider('humor', v), 'Serious', 'Playful')}
          {renderSlider('Empathy', config.empathy, (v) => setSlider('empathy', v), 'Detached', 'Empathetic')}

          {/* System Prompt */}
          <div>
            <label className="text-xs text-slate-400 font-medium mb-1.5 block">
              System Prompt
              <span className="text-slate-600 font-normal ml-1">— editable preview</span>
            </label>
            <textarea
              value={config.system_prompt}
              onChange={(e) => setConfig((p) => ({ ...p, system_prompt: e.target.value, tone: 'custom' }))}
              rows={5}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none font-mono"
              placeholder="You are a helpful AI assistant..."
            />
          </div>
        </div>

        {/* Footer — Revert only */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-700 px-4 pb-4">
          <button
            onClick={handleRevert}
            className="px-3 py-1.5 text-[11px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 hover:text-indigo-200 rounded"
            title="Restore personality to how it was when you opened this panel"
          >
            Revert
          </button>
        </div>
      </div>
    </div>
  );
}
