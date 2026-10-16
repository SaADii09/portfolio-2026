const WORD_CHAR = /[a-z0-9]/;

/** First occurrence of `char` in `text` at or after `from`, or `-1`. */
function findChar(text: string, char: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === char) return i;
  }
  return -1;
}

/** A +3 bonus for the first character or one following a non-word character. */
function isWordStart(text: string, index: number): boolean {
  return index === 0 || !WORD_CHAR.test(text[index - 1]);
}

/** A +2 bonus when the match continues an unbroken run from the previous one. */
function isConsecutiveRun(index: number, prevMatch: number): boolean {
  return prevMatch !== -1 && index === prevMatch + 1;
}

function charScore(index: number, prevMatch: number, text: string): number {
  const wordStart = isWordStart(text, index) ? 3 : 0;
  const run = isConsecutiveRun(index, prevMatch) ? 2 : 0;
  return 1 + wordStart + run;
}

/**
 * Fuzzy scorer for command-palette filtering.
 *
 * Matches `query` against `text` as a case-insensitive, in-order subsequence.
 * Each matched character scores 1 point, a character that starts a word earns
 * a +3 bonus, and a character that continues an unbroken run earns a +2 bonus.
 *
 * @returns the score, `0` for an empty query, or `null` when `query` is not a
 * subsequence of `text`.
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (query.length === 0) return 0;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  let score = 0;
  let prevMatch = -1;
  let from = 0;

  for (let qi = 0; qi < q.length; qi++) {
    const index = findChar(t, q[qi], from);
    if (index === -1) return null;

    score += charScore(index, prevMatch, t);
    prevMatch = index;
    from = index + 1;
  }

  return score;
}
