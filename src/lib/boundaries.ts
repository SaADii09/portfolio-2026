import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MOBILE_BREAKPOINT } from "@/lib/constants";

const DEFAULT_WIDGET_W = 200;
const DEFAULT_WIDGET_H = 100;

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
    y: Math.max(topBar, Math.min(y, vh - maxH - bottomBar)),
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

export function clampDragPosition(
  x: number,
  y: number,
  windowWidth: number,
  vw: number,
  vh: number,
) {
  const { topBar, bottomBar } = getViewportBounds(vw);
  const visibleFraction = 0.5;
  const minX = -(windowWidth * visibleFraction);
  const maxX = vw - windowWidth * visibleFraction;
  return {
    x: Math.max(minX, Math.min(x, maxX)),
    y: Math.max(topBar, Math.min(y, vh - bottomBar)),
  };
}

export { DEFAULT_WIDGET_W, DEFAULT_WIDGET_H };
