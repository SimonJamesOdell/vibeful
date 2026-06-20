import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let _addToast: ((text: string, type: 'success' | 'error' | 'info') => void) | null = null;

/** Call from anywhere to show a styled toast notification */
export function showToast(text: string, type: 'success' | 'error' | 'info' = 'success') {
  _addToast?.(text, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  let nextId = 1;

  const addToast = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-4), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  if (toasts.length === 0) return null;

  const colors = {
    success: 'border-emerald-500/40 bg-emerald-900/80 text-emerald-200',
    error: 'border-red-500/40 bg-red-900/80 text-red-200',
    info: 'border-indigo-500/40 bg-indigo-900/80 text-indigo-200',
  };
  const icons = {
    success: <CheckCircle size={14} className="text-emerald-400" />,
    error: <AlertTriangle size={14} className="text-red-400" />,
    info: <Info size={14} className="text-indigo-400" />,
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-2xl animate-slide-up text-sm max-w-sm ${colors[t.type]}`}
        >
          {icons[t.type]}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="text-white/50 hover:text-white/80">
            <X size={12} />
          </button>
        </div>
      ))}
      <style>{`@keyframes slide-up { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } } .animate-slide-up { animation: slide-up 0.3s ease-out }`}</style>
    </div>
  );
}