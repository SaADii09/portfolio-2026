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

export function resolveWidgetCollisions(
  x: number,
  y: number,
  w: number,
  h: number,
  others: Array<{ x: number; y: number; width?: number; isCollapsed: boolean }>,
  vw: number,
  vh: number,
) {
  const { topBar, bottomBar } = getViewportBounds(vw);

  let finalX = Math.max(0, Math.min(x, vw - w));
  let finalY = Math.max(topBar, Math.min(y, vh - h - bottomBar));

  for (const other of others) {
    const ox = other.x;
    const oy = other.y;
    const ow = other.width || DEFAULT_WIDGET_W;
    const oh = DEFAULT_WIDGET_H;

    const overlaps =
      finalX < ox + ow && finalX + w > ox && finalY < oy + oh && finalY + h > oy;

    if (overlaps) {
      const pushRight = ox + ow - finalX;
      const pushLeft = finalX + w - ox;
      const pushDown = oy + oh - finalY;
      const pushUp = finalY + h - oy;
      const minPush = Math.min(pushRight, pushLeft, pushDown, pushUp);

      if (minPush === pushRight) finalX = ox + ow + 4;
      else if (minPush === pushLeft) finalX = ox - w - 4;
      else if (minPush === pushDown) finalY = oy + oh + 4;
      else finalY = oy - h - 4;
    }
  }

  finalX = Math.max(0, Math.min(finalX, vw - w));
  finalY = Math.max(topBar, Math.min(finalY, vh - h - bottomBar));

  return { x: finalX, y: finalY };
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
