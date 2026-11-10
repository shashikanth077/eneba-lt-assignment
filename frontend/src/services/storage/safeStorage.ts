/**
 * localStorage that never throws (private windows, blocked site data, full quota): every caller treats "no storage" as "nothing
 * stored". There is deliberately no token storage: the session is an HttpOnly cookie that JavaScript cannot read, which is the point.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to remove
    }
  },
};
