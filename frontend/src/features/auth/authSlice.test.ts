import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { apiError, fakeApi } from '../../test/fakeApi';
import { bootstrapRequest, loginRequest, logoutRequest, sessionExpired } from './authSlice';
import { fetchCartRequest } from '../cart/cartSlice';

const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada' };
const emptyCart = { lines: [], totalCents: 0, currency: 'EUR', issues: [] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe('auth slice + saga', () => {
  it('starts unknown: we have not asked the server yet', () => {
    expect(makeStore().getState().auth).toMatchObject({
      status: 'unknown',
      user: null,
      signingOut: false,
    });
  });

  it("becomes authenticated when /auth/me answers with a user, and then loads that user's cart", async () => {
    const api = fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': { body: emptyCart },
    });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();

    expect(store.getState().auth).toMatchObject({
      status: 'authenticated',
      user: ada,
      signingOut: false,
    });
    expect(store.getState().cart.cart).toEqual(emptyCart);
    expect(api.callsTo('/api/cart')).toHaveLength(1);
  });

  it('becomes anonymous on a 401 from /auth/me, and asks for no cart', async () => {
    const api = fakeApi({
      'GET /api/auth/me': apiError(401, 'unauthorized', 'Authentication required'),
    });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();

    expect(store.getState().auth).toMatchObject({ status: 'anonymous', user: null });
    expect(api.callsTo('/api/cart')).toHaveLength(0);
  });

  it('is "error", NOT anonymous, when the server fails: no redirect to login for an outage', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 503, body: {} } });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();

    expect(store.getState().auth.status).toBe('error');
  });

  it("login signs in; logout signs out and clears that session's cart", async () => {
    fakeApi({
      'POST /api/auth/login': { body: { user: ada } },
      'GET /api/cart': { body: emptyCart },
      'POST /api/auth/logout': { status: 204 },
    });
    const store = makeStore();
    store.dispatch(loginRequest({ email: ada.email, password: 'x' }));
    await settle();
    expect(store.getState().auth.status).toBe('authenticated');
    expect(store.getState().cart.cart).not.toBeNull();

    store.dispatch(logoutRequest());
    expect(store.getState().auth.signingOut).toBe(true); // flagged by the very action that starts it
    await settle();
    expect(store.getState().auth).toMatchObject({
      status: 'anonymous',
      user: null,
      signingOut: false,
    });
    expect(store.getState().cart.cart).toBeNull();
  });

  it('a 401 from a protected endpoint ends the session, but a wrong password does not count as one', async () => {
    fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': apiError(401, 'unauthorized', 'Authentication required'),
      'POST /api/auth/login': apiError(401, 'invalid_credentials', 'Invalid email or password'),
    });
    const store = makeStore();
    store.dispatch(loginRequest({ email: 'a@b.co', password: 'nope' }));
    await settle();
    expect(store.getState().auth.status).toBe('unknown'); // nothing was decided by a failed login
    expect(store.getState().auth.login.error?.code).toBe('invalid_credentials');

    store.dispatch(bootstrapRequest()); // signed in; its cart request then answers 401
    await settle();
    expect(store.getState().auth.status).toBe('anonymous'); // the session is gone
  });

  it('only the first expiry counts: a late 401 does not bounce someone who has signed in again', async () => {
    fakeApi({ 'GET /api/auth/me': { body: { user: ada } }, 'GET /api/cart': { body: emptyCart } });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();

    store.dispatch(sessionExpired());
    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().cart.cart).toBeNull();
  });

  it('a failed logout still ends the session in this browser', async () => {
    fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': { body: emptyCart },
      'POST /api/auth/logout': { status: 500, body: {} },
    });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();

    store.dispatch(logoutRequest());
    await settle();
    expect(store.getState().auth).toMatchObject({ status: 'anonymous', signingOut: false });
  });

  it('a cart request that finishes after sign-out cannot put the old cart back', async () => {
    let release: () => void = () => undefined;
    fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': () =>
        new Promise(
          (resolve) => (release = () => resolve({ body: { ...emptyCart, totalCents: 999 } })),
        ),
      'POST /api/auth/logout': { status: 204 },
    });
    const store = makeStore();
    store.dispatch(bootstrapRequest());
    await settle();
    store.dispatch(logoutRequest());
    await settle();
    release();
    await settle();

    expect(store.getState().cart.cart).toBeNull();
    void fetchCartRequest;
  });
});
