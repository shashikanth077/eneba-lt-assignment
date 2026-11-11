import { all, call, delay, put, race, select, spawn, take, takeLatest } from 'redux-saga/effects';
import type { RootState } from '../../app/store';
import { sendOrderConfirmationEmail } from '../../services/email/emailService';
import { takeReceiptDue } from '../../services/email/receiptFlag';
import { reportEvent } from '../../services/log/clientLog';
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
function* afterPaid(order: OrderDetail, justPaid: boolean): Generator {
  yield put(fetchCartRequest());
  yield put(invalidateOrdersList());
  const user = (yield select(selectUser)) as User | null;
  if (user && takeReceiptDue(order.id)) {
    // spawned, not called: the page that polls leaves for the order page the moment the order is paid, which stops this saga; the
    // e-mail must still go out.
    yield spawn(sendOrderConfirmationEmail, { order, user }); // never throws
  } else if (user && justPaid) {
    // paid, but this browser did not press Pay for it (another device, storage cleared, or the e-mail already went out): say so in the log
    reportEvent('email.skipped', {
      kind: 'order',
      reason: 'no pending receipt flag in this browser',
      order_id: order.id,
    });
  }
}

/** Loads the order, then keeps asking every POLL_EVERY_MS for as long as it is `pending`. */
function* pollUntilSettled(id: number): Generator {
  let haveOrder = false;
  let sawPending = false; // the order turned paid while this page was watching it (not an old order being opened)
  while (true) {
    try {
      const { order } = (yield call(getOrder, id)) as { order: OrderDetail };
      haveOrder = true;
      yield put(orderLoaded(order));
      if (order.status === 'pending') sawPending = true;
      if (order.status !== 'pending') {
        if (order.status === 'paid') yield call(afterPaid, order, sawPending);
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
  if (result.giveUp) {
    reportEvent('payment.poll.gave_up', { order_id: action.payload }); // the server log then shows whether Stripe or the API was the problem
    yield put(pollingGaveUp());
  }
}

export function* ordersSaga(): Generator {
  yield all([watchList(), takeLatest(startOrderPolling.type, pollOrder as never)]);
}
