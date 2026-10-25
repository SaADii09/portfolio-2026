import { useEffect, useRef } from "react";
import { extractChatActions, type ActionRef } from "@/lib/ai/actions";
import { executeMarkerAction } from "@/lib/ai/actions-client";
import { useStore } from "@/store";

/**
 * Hard cap on executed actions per streaming message (spec §stream-time
 * execution): markers are progressive enhancement, never load-bearing, so
 * anything beyond the cap is silently dropped.
 */
const MAX_EXECUTED_PER_MESSAGE = 32;

/** Bookkeeping scoped to ONE streaming message; re-keyed when the id changes so a fresh stream can't inherit a prior stream's executed refs. */
interface MessageBookkeeping {
  id: string | null;
  executed: Set<string>;
}

/** Dedupe key for an executed marker (documented interface: `verb:arg`). */
function actionKey(ref: ActionRef): string {
  return `${ref.verb}:${ref.arg ?? ""}`;
}

/**
 * Dev-only diagnostic: a validated marker that failed to execute is a silent
 * no-op in production, but in dev it names the dropped key so a broken
 * os-actions mapping is visible in the console instead of vanishing.
 */
function warnIfFailed(ok: boolean, key: string): void {
  if (!ok && process.env.NODE_ENV !== "production") {
    console.warn(`[chat] action not executed: ${key}`);
  }
}

/**
 * Fire the not-yet-executed refs exactly once each. A marker reaching this
 * layer was already validated by the parser, and a failed execution is still
 * "executed" from the dedupe perspective (actions are fire-and-forget); the
 * boolean is surfaced as a dev-only `console.warn` via `warnIfFailed`.
 */
function executeNewActions(refs: readonly ActionRef[], executed: Set<string>): void {
  for (const ref of refs) {
    const key = actionKey(ref);
    // Already executed on an earlier (partial) deliver — never re-fire.
    if (executed.has(key)) continue;
    // Hard cap: whatever arrives past 32 executions is dropped, silently.
    if (executed.size >= MAX_EXECUTED_PER_MESSAGE) break;
    executed.add(key);
    warnIfFailed(executeMarkerAction(ref), key);
  }
}

/**
 * The fast-tail re-scan: scan a FINALIZED message's final content once
 * through the same path. settle() flushes the last token chunk and flips
 * `streaming:false` in ONE React batch, so the streaming observer can miss a
 * marker whose `]]` completed in the final chunk (no render ever saw it with
 * `streaming:true`). The per-message dedupe Set makes the extra scan
 * idempotent — a marker already fired mid-stream is never re-fired here.
 */
function scanFinalizedMessage(
  id: string,
  bookkeeping: MessageBookkeeping,
  contentOf: (id: string) => string | undefined,
): void {
  // Bookkeeping re-keyed to a newer stream: skip — scanning into the wrong
  // Set could double-fire. (A newer stream starting mid-finalize is not a
  // reachable interleave — the composer/Retry are gated on isLoading — but
  // the guard keeps the scan correct by construction.)
  if (bookkeeping.id !== id) return;
  const content = contentOf(id);
  if (content === undefined) return;
  const { actions } = extractChatActions(content);
  executeNewActions(actions, bookkeeping.executed);
}

/**
 * Observe the CURRENT streaming assistant message and fire each newly-
 * completed `[[action:...]]` marker the moment it appears in the stream.
 *
 * - Partials (`[[…` tails still streaming in) are held back by the parser
 *   (`openPartial` semantics) and simply yield no actions yet; the marker
 *   fires on the later write that completes its `]]`.
 * - Dedupe is scoped per message id, so a fresh stream starts clean.
 * - FAST TAIL: when the streaming message finalizes (the `streaming` prop
 *   drops to null), the finalized message's final content is re-scanned ONCE
 *   (one store read at that transition, mirroring ChatPanel's message
 *   selection) — the settle() same-batch flush can otherwise drop a marker
 *   completed in the final chunk. Same `executeNewActions` path, so the
 *   dedupe Set keeps the re-scan idempotent.
 * - The hook returns nothing; it mounts in ChatPanel (Task 8) which is
 *   always mounted on both platforms, so execution never stops when the
 *   chat window is closed.
 */
export function useChatActionExecutor(streaming: { id: string; content: string } | null): void {
  const streamingId = streaming?.id;
  const streamingContent = streaming?.content;
  const bookkeeping = useRef<MessageBookkeeping>({ id: null, executed: new Set() });
  /** The streaming id still owed a finalize scan (null = none pending). */
  const finalizeScanId = useRef<string | null>(null);

  useEffect(() => {
    if (streamingId === undefined || streamingContent === undefined) return;
    if (bookkeeping.current.id !== streamingId) {
      bookkeeping.current = { id: streamingId, executed: new Set() };
    }
    finalizeScanId.current = streamingId;
    const { actions } = extractChatActions(streamingContent);
    executeNewActions(actions, bookkeeping.current.executed);
  }, [streamingId, streamingContent]);

  // The finalize transition: the streaming prop became null while a scan is
  // still owed. One store read, one scan through the shared path, then the
  // debt is cleared — the effect never runs twice for the same message.
  useEffect(() => {
    const pendingId = finalizeScanId.current;
    if (pendingId === null || pendingId === streamingId) return;
    finalizeScanId.current = null;
    scanFinalizedMessage(
      pendingId,
      bookkeeping.current,
      (id) => useStore.getState().messages.find((m) => m.id === id)?.content,
    );
  }, [streamingId, streamingContent]);
}
