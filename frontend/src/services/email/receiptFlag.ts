import { safeStorage } from '../storage/safeStorage';

/**
 * "This order still needs its confirmation email." Set when the buyer confirms payment in this browser, cleared once the email
 * has been sent. It stops an email going out again on every visit to the order page (and an old order from sending one at all).
 * No storage means no flag, which means no email: the safe direction to fail in.
 */
const key = (orderId: number) => `keymart:receipt-due:${orderId}`;

export const markReceiptDue = (orderId: number): void => {
  safeStorage.set(key(orderId), '1');
};

/** True exactly once per marked order. */
export function takeReceiptDue(orderId: number): boolean {
  if (safeStorage.get(key(orderId)) === null) return false;
  safeStorage.remove(key(orderId));
  return true;
}
