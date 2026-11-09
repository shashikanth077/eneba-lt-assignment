import { describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { authApi } from './authApi';
import { sessionExpired } from './authActions';
import { signOutStarted } from './authSlice';
import { fakeApi, apiError } from '../../test/fakeApi';

const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada' };

describe('auth slice', () => {
  it('starts unknown: we have not asked the server yet', () => {
    expect(makeStore().getState().auth).toEqual({
      status: 'unknown',
      user: null,
      signingOut: false,
    });
  });

  it('becomes authenticated when /auth/me answers with a user', async () => {
    fakeApi({ 'GET /api/auth/me': { body: { user: ada } } });
    const store = makeStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: ada,
      signingOut: false,
    });
  });

  it('becomes anonymous on a 401 from /auth/me', async () => {
    fakeApi({ 'GET /api/auth/me': apiError(401, 'unauthorized', 'Authentication required') });
    const store = makeStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null, signingOut: false });
  });

  it('is "error", NOT anonymous, when the server cannot be reached or fails: no redirect to login for an outage', async () => {
    fakeApi({ 'GET /api/auth/me': { status: 503, body: {} } });
    const store = makeStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().auth.status).toBe('error');
  });

  it('login and register sign the user in, logout signs out and clears the cached data of that session', async () => {
    fakeApi({
      'POST /api/auth/login': { body: { user: ada } },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
      'POST /api/auth/logout': { status: 204 },
    });
    const store = makeStore();

    await store.dispatch(authApi.endpoints.login.initiate({ email: ada.email, password: 'x' }));
    expect(store.getState().auth.status).toBe('authenticated');

    const { cartApi } = await import('../cart/cartApi');
    await store.dispatch(cartApi.endpoints.getCart.initiate());
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);

    await store.dispatch(authApi.endpoints.logout.initiate());
    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null, signingOut: false });
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
  });

  it('a 401 from a protected endpoint ends the session, but a wrong password does not count as one', async () => {
    fakeApi({
      'GET /api/orders': apiError(401, 'unauthorized', 'Authentication required'),
      'POST /api/auth/login': apiError(401, 'invalid_credentials', 'Invalid email or password'),
    });
    const store = makeStore();
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@b.co', password: 'nope' }));
    expect(store.getState().auth.status).toBe('unknown'); // nothing was decided by a failed login

    const { ordersApi } = await import('../orders/ordersApi');
    await store.dispatch(ordersApi.endpoints.listOrders.initiate());
    expect(store.getState().auth.status).toBe('anonymous'); // the session is gone
  });

  it('an expiry resets the cache once, not on every later 401 (that would loop: reset -> refetch -> 401 -> reset ...)', async () => {
    fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const store = makeStore();
    await store.dispatch(authApi.endpoints.getMe.initiate());
    const { cartApi } = await import('../cart/cartApi');
    await store.dispatch(cartApi.endpoints.getCart.initiate());

    store.dispatch(sessionExpired()); // signed in -> signed out: the cache of that session is dropped
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);

    await store.dispatch(cartApi.endpoints.getCart.initiate());
    store.dispatch(sessionExpired()); // already signed out: nothing more to clear
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);
  });

  it('signing out is flagged while the request runs, cleared when it ends, and a failed logout leaves the user signed in', async () => {
    let fail = true;
    fakeApi({
      'GET /api/auth/me': { body: { user: ada } },
      'POST /api/auth/logout': () => (fail ? { status: 500, body: {} } : { status: 204 }),
    });
    const store = makeStore();
    await store.dispatch(authApi.endpoints.getMe.initiate());

    store.dispatch(signOutStarted());
    expect(store.getState().auth.signingOut).toBe(true);

    await store.dispatch(authApi.endpoints.logout.initiate());
    expect(store.getState().auth).toEqual({
      status: 'authenticated',
      user: ada,
      signingOut: false,
    });

    fail = false;
    store.dispatch(signOutStarted());
    await store.dispatch(authApi.endpoints.logout.initiate());
    expect(store.getState().auth).toEqual({ status: 'anonymous', user: null, signingOut: false });
  });

  it('sessionExpired signs out', () => {
    const store = makeStore();
    store.dispatch(sessionExpired());
    expect(store.getState().auth.status).toBe('anonymous');
  });
});
