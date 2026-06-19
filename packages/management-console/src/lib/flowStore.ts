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
    set({ nodes: applyNodeChanges(changes, get().nodes) as unknown as Node<VibefulNodeData>[] });
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });
  },

  addNode: (nodeType, label, position) => {
    const { nodes, edges } = get();
    // Auto-connect to last node if chain-building
    const id = makeId();
    const newNode: Node<VibefulNodeData> = {
      id,
      type: 'vibefulNode',
      position: position || { x: Math.random() * 400 + 50, y: nodes.length * 120 + 50 },
      data: { label, nodeType, config: {} },
    };

    let newEdges = edges;
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      newEdges = [
        ...edges,
        {
          id: `edge_${lastNode.id}_${id}`,
          source: lastNode.id,
          target: id,
        },
      ];
    }

    set({ nodes: [...nodes, newNode], edges: newEdges, selectedNodeId: id });
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

  loadGraph: (nodes, edges) => {
    set({ nodes, edges, selectedNodeId: null });
  },
  clearGraph: () => {
    set({ nodes: [], edges: [], selectedNodeId: null });
  },
}));
