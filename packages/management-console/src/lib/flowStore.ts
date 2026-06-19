import { create } from 'zustand';
import {
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';

export interface VibefulNodeData extends Record<string, unknown> {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

export interface FlowState {
  nodes: Node<VibefulNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  codePreviewVisible: boolean;
  propertiesVisible: boolean;
  agentName: string;
  agentDescription: string;

  // Node operations
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (nodeType: string, label: string, position?: { x: number; y: number }) => void;
  removeSelectedNodes: () => void;
  duplicateSelectedNodes: () => void;

  // Selection
  selectNode: (nodeId: string | null) => void;

  // Panel visibility
  toggleCodePreview: () => void;
  toggleProperties: () => void;

  // Agent metadata
  setAgentName: (name: string) => void;
  setAgentDescription: (desc: string) => void;

  // Config
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;

  // Tour / guided walkthrough
  tourSteps: TourStep[];
  tourActiveIndex: number;
  startTour: (steps: TourStep[]) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  dismissTour: () => void;

  // Bulk
  loadGraph: (nodes: Node<VibefulNodeData>[], edges: Edge[]) => void;
  clearGraph: () => void;
  autoAlign: () => void;
}

export interface TourStep {
  nodeLabel: string;   // Matched against node.data.label to find the node
  explanation: string; // Text to show in the tooltip
}

let nodeIdCounter = 0;
function makeId(): string {
  return `node_${Date.now()}_${++nodeIdCounter}`;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  codePreviewVisible: true,
  propertiesVisible: true,
  agentName: '',
  agentDescription: '',
  tourSteps: [],
  tourActiveIndex: -1,

  onNodesChange: (changes) => {
    const newNodes = applyNodeChanges(changes, get().nodes) as unknown as Node<VibefulNodeData>[];
    // Sync selectedNodeId when the user clicks a node on the canvas
    const selectChanges = changes.filter((c) => c.type === 'select');
    const newSelectedNodeId = selectChanges.length > 0
      ? (newNodes.find((n) => n.selected)?.id ?? null)
      : get().selectedNodeId;
    set({ nodes: newNodes, selectedNodeId: newSelectedNodeId });
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });
  },

  addNode: (nodeType, label, position) => {
    const { nodes, selectedNodeId } = get();
    const id = makeId();

    // Smart default position: below selected node, else below last node, else top
    let defaultPos = { x: 250, y: 50 };
    if (selectedNodeId) {
      const sel = nodes.find((n) => n.id === selectedNodeId);
      if (sel) defaultPos = { x: sel.position.x, y: sel.position.y + 120 };
    } else if (nodes.length > 0) {
      const last = nodes[nodes.length - 1];
      defaultPos = { x: last.position.x, y: last.position.y + 120 };
    }

    const newNode: Node<VibefulNodeData> = {
      id,
      type: 'vibefulNode',
      position: position || defaultPos,
      data: { label, nodeType, config: {} },
    };

    // New nodes start unconnected — the user manually links them by dragging handles
    set({ nodes: [...nodes, newNode], selectedNodeId: id });
  },

  removeSelectedNodes: () => {
    const { nodes, edges } = get();
    const selectedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedIds.size === 0) return;
    set({
      nodes: nodes.filter((n) => !selectedIds.has(n.id)),
      edges: edges.filter((e) => !selectedIds.has(e.source) && !selectedIds.has(e.target)),
      selectedNodeId: null,
    });
  },

  duplicateSelectedNodes: () => {
    const { nodes } = get();
    const selected = nodes.filter((n) => n.selected);
    if (selected.length === 0) return;
    const newNodes = [...nodes];
    let lastId = '';
    for (const node of selected) {
      const id = makeId();
      lastId = id;
      const dup: Node<VibefulNodeData> = {
        ...node,
        id,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        selected: true,
      };
      newNodes.push(dup);
    }
    set({ nodes: newNodes, selectedNodeId: lastId || null });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  startTour: (steps) => {
    const { nodes } = get();
    const first = steps[0];
    const node = nodes.find((n) => n.data.label === first?.nodeLabel || n.id === first?.nodeLabel);
    // Single set() — prevents React batching from rendering intermediate empty state
    // Set selected:true on the active tour node so the Guide context indicator highlights it
    set({
      tourSteps: steps,
      tourActiveIndex: 0,
      selectedNodeId: node?.id ?? null,
      nodes: nodes.map((n) => ({ ...n, selected: n.id === node?.id })),
    });
  },
  nextTourStep: () => {
    const { tourSteps, tourActiveIndex, nodes } = get();
    const next = tourActiveIndex + 1;
    if (next >= tourSteps.length) {
      set({ tourSteps: [], tourActiveIndex: -1, selectedNodeId: null, nodes: nodes.map((n) => ({ ...n, selected: false })) });
      return;
    }
    const step = tourSteps[next];
    const node = nodes.find((n) => n.data.label === step?.nodeLabel || n.id === step?.nodeLabel);
    set({ tourActiveIndex: next, selectedNodeId: node?.id ?? null, nodes: nodes.map((n) => ({ ...n, selected: n.id === node?.id })) });
  },
  prevTourStep: () => {
    const { tourSteps, tourActiveIndex, nodes } = get();
    const prev = tourActiveIndex - 1;
    if (prev < 0) return;
    const step = tourSteps[prev];
    const node = nodes.find((n) => n.data.label === step?.nodeLabel || n.id === step?.nodeLabel);
    set({ tourActiveIndex: prev, selectedNodeId: node?.id ?? null, nodes: nodes.map((n) => ({ ...n, selected: n.id === node?.id })) });
  },
  dismissTour: () => {
    const { nodes } = get();
    set({ tourSteps: [], tourActiveIndex: -1, selectedNodeId: null, nodes: nodes.map((n) => ({ ...n, selected: false })) });
  },

  toggleCodePreview: () => {
    set((s) => ({ codePreviewVisible: !s.codePreviewVisible }));
  },
  toggleProperties: () => {
    set((s) => ({ propertiesVisible: !s.propertiesVisible }));
  },

  setAgentName: (name) => set({ agentName: name }),
  setAgentDescription: (desc) => set({ agentDescription: desc }),

  updateNodeConfig: (nodeId, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
      ),
    });
  },

  autoAlign: () => {
    const { nodes, edges } = get();
    if (nodes.length === 0) return;

    // BFS from roots to assign chain depth, then position vertically
    const incoming = new Set(edges.map((e) => e.target));
    const roots = nodes.filter((n) => !incoming.has(n.id));

    const depth = new Map<string, number>();
    const queue: { id: string; d: number }[] = roots.map((n) => ({ id: n.id, d: 0 }));
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (depth.has(id)) continue;
      depth.set(id, d);
      for (const e of edges.filter((e) => e.source === id)) {
        if (!depth.has(e.target)) queue.push({ id: e.target, d: d + 1 });
      }
    }

    // Any unvisited nodes (disconnected / in cycles) get placed after
    let nextDepth = depth.size;
    for (const n of nodes) {
      if (!depth.has(n.id)) { depth.set(n.id, nextDepth); nextDepth += 1; }
    }

    const aligned = nodes.map((n) => ({
      ...n,
      position: { x: 250, y: (depth.get(n.id) ?? 0) * 120 + 50 },
    }));

    set({ nodes: aligned });
  },

  loadGraph: (nodes, edges) => {
    set({ nodes, edges, selectedNodeId: null });
  },
  clearGraph: () => {
    set({ nodes: [], edges: [], selectedNodeId: null });
  },
}));
