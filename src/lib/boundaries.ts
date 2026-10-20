import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MOBILE_BREAKPOINT } from "@/lib/constants";

const DEFAULT_WIDGET_W = 200;
const DEFAULT_WIDGET_H = 100;

/** Gap left between widgets when a drop pushes one clear of another. */
const COLLISION_GAP = 4;

export function getViewportBounds(vw: number) {
  const isMobile = vw < MOBILE_BREAKPOINT;
  const topBar = isMobile ? 32 : 36;
  const bottomBar = isMobile ? 52 : 76;
  return { isMobile, topBar, bottomBar };
}

export function clampWindowSize(w: number, h: number, vw: number, vh: number) {
  const { topBar, bottomBar } = getViewportBounds(vw);
  return {
    width: Math.max(MIN_WINDOW_WIDTH, Math.min(w, vw)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.min(h, vh - topBar - bottomBar)),
  };
}

export function clampWindowPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
) {
  const { topBar, bottomBar } = getViewportBounds(vw);
  const maxW = Math.max(MIN_WINDOW_WIDTH, Math.min(w, vw));
  const maxH = Math.max(MIN_WINDOW_HEIGHT, Math.min(h, vh - topBar - bottomBar));
  return {
    x: Math.max(0, Math.min(x, vw - maxW)),
    // Windows store content-zone-relative coords (paintedY = y + topBar),
    // so the zone floor is 0 — clamping at topBar teleported windows opened
    // in the zone's top slots (per-app geometry) on drag, resize, or any
    // viewport resize. Visible top edge never goes above the zone: the
    // Window component paints inside the content zone (top = topBar), and
    // the max bound keeps painted windows fully above the bottom bar
    // (paintedY ≤ vh − bottomBar − h ⇒ store y ≤ zoneHeight − h).
    y: Math.max(0, Math.min(y, vh - topBar - bottomBar - maxH)),
  };
}

export function clampWidgetBounds(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
) {
  const { topBar, bottomBar } = getViewportBounds(vw);
  const cw = Math.min(w, vw);
  const ch = Math.min(h, vh - topBar - bottomBar);
  return {
    x: Math.max(0, Math.min(x, vw - cw)),
    y: Math.max(topBar, Math.min(y, vh - ch - bottomBar)),
    width: cw,
    height: ch,
  };
}

interface CollisionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PushVector {
  distance: number;
  x: number;
  y: number;
}

function clampToSafeZone(rect: CollisionRect, vw: number, vh: number): CollisionRect {
  const { topBar, bottomBar } = getViewportBounds(vw);
  return {
    x: Math.max(0, Math.min(rect.x, vw - rect.w)),
    y: Math.max(topBar, Math.min(rect.y, vh - rect.h - bottomBar)),
    w: rect.w,
    h: rect.h,
  };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function overlaps(a: CollisionRect, b: CollisionRect): boolean {
  return (
    rangesOverlap(a.x, a.x + a.w, b.x, b.x + b.w) && rangesOverlap(a.y, a.y + a.h, b.y, b.y + b.h)
  );
}

/**
 * The four push-out vectors, ordered right → left → down → up so the smallest
 * push wins and ties break exactly as the previous inline resolver did.
 */
function pushVectors(pos: CollisionRect, other: CollisionRect): PushVector[] {
  const gap = COLLISION_GAP;
  return [
    { distance: other.x + other.w - pos.x, x: other.x + other.w + gap, y: pos.y },
    { distance: pos.x + pos.w - other.x, x: other.x - pos.w - gap, y: pos.y },
    { distance: other.y + other.h - pos.y, x: pos.x, y: other.y + other.h + gap },
    { distance: pos.y + pos.h - other.y, x: pos.x, y: other.y - pos.h - gap },
  ];
}

function pushOut(pos: CollisionRect, other: CollisionRect): CollisionRect {
  const vectors = pushVectors(pos, other);
  const minPush = Math.min(...vectors.map((v) => v.distance));
  const chosen = vectors.find((v) => v.distance === minPush);
  return chosen ? { x: chosen.x, y: chosen.y, w: pos.w, h: pos.h } : pos;
}

function resolveCollision(
  rect: CollisionRect,
  other: { x: number; y: number; width?: number; isCollapsed: boolean },
): CollisionRect {
  const target: CollisionRect = {
    x: other.x,
    y: other.y,
    w: other.width || DEFAULT_WIDGET_W,
    h: DEFAULT_WIDGET_H,
  };
  if (!overlaps(rect, target)) return rect;
  return pushOut(rect, target);
}

export function resolveWidgetCollisions(
  x: number,
  y: number,
  w: number,
  h: number,
  others: Array<{ x: number; y: number; width?: number; isCollapsed: boolean }>,
  vw: number,
  vh: number,
) {
  let rect = clampToSafeZone({ x, y, w, h }, vw, vh);
  for (const other of others) {
    rect = resolveCollision(rect, other);
  }
  const final = clampToSafeZone(rect, vw, vh);
  return { x: final.x, y: final.y };
}

export function clampDragPosition(
  x: number,
  y: number,
  windowWidth: number,
  vw: number,
  vh: number,
) {
  const { bottomBar, topBar } = getViewportBounds(vw);
  const visibleFraction = 0.5;
  const minX = -(windowWidth * visibleFraction);
  const maxX = vw - windowWidth * visibleFraction;
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    // Zone frame: dragged windows may park with their painted top at the dock
    // top (store y ≤ zoneHeight), the same allowance the painted-frame clamp
    // had before the zone shift (painted top ≤ vh − bottomBar). Painted top
    // is topBar + y, so the faithful translate keeps the −topBar here.
    y: Math.max(0, Math.min(y, vh - topBar - bottomBar)),
  };
}

export { DEFAULT_WIDGET_W, DEFAULT_WIDGET_H };
