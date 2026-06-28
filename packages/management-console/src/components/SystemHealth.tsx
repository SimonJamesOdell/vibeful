import { useState, useEffect } from 'react';
import { Activity, CheckCircle, XCircle, Shield, Zap, Cpu } from 'lucide-react';

export default function SystemHealth() {
  const [engineStatus, setEngineStatus] = useState<'ok' | 'error' | 'loading'>('loading');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');

  useEffect(() => {
    // Check engine health
    fetch('/health')
      .then((r) => {
        if (r.ok) setEngineStatus('ok');
        else setEngineStatus('error');
        return r.json();
      })
      .then((data) => {
        if (data.status !== 'ok') setEngineStatus('error');
      })
      .catch((e) => {
        setEngineStatus('error');
        setErrorDetail(e.message);
      });

    // Check API key via health/config
    fetch('/v1/health/config')
      .then((r) => r.json())
      .then((data) => {
        setApiKeyConfigured(!!data.api_key_configured);
        setNeedsSetup(!data.api_key_configured);
      })
      .catch(() => {});
  }, []);

  const cards = [
    {
      label: 'Agent Engine',
      status: engineStatus,
      icon: <Cpu size={18} />,
      detail: engineStatus === 'error' ? errorDetail || 'Engine unreachable' : 'Running on port 50052',
    },
    {
      label: 'DeepSeek API Key',
      status: apiKeyConfigured ? 'ok' as const : 'error' as const,
      icon: <Shield size={18} />,
      detail: apiKeyConfigured ? 'Configured' : 'Not configured — create a .env file',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">System Health</h2>
            <p className="text-xs text-slate-500 mt-1">
              Engine status, API key, and platform diagnostics
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-slate-900 border border-slate-800 rounded-lg p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  card.status === 'ok' ? 'bg-emerald-500/10 text-emerald-400' :
                  card.status === 'loading' ? 'bg-slate-700 text-slate-400' :
                  'bg-red-500/10 text-red-400'
                }`}>
                  {card.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">{card.label}</div>
                  <div className={`text-xs font-medium ${
                    card.status === 'ok' ? 'text-emerald-400' :
                    card.status === 'loading' ? 'text-slate-500' :
                    'text-red-400'
                  }`}>
                    {card.status === 'ok' ? 'Healthy' : card.status === 'loading' ? 'Checking…' : 'Error'}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">{card.detail}</p>
            </div>
          ))}
        </div>

        {needsSetup && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-amber-400" />
              <span className="text-sm font-medium text-amber-300">Quick Setup</span>
            </div>
            <p className="text-xs text-amber-400/70 leading-relaxed">
              Create a <code className="text-amber-300">.env</code> file in the vibeful root with <code className="text-amber-300">DEEPSEEK_API_KEY=sk-your-key</code> then restart the engine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
