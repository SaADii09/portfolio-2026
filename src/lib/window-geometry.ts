import {
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MIN_WINDOW_HEIGHT,
  MOBILE_FILL_H,
} from "@/lib/constants";
import { availableWindowHeight, clampWindowSize, getViewportBounds } from "@/lib/boundaries";
import type { AppId } from "@/lib/apps";

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
  /** Per-app height floor (short-window spec G1) — threaded into clampSize. */
  minHeight: number;
}

/** DevOS Browser content-fit size + first-open anchor slot (browser spec §7). */
export const BROWSER_SIZE: SizeSpec = { width: 960, height: 660 };
export const BROWSER_SLOT: SlotSpec = { leftFrac: 0.5, topFrac: 0.1 };

/** Locked per-app content-fit sizes — measured content footprints (spec §4.4). */
const APP_SIZES: Record<string, SizeSpec> = {
  about: { width: 560, height: 620 },
  // The Projects WINDOW is opened again (the Browser is a stand-alone app
  // with its own icon); this row is its locked size.
  projects: { width: 720, height: 640 },
  "control-panel": { width: 460, height: 640 },
  resume: { width: 700, height: 760 },
  terminal: { width: 640, height: 420 },
  contact: { width: 480, height: 520 },
  // Browser exact-key row (browser spec §7) — resolved like any app key.
  browser: BROWSER_SIZE,
};

/** Locked first-open anchor slots in leftover safe-zone space (spec §4.4). */
const APP_SLOTS: Record<string, SlotSpec> = {
  about: { leftFrac: 0, topFrac: 0.18 },
  // The Projects window's own slot (see the size row above).
  projects: { leftFrac: 0.55, topFrac: 0.25 },
  "control-panel": { leftFrac: 0.5, topFrac: 0.5 },
  resume: { leftFrac: 0.5, topFrac: 0.06 },
  terminal: { leftFrac: 0, topFrac: 0.9 },
  contact: { leftFrac: 0.72, topFrac: 0.25 },
  browser: BROWSER_SLOT,
};

const WEBVIEW_SIZE: SizeSpec = { width: 800, height: 560 };
const WEBVIEW_SLOT: SlotSpec = { leftFrac: 0.5, topFrac: 0.4 };

/**
 * Per-app height floors (short-window spec) — the height at which each app's
 * primary action stays IN-VIEWPORT WITHOUT SCROLLING. `Record<AppId, …>`
 * makes a new AppId a compile error until it declares a floor. Values:
 * contact 500 · about 480 · control-panel 420 (deliberately scrolls below
 * the Theme section) · browser 380 (⅓–¼ unreachable BY DESIGN — the start
 * page compacts, see the browser compaction CSS) · projects 360 · resume
 * 320 · terminal 200 (the global floor; its 158px body fits).
 */
export const APP_MIN_HEIGHTS: Record<AppId, number> = {
  contact: 500,
  about: 480,
  "control-panel": 420,
  browser: 380,
  projects: 360,
  resume: 320,
  terminal: 200,
};

/**
 * The height floor for a window keyed by `component` (or a geometry key).
 * Unknown components and `webview:<url>` iframe keys resolve to the global
 * `MIN_WINDOW_HEIGHT`. A lookup, not a chain — one guarded map read.
 * `Object.hasOwn` keeps inherited `Object.prototype` keys ("toString",
 * "constructor", …) from resolving — a tampered localStorage key would
 * otherwise yield a FUNCTION here and NaN geometry downstream (review M1).
 */
export function minHeightFor(component?: string): number {
  if (!component) return MIN_WINDOW_HEIGHT;
  return Object.hasOwn(APP_MIN_HEIGHTS, component)
    ? (APP_MIN_HEIGHTS[component as AppId] ?? MIN_WINDOW_HEIGHT)
    : MIN_WINDOW_HEIGHT;
}

