import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { Cart } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import { sessionExpired, signedOut } from '../auth/authSlice';
import type { CartState } from './cartTypes';

const initialState: CartState = { cart: null, status: 'idle', error: null, lines: {} };

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    fetchCartRequest: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    fetchCartSuccess: (state, action: PayloadAction<Cart>) => {
      state.cart = action.payload;
      state.status = 'succeeded';
    },
    fetchCartFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.status = 'failed';
      state.error = action.payload;
    },

    addToCartRequest: (state, action: PayloadAction<{ offerId: number; qty?: number }>) => {
      state.lines[action.payload.offerId] = { pending: true, error: null };
    },
    setQuantityRequest: (state, action: PayloadAction<{ offerId: number; qty: number }>) => {
      state.lines[action.payload.offerId] = { pending: true, error: null };
    },
    removeLineRequest: (state, action: PayloadAction<number>) => {
      state.lines[action.payload] = { pending: true, error: null };
    },
    /** Add, set-quantity and remove all answer with the whole, recomputed cart. */
    lineChangeSuccess: (state, action: PayloadAction<{ offerId: number; cart: Cart }>) => {
      state.cart = action.payload.cart;
      state.status = 'succeeded';
      state.lines[action.payload.offerId] = { pending: false, error: null };
    },
    lineChangeFailure: (
      state,
      action: PayloadAction<{ offerId: number; error: SerializedApiError }>,
    ) => {
      state.lines[action.payload.offerId] = { pending: false, error: action.payload.error };
    },
  },
  extraReducers: (builder) => {
    // One person's cart must never be left in memory for the next person on this browser.
    builder.addCase(signedOut, () => initialState).addCase(sessionExpired, () => initialState);
  },
});

export const {
  fetchCartRequest,
  fetchCartSuccess,
  fetchCartFailure,
  addToCartRequest,
  setQuantityRequest,
  removeLineRequest,
  lineChangeSuccess,
  lineChangeFailure,
} = cartSlice.actions;
export const cartReducer = cartSlice.reducer;

export const selectCartState = (state: RootState): CartState => state.cart;
export const selectCart = (state: RootState): Cart | null => state.cart.cart;
/** Derived, never stored: number of units in the cart (the header badge). */
export const selectCartCount = (state: RootState): number =>
  state.cart.cart?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;
export const selectLineState = (offerId: number) => (state: RootState) => state.cart.lines[offerId];
export const selectQtyInCart =
  (offerId: number) =>
  (state: RootState): number =>
    state.cart.cart?.lines.find((line) => line.offerId === offerId)?.qty ?? 0;
