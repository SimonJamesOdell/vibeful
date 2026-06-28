import { useMemo, useCallback } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface PageData {
  id: string;
  slug: string;
  title: string;
  content_markdown: string;
}

function extractLinks(markdown: string): string[] {
  const slugs: string[] = [];
  // Markdown links: [text](/slug)
  const mdLinkRegex = /\[([^\]]*)\]\(\/([a-z0-9-]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRegex.exec(markdown)) !== null) {
    slugs.push(m[2]);
  }
  // Widget href props
  const hrefRegex = /"href"\s*:\s*"\/([a-z0-9-]+)"/g;
  while ((m = hrefRegex.exec(markdown)) !== null) {
    slugs.push(m[1]);
  }
  // data-vibeful-widget card props with href
  const widgetHrefRegex = /"href":"\/([a-z0-9-]+)"/g;
  while ((m = widgetHrefRegex.exec(markdown)) !== null) {
    slugs.push(m[1]);
  }
  return [...new Set(slugs)];
}

export default function PageGraph({ pages }: { pages: PageData[] }) {
  const slugMap = useMemo(() => new Map(pages.map((p) => [p.slug, p])), [pages]);
  const slugToId = useMemo(() => new Map(pages.map((p) => [p.slug, p.id])), [pages]);

  const { initialNodes, initialEdges } = useMemo(() => {
    if (pages.length === 0) return { initialNodes: [], initialEdges: [] };

    // Find homepage — build tree from links
    const homePage = pages.find((p) => p.slug === 'home') || pages[0];
    const slugMap = new Map(pages.map((p) => [p.slug, p]));

    // Build adjacency from markdown links
    const children = new Map<string, string[]>();
    let totalLinks = 0;
    for (const p of pages) {
      const links = extractLinks(p.content_markdown || '');
      const childSlugs = [...new Set(links.filter((s) => slugMap.has(s) && s !== p.slug))];
      children.set(p.id, childSlugs.map((s) => slugToId.get(s)!));
      totalLinks += childSlugs.length;
    }

    // Fallback: if no explicit links found, make all non-home pages children of home
    if (totalLinks === 0 && pages.length > 1) {
      const otherIds = pages.filter((p) => p.id !== homePage.id).map((p) => p.id);
      children.set(homePage.id, otherIds);
    }

    // BFS tree starting from homepage
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visited = new Set<string>();
    const colGap = 260;
    const rowGap = 80;
    const queue: Array<{ id: string; col: number; row: number }> = [{ id: homePage.id, col: 0, row: 0 }];

    while (queue.length > 0) {
      const { id, col, row } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const page = slugMap.get(slugToId.get(id) ? pages.find((p) => p.id === id)?.slug || '' : '') || pages.find((p) => p.id === id);
      if (!page) continue;

      nodes.push({
        id,
        type: 'default',
        position: { x: col * colGap + 40, y: row * rowGap + 20 },
        data: { label: page.title },
        style: {
          background: id === homePage.id ? '#4338ca' : '#1e293b',
          color: id === homePage.id ? '#fff' : '#e2e8f0',
          border: id === homePage.id ? '2px solid #6366f1' : '1px solid #334155',
          borderRadius: '10px',
          padding: '10px 16px',
          fontSize: id === homePage.id ? '14px' : '12px',
          fontWeight: id === homePage.id ? 600 : 500,
          width: 200,
          textAlign: 'center' as const,
        },
      });

      const childIds = children.get(id) || [];
      childIds.forEach((cid, i) => {
        if (!visited.has(cid)) {
          queue.push({ id: cid, col: col + 1, row: row + i });
          edges.push({
            id: `${id}-${cid}`,
            source: id,
            target: cid,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 1.5, opacity: 0.6 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 8, height: 8 },
          });
        }
      });
    }

    // Add any unvisited pages in a final column
    for (const p of pages) {
      if (!visited.has(p.id)) {
        nodes.push({
          id: p.id,
          type: 'default',
          position: { x: (queue.length > 0 ? 3 : 1) * colGap + 40, y: visited.size * rowGap + 20 },
          data: { label: p.title },
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '10px 16px',
            fontSize: '12px',
            fontWeight: 500,
            width: 200,
            textAlign: 'center' as const,
          },
        });
        visited.add(p.id);
      }
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [pages, slugToId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset when pages change
  const prevPagesRef = useMemo(() => pages, []);
  if (pages !== prevPagesRef) {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }

  if (pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <p className="text-sm">No pages to display</p>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        attributionPosition="bottom-right"
      >
        <Background color="#1e293b" gap={20} />
        <Controls className="[&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300 [&>button]:fill-slate-400" />
      </ReactFlow>
    </div>
  );
}
