/**
 * NodeTooltip — floating annotation card shown during guided tours.
 * Appears next to the currently highlighted node with step-through controls.
 */
import { useFlowStore, type TourStep } from '../lib/flowStore';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function NodeTooltip() {
  const { tourSteps, tourActiveIndex, nextTourStep, prevTourStep, dismissTour } =
    useFlowStore();

  if (tourSteps.length === 0 || tourActiveIndex < 0) return null;

  const step: TourStep | undefined = tourSteps[tourActiveIndex];
  if (!step) return null;

  const isFirst = tourActiveIndex === 0;
  const isLast = tourActiveIndex === tourSteps.length - 1;
  const total = tourSteps.length;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-md w-full px-4">
      <div className="bg-indigo-950 border border-indigo-700 rounded-lg shadow-2xl p-4 animate-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-600/50 text-indigo-300 rounded-full font-medium">
              {tourActiveIndex + 1} of {total}
            </span>
            <span className="text-xs font-medium text-indigo-200">
              {step.nodeLabel}
            </span>
          </div>
          <button
            onClick={dismissTour}
            className="text-indigo-400 hover:text-indigo-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Explanation */}
        <p className="text-xs text-indigo-100 leading-relaxed mb-3">
          {step.explanation}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={prevTourStep}
            disabled={isFirst}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-800 hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed text-indigo-200 rounded transition-colors"
          >
            <ChevronLeft size={12} />
            Prev
          </button>

          {isLast ? (
            <button
              onClick={dismissTour}
              className="flex items-center gap-1 px-3 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
            >
              Got it
              <ChevronRight size={12} />
            </button>
          ) : (
            <button
              onClick={nextTourStep}
              className="flex items-center gap-1 px-3 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
            >
              Next
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
