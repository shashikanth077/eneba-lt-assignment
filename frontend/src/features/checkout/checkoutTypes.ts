import type { Checkout } from '../../types/api.types';
import type { RequestStatus, SerializedApiError } from '../../types/common.types';

export interface CheckoutState {
  status: RequestStatus;
  /** The reserved order and its PaymentIntent secret, once the server has created them. */
  checkout: Checkout | null;
  error: SerializedApiError | null;
}
