import { useState, useRef, useEffect } from 'react';
import { X, Bot, Brain, Rocket } from 'lucide-react';

const TEMPLATES = [
  { key: 'minimal', name: 'Basic Chatbot', desc: '4 nodes — Setup, System Prompt, ReAct, Stream. Simplest agent.', icon: Bot },
  { key: 'full', name: 'Full Agent', desc: '10 nodes — RAG, Router, Planning, Attack Guard. Production-ready.', icon: Brain },
  { key: 'lucid', name: 'Lucid Analysis', desc: '7 nodes — Analysis pipeline + conductor + DML router.', icon: Rocket },
];

interface Props {
  defaultName?: string;
  defaultTemplate?: string;
  onConfirm: (name: string, template: string) => void;
  onClose: () => void;
}

export default function CreateAgentModal({ defaultName, defaultTemplate, onConfirm, onClose }: Props) {
  const [name, setName] = useState(defaultName || '');
  const [template, setTemplate] = useState(defaultTemplate || 'minimal');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const finalName = name.trim() || 'Unnamed Agent';
    onConfirm(finalName, template);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-indigo-400" />
            <span className="text-sm font-medium text-slate-200">Create New Agent</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Agent Name</label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Support Bot, Sales Agent, Charlie…"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Template */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Template</label>
            <div className="space-y-2">
              {TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <label
                    key={tpl.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      template === tpl.key
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={tpl.key}
                      checked={template === tpl.key}
                      onChange={() => setTemplate(tpl.key)}
                      className="mt-0.5 accent-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon size={13} className="text-indigo-400" />
                        <span className="text-xs font-medium text-slate-200">{tpl.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{tpl.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-700 bg-slate-800/30">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium">
            Create Agent
          </button>
        </div>
      </div>
    </div>
  );
}