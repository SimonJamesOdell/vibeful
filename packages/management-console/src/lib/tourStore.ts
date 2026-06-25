import { create } from 'zustand';

/** A single step in a page tour. Points to a DOM element by selector. */
export interface PageTourStep {
  /** CSS selector to the target element (e.g., '#some-id', '.some-class', '[data-tour="x"]') */
  selector: string;
  /** Short heading for the tooltip */
  title: string;
  /** Full explanation text */
  description: string;
  /** Position relative to the target element */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TourState {
  /** Whether a tour is currently active on any page */
  active: boolean;
  /** Which page the tour is associated with (for context) */
  page: string | null;
  /** All steps in the current tour */
  steps: PageTourStep[];
  /** Current step index */
  currentIndex: number;

  /** Start a tour for a specific page */
  startTour: (page: string, steps: PageTourStep[]) => void;
  /** Advance to the next step */
  nextStep: () => void;
  /** Go back to the previous step */
  prevStep: () => void;
  /** Dismiss the tour */
  dismiss: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  page: null,
  steps: [],
  currentIndex: 0,

  startTour: (page, steps) => {
    set({ active: true, page, steps, currentIndex: 0 });
  },

  nextStep: () => {
    const { steps, currentIndex } = get();
    if (currentIndex + 1 >= steps.length) {
      set({ active: false, page: null, steps: [], currentIndex: 0 });
    } else {
      set({ currentIndex: currentIndex + 1 });
    }
  },

  prevStep: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  dismiss: () => {
    set({ active: false, page: null, steps: [], currentIndex: 0 });
  },
}));
