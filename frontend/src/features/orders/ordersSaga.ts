import { all, call, delay, put, race, select, take, takeLatest } from 'redux-saga/effects';
import type { RootState } from '../../app/store';
import { sendOrderReceipt } from '../../services/email/emailjs';
import { takeReceiptDue } from '../../services/email/receiptFlag';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { OrderDetail, User } from '../../types/api.types';
import { createKeyedWatcher } from '../../utils/keyedSaga';
import { selectUser } from '../auth/authSlice';
import { fetchCartRequest } from '../cart/cartSlice';
import { getOrder, getOrders } from './ordersService';
import {
  fetchOrdersFailure,
  fetchOrdersRequest,
  fetchOrdersSuccess,
  invalidateOrdersList,
  orderLoaded,
  orderLoadFailed,
  pollingGaveUp,
  startOrderPolling,
  stopOrderPolling,
} from './ordersSlice';

/** How often the order is asked for while the payment is still being confirmed, and for how long before we stop and say so. */
export const POLL_EVERY_MS = 2000;
export const POLL_GIVE_UP_MS = 120_000;

const watchList = createKeyedWatcher({
  request: fetchOrdersRequest,
  success: fetchOrdersSuccess,
  failure: fetchOrdersFailure,
  entry: (state: RootState, key) => state.orders.list[key],
  fetch: (key) => getOrders(Number(key)),
});

/** The order just became paid: the cart lost the bought lines, the list changed, and the buyer is owed a (key-less) email, once. */
function* afterPaid(order: OrderDetail): Generator {
  yield put(fetchCartRequest());
  yield put(invalidateOrdersList());
  const user = (yield select(selectUser)) as User | null;
  if (user && takeReceiptDue(order.id)) {
    yield call(sendOrderReceipt, order, user); // never throws
  }
}

/** Loads the order, then keeps asking every POLL_EVERY_MS for as long as it is `pending`. */
function* pollUntilSettled(id: number): Generator {
  let haveOrder = false;
  while (true) {
    try {
      const { order } = (yield call(getOrder, id)) as { order: OrderDetail };
      haveOrder = true;
      yield put(orderLoaded(order));
      if (order.status !== 'pending') {
        if (order.status === 'paid') yield call(afterPaid, order);
        return;
      }
    } catch (error) {
      yield put(orderLoadFailed(toApiError(error)));
      if (!haveOrder) return; // nothing to show yet: let the page offer "try again"
      // a hiccup while polling: keep what is on screen and ask again
    }
    yield delay(POLL_EVERY_MS);
  }
}

function* pollOrder(action: ReturnType<typeof startOrderPolling>): Generator {
  const result = (yield race({
    settled: call(pollUntilSettled, action.payload),
    stop: take(stopOrderPolling.type),
    giveUp: delay(POLL_GIVE_UP_MS),
  })) as { giveUp?: true };
  if (result.giveUp) yield put(pollingGaveUp());
}

export function* ordersSaga(): Generator {
  yield all([watchList(), takeLatest(startOrderPolling.type, pollOrder as never)]);
}
