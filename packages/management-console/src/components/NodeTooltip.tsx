/**
 * NodeTooltip — floating annotation card shown during guided tours.
 * Positioned next to the currently highlighted node on the canvas.
 */
import { useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore, type TourStep } from '../lib/flowStore';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export default function NodeTooltip() {
  const { tourSteps, tourActiveIndex, nextTourStep, prevTourStep, dismissTour, nodes } =
    useFlowStore();
  const { getZoom } = useReactFlow();

  if (tourSteps.length === 0 || tourActiveIndex < 0) return null;

  const step: TourStep | undefined = tourSteps[tourActiveIndex];
  if (!step) return null;

  // Find the highlighted node to position the tooltip next to it
  const activeNode = nodes.find(
    (n) => n.data.label === step.nodeLabel || n.id === step.nodeLabel
  );
  const nodePos = activeNode?.position ?? { x: 250, y: 100 };
  const zoom = getZoom();

  // Position tooltip to the right of the node, above if near bottom edge
  const tooltipX = (nodePos.x + 280) * zoom;
  const tooltipY = (nodePos.y - 20) * zoom;

  const isFirst = tourActiveIndex === 0;
  const isLast = tourActiveIndex === tourSteps.length - 1;
  const total = tourSteps.length;

  return (
    <div
      className="absolute z-40 w-72"
      style={{ left: tooltipX, top: tooltipY }}
    >
      {/* Arrow pointing left to the node */}
      <div className="absolute -left-2 top-4 w-0 h-0 border-t-8 border-t-transparent border-b-8 border-b-transparent border-r-8 border-r-indigo-700" />

      <div className="bg-indigo-950 border border-indigo-700 rounded-lg shadow-2xl p-4">
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
