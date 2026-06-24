import { useState, useEffect, useRef } from 'react';
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
  const [saving, setSaving] = useState(false);

  // Snapshot of config on mount — used by Revert
  const savedConfigRef = useRef<PersonalityConfig>({ ...config });

  // Load saved personality from the agent on mount
  useEffect(() => {
    if (!agentId) return;
    fetch(`/v1/agents/${agentId}`)
      .then((r) => r.json())
      .then((agent) => {
        if (agent.system_prompt) {
          // Try to detect preset from existing system prompt
          let detectedTone = 'custom';
          for (const [key, preset] of Object.entries(PRESETS)) {
            if (agent.system_prompt === preset.system_prompt) {
              detectedTone = key;
              break;
            }
          }
          setConfig((prev) => ({
            ...prev,
            tone: detectedTone,
            system_prompt: agent.system_prompt || prev.system_prompt,
          }));
        }
        // Capture snapshot after load for Revert
        savedConfigRef.current = { ...config };
      })
      .catch(() => {});
  }, [agentId]);

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

  const handleSave = async () => {
    if (!agentId) return;
    setSaving(true);
    try {
      await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: config.system_prompt }),
      });
    } catch {}
    setSaving(false);
    onClose();
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
        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
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
            <Smile size={14} className="text-purple-400" />
            <span className="text-sm font-medium text-slate-200">Personality</span>
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
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 hover:border-indigo-500 text-slate-300 capitalize"
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
              onChange={(e) => { setConfig((p) => ({ ...p, temperature: Number(e.target.value), tone: 'custom' })); }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>Precise (0.0)</span>
              <span>Creative (2.0)</span>
            </div>
          </div>

          {/* Sliders */}
          {renderSlider('Formality', config.formality, (v) => setConfig((p) => ({ ...p, formality: v, tone: 'custom' })), 'Casual', 'Formal')}
          {renderSlider('Verbosity', config.verbosity, (v) => setConfig((p) => ({ ...p, verbosity: v, tone: 'custom' })), 'Concise', 'Detailed')}
          {renderSlider('Humor', config.humor, (v) => setConfig((p) => ({ ...p, humor: v, tone: 'custom' })), 'Serious', 'Playful')}
          {renderSlider('Empathy', config.empathy, (v) => setConfig((p) => ({ ...p, empathy: v, tone: 'custom' })), 'Detached', 'Empathetic')}

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

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
          <button
            onClick={() => {
              setConfig({ ...savedConfigRef.current });
            }}
            className="px-3 py-1.5 text-[11px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 hover:text-indigo-200 rounded"
            title="Undo changes, restore personality from when you opened this panel"
          >
            Revert
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Right: Preview card */}
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Smile size={12} className="text-purple-400" />
            </div>
            <span className="text-xs font-medium text-slate-300 capitalize">{config.tone} Agent</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Temperature', value: config.temperature.toFixed(1), max: 2 },
              { label: 'Formality', value: `${config.formality}%` },
              { label: 'Verbosity', value: `${config.verbosity}%` },
              { label: 'Humor', value: `${config.humor}%` },
              { label: 'Empathy', value: `${config.empathy}%` },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-20">{item.label}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: item.label === 'Temperature' ? `${(config.temperature / 2) * 100}%` : item.value }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
