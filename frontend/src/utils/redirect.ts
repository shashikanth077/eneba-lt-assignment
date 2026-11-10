/**
 * "Sign in, then go back where you were." The target travels in the URL (?next=/account/orders) so it survives a page
 * refresh, and is validated so the login page can never be used as an open redirect.
 */
export const LOGIN_PATH = '/login';
export const DEFAULT_AFTER_LOGIN = '/';

export function loginUrl(target: string): string {
  return `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}

/** Only same-site paths are allowed: "/x", never "//evil.com", "/\evil.com", "https://...", or javascript: URLs. */
export function safeNext(
  raw: string | null | undefined,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if ([...raw].some((char) => char.charCodeAt(0) < 32)) return fallback; // tabs/newlines can smuggle a scheme past naive checks
  if (raw === LOGIN_PATH || raw.startsWith(`${LOGIN_PATH}?`) || raw.startsWith('/register'))
    return fallback; // never bounce back into the auth pages
  return raw;
}
