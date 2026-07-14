import { useRef, useCallback } from "react";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;

interface LongPressOptions {
  onLongPress: (e: React.PointerEvent) => void;
}

export function useLongPress({ onLongPress }: LongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const triggered = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      triggered.current = false;
      startPos.current = { x: e.clientX, y: e.clientY };
      clear();
      timerRef.current = setTimeout(() => {
        triggered.current = true;
        onLongPress(e);
      }, LONG_PRESS_MS);
    },
    [onLongPress, clear],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (timerRef.current === null) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
        clear();
      }
    },
    [clear],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- event accepted for call-site compatibility
  const onPointerUp = useCallback((e?: React.PointerEvent) => {
    clear();
  }, [clear]);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!triggered.current) {
        onLongPress(e as unknown as React.PointerEvent);
      }
    },
    [onLongPress],
  );

  return { onPointerDown, onPointerMove, onPointerUp, onContextMenu };
}
