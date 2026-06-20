import { useState, useEffect } from 'react';
import { Bot, BookOpen, Puzzle, Rocket, Code, Wand2, Zap, ArrowRight } from 'lucide-react';

interface DashboardStats {
  agentCount: number;
  contextCount: number;
}

const TIERS = [
  {
    title: 'Simple Chatbot',
    icon: Bot,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    desc: 'Define a chatbot, embed it in any website with a few lines of HTML. Perfect for FAQs, support, and static sites.',
    code: '<script src="vibeful.js"></script>\n<script>Vibeful.init({ agent: "your-id" })</script>',
    cta: 'Create Chatbot',
  },
  {
    title: 'Interactive Widget',
    icon: Wand2,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    desc: 'Agent can navigate your app, highlight elements, start guided tours, and control the page — all through Vibeful commands.',
    code: 'fetch("/v1/ai/assist", {\n  body: JSON.stringify({...})\n})\n// Agent returns vibeful-command blocks\n// → navigate, highlight, tour, modal...',
    cta: 'Build Widget',
  },
  {
    title: 'Agent-Driven App',
    icon: Rocket,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    desc: 'Build entire applications where AI agents drive the user experience. Multi-agent orchestration, custom widgets, RAG knowledge bases.',
    code: '// Multi-agent, custom widgets,\n// deep RAG integration,\n// full vibeful-command protocol\n// Your AI is the application.',
    cta: 'Go Pro',
  },
];

export default function Dashboard({ onNavigate }: { onNavigate: (tab: any) => void }) {
  const [stats, setStats] = useState<DashboardStats>({ agentCount: 0, contextCount: 0 });
  const [showSnippet, setShowSnippet] = useState<number | null>(null);

  useEffect(() => {
    fetch('/v1/agents')
      .then(r => r.json())
      .then(data => setStats(prev => ({
        ...prev,
        agentCount: Array.isArray(data) ? data.length : 0,
      })))
      .catch(() => {});
    fetch('/v1/contexts')
      .then(r => r.json())
      .then(data => setStats(prev => ({
        ...prev,
        contextCount: Array.isArray(data) ? data.length : 0,
      })))
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950">
      {/* Hero header */}
      <div className="border-b border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Zap size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Vibeful Console</h1>
              <p className="text-sm text-slate-400">WordPress for AI Agents — build, manage, embed</p>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex gap-6 mt-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Bot size={14} className="text-indigo-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-200">{stats.agentCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Agents</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <BookOpen size={14} className="text-emerald-400" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-200">{stats.contextCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Knowledge Bases</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Integration tiers */}
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Puzzle size={14} className="text-indigo-400" />
          Integration Tiers — choose your depth
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-10">
          {TIERS.map((tier, i) => {
            const Icon = tier.icon;
            return (
              <div
                key={i}
                className={`rounded-xl border p-5 ${tier.bg} ${tier.border} hover:border-opacity-60 transition-all cursor-pointer`}
                onClick={() => setShowSnippet(showSnippet === i ? null : i)}
              >
                <div className={`w-10 h-10 rounded-lg ${tier.bg} flex items-center justify-center mb-3`}>
                  <Icon size={20} className={tier.color} />
                </div>
                <h3 className="text-sm font-semibold text-slate-200 mb-2">{tier.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">{tier.desc}</p>

                {showSnippet === i && (
                  <pre className="text-[10px] bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono leading-relaxed mb-3 overflow-x-auto">
                    {tier.code}
                  </pre>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (i === 0) window.dispatchEvent(new CustomEvent('vibeful:quick-start', { detail: { template: 'minimal', message: 'I want to create a basic chatbot' } }));
                    else if (i === 1) onNavigate('contexts');
                    else onNavigate('designer');
                  }}
                  className={`text-xs font-medium flex items-center gap-1 ${tier.color} hover:underline`}
                >
                  {tier.cta} <ArrowRight size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap size={14} className="text-indigo-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-4 gap-3 mb-10">
          <button onClick={() => window.dispatchEvent(new CustomEvent('vibeful:quick-start', { detail: { template: 'minimal', message: 'I want to create a basic chatbot' } }))} className="group p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all text-left">
            <Bot size={16} className="text-indigo-400 mb-2" />
            <div className="text-xs font-medium text-slate-200">New Agent</div>
            <div className="text-[10px] text-slate-500 mt-1">Design an agent on the canvas</div>
          </button>
          <button onClick={() => onNavigate('contexts')} className="group p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all text-left">
            <BookOpen size={16} className="text-emerald-400 mb-2" />
            <div className="text-xs font-medium text-slate-200">Knowledge Base</div>
            <div className="text-[10px] text-slate-500 mt-1">Manage RAG document contexts</div>
          </button>
          <button onClick={() => onNavigate('templates')} className="group p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all text-left">
            <Rocket size={16} className="text-amber-400 mb-2" />
            <div className="text-xs font-medium text-slate-200">Templates</div>
            <div className="text-[10px] text-slate-500 mt-1">Start from a pre-built agent</div>
          </button>
          <button onClick={() => window.open('docs.html', '_blank')} className="group p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all text-left">
            <Code size={16} className="text-purple-400 mb-2" />
            <div className="text-xs font-medium text-slate-200">Documentation</div>
            <div className="text-[10px] text-slate-500 mt-1">API reference and guides</div>
          </button>
        </div>
      </div>
    </div>
  );
}