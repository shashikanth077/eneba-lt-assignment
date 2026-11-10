import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { OrderDetail, OrderSummary, Paginated } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import { keyedCaseReducers } from '../../utils/keyed';
import { sessionExpired, signedOut } from '../auth/authSlice';
import type { CurrentOrderState, OrdersState } from './ordersTypes';

const emptyCurrent: CurrentOrderState = {
  id: null,
  status: 'idle',
  order: null,
  error: null,
  gaveUp: false,
};
const initialState: OrdersState = { list: {}, current: emptyCurrent };

const list = keyedCaseReducers<OrdersState, Paginated<OrderSummary>>((s) => s.list);

const ordersSlice = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    fetchOrdersRequest: list.request,
    fetchOrdersSuccess: list.success,
    fetchOrdersFailure: list.failure,
    /** The list changed (a checkout started, an order was paid): drop the cached pages. */
    invalidateOrdersList: (state) => {
      state.list = {};
    },

    /** Opens an order: loads it now and keeps asking while its payment is still pending. */
    startOrderPolling: (state, action: PayloadAction<number>) => {
      if (state.current.id !== action.payload)
        state.current = { ...emptyCurrent, id: action.payload };
      state.current.status = state.current.order ? state.current.status : 'loading';
      state.current.gaveUp = false;
      state.current.error = null;
    },
    stopOrderPolling: () => undefined,
    orderLoaded: (state, action: PayloadAction<OrderDetail>) => {
      state.current.order = action.payload;
      state.current.status = 'succeeded';
      state.current.error = null;
    },
    orderLoadFailed: (state, action: PayloadAction<SerializedApiError>) => {
      state.current.status = 'failed';
      state.current.error = action.payload;
    },
    pollingGaveUp: (state) => {
      state.current.gaveUp = true;
    },
    /** The order page closed: the keys leave the browser's memory with it. */
    leaveOrder: (state) => {
      state.current = emptyCurrent;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState).addCase(sessionExpired, () => initialState);
  },
});

export const {
  fetchOrdersRequest,
  fetchOrdersSuccess,
  fetchOrdersFailure,
  invalidateOrdersList,
  startOrderPolling,
  stopOrderPolling,
  orderLoaded,
  orderLoadFailed,
  pollingGaveUp,
  leaveOrder,
} = ordersSlice.actions;
export const ordersReducer = ordersSlice.reducer;

export const selectOrdersEntry = (page: number) => (state: RootState) =>
  state.orders.list[String(page)];
export const selectCurrentOrder = (state: RootState): CurrentOrderState => state.orders.current;
