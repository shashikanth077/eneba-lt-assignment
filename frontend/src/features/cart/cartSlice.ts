import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { Cart, CartIssue, CartLine } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import { sessionExpired, signedOut } from '../auth/authSlice';
import { loadGuestLines } from './guestCartStorage';
import type { CartState } from './cartTypes';

/** A function, not a constant: after signing out the guest part must be re-read, not left over from page load. */
const makeInitialState = (): CartState => ({
  cart: null,
  guest: loadGuestLines(),
  merging: false,
  status: 'idle',
  error: null,
  lines: {},
});

const cartSlice = createSlice({
  name: 'cart',
  initialState: makeInitialState, // lazy: every new store (every page load) reads the browser's storage again
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

    addToCartRequest: (
      state,
      action: PayloadAction<{ offerId: number; qty?: number; productSlug?: string }>,
    ) => {
      state.lines[action.payload.offerId] = { pending: true, error: null };
    },
    setQuantityRequest: (state, action: PayloadAction<{ offerId: number; qty: number }>) => {
      state.lines[action.payload.offerId] = { pending: true, error: null };
    },
    removeLineRequest: (state, action: PayloadAction<number>) => {
      state.lines[action.payload] = { pending: true, error: null };
    },
    /** Guest cart: the whole new list of lines (the saga validated it and has stored it). */
    guestLinesChanged: (state, action: PayloadAction<{ offerId?: number; lines: CartLine[] }>) => {
      state.guest = action.payload.lines;
      if (action.payload.offerId !== undefined) {
        state.lines[action.payload.offerId] = { pending: false, error: null };
      }
    },
    mergeStarted: (state) => {
      state.merging = true;
    },
    mergeFinished: (state) => {
      state.merging = false;
      state.guest = [];
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
    builder.addCase(signedOut, makeInitialState).addCase(sessionExpired, makeInitialState);
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
  guestLinesChanged,
  mergeStarted,
  mergeFinished,
} = cartSlice.actions;
export const cartReducer = cartSlice.reducer;

/** The same cart shape the server answers with, drawn from the visitor's own lines. Totals here are an estimate for display only. */
export function guestToCart(lines: CartLine[]): Cart {
  const issues: CartIssue[] = [];
  for (const line of lines) {
    if (line.available === 0) {
      issues.push({ offerId: line.offerId, code: 'out_of_stock', message: 'Out of stock' });
    } else if (line.qty > line.available) {
      issues.push({
        offerId: line.offerId,
        code: 'insufficient_stock',
        message: `Only ${line.available} left`,
      });
    }
  }
  return {
    lines: lines.map((line) => ({ ...line, lineCents: line.unitCents * line.qty })),
    totalCents: lines.reduce((sum, line) => sum + line.unitCents * line.qty, 0),
    currency: 'EUR',
    issues,
  };
}

const selectGuestCart = createSelector([(state: RootState) => state.cart.guest], guestToCart);

/** Signed in: the server's cart. Signed out: the visitor's own cart (already complete, nothing to load). */
export const selectCartState = createSelector(
  [
    (state: RootState) => state.cart,
    (state: RootState) => state.auth.status === 'authenticated',
    selectGuestCart,
  ],
  (cart, signedIn, guestCart): CartState =>
    signedIn
      ? {
          ...cart,
          status: cart.merging ? 'loading' : cart.status,
          cart: cart.merging ? null : cart.cart,
        }
      : { ...cart, cart: guestCart, status: 'succeeded', error: null },
);
export const selectCart = (state: RootState): Cart | null => selectCartState(state).cart;
/** Derived, never stored: number of units in the cart (the header badge). */
export const selectCartCount = (state: RootState): number =>
  selectCart(state)?.lines.reduce((sum, line) => sum + line.qty, 0) ?? 0;
export const selectLineState = (offerId: number) => (state: RootState) => state.cart.lines[offerId];
export const selectQtyInCart =
  (offerId: number) =>
  (state: RootState): number =>
    selectCart(state)?.lines.find((line) => line.offerId === offerId)?.qty ?? 0;
