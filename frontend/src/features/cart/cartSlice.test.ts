import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { apiError, fakeApi } from '../../test/fakeApi';
import { commerceBackend, line } from '../../test/commerceBackend';
import { loginRequest, loginSuccess } from '../auth/authSlice';
import {
  addToCartRequest,
  fetchCartRequest,
  removeLineRequest,
  selectCartCount,
  selectLineState,
  selectQtyInCart,
  setQuantityRequest,
} from './cartSlice';

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada', emailVerified: true };

/** These tests are about the signed-in cart (the server's); the visitor's cart has its own file. */
const signedInStore = () => {
  const store = makeStore();
  store.dispatch(loginSuccess(ada));
  return store;
};

describe('cart slice + saga', () => {
  it('the badge count is derived from the lines, not stored', async () => {
    commerceBackend({ lines: [line(1, 'A', 1000, 2), line(2, 'B', 500, 1)] });
    const store = signedInStore();
    store.dispatch(fetchCartRequest());
    await settle();

    expect(selectCartCount(store.getState())).toBe(3);
    expect(selectQtyInCart(1)(store.getState())).toBe(2);
    expect(selectQtyInCart(99)(store.getState())).toBe(0);
  });

  it("every change answers with the server's whole cart, whose total replaces ours", async () => {
    const api = commerceBackend({ lines: [line(1, 'A', 1000, 1)] });
    const store = signedInStore();
    store.dispatch(fetchCartRequest());
    await settle();

    store.dispatch(setQuantityRequest({ offerId: 1, qty: 3 }));
    expect(selectLineState(1)(store.getState())).toEqual({ pending: true, error: null });
    await settle();
    expect(store.getState().cart.cart?.totalCents).toBe(3000);
    expect(selectLineState(1)(store.getState())).toEqual({ pending: false, error: null });
    expect(api.cart.lines[0].qty).toBe(3);

    store.dispatch(removeLineRequest(1));
    await settle();
    expect(store.getState().cart.cart?.lines).toEqual([]);
  });

  it('a refused change is recorded on that line only, as plain data', async () => {
    commerceBackend({
      lines: [line(1, 'A', 1000, 1), line(2, 'B', 500, 1)],
      extra: { 'PATCH /api/cart/1': apiError(409, 'insufficient_stock', 'Only 2 left') },
    });
    const store = signedInStore();
    store.dispatch(fetchCartRequest());
    await settle();

    store.dispatch(setQuantityRequest({ offerId: 1, qty: 5 }));
    await settle();
    expect(selectLineState(1)(store.getState())).toMatchObject({
      pending: false,
      error: { code: 'insufficient_stock', status: 409 },
    });
    expect(selectLineState(2)(store.getState())).toBeUndefined();
    expect(store.getState().cart.cart?.lines[0].qty).toBe(1); // unchanged
  });

  it("adding shows a toast and takes the server's new cart", async () => {
    const after = {
      lines: [{ ...line(1, 'A', 1000, 2) }],
      totalCents: 2000,
      currency: 'EUR',
      issues: [],
    };
    commerceBackend({
      lines: [line(1, 'A', 1000, 1)],
      extra: { 'POST /api/cart': { status: 201, body: after } },
    });
    const store = signedInStore();
    store.dispatch(fetchCartRequest());
    await settle();
    store.dispatch(addToCartRequest({ offerId: 1 }));
    await settle();

    expect(selectCartCount(store.getState())).toBe(2);
    expect(store.getState().ui.toasts.map((t) => t.message)).toContain('Added to your cart');
  });

  it('signing in loads the cart without anybody asking for it', async () => {
    const api = fakeApi({
      'POST /api/auth/login': { body: { user: ada } },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const store = makeStore();
    store.dispatch(loginRequest({ email: ada.email, password: 'x' }));
    await settle();
    expect(api.callsTo('/api/cart')).toHaveLength(1);
  });
});