/** Unknown components keep today's defaults (spec §4.4 fallback row). */
const FALLBACK_SIZE: SizeSpec = { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };
const FALLBACK_X = 80;
const FALLBACK_Y = 60;

/** Inputs below these normalize up so the slot maths never flips/NaNs. */
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 480;

/**
 * Mobile fill WIDTH margin — Window.tsx clamps display size to `vw − 32`,
 * so the table size must already respect that or windows paint wider than
 * safe. (The height twin, MOBILE_FILL_H, moved to constants.ts so
 * boundaries.ts can consume it for `availableWindowHeight` — validation B7.)
 */
const MOBILE_FILL_W = 32;
/** Mobile windows sit just under the status bar (spec §4.4 mobile rule). */
const MOBILE_TOP_GAP = 8;

function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function lookupSpec(key: string): Spec | null {
  if (key.startsWith(WEBVIEW_GEOMETRY_KEY)) {
    return { size: WEBVIEW_SIZE, slot: WEBVIEW_SLOT, minHeight: minHeightFor(key) };
  }
  const size = APP_SIZES[key];
  const slot = APP_SLOTS[key];
  if (!size || !slot) return null;
  return { size, slot, minHeight: minHeightFor(key) };
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
  if (!shouldUseTableGeometry(config)) return legacyOpenGeometry(config, vw, vh, offset);
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

function legacyOpenGeometry(
  config: GeometryRequest,
  vw: number,
  vh: number,
  offset: number,
): WindowGeometry {
  // Explicit geometry is still floored: a caller may hand a height below the
  // app's floor (or below MIN_WINDOW_HEIGHT) — G1 says NO height-setting path
  // bypasses the floor. Unknown/url-only configs floor at MIN_WINDOW_HEIGHT.
  const raw = { ...legacyOpenPosition(config, offset), ...legacyOpenSize(config) };
  const size = clampWindowSize(raw.width, raw.height, vw, vh, minHeightFor(config.component));
  return { ...raw, ...size };
}

function clampSize(raw: SizeSpec, vw: number, vh: number, minHeight: number): SizeSpec {
  const clamped = clampWindowSize(raw.width, raw.height, vw, vh, minHeight);
  return { width: clamped.width, height: clamped.height };
}

/** Mobile shrinks the table size to the fill constraint before clamping. */
function mobileSize(size: SizeSpec, vw: number, vh: number, minHeight: number): SizeSpec {
  const filled: SizeSpec = {
    width: Math.min(size.width, vw - MOBILE_FILL_W),
    height: Math.min(size.height, vh - MOBILE_FILL_H),
  };
  return clampSize(filled, vw, vh, minHeight);
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
  const size = isMobile
    ? mobileSize(spec.size, vw, vh, spec.minHeight)
    : clampSize(spec.size, vw, vh, spec.minHeight);
  const pos = isMobile
    ? mobilePosition(size.width, size.height, vw, vh, cascade)
    : desktopPosition(spec.slot, size.width, size.height, vw, vh, cascade);
  return settle(pos, size.width, size.height, vw, vh);
}

function fallbackGeometry(key: string, vw: number, vh: number, cascade: number): WindowGeometry {
  const size = clampSize(FALLBACK_SIZE, vw, vh, minHeightFor(key));
  const pos = legacyPosition(cascade);
  return settle(pos, size.width, size.height, vw, vh);
}

/**
 * The height a resize commits to (short-window spec G1) — the reported
 * height clamped into `[min(floor, available), available]`. Pure; shared by
 * updateWindowSize so the floor is unfakeable from ANY caller.
 */
export function clampResizedHeight(
  height: number,
  component: string | undefined,
  vw: number,
  vh: number,
): number {
  const available = availableWindowHeight(vw, vh);
  const floor = Math.min(minHeightFor(component), available);
  return Math.min(available, Math.max(floor, height));
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
  if (!spec) return fallbackGeometry(key, vw, vh, cascade);
  return specGeometry(spec, vw, vh, cascade);
}
