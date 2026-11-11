import { call, put, takeLatest } from 'redux-saga/effects';
import { reportEvent } from '../../services/log/clientLog';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { Checkout } from '../../types/api.types';
import { invalidateOrdersList } from '../orders/ordersSlice';
import { createCheckout } from './checkoutService';
import {
  createCheckoutFailure,
  createCheckoutRequest,
  createCheckoutSuccess,
} from './checkoutSlice';

function* startCheckout(): Generator {
  try {
    const checkout = (yield call(createCheckout)) as Checkout;
    yield put(createCheckoutSuccess(checkout));
    yield put(invalidateOrdersList()); // a new (pending) order now exists
  } catch (error) {
    const apiError = toApiError(error);
    reportEvent('checkout.failed', { reason: apiError.code, status: apiError.status }); // the API logged its side; this is what the buyer saw
    yield put(createCheckoutFailure(apiError));
  }
}

export function* checkoutSaga(): Generator {
  yield takeLatest(createCheckoutRequest.type, startCheckout);
}
