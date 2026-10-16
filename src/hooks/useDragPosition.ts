"use client";

import { useCallback, useEffect, useRef } from "react";

export interface UseDragPositionOptions {
  elementRef: React.RefObject<HTMLElement | null>;
  posX: number;
  posY: number;
  /**
   * Written on every animation frame while dragging, with the raw (clamped)
   * pointer position, and once more on release unless `onRelease` is given.
   */
  onCommit: (x: number, y: number) => void;
  /**
   * Called once with the final pending position when the drag ends
   * (pointerup or pointercancel). Use it for drop-only side effects such as
   * collision resolution; defaults to `onCommit`.
   */
  onRelease?: (x: number, y: number) => void;
  clamp: (x: number, y: number) => { x: number; y: number };
  onDragStart?: () => void;
  disabled?: boolean;
}

interface UseDragPositionReturn {
  handlePointerDown: (e: React.PointerEvent) => void;
}

interface DragOrigin {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
}

interface ValueRef<T> {
  current: T;
}

interface DragSession {
  el: HTMLElement | null;
  originRef: ValueRef<DragOrigin>;
  rafIdRef: ValueRef<number>;
  cleanupRef: ValueRef<(() => void) | null>;
  clamp: (x: number, y: number) => { x: number; y: number };
  onCommit: (x: number, y: number) => void;
  onRelease: (x: number, y: number) => void;
  pending: { x: number; y: number };
  rafScheduled: boolean;
  removeListeners: () => void;
}

interface DragStart {
  e: React.PointerEvent;
  el: HTMLElement | null;
  originRef: ValueRef<DragOrigin>;
  rafIdRef: ValueRef<number>;
  cleanupRef: ValueRef<(() => void) | null>;
  clamp: (x: number, y: number) => { x: number; y: number };
  onCommit: (x: number, y: number) => void;
  onRelease: ((x: number, y: number) => void) | undefined;
  onDragStart: (() => void) | undefined;
  posX: number;
  posY: number;
}

function noop(): void {}

function paint(session: DragSession): void {
  const el = session.el;
  if (!el) return;
  el.style.transform = `translate(${session.pending.x}px, ${session.pending.y}px)`;
}

/** Batch store commits to one per frame, always with the latest pending position. */
function scheduleCommit(session: DragSession): void {
  if (session.rafScheduled) return;
  session.rafScheduled = true;
  session.rafIdRef.current = requestAnimationFrame(() => {
    session.onCommit(session.pending.x, session.pending.y);
    session.rafScheduled = false;
  });
}

function trackPointer(session: DragSession, e: PointerEvent): void {
  const { sx, sy, wx, wy } = session.originRef.current;
  const clamped = session.clamp(wx + e.clientX - sx, wy + e.clientY - sy);
  session.pending.x = clamped.x;
  session.pending.y = clamped.y;
  paint(session);
  scheduleCommit(session);
}

function cleanupSession(session: DragSession): void {
  const el = session.el;
  if (el) el.classList.remove("os-dragging");
  cancelAnimationFrame(session.rafIdRef.current);
  session.rafScheduled = false;
  session.removeListeners();
}

/** The drag ends on pointerup and pointercancel alike — same final commit, no leaked listeners. */
function endDrag(session: DragSession): void {
  cleanupSession(session);
  session.cleanupRef.current = null;
  session.onRelease(session.pending.x, session.pending.y);
}

function attachPointerListeners(session: DragSession): void {
  const onMove = (e: PointerEvent) => trackPointer(session, e);
  const onUp = () => endDrag(session);
  const onCancel = () => endDrag(session);

  session.removeListeners = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onCancel);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onCancel);
}

function isButtonTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

function shouldIgnorePointer(disabled: boolean | undefined, target: EventTarget | null): boolean {
  if (disabled) return true;
  return isButtonTarget(target);
}

function invokeDragStart(onDragStart: (() => void) | undefined): void {
  if (onDragStart) onDragStart();
}

function markDragging(el: HTMLElement | null): void {
  if (el) el.classList.add("os-dragging");
}

/** The release callback always fires the final commit; default it to `onCommit`. */
function resolveOnRelease(
  onRelease: ((x: number, y: number) => void) | undefined,
  onCommit: (x: number, y: number) => void,
): (x: number, y: number) => void {
  return onRelease ?? onCommit;
}

function beginDrag(start: DragStart): void {
  start.cleanupRef.current?.();
  start.originRef.current = {
    sx: start.e.clientX,
    sy: start.e.clientY,
    wx: start.posX,
    wy: start.posY,
  };
  invokeDragStart(start.onDragStart);
  markDragging(start.el);

  const session: DragSession = {
    el: start.el,
    originRef: start.originRef,
    rafIdRef: start.rafIdRef,
    cleanupRef: start.cleanupRef,
    clamp: start.clamp,
    onCommit: start.onCommit,
    onRelease: resolveOnRelease(start.onRelease, start.onCommit),
    pending: { x: start.posX, y: start.posY },
    rafScheduled: false,
    removeListeners: noop,
  };

  attachPointerListeners(session);
  start.cleanupRef.current = () => cleanupSession(session);
}

/**
 * Shared transform-based drag core for windows and widgets.
 * Writes `transform: translate()` on the target element during the drag,
 * batches store commits through requestAnimationFrame (one per frame) with the
 * raw (clamped) position, and hands the final position to `onRelease` when the
 * drag ends. Commits stay raw on purpose: they must match the painted position
 * so React re-renders cannot fight the pointer. The hook never touches the store.
 */
export function useDragPosition({
  elementRef,
  posX,
  posY,
  onCommit,
  onRelease,
  clamp,
  onDragStart,
  disabled,
}: UseDragPositionOptions): UseDragPositionReturn {
  const dragRef = useRef({ sx: 0, sy: 0, wx: 0, wy: 0 });
  const rafRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Abort any in-flight drag when the target unmounts, otherwise the document
  // listeners and the pending rAF outlive the element.
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (shouldIgnorePointer(disabled, e.target)) return;
      e.preventDefault();
      beginDrag({
        e,
        el: elementRef.current,
        originRef: dragRef,
        rafIdRef: rafRef,
        cleanupRef,
        clamp,
        onCommit,
        onRelease,
        onDragStart,
        posX,
        posY,
      });
    },
    [disabled, posX, posY, clamp, onCommit, onRelease, onDragStart, elementRef],
  );

  return { handlePointerDown };
}
