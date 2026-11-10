import type { Cart, CartLine } from '../../types/api.types';
import type { RequestStatus, SerializedApiError } from '../../types/common.types';

/** What is going on with one cart line (or one offer being added): shown on that row only. */
export interface LineState {
  pending: boolean;
  error: SerializedApiError | null;
}

export interface CartState {
  /** The signed-in user's cart, as the server last answered. */
  cart: Cart | null;
  /** The visitor's cart before signing in (see guestCartStorage). Merged into `cart` by the server after sign-in, then emptied. */
  guest: CartLine[];
  /** true while the guest items are being added to the account (pages wait instead of showing an empty cart). */
  merging: boolean;
  status: RequestStatus;
  error: SerializedApiError | null;
  /** Per offer id. */
  lines: Record<number, LineState>;
}
