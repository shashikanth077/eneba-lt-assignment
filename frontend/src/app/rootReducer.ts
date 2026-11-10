import { combineReducers } from '@reduxjs/toolkit';
import { authReducer } from '../features/auth/authSlice';
import { cartReducer } from '../features/cart/cartSlice';
import { checkoutReducer } from '../features/checkout/checkoutSlice';
import { homeReducer } from '../features/home/homeSlice';
import { ordersReducer } from '../features/orders/ordersSlice';
import { productsReducer } from '../features/products/productsSlice';
import { uiReducer } from '../features/ui/uiSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  cart: cartReducer,
  checkout: checkoutReducer,
  home: homeReducer,
  orders: ordersReducer,
  products: productsReducer,
  ui: uiReducer,
});
