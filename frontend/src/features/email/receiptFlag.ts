/**
 * "This order still needs its confirmation email." Set when the buyer confirms payment in this browser, cleared once the email
 * has been sent. It stops an email going out again on every visit to the order page (and an old order from sending one at all).
 * localStorage can be blocked or full: then no email is sent, which is the safe direction to fail in.
 */
const key = (orderId: number) => `keymart:receipt-due:${orderId}`;

export function markReceiptDue(orderId: number): void {
  try {
    localStorage.setItem(key(orderId), '1');
  } catch {
    // no storage: no receipt email
  }
}

/** True exactly once per marked order. */
export function takeReceiptDue(orderId: number): boolean {
  try {
    if (localStorage.getItem(key(orderId)) === null) return false;
    localStorage.removeItem(key(orderId));
    return true;
  } catch {
    return false;
  }
}
