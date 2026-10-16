import { StateCreator } from "zustand";

export interface UiSlice {
  isPaletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

/**
 * Transient UI state. Deliberately NOT persisted: `partialize` in
 * `src/store/index.ts` excludes this slice, so overlays never survive reload.
 */
export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  isPaletteOpen: false,
  openPalette: () => set({ isPaletteOpen: true }),
  closePalette: () => set({ isPaletteOpen: false }),
  togglePalette: () => set((s) => ({ isPaletteOpen: !s.isPaletteOpen })),
});
