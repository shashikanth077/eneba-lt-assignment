import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { Checkout } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import { sessionExpired, signedOut } from '../auth/authSlice';
import type { CheckoutState } from './checkoutTypes';

const initialState: CheckoutState = { status: 'idle', checkout: null, error: null };

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    createCheckoutRequest: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    createCheckoutSuccess: (state, action: PayloadAction<Checkout>) => {
      state.status = 'succeeded';
      state.checkout = action.payload;
    },
    createCheckoutFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.status = 'failed';
      state.error = action.payload;
    },
    /** Leaving the checkout page: forget the reservation's client secret. */
    resetCheckout: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(signedOut, () => initialState).addCase(sessionExpired, () => initialState);
  },
});

export const {
  createCheckoutRequest,
  createCheckoutSuccess,
  createCheckoutFailure,
  resetCheckout,
} = checkoutSlice.actions;
export const checkoutReducer = checkoutSlice.reducer;
export const selectCheckout = (state: RootState): CheckoutState => state.checkout;
