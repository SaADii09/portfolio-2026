export const MIN_WINDOW_WIDTH = 280;
export const MIN_WINDOW_HEIGHT = 200;
export const INITIAL_Z_INDEX = 100;
export const DEFAULT_WINDOW_WIDTH = 400;
export const DEFAULT_WINDOW_HEIGHT = 320;
export const MOBILE_BREAKPOINT = 768;
/**
 * Mobile fill margins — Window.tsx clamps display size to `vw − 32 × vh − 140`,
 * so every window height must respect that or windows paint taller than safe.
 * Lives here (beside MIN_WINDOW_*) so boundaries.ts can consume it without a
 * circular import through window-geometry.ts (short-window spec, validation B7).
 */
export const MOBILE_FILL_H = 140;
