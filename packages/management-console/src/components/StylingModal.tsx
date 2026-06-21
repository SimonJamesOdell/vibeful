import { useState, useRef, useEffect } from 'react';
import { X, Upload, Palette, Type } from 'lucide-react';

interface StylingConfig {
  bgColor: string;
  fontColor: string;
  fontFamily: string;
  fontSize: string;
  headerLogo: string; // data URL or empty
}

const SYSTEM_FONTS = [
  { label: 'System UI', value: 'system-ui, sans-serif' },
  { label: 'Inter', value: '"Inter", sans-serif', cdn: 'https://fonts.googleapis.com/css2?family=Inter' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Consolas', value: '"Consolas", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
];

const CDN_BASES: Record<string, { label: string; url: (name: string) => string }> = {
  google: { label: 'Google Fonts', url: (n) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(n)}` },
  adobe: { label: 'Adobe Fonts (Typekit)', url: (n) => `https://use.typekit.net/${n}.css` },
  custom: { label: 'Custom URL', url: (n) => n },
};
const PRESET_STYLES: Record<string, Partial<StylingConfig>> = {
  default: { bgColor: '#1e293b', fontColor: '#e2e8f0', fontFamily: 'Inter, sans-serif', fontSize: '14px' },
  light: { bgColor: '#ffffff', fontColor: '#1e293b', fontFamily: 'system-ui', fontSize: '14px' },
  dark: { bgColor: '#0f172a', fontColor: '#f1f5f9', fontFamily: 'Inter, sans-serif', fontSize: '14px' },
  brand: { bgColor: '#4f46e5', fontColor: '#ffffff', fontFamily: 'Poppins, sans-serif', fontSize: '14px' },
};

export default function StylingModal({ onClose, onApply }: { onClose: () => void; onApply: (config: StylingConfig) => void }) {
  const [config, setConfig] = useState<StylingConfig>({
    bgColor: '#1e293b',
    fontColor: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    headerLogo: '',
  });
  const [customFonts, setCustomFonts] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [cdnProvider, setCdnProvider] = useState('google');
  const [cdnFontName, setCdnFontName] = useState('');
  const [cdnFonts, setCdnFonts] = useState<Array<{ label: string; value: string; cdn: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const handleCdnImport = () => {
    const name = cdnFontName.trim();
    if (!name || !CDN_BASES[cdnProvider]) return;
    const url = CDN_BASES[cdnProvider].url(name);
    const value = `"${name}", sans-serif`;
    setCdnFonts((prev) => [...prev.filter((f) => f.value !== value), { label: `${name} (CDN)`, value, cdn: url }]);
    setConfig((p) => ({ ...p, fontFamily: value }));
    setCdnFontName('');
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || (!file.name.endsWith('.ttf') && !file.name.endsWith('.woff') && !file.name.endsWith('.woff2'))) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const name = file.name.replace(/\.ttf$/i, '');
      setCustomFonts((prev) => [...prev, { name, dataUrl }]);
      setConfig((p) => ({ ...p, fontFamily: `'${name}', sans-serif` }));
    };
    reader.readAsDataURL(file);
  };

  const handlePreset = (key: string) => {
    setConfig((prev) => ({ ...prev, ...PRESET_STYLES[key] }));
  };

  // Listen for AI Guide styling commands
  useEffect(() => {
    const handler = (e: Event) => {
      const { preset, font } = (e as CustomEvent).detail || {};
      if (preset && PRESET_STYLES[preset]) {
        setConfig((prev) => ({ ...prev, ...PRESET_STYLES[preset] }));
      }
      if (font) {
        const allFonts = [...SYSTEM_FONTS, ...cdnFonts, ...customFonts.map((f) => ({ label: f.name, value: `'${f.name}', sans-serif` }))];
        const match = allFonts.find((f) => f.label.toLowerCase().includes(font.toLowerCase())
          || f.value.toLowerCase().includes(font.toLowerCase()));
        if (match) setConfig((prev) => ({ ...prev, fontFamily: match.value }));
        else {
          // Auto-import from CDN if not found
          setCdnFontName(font);
          handleCdnImport();
        }
      }
    };
    window.addEventListener('vibeful:styling-apply', handler);
    return () => window.removeEventListener('vibeful:styling-apply', handler);
  }, []);

  // Dynamically load selected font (CDN or custom TTF) for live preview
  const selectedFont = [...SYSTEM_FONTS, ...cdnFonts].find((f) => f.value === config.fontFamily);
  const customFont = customFonts.find((f) => `'${f.name}', sans-serif` === config.fontFamily);
  const fontCdn = selectedFont?.cdn;
  const fontDataUrl = customFont?.dataUrl;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setConfig((prev) => ({ ...prev, headerLogo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="absolute inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-indigo-400" />
            <span className="text-sm font-medium text-slate-200">Widget Styling</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Presets */}
          <div>
            <label className="text-xs text-slate-400 font-medium mb-2 block">Preset Themes</label>
            <div className="flex gap-2">
              {Object.entries(PRESET_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  onClick={() => handlePreset(key)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-slate-700 hover:border-indigo-500 text-slate-300 capitalize"
                  style={{ backgroundColor: style.bgColor, color: style.fontColor }}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">Background</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config.bgColor} onChange={(e) => setConfig((p) => ({ ...p, bgColor: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                <input value={config.bgColor} onChange={(e) => setConfig((p) => ({ ...p, bgColor: e.target.value }))} className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">Font Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={config.fontColor} onChange={(e) => setConfig((p) => ({ ...p, fontColor: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                <input value={config.fontColor} onChange={(e) => setConfig((p) => ({ ...p, fontColor: e.target.value }))} className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono" />
              </div>
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">Font</label>
              <select value={config.fontFamily} onChange={(e) => setConfig((p) => ({ ...p, fontFamily: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200">
                <optgroup label="System Fonts">
                  {SYSTEM_FONTS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </optgroup>
                {cdnFonts.length > 0 && (
                  <optgroup label="CDN Fonts">
                    {cdnFonts.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </optgroup>
                )}
                {customFonts.length > 0 && (
                  <optgroup label="Custom Uploads">
                    {customFonts.map((f) => (
                      <option key={f.name} value={`'${f.name}', sans-serif`}>{f.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select value={cdnProvider} onChange={(e) => setCdnProvider(e.target.value)} className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200">
                {Object.entries(CDN_BASES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input
                value={cdnFontName}
                onChange={(e) => setCdnFontName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCdnImport()}
                placeholder="Font name…"
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
              />
              <button onClick={handleCdnImport} disabled={!cdnFontName.trim()} className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded">Import</button>
            </div>
            <div>
              <input ref={fontInputRef} type="file" accept=".ttf,.woff,.woff2" onChange={handleFontUpload} className="hidden" />
              <button onClick={() => fontInputRef.current?.click()} className="w-full px-3 py-2 border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-lg text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1">
                <Upload size={12} /> Upload custom font (TTF, WOFF, WOFF2)
              </button>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1 block">Size</label>
              <select value={config.fontSize} onChange={(e) => setConfig((p) => ({ ...p, fontSize: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200">
                {['12px', '13px', '14px', '15px', '16px', '18px'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Header branding */}
          <div>
            <label className="text-xs text-slate-400 font-medium mb-2 block flex items-center gap-1"><Upload size={12} /> Header Branding</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            {config.headerLogo ? (
              <div className="flex items-center gap-3">
                <img src={config.headerLogo} alt="Logo" className="h-10 rounded border border-slate-700" />
                <button onClick={() => setConfig((p) => ({ ...p, headerLogo: '' }))} className="text-xs text-red-400 hover:text-red-300">Remove</button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} className="w-full px-3 py-4 border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-lg text-xs text-slate-400 hover:text-slate-200 flex flex-col items-center gap-1">
                <Upload size={16} />
                Upload logo image
              </button>
            )}
          </div>

          {/* Live preview */}
          <div>
            <label className="text-xs text-slate-400 font-medium mb-2 block flex items-center gap-1"><Type size={12} /> Preview</label>
            <div className="rounded-xl border border-slate-700 overflow-hidden" style={{ backgroundColor: config.bgColor, color: config.fontColor, fontFamily: config.fontFamily, fontSize: config.fontSize }}>
              <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2">
                {config.headerLogo && <img src={config.headerLogo} alt="" className="h-6 rounded" />}
                <span className="font-semibold text-xs">Your Agent</span>
              </div>
              <div className="p-4 space-y-2">
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: config.bgColor, filter: 'brightness(0.9)' }}>
                  Hello! How can I help you today?
                </div>
                <div className="flex justify-end">
                  <div className="rounded-lg px-3 py-2 text-xs text-white" style={{ backgroundColor: '#4f46e5' }}>
                    I have a question about pricing.
                  </div>
                </div>
                <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: config.bgColor, filter: 'brightness(0.9)' }}>
                  Sure! Our plans start at $10/month…
                </div>
              </div>
              <div className="px-3 py-2 border-t border-white/10">
                <div className="rounded-lg px-3 py-2 text-xs text-white/40" style={{ backgroundColor: config.bgColor, filter: 'brightness(0.8)' }}>
                  Type a message…
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-700 bg-slate-800/30">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded">Cancel</button>
          <button onClick={() => onApply(config)} className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded">Apply</button>
        </div>
      </div>
    </div>
  );
}