import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';

const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada Lovelace' };
const filters = {
  platforms: [
    { value: 'steam', label: 'Steam', count: 49 },
    { value: 'xbox', label: 'Xbox', count: 18 },
  ],
  regions: [],
  genres: [{ value: 'Action', label: 'Action', count: 4 }],
  price: { min: 559, max: 6519 },
};
const cart = (...qty: number[]) => ({
  lines: qty.map((q, i) => ({
    offerId: i + 1,
    productSlug: `g${i}`,
    productName: `Game ${i}`,
    sellerName: 'S',
    unitCents: 1000,
    qty: q,
    lineCents: 1000 * q,
    available: 5,
  })),
  totalCents: qty.reduce((sum, q) => sum + q * 1000, 0),
  currency: 'EUR',
  issues: [],
});

describe('header and navigation', () => {
  it('signed out: Sign in and Register, a cart icon without a count, and no cart request', async () => {
    const api = fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/');

    const header = await screen.findByRole('banner');
    await waitFor(() => expect(header).toHaveTextContent('Sign in'));
    expect(header).toHaveTextContent('Register');
    expect(within(header).getByRole('link', { name: 'Cart' })).toBeInTheDocument();
    expect(api.callsTo('/cart')).toHaveLength(0);
  });

  it('signed in: the cart badge sums the quantities, and the account menu shows the name', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': { body: cart(2, 1) },
    });
    renderApp('/');

    expect(await screen.findByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Account menu/ })).toHaveTextContent('Ada Lovelace');
  });

  it('signed in with an empty cart: no badge number', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': { body: { user: ada } },
      'GET /api/cart': { body: cart() },
    });
    renderApp('/');

    await screen.findByRole('button', { name: /Account menu/ });
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Cart' }),
    ).toBeInTheDocument();
  });

  it('the nav bar lists platforms from the API, links them to the store, and keeps working when the API fails', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    const { unmount } = renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Categories and platforms' });

    const steam = await screen.findByRole('link', { name: 'Steam' });
    expect(steam).toHaveAttribute('href', '/store?platform=steam');
    expect(nav).toHaveTextContent('All games');
    expect(within(nav).getByRole('link', { name: 'Deals' })).toHaveAttribute(
      'href',
      '/store?sort=discount',
    );
    unmount();

    fakeApi({
      'GET /api/filters': { status: 500, body: {} },
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/');
    const degraded = await screen.findByRole('navigation', { name: 'Categories and platforms' });
    await within(degraded).findByRole('link', { name: 'All games' });
    expect(within(degraded).getByRole('link', { name: 'New releases' })).toBeInTheDocument();
    expect(within(degraded).queryByRole('link', { name: 'Steam' })).not.toBeInTheDocument();
  });

  it('the header, nav and footer are on every page, including unknown ones', async () => {
    fakeApi({
      'GET /api/filters': { body: filters },
      'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/does/not/exist');

    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Categories and platforms' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search games' })).toBeInTheDocument();
  });
});
