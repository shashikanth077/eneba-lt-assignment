import type { OrderDetail, OrderSummary, Paginated } from '../../types/api.types';
import type { RequestStatus, SerializedApiError } from '../../types/common.types';
import type { Keyed } from '../../utils/keyed';

export interface CurrentOrderState {
  id: number | null;
  status: RequestStatus;
  /** Contains the plain-text keys once paid. Lives only while the order page is open (see leaveOrder). */
  order: OrderDetail | null;
  error: SerializedApiError | null;
  /** We stopped asking after two minutes without the payment being confirmed. */
  gaveUp: boolean;
}

export interface OrdersState {
  /** The order history, one entry per page. */
  list: Keyed<Paginated<OrderSummary>>;
  current: CurrentOrderState;
}
