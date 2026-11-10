import { call, cancel, fork, put, takeEvery, takeLatest, take } from 'redux-saga/effects';
import type { Task } from 'redux-saga';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { Cart } from '../../types/api.types';
import {
  bootstrapSuccess,
  loginSuccess,
  registerSuccess,
  sessionExpired,
  signedOut,
} from '../auth/authSlice';
import { showToast } from '../ui/uiSlice';
import * as cartService from './cartService';
import {
  addToCartRequest,
  fetchCartFailure,
  fetchCartRequest,
  fetchCartSuccess,
  lineChangeFailure,
  lineChangeSuccess,
  removeLineRequest,
  setQuantityRequest,
} from './cartSlice';

function* fetchCart(): Generator {
  try {
    const cart = (yield call(cartService.getCart)) as Cart;
    yield put(fetchCartSuccess(cart));
  } catch (error) {
    yield put(fetchCartFailure(toApiError(error)));
  }
}

function* addToCart(action: ReturnType<typeof addToCartRequest>): Generator {
  const { offerId, qty } = action.payload;
  try {
    const cart = (yield call(cartService.addToCart, offerId, qty)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
    yield put(showToast('success', 'Added to your cart'));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

function* setQuantity(action: ReturnType<typeof setQuantityRequest>): Generator {
  const { offerId, qty } = action.payload;
  try {
    const cart = (yield call(cartService.setCartQuantity, offerId, qty)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

function* removeLine(action: ReturnType<typeof removeLineRequest>): Generator {
  const offerId = action.payload;
  try {
    const cart = (yield call(cartService.removeCartLine, offerId)) as Cart;
    yield put(lineChangeSuccess({ offerId, cart }));
  } catch (error) {
    yield put(lineChangeFailure({ offerId, error: toApiError(error) }));
  }
}

/** All the cart's work, stopped the moment the session ends so a late answer cannot put the old user's cart back. */
function* cartWork(): Generator {
  yield takeLatest(fetchCartRequest.type, fetchCart);
  yield takeEvery(addToCartRequest.type, addToCart as never);
  yield takeEvery(setQuantityRequest.type, setQuantity as never);
  yield takeEvery(removeLineRequest.type, removeLine as never);
}

export function* cartSaga(): Generator {
  // Whenever somebody becomes signed in, load their cart (the header badge needs it on every page).
  yield takeLatest([bootstrapSuccess.type, loginSuccess.type, registerSuccess.type], function* () {
    yield put(fetchCartRequest());
  });

  while (true) {
    const work = (yield fork(cartWork)) as Task;
    yield take([signedOut.type, sessionExpired.type]);
    yield cancel(work);
  }
}
