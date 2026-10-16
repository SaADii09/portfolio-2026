const WORD_CHAR = /[a-z0-9]/;

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
    const char = q[qi];
    let index = -1;

    for (let ti = from; ti < t.length; ti++) {
      if (t[ti] === char) {
        index = ti;
        break;
      }
    }

    if (index === -1) return null;

    score += 1;
    if (index === 0 || !WORD_CHAR.test(t[index - 1])) score += 3; // word-start bonus
    if (prevMatch !== -1 && index === prevMatch + 1) score += 2; // consecutive-run bonus

    prevMatch = index;
    from = index + 1;
  }

  return score;
}
