import type { Cart } from '../../types/api.types';
import type { RequestStatus, SerializedApiError } from '../../types/common.types';

/** What is going on with one cart line (or one offer being added): shown on that row only. */
export interface LineState {
  pending: boolean;
  error: SerializedApiError | null;
}

export interface CartState {
  cart: Cart | null;
  status: RequestStatus;
  error: SerializedApiError | null;
  /** Per offer id. */
  lines: Record<number, LineState>;
}
