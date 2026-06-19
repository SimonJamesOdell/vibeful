/**
 * Setup Wizard — detects missing LLM API key and lets users
 * configure it directly in the UI. No .env file editing required.
 */

import { useState, useEffect } from 'react';
import { Key, ExternalLink, X, RefreshCw, Loader2, Check, Shield } from 'lucide-react';

interface ConfigStatus {
  deepseek_api_key_configured: boolean;
  llm_provider: string;
  needs_setup: boolean;
  setup_instructions: string;
  get_api_key_url: string;
}

export default function SetupWizard() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const checkConfig = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/v1/health/config');
      if (resp.ok) {
        const data = await resp.json();
        setConfig(data);
        if (data.deepseek_api_key_configured) {
          setSaved(true);
        }
      }
    } catch {
      // Proxy may not be running yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConfig();
    const interval = setInterval(checkConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveKey = async () => {
    const key = apiKey.trim();
    if (!key || key.length < 10) {
      setError('Please enter a valid API key (at least 10 characters).');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const resp = await fetch('/v1/setup/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key }),
      });

      if (resp.ok) {
        setSaved(true);
        setApiKey('');
        await checkConfig(); // Re-check to confirm
      } else {
        const data = await resp.json();
        setError(data.detail || 'Failed to save API key.');
      }
    } catch {
      setError('Could not connect to the server. Is the proxy running?');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config || !config.needs_setup || (dismissed && saved)) {
    return null;
  }

  return (
    <div className="bg-amber-950/60 border-b border-amber-800/50 px-4 py-3">
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <div className="mt-1 flex-shrink-0">
          <Key size={18} className="text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-amber-200 flex items-center gap-2">
            ⚠️ LLM API Key Not Configured
            {saved && <span className="text-[10px] px-1.5 py-0.5 bg-green-900/50 text-green-300 rounded-full">Saved</span>}
          </h3>

          <p className="text-xs text-amber-300/80 mt-1">
            Vibeful needs a DeepSeek API key to power its AI agents.
            Paste your key below — no file editing needed.
          </p>

          {/* Key input form */}
          {!saved && (
            <div className="mt-3 flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setError(''); }}
                  placeholder="sk-..."
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                />
                <Shield size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600" />
              </div>
              <button
                onClick={handleSaveKey}
                disabled={saving || !apiKey.trim()}
                className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors flex items-center gap-1"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {saving ? 'Saving…' : 'Save Key'}
              </button>
            </div>
          )}

          {saved && (
            <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
              <Check size={12} />
              API key configured! The system is ready to use.
              <button onClick={checkConfig} className="text-amber-400 hover:text-amber-300 underline ml-2">
                Re-check
              </button>
            </div>
          )}

          {error && (
            <div className="mt-2 text-xs text-red-400">{error}</div>
          )}

          {/* Help links */}
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={config.get_api_key_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-amber-800/50 hover:bg-amber-700/50 text-amber-300 rounded transition-colors"
            >
              Get a free API key <ExternalLink size={9} />
            </a>
            <span className="text-[10px] text-amber-500/60 self-center">
              Your key is sent only to the Vibeful proxy running on your machine.
            </span>
          </div>
        </div>

        {saved && (
          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 text-amber-500 hover:text-amber-300 transition-colors mt-1"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
