import type { CartLine } from '../../types/api.types';

/**
 * The cart of a visitor who has not signed in: kept in this browser only (localStorage), so it survives a refresh. It holds what the page
 * showed when the item was added (name, seller, price, stock) so the cart can be drawn; the server never trusts any of it. Prices and
 * stock are re-read from the catalogue when the cart page opens, and the server recomputes everything when the items are merged into the
 * account (cartSaga) and again at checkout.
 */
const KEY = 'keymart:guest-cart:v1';

const isLine = (value: unknown): value is CartLine => {
  const line = value as Partial<CartLine> | null;
  return (
    typeof line === 'object' &&
    line !== null &&
    Number.isInteger(line.offerId) &&
    typeof line.productSlug === 'string' &&
    typeof line.productName === 'string' &&
    typeof line.sellerName === 'string' &&
    Number.isInteger(line.unitCents) &&
    Number.isInteger(line.qty) &&
    Number.isInteger(line.available)
  );
};

/** Never throws: private windows and blocked storage simply give an empty cart. */
export function loadGuestLines(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

export function saveGuestLines(lines: CartLine[]): void {
  try {
    if (lines.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // storage unavailable: the cart still works for this page view
  }
}
