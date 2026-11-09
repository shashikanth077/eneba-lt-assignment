/** Same normalisation idea as the backend's TextNormalizer: lower case, no accents or apostrophes, everything else a space. */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previous[j] + 1,
        row[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length];
}

/**
 * "Did you mean ...?": repairs the words of `query` using the words of the best match's title. A word that already
 * is a title word (or the start of one: the person is still typing) is kept; any other word is replaced by the closest
 * title word, if it is close enough (about one edit per three letters). Returns null when nothing would change, so the
 * page never offers "did you mean" the very same thing.
 */
export function suggestQuery(query: string, topTitle: string): string | null {
  const title = words(topTitle);
  const typed = words(query);
  if (typed.length === 0 || title.length === 0) return null;

  const fixed = typed.map((word) => {
    if (title.some((candidate) => candidate.startsWith(word))) return word;
    const allowed = Math.max(1, Math.floor(word.length / 3));
    let best = word;
    let bestDistance = allowed + 1;
    for (const candidate of title) {
      const d = distance(word, candidate);
      if (d < bestDistance) {
        best = candidate;
        bestDistance = d;
      }
    }
    return best;
  });
  const suggestion = fixed.join(' ');
  return suggestion === typed.join(' ') ? null : suggestion;
}

/**
 * The backend scores 0..1: exact or partial names land at 0.85-1.0, typos around 0.5-0.7 (docs/SEARCH.md).
 * Below this the best match is probably not what was meant.
 */
export const WEAK_SCORE = 0.75;
