/**
 * Idle/total read timeout for provider streams (design §Idle-read timeout).
 * Free providers stall; the UI must always recover — the adapter turns a
 * stalled upstream into a terminal `error("timeout")` instead of hanging.
 *
 * Wraps ANY async iterable (both adapters reuse it — anthropic here, the
 * openai-compat adapter in task 3):
 *  - no item within `ms`  → throws `StreamTimeoutError("idle")`
 *  - total time > `totalMs` → throws `StreamTimeoutError("total")`
 *  - `signal` aborted      → the stream simply ENDS (client disconnect is
 *    not an error; the Response is dead already)
 *
 * On any early end the wrapper cancels the upstream (`cancel` callback +
 * `iterator.return()`), so a stalled body never leaks a pending read.
 *
 * Fake-timer friendly: deadlines are measured with `Date.now()`, so
 * `vi.useFakeTimers()` (modern mocks patch Date) drives them in tests.
 */

/** Thrown by `withIdleTimeout` when the stream stalls or overruns its budget. */
export class StreamTimeoutError extends Error {
  constructor(readonly reason: "idle" | "total") {
    super(reason === "idle" ? "stream idle timeout" : "stream total timeout");
    this.name = "StreamTimeoutError";
  }
}

export interface IdleTimeoutOptions {
  /** Max gap between two items. */
  ms: number;
  /** Max total stream duration. */
  totalMs: number;
  /** Client disconnect — aborting it ends the stream quietly. */
  signal?: AbortSignal;
  /**
   * Called when the wrapper ends early (timeout, abort, consumer break) to
   * release upstream resources (e.g. cancel the body reader).
   */
  cancel?: () => void;
}

/** Unique "aborted" marker; real iterator results never collide with it. */
const ABORTED = Symbol("aborted");

/**
 * Races one `iterator.next()` against the idle timer and the abort signal.
 * Throws StreamTimeoutError on an idle overrun; resolves ABORTED when the
 * client disconnects. `Promise.race` subscribes to every input, so the
 * abandoned `next()` never becomes an unhandled rejection.
 */
async function raceNext<T>(
  next: Promise<IteratorResult<T>>,
  idleMs: number,
  aborted: Promise<typeof ABORTED>,
): Promise<IteratorResult<T> | typeof ABORTED> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const idle: Promise<never> = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new StreamTimeoutError("idle")), idleMs);
    });
    return await Promise.race([next, idle, aborted]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The next event, or null when the stream should end now. */
async function takeNext<T>(
  iterator: AsyncIterator<T>,
  startedAt: number,
  options: IdleTimeoutOptions,
  aborted: Promise<typeof ABORTED>,
): Promise<T | null> {
  const remaining = options.totalMs - (Date.now() - startedAt);
  if (remaining <= 0) throw new StreamTimeoutError("total");
  const result = await raceNext(iterator.next(), Math.min(options.ms, remaining), aborted);
  if (result === ABORTED || result.done) return null;
  return result.value;
}

/** Fire-and-forget release of the upstream iterable. */
function releaseEarly<T>(iterator: AsyncIterator<T>, options: IdleTimeoutOptions): void {
  options.cancel?.();
  void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
}

export async function* withIdleTimeout<T>(
  iterable: AsyncIterable<T>,
  options: IdleTimeoutOptions,
): AsyncGenerator<T, void, undefined> {
  const { signal } = options;
  const aborted = new Promise<typeof ABORTED>((resolve) => {
    if (signal?.aborted) {
      resolve(ABORTED);
      return;
    }
    signal?.addEventListener("abort", () => resolve(ABORTED), { once: true });
  });
  const iterator = iterable[Symbol.asyncIterator]();
  const startedAt = Date.now();
  try {
    for (;;) {
      const value = await takeNext(iterator, startedAt, options, aborted);
      if (value === null) return;
      yield value;
    }
  } finally {
    releaseEarly(iterator, options);
  }
}
