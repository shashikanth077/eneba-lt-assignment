import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../../../test/fakeApi';
import { commerceBackend, line } from '../../../../test/commerceBackend';
import { renderApp } from '../../../../test/renderApp';

const filters = {
  body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
};

describe('the cart panel opened by the header cart icon', () => {
  it('shows the lines with picture, seller, price and total, and the two actions', async () => {
    commerceBackend({
      lines: [line(1, 'Alpha Quest', 1500, 2), line(2, 'Bravo Run', 500, 1)],
    });
    renderApp('/store');
    await userEvent.setup().click(await screen.findByRole('link', { name: /^Cart, 3 items/ }));

    const panel = await screen.findByRole('dialog', { name: 'My shopping cart' });
    const items = within(panel).getByRole('list', { name: 'Cart items' });
    expect(within(items).getAllByRole('listitem')).toHaveLength(2);
    expect(within(items).getByText('Alpha Quest')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Cart total')).toHaveTextContent('35');
    expect(within(panel).getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
    expect(within(panel).getByRole('link', { name: 'Checkout now' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('lets the buyer change a quantity and remove a line inside the panel', async () => {
    const api = commerceBackend({
      lines: [line(1, 'Alpha Quest', 1500, 1)],
    });
    renderApp('/store');
    await userEvent.setup().click(await screen.findByRole('link', { name: /^Cart, 1 items/ }));
    const panel = await screen.findByRole('dialog', { name: 'My shopping cart' });

    await userEvent
      .setup()
      .click(within(panel).getByRole('button', { name: /Increase quantity of Alpha Quest/ }));
    await waitFor(() => expect(api.cart.lines[0].qty).toBe(2));
    await userEvent
      .setup()
      .click(within(panel).getByRole('button', { name: /Remove Alpha Quest/ }));
    expect(await within(panel).findByText('Your cart is empty')).toBeInTheDocument();
  });

  it('shows an empty state for a visitor and closes with its close button', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
    });
    renderApp('/store');
    await userEvent
      .setup()
      .click(await within(await screen.findByRole('banner')).findByRole('link', { name: 'Cart' }));

    const panel = await screen.findByRole('dialog', { name: 'My shopping cart' });
    expect(within(panel).getByText('Your cart is empty')).toBeInTheDocument();
    await userEvent
      .setup()
      .click(within(panel).getByRole('button', { name: 'Close my shopping cart' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
