import { all, call } from 'redux-saga/effects';
import { authSaga } from '../features/auth/authSaga';
import { cartSaga } from '../features/cart/cartSaga';
import { checkoutSaga } from '../features/checkout/checkoutSaga';
import { homeSaga } from '../features/home/homeSaga';
import { ordersSaga } from '../features/orders/ordersSaga';
import { productsSaga } from '../features/products/productsSaga';
import { uiSaga } from '../features/ui/uiSlice';

/** Every feature's watcher sagas, started together. A saga that throws is logged by Redux Saga and does not take the others down. */
export function* rootSaga(): Generator {
  yield all([
    call(authSaga),
    call(cartSaga),
    call(checkoutSaga),
    call(homeSaga),
    call(ordersSaga),
    call(productsSaga),
    call(uiSaga),
  ]);
}
