/**
 * Which games this visitor looked at, newest first, kept in this browser only (nothing is sent anywhere). Only slugs are stored:
 * the "Recently viewed" row asks the catalogue for them, so prices and stock shown are always current.
 */
const KEY = 'keymart:recently-viewed:v1';
export const MAX_RECENT = 12;

export function loadRecentSlugs(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,160}$/.test(s))
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function recordViewed(slug: string): void {
  try {
    const next = [slug, ...loadRecentSlugs().filter((s) => s !== slug)].slice(0, MAX_RECENT);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: nothing to remember
  }
}
