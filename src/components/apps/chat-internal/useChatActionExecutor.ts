import { useEffect, useRef } from "react";
import { extractChatActions, type ActionRef } from "@/lib/ai/actions";
import { executeMarkerAction } from "@/lib/ai/actions-client";

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
 * Fire the not-yet-executed refs exactly once each. The boolean return of
 * `executeMarkerAction` is deliberately consumed nowhere: a marker reaching
 * this layer was already validated by the parser, and a failed execution is
 * still "executed" from the dedupe perspective (actions are fire-and-forget).
 */
function executeNewActions(refs: readonly ActionRef[], executed: Set<string>): void {
  for (const ref of refs) {
    const key = actionKey(ref);
    // Already executed on an earlier (partial) deliver — never re-fire.
    if (executed.has(key)) continue;
    // Hard cap: whatever arrives past 32 executions is dropped, silently.
    if (executed.size >= MAX_EXECUTED_PER_MESSAGE) break;
    executed.add(key);
    executeMarkerAction(ref);
  }
}

/**
 * Observe the CURRENT streaming assistant message and fire each newly-
 * completed `[[action:...]]` marker the moment it appears in the stream.
 *
 * - Partials (`[[…` tails still streaming in) are held back by the parser
 *   (`openPartial` semantics) and simply yield no actions yet; the marker
 *   fires on the later write that completes its `]]`.
 * - Dedupe is scoped per message id, so a fresh stream starts clean.
 * - The hook reads only its ARGUMENTS (no store) and returns nothing; it
 *   mounts in ChatPanel (Task 8) which is always mounted on both platforms,
 *   so execution never stops when the chat window is closed.
 */
export function useChatActionExecutor(streaming: { id: string; content: string } | null): void {
  const streamingId = streaming?.id;
  const streamingContent = streaming?.content;
  const bookkeeping = useRef<MessageBookkeeping>({ id: null, executed: new Set() });

  useEffect(() => {
    if (streamingId === undefined || streamingContent === undefined) return;
    if (bookkeeping.current.id !== streamingId) {
      bookkeeping.current = { id: streamingId, executed: new Set() };
    }
    const { actions } = extractChatActions(streamingContent);
    executeNewActions(actions, bookkeeping.current.executed);
  }, [streamingId, streamingContent]);
}
