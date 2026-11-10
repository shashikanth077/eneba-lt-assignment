import { call, put, takeLatest } from 'redux-saga/effects';
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
    yield put(createCheckoutFailure(toApiError(error)));
  }
}

export function* checkoutSaga(): Generator {
  yield takeLatest(createCheckoutRequest.type, startCheckout);
}
