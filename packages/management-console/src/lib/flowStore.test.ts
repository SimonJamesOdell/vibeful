import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowStore, type TourStep, type VibefulNodeData } from './flowStore';
import type { Node } from '@xyflow/react';

// ═══════════════════════════════════════════════════════════════
// Invariants for the tour state machine in the flow store.
//
// REGRESSION GUARDS:
// - startTour sets tourSteps and tourActiveIndex atomically (single set())
// - nextTourStep at last step dismisses the tour
// - prevTourStep at first step is a no-op
// - dismissTour clears all tour state
// - NodeTooltip rendering depends on tourSteps.length > 0 && tourActiveIndex >= 0
// ═══════════════════════════════════════════════════════════════

function makeNode(label: string, y: number): Node<VibefulNodeData> {
  return {
    id: `n_${label}`,
    type: 'vibefulNode',
    position: { x: 250, y },
    data: { label, nodeType: 'builtin.setup', config: {} },
  };
}

function makeTourStep(nodeLabel: string, explanation: string): TourStep {
  return { nodeLabel, explanation };
}

describe('tour state machine', () => {
  beforeEach(() => {
    // Reset store to clean state before each test
    useFlowStore.setState({
      nodes: [],
      edges: [],
      tourSteps: [],
      tourActiveIndex: -1,
      selectedNodeId: null,
    });
  });

  describe('startTour', () => {
    it('sets tourSteps and tourActiveIndex to 0', () => {
      const steps: TourStep[] = [
        makeTourStep('setup', 'First step'),
        makeTourStep('react_agent', 'Second step'),
      ];
      useFlowStore.getState().startTour(steps);

      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual(steps);
      expect(state.tourActiveIndex).toBe(0);
    });

    it('selects the first node when it exists on canvas', () => {
      const node = makeNode('setup', 50);
      useFlowStore.setState({ nodes: [node] });

      const steps: TourStep[] = [makeTourStep('setup', 'Init')];
      useFlowStore.getState().startTour(steps);

      const state = useFlowStore.getState();
      expect(state.selectedNodeId).toBe(node.id);
    });

    it('sets selectedNodeId to null when first node not on canvas', () => {
      useFlowStore.setState({ nodes: [] });

      const steps: TourStep[] = [makeTourStep('missing_node', '...')];
      useFlowStore.getState().startTour(steps);

      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual(steps);
      expect(state.tourActiveIndex).toBe(0);
      expect(state.selectedNodeId).toBeNull();
    });
  });

  describe('nextTourStep', () => {
    it('advances to next step and selects corresponding node', () => {
      const n1 = makeNode('setup', 50);
      const n2 = makeNode('react_agent', 170);
      useFlowStore.setState({ nodes: [n1, n2] });

      const steps: TourStep[] = [
        makeTourStep('setup', 'A'),
        makeTourStep('react_agent', 'B'),
      ];
      const state = useFlowStore.getState();
      state.startTour(steps);

      state.nextTourStep();
      const afterNext = useFlowStore.getState();
      expect(afterNext.tourActiveIndex).toBe(1);
      expect(afterNext.selectedNodeId).toBe(n2.id);
    });

    it('dismisses tour when advancing past last step', () => {
      const node = makeNode('setup', 50);
      useFlowStore.setState({ nodes: [node] });

      const steps: TourStep[] = [makeTourStep('setup', 'Only step')];
      useFlowStore.getState().startTour(steps);

      // Advance past the only step
      useFlowStore.getState().nextTourStep();

      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual([]);
      expect(state.tourActiveIndex).toBe(-1);
      expect(state.selectedNodeId).toBeNull();
    });

    it('dismisses tour from empty steps list', () => {
      useFlowStore.setState({ tourSteps: [], tourActiveIndex: 0 });
      useFlowStore.getState().nextTourStep();
      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual([]);
      expect(state.tourActiveIndex).toBe(-1);
    });
  });

  describe('prevTourStep', () => {
    it('goes back to previous step and selects corresponding node', () => {
      const n1 = makeNode('setup', 50);
      const n2 = makeNode('react_agent', 170);
      useFlowStore.setState({ nodes: [n1, n2] });

      const steps: TourStep[] = [
        makeTourStep('setup', 'A'),
        makeTourStep('react_agent', 'B'),
      ];
      const state = useFlowStore.getState();
      state.startTour(steps);
      state.nextTourStep(); // now at index 1

      state.prevTourStep();
      const afterPrev = useFlowStore.getState();
      expect(afterPrev.tourActiveIndex).toBe(0);
      expect(afterPrev.selectedNodeId).toBe(n1.id);
    });

    it('is a no-op at first step (index 0)', () => {
      const node = makeNode('setup', 50);
      useFlowStore.setState({ nodes: [node] });

      const steps: TourStep[] = [
        makeTourStep('setup', 'A'),
        makeTourStep('react_agent', 'B'),
      ];
      useFlowStore.getState().startTour(steps);
      // Already at index 0

      useFlowStore.getState().prevTourStep();
      const state = useFlowStore.getState();
      expect(state.tourActiveIndex).toBe(0);
      expect(state.tourSteps).toEqual(steps);
    });
  });

  describe('dismissTour', () => {
    it('clears tourSteps, resets tourActiveIndex to -1, deselects node', () => {
      const node = makeNode('setup', 50);
      useFlowStore.setState({ nodes: [node] });

      const steps: TourStep[] = [makeTourStep('setup', '...')];
      useFlowStore.getState().startTour(steps);
      expect(useFlowStore.getState().tourSteps.length).toBe(1);

      useFlowStore.getState().dismissTour();
      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual([]);
      expect(state.tourActiveIndex).toBe(-1);
      expect(state.selectedNodeId).toBeNull();
    });

    it('is idempotent — calling dismissTour on empty tour does nothing', () => {
      useFlowStore.setState({ tourSteps: [], tourActiveIndex: -1, selectedNodeId: 'abc' });
      useFlowStore.getState().dismissTour();
      const state = useFlowStore.getState();
      expect(state.tourSteps).toEqual([]);
      expect(state.tourActiveIndex).toBe(-1);
      expect(state.selectedNodeId).toBeNull();
    });
  });

  describe('tour invariants for NodeTooltip visibility', () => {
    it('NodeTooltip would render (tourSteps.length > 0 && tourActiveIndex >= 0)', () => {
      const steps: TourStep[] = [makeTourStep('setup', '...')];
      useFlowStore.getState().startTour(steps);

      const { tourSteps, tourActiveIndex } = useFlowStore.getState();
      const wouldRender = tourSteps.length > 0 && tourActiveIndex >= 0;
      expect(wouldRender).toBe(true);
    });

    it('NodeTooltip would NOT render after dismissTour', () => {
      const steps: TourStep[] = [makeTourStep('setup', '...')];
      useFlowStore.getState().startTour(steps);
      useFlowStore.getState().dismissTour();

      const { tourSteps, tourActiveIndex } = useFlowStore.getState();
      const wouldRender = tourSteps.length > 0 && tourActiveIndex >= 0;
      expect(wouldRender).toBe(false);
    });

    it('NodeTooltip would NOT render from initial state', () => {
      const { tourSteps, tourActiveIndex } = useFlowStore.getState();
      const wouldRender = tourSteps.length > 0 && tourActiveIndex >= 0;
      expect(wouldRender).toBe(false);
    });
  });
});
