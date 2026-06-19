/**
 * Setup Wizard — detects missing LLM API key and guides the user
 * through configuration. Appears as a dismissible banner at the top
 * of the Management Console.
 */

import { useState, useEffect } from 'react';
import { Key, ExternalLink, X, RefreshCw, Loader2, Copy, Check } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);

  const checkConfig = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/v1/health/config');
      if (resp.ok) {
        const data = await resp.json();
        setConfig(data);
      }
    } catch {
      // Proxy may not be running yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConfig();
    // Re-check every 30s in case the user fixes the config
    const interval = setInterval(checkConfig, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCopyInstructions = () => {
    if (config) {
      navigator.clipboard.writeText(config.setup_instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Don't show anything while loading or if everything is configured
  if (loading || !config || !config.needs_setup || dismissed) {
    return null;
  }

  return (
    <div className="bg-amber-950/60 border-b border-amber-800/50 px-4 py-3">
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <div className="mt-0.5 flex-shrink-0">
          <Key size={16} className="text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-amber-200">
              ⚠️ LLM API Key Not Configured
            </h3>
          </div>

          <p className="text-xs text-amber-300/80 mt-1">
            Vibeful needs a DeepSeek API key to power its AI agents.
            Without it, agents won't be able to respond to messages.
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href={config.get_api_key_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
            >
              Get API Key <ExternalLink size={10} />
            </a>

            <button
              onClick={handleCopyInstructions}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-800/50 hover:bg-amber-700/50 text-amber-200 rounded transition-colors border border-amber-700/50"
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied' : 'Copy Setup Instructions'}
            </button>

            <button
              onClick={checkConfig}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-800/30 hover:bg-amber-700/30 text-amber-300 rounded transition-colors"
            >
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
              Re-check
            </button>
          </div>

          <details className="mt-2">
            <summary className="text-[10px] text-amber-400/60 cursor-pointer hover:text-amber-400/80">
              Show setup instructions
            </summary>
            <pre className="mt-1 p-2 bg-slate-900/80 rounded text-[10px] text-slate-300 font-mono whitespace-pre-wrap border border-slate-800">
              {config.setup_instructions}
            </pre>
          </details>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-amber-500 hover:text-amber-300 transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
