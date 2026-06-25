import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useTourStore, type PageTourStep } from '../lib/tourStore';

/** Renders a positioned tooltip overlay for page tours. */
export default function TourOverlay() {
  const { active, steps, currentIndex, nextStep, prevStep, dismiss } = useTourStore();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const currentStep: PageTourStep | null = steps[currentIndex] ?? null;

  // Find and track the target element's bounding rect
  const updateRect = useCallback(() => {
    if (!currentStep) { setRect(null); return; }
    try {
      const el = document.querySelector(currentStep.selector);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null); // Element not found (maybe scrolled away or not rendered)
      }
    } catch {
      setRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    updateRect();
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [updateRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
      if (e.key === 'ArrowRight') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, nextStep, prevStep, dismiss]);

  if (!active || !currentStep) return null;

  const position = currentStep.position || 'bottom';
  const isLast = currentIndex >= steps.length - 1;

  // Calculate tooltip position based on target element rect
  let style: React.CSSProperties = {};
  if (rect) {
    const margin = 12;
    switch (position) {
      case 'bottom':
        style = { top: rect.bottom + margin, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
        break;
      case 'top':
        style = { bottom: window.innerHeight - rect.top + margin, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' };
        break;
      case 'right':
        style = { top: rect.top + rect.height / 2, left: rect.right + margin, transform: 'translateY(-50%)' };
        break;
      case 'left':
        style = { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + margin, transform: 'translateY(-50%)' };
        break;
    }
  } else {
    // Fallback: center of screen
    style = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <>
      {/* Dim backdrop — clicking dismisses */}
      <div
        onClick={dismiss}
        className="fixed inset-0 z-[9997] bg-black/40 transition-opacity"
      />

      {/* Highlight ring around target */}
      {rect && (
        <div
          className="fixed z-[9998] pointer-events-none"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            borderRadius: '8px',
            boxShadow: '0 0 0 4px rgba(99,102,241,0.6), 0 0 20px rgba(99,102,241,0.3)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="fixed z-[9999] bg-slate-900 border border-indigo-500/30 rounded-xl shadow-2xl max-w-sm w-full p-4"
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
            {currentIndex + 1} of {steps.length}
          </span>
          <button
            onClick={dismiss}
            className="p-1 text-slate-500 hover:text-slate-300 rounded transition-colors"
            title="Close tour"
          >
            <X size={14} />
          </button>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-slate-100 mb-1">{currentStep.title}</h3>

        {/* Description */}
        <p className="text-xs text-slate-400 leading-relaxed">{currentStep.description}</p>

        {/* Learn more link */}
        {currentStep.learnMoreUrl && (
          <a
            href={currentStep.learnMoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <ExternalLink size={10} />
            Learn more in docs
          </a>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
          <button
            onClick={prevStep}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
          >
            <ChevronLeft size={12} />
            Back
          </button>
          <button
            onClick={nextStep}
            className="flex items-center gap-1 px-3 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
          >
            {isLast ? 'Done' : 'Next'}
            {!isLast && <ChevronRight size={12} />}
          </button>
        </div>
      </div>
    </>
  );
}
