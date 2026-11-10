import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';
import { fetchCartRequest } from '../cart/cartSlice';
import { fetchOrdersRequest } from '../orders/ordersSlice';

const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const orders = {
  items: [
    { id: 41, status: 'paid', totalCents: 4500, createdAt: '2026-11-09T10:00:00Z', itemCount: 2 },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
};
const filters = { platforms: [], regions: [], genres: [], price: { min: null, max: null } };

/** A tiny backend with a session: "/auth/me" and "/orders" answer 401 until /auth/login has been called. */
function backendWithSession() {
  let signedIn = false;
  return fakeApi({
    'GET /api/filters': { body: filters },
    'GET /api/auth/me': () =>
      signedIn ? { body: { user: ada } } : apiError(401, 'unauthorized', 'Authentication required'),
    'GET /api/orders': () =>
      signedIn ? { body: orders } : apiError(401, 'unauthorized', 'Authentication required'),
    'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    'POST /api/auth/login': ({ body }) => {
      if ((body as { password: string }).password !== 'correct horse 9')
        return apiError(401, 'invalid_credentials', 'Invalid email or password');
      signedIn = true;
      return { body: { user: ada } };
    },
  });
}

const signIn = async (password = 'correct horse 9') => {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/email/i), ada.email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('ProtectedRoute: redirect to login, then back', () => {
  it('sends a signed-out visitor to /login with the page they wanted in ?next, and back after signing in', async () => {
    backendWithSession();
    const { router } = renderApp('/orders');

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Forders');

    await signIn();

    await screen.findByText('Order #41');
    expect(router.state.location.pathname).toBe('/orders');
    expect(screen.getByRole('button', { name: /Account menu/ })).toHaveTextContent('Ada Lovelace');
  });

  it('keeps the query string of the page too (/store?x is public, but a protected page with a query comes back intact)', async () => {
    backendWithSession();
    const { router } = renderApp('/checkout?step=payment');

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(router.state.location.search).toBe('?next=%2Fcheckout%3Fstep%3Dpayment');

    await signIn();

    await screen.findByRole('heading', { name: 'Checkout' });
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/checkout?step=payment',
    );
  });

  it('does NOT redirect a signed-in user who opens (or refreshes) a protected page', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/orders': { body: orders },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const { router } = renderApp('/orders');

    await screen.findByText('Order #41');

    expect(router.state.location.pathname).toBe('/orders');
    expect(router.state.historyAction).not.toBe('REPLACE'); // never passed through /login
  });

  it('shows a waiting state, not a redirect, while it is still asking the server who you are', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': () => new Promise(() => undefined) as never,
    });
    // a never-resolving answer: the route must stay in "checking" and must not decide anything
    const { router } = renderApp('/orders');

    await screen.findByText('Checking your session…');
    expect(router.state.location.pathname).toBe('/orders');
  });

  it('does not treat a server outage as "signed out": it offers a retry instead of the login page', async () => {
    let up = false;
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': () => (up ? { body: { user: ada } } : { status: 503, body: {} }),
      'GET /api/orders': { body: orders },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const { router } = renderApp('/orders');

    await screen.findByText('We could not check your session');
    expect(router.state.location.pathname).toBe('/orders');

    up = true;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Order #41');
  });

  it('sends the user back to login when the session expires while using a protected page', async () => {
    let signedIn = true;
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': () =>
        signedIn ? { body: { user: ada } } : apiError(401, 'unauthorized', 'x'),
      'GET /api/orders': () =>
        signedIn ? { body: orders } : apiError(401, 'unauthorized', 'Authentication required'),
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const { router, store } = renderApp('/orders');
    await screen.findByText('Order #41');

    signedIn = false; // the cookie expires; the next protected request answers 401
    store.dispatch(fetchCartRequest()); // a protected request answers 401: the session is gone
    store.dispatch(fetchOrdersRequest('1', { force: true }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Forders');
  });

  it('shows the server message for a wrong password and stays on the login page with the target kept', async () => {
    backendWithSession();
    const { router } = renderApp('/orders');
    await screen.findByRole('heading', { name: 'Sign in' });

    await signIn('wrong password');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/login?next=%2Forders',
    );
  });

  it('shows field errors from a 422 under the right field', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
      'POST /api/auth/register': apiError(422, 'validation_failed', 'invalid', {
        fields: {
          email: ['Must be a valid email address'],
          password: ['Must be at least 8 characters'],
        },
      }),
    });
    renderApp('/register');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/display name/i), 'Ada');
    // Passes the browser's own checks, so the request is sent and the SERVER's field errors are what appears.
    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Must be a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores an unsafe ?next (open redirect) and goes home after signing in', async () => {
    backendWithSession();
    const { router } = renderApp('/login?next=%2F%2Fevil.example%2Fsteal');

    await signIn();

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
  });

  it('keeps the target when switching between Sign in and Register', async () => {
    backendWithSession();
    const { router } = renderApp('/login?next=%2Fcart');

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Create an account' }));

    await screen.findByRole('heading', { name: 'Create your account' });
    expect(router.state.location.search).toBe('?next=%2Fcart');
  });

  it('redirects an already signed-in user away from /login to the target', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/orders': { body: orders },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const { router } = renderApp('/login?next=%2Forders');

    await screen.findByText('Order #41');
    expect(router.state.location.pathname).toBe('/orders');
  });

  it('signing out from a protected page ends on the home page, not on a login redirect', async () => {
    let signedIn = true;
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': () =>
        signedIn ? { body: { user: ada } } : apiError(401, 'unauthorized', 'x'),
      'GET /api/orders': { body: orders },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
      'POST /api/auth/logout': () => {
        signedIn = false;
        return { status: 204 };
      },
    });
    const { router } = renderApp('/orders');
    await screen.findByText('Order #41');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(screen.getByRole('banner')).toHaveTextContent('Sign in'));
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
  });

  it('every protected route is guarded', async () => {
    for (const path of ['/checkout', '/orders']) {
      backendWithSession();
      const { router, unmount } = renderApp(path);
      await screen.findByRole('heading', { name: 'Sign in' });
      expect(router.state.location.search, path).toBe(`?next=${encodeURIComponent(path)}`);
      unmount();
    }
  });

  it('public routes are not guarded', async () => {
    for (const path of ['/', '/store', '/search?q=cyber', '/product/some-game']) {
      backendWithSession();
      const { router, unmount } = renderApp(path);
      await screen.findByRole('combobox', { name: 'Search games' });
      await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
      expect(router.state.location.pathname, path).not.toBe('/login');
      unmount();
    }
  });

  it('the cart is public (a visitor can fill it); checkout is where signing in is asked for', async () => {
    backendWithSession();
    const { router } = renderApp('/cart');

    expect(await screen.findByRole('heading', { name: 'Your cart' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cart');
  });
});
