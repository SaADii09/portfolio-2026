import { DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from "@/lib/constants";
import { clampWindowSize, getViewportBounds } from "@/lib/boundaries";

/**
 * Per-app default window geometry (control-panel/geometry design spec §4.4).
 *
 * Key-based: `key = component` for app windows, `webview:<url>` for iframe
 * windows (matched via the WEBVIEW_GEOMETRY_KEY prefix). Pure and stateless —
 * Task 4's geometry-memory composes on top of `getAppWindowGeometry`.
 */

/** Prefix every iframe-window geometry key starts with (`webview:${url}`). */
export const WEBVIEW_GEOMETRY_KEY = "webview:";

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GeometryRequest {
  component?: string;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface SizeSpec {
  width: number;
  height: number;
}

/** First-open anchor as fractions of the leftover safe-zone space (spec §4.4). */
interface SlotSpec {
  leftFrac: number;
  topFrac: number;
}

interface Spec {
  size: SizeSpec;
  slot: SlotSpec;
}

/** Locked per-app content-fit sizes — measured content footprints (spec §4.4). */
const APP_SIZES: Record<string, SizeSpec> = {
  about: { width: 560, height: 620 },
  projects: { width: 720, height: 640 },
  "control-panel": { width: 460, height: 640 },
  resume: { width: 700, height: 760 },
  terminal: { width: 640, height: 420 },
  contact: { width: 480, height: 520 },
};

/** Locked first-open anchor slots in leftover safe-zone space (spec §4.4). */
const APP_SLOTS: Record<string, SlotSpec> = {
  about: { leftFrac: 0, topFrac: 0.18 },
  projects: { leftFrac: 0.55, topFrac: 0.25 },
  "control-panel": { leftFrac: 0.5, topFrac: 0.5 },
  resume: { leftFrac: 0.5, topFrac: 0.06 },
  terminal: { leftFrac: 0, topFrac: 0.9 },
  contact: { leftFrac: 0.72, topFrac: 0.25 },
};

const WEBVIEW_SIZE: SizeSpec = { width: 800, height: 560 };
const WEBVIEW_SLOT: SlotSpec = { leftFrac: 0.5, topFrac: 0.4 };

/** Unknown components keep today's defaults (spec §4.4 fallback row). */
const FALLBACK_SIZE: SizeSpec = { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };
const FALLBACK_X = 80;
const FALLBACK_Y = 60;

/** Inputs below these normalize up so the slot maths never flips/NaNs. */
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 480;

/**
 * Mobile fill margins — Window.tsx clamps display size to `vw − 32 × vh − 140`,
 * so the table size must already respect that or windows paint taller than safe.
 */
const MOBILE_FILL_W = 32;
const MOBILE_FILL_H = 140;
/** Mobile windows sit just under the status bar (spec §4.4 mobile rule). */
const MOBILE_TOP_GAP = 8;

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function lookupSpec(key: string): Spec | null {
  if (key.startsWith(WEBVIEW_GEOMETRY_KEY)) return { size: WEBVIEW_SIZE, slot: WEBVIEW_SLOT };
  const size = APP_SIZES[key];
  const slot = APP_SLOTS[key];
  if (!size || !slot) return null;
  return { size, slot };
}

/**
 * True when a config should resolve geometry from the per-app table: every
 * explicit x/y/width/height absent AND a key present (component or url).
 */
export function shouldUseTableGeometry(config: GeometryRequest): boolean {
  return hasGeometryKey(config) && allGeometryUndefined(config);
}

function hasGeometryKey(config: GeometryRequest): boolean {
  return config.component !== undefined || config.url !== undefined;
}

function allGeometryUndefined(config: GeometryRequest): boolean {
  return (
    config.x === undefined &&
    config.y === undefined &&
    config.width === undefined &&
    config.height === undefined
  );
}

/**
 * Full open-time geometry for any config. Explicit values win per-field
 * (legacy behavior); otherwise the per-app table + anchor slot resolve it.
 * Unknown keys keep the legacy defaults (spec §4.4 fallback row).
 */
export function resolveOpenGeometry(
  config: GeometryRequest,
  vw: number,
  vh: number,
  offset: number,
): WindowGeometry {
  if (!shouldUseTableGeometry(config)) return legacyOpenGeometry(config, offset);
  return getAppWindowGeometry(config.component ?? `webview:${config.url}`, vw, vh, offset);
}

function legacyOpenPosition(config: GeometryRequest, offset: number): { x: number; y: number } {
  return { x: config.x ?? FALLBACK_X + offset, y: config.y ?? FALLBACK_Y + offset };
}

function legacyOpenSize(config: GeometryRequest): SizeSpec {
  return {
    width: config.width ?? DEFAULT_WINDOW_WIDTH,
    height: config.height ?? DEFAULT_WINDOW_HEIGHT,
  };
}

function legacyOpenGeometry(config: GeometryRequest, offset: number): WindowGeometry {
  return { ...legacyOpenPosition(config, offset), ...legacyOpenSize(config) };
}

function clampSize(raw: SizeSpec, vw: number, vh: number): SizeSpec {
  const clamped = clampWindowSize(raw.width, raw.height, vw, vh);
  return { width: clamped.width, height: clamped.height };
}

/** Mobile shrinks the table size to the fill constraint before clamping. */
function mobileSize(size: SizeSpec, vw: number, vh: number): SizeSpec {
  const filled: SizeSpec = {
    width: Math.min(size.width, vw - MOBILE_FILL_W),
    height: Math.min(size.height, vh - MOBILE_FILL_H),
  };
  return clampSize(filled, vw, vh);
}

function desktopPosition(
  slot: SlotSpec,
  w: number,
  h: number,
  vw: number,
  vh: number,
  cascade: number,
): { x: number; y: number } {
  const { topBar, bottomBar } = getViewportBounds(vw);
  // Slot maths run in painted viewport coords (the spec's frame); windows
  // paint inside the content zone (top = topBar), so translate to store
  // coords afterwards: paintedY = storeY + topBar.
  const leftover = vh - h - bottomBar;
  const paintedY = clampRange(slot.topFrac * leftover + cascade, topBar, leftover);
  return {
    x: clampRange(slot.leftFrac * (vw - w) + cascade, 0, vw - w),
    y: paintedY - topBar,
  };
}

/** Mobile ignores the slots: centered horizontally, just under the status bar. */
function mobilePosition(w: number, h: number, vw: number, vh: number, cascade: number) {
  const { topBar, bottomBar } = getViewportBounds(vw);
  const paintedY = clampRange(topBar + MOBILE_TOP_GAP + cascade, topBar, vh - h - bottomBar);
  return {
    x: clampRange((vw - w) / 2 + cascade, 0, vw - w),
    y: paintedY - topBar,
  };
}

/** Legacy placement for keys outside the table — today's 80/60 default + cascade. */
function legacyPosition(cascade: number): { x: number; y: number } {
  return { x: FALLBACK_X + cascade, y: FALLBACK_Y + cascade };
}

/**
 * Safe-zone clamp in store (content-zone-relative) coords, then round to
 * ints. Windows paint at paintedY = y + topBar, so the zone top is 0 and the
 * zone floor is (vh − topBar − bottomBar). Integer bounds make rounding safe.
 */
function settle(
  pos: { x: number; y: number },
  w: number,
  h: number,
  vw: number,
  vh: number,
): WindowGeometry {
  const { topBar, bottomBar } = getViewportBounds(vw);
  const zoneHeight = vh - topBar - bottomBar;
  return {
    x: clampRange(Math.round(pos.x), 0, vw - w),
    y: clampRange(Math.round(pos.y), 0, zoneHeight - h),
    width: w,
    height: h,
  };
}

function specGeometry(spec: Spec, vw: number, vh: number, cascade: number): WindowGeometry {
  const { isMobile } = getViewportBounds(vw);
  const size = isMobile ? mobileSize(spec.size, vw, vh) : clampSize(spec.size, vw, vh);
  const pos = isMobile
    ? mobilePosition(size.width, size.height, vw, vh, cascade)
    : desktopPosition(spec.slot, size.width, size.height, vw, vh, cascade);
  return settle(pos, size.width, size.height, vw, vh);
}

function fallbackGeometry(vw: number, vh: number, cascade: number): WindowGeometry {
  const size = clampSize(FALLBACK_SIZE, vw, vh);
  const pos = legacyPosition(cascade);
  return settle(pos, size.width, size.height, vw, vh);
}

/**
 * Geometry for a window keyed by `component` or `webview:<url>`.
 *
 * `cascade` staggers repeat opens (windowSlice's `(openCount % 8) × 50` step);
 * explicit geometry from the caller bypasses this function entirely.
 */
export function getAppWindowGeometry(
  key: string,
  vwRaw: number,
  vhRaw: number,
  cascade = 0,
): WindowGeometry {
  const vw = Math.max(MIN_VIEWPORT_WIDTH, vwRaw);
  const vh = Math.max(MIN_VIEWPORT_HEIGHT, vhRaw);
  const spec = lookupSpec(key);
  if (!spec) return fallbackGeometry(vw, vh, cascade);
  return specGeometry(spec, vw, vh, cascade);
}
