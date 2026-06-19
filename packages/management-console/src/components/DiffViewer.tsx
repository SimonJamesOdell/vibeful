import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';

interface DiffViewerProps {
  oldYaml: string;
  newYaml: string;
}

export default function DiffViewer({ oldYaml, newYaml }: DiffViewerProps) {
  const diff = useMemo(() => computeDiff(oldYaml, newYaml), [oldYaml, newYaml]);

  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
        Changes
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="bg-red-950/30 border border-red-900/50 rounded p-2 max-h-60 overflow-y-auto">
          <div className="text-red-400 font-medium mb-1">Previous Version</div>
          {diff.removed.length > 0 ? (
            diff.removed.map((line, i) => (
              <div key={i} className="text-red-300/70 leading-relaxed">
                - {line}
              </div>
            ))
          ) : (
            <div className="text-slate-600 italic">No removals</div>
          )}
        </div>
        <div className="bg-green-950/30 border border-green-900/50 rounded p-2 max-h-60 overflow-y-auto">
          <div className="text-green-400 font-medium mb-1">Current Version</div>
          {diff.added.length > 0 ? (
            diff.added.map((line, i) => (
              <div key={i} className="text-green-300/70 leading-relaxed">
                + {line}
              </div>
            ))
          ) : (
            <div className="text-slate-600 italic">No additions</div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        {diff.added.length} additions, {diff.removed.length} removals
      </div>
    </div>
  );
}

function computeDiff(oldText: string, newText: string) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const oldSet = new Set(oldLines.map((l) => l.trim()));
  const newSet = new Set(newLines.map((l) => l.trim()));

  const removed: string[] = [];
  const added: string[] = [];

  for (const line of oldLines) {
    if (!newSet.has(line.trim()) && line.trim()) {
      removed.push(line);
    }
  }
  for (const line of newLines) {
    if (!oldSet.has(line.trim()) && line.trim()) {
      added.push(line);
    }
  }

  return { removed: removed.slice(0, 30), added: added.slice(0, 30) };
}
