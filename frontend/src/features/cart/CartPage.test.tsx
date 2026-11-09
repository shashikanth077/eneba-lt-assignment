import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError } from '../../test/fakeApi';
import { commerceBackend, line } from '../../test/commerceBackend';
import { formatMoney } from '../../lib/money';
import { renderApp } from '../../test/renderApp';

const A = line(1, 'Alpha Quest', 1500, 2);
const B = line(2, 'Bravo Run', 1000, 1);

async function openCart({ list = true } = {}) {
  const view = renderApp('/cart');
  await screen.findByRole('heading', { level: 1, name: 'Your cart' });
  if (list) await screen.findByRole('list', { name: 'Cart items' });
  return view;
}
const items = () => within(screen.getByRole('list', { name: 'Cart items' }));
const summary = () => within(screen.getByRole('region', { name: 'Order summary' }));

describe('cart page', () => {
  it("lists every line with seller, unit price, quantity and line total, and the server's total", async () => {
    commerceBackend({ lines: [A, B] });
    await openCart();

    expect(await items().findByText('Alpha Quest')).toBeInTheDocument();
    expect(items().getByText(/Sold by Seller 1/)).toBeInTheDocument();
    expect(items().getByText(formatMoney(3000))).toBeInTheDocument(); // 2 x 15.00
    expect(summary().getByLabelText('Total')).toHaveTextContent(formatMoney(4000));
    expect(summary().getByText('3 items')).toBeInTheDocument();
  });

  it("+ and - change the quantity through the server and the total follows the server's answer", async () => {
    const api = commerceBackend({ lines: [A, B] });
    await openCart();
    await userEvent.click(
      await items().findByRole('button', { name: 'Increase quantity of Alpha Quest' }),
    );

    await waitFor(() =>
      expect(summary().getByLabelText('Total')).toHaveTextContent(formatMoney(5500)),
    );
    expect(api.cart.lines[0].qty).toBe(3);
    expect(api.callsTo('/api/cart/1').some((c) => c.startsWith('PATCH'))).toBe(true);

    await userEvent.click(
      items().getByRole('button', { name: 'Decrease quantity of Alpha Quest' }),
    );
    await waitFor(() =>
      expect(summary().getByLabelText('Total')).toHaveTextContent(formatMoney(4000)),
    );
  });

  it('cannot go below 1 (remove is the way to drop a line) or above 5 / the stock', async () => {
    commerceBackend({
      lines: [
        line(1, 'Alpha Quest', 1500, 1),
        line(2, 'Bravo Run', 1000, 3, { available: 3 }),
        line(3, 'Charlie Cut', 500, 5),
      ],
    });
    await openCart();

    expect(
      await items().findByRole('button', { name: 'Decrease quantity of Alpha Quest' }),
    ).toBeDisabled();
    expect(items().getByRole('button', { name: 'Increase quantity of Bravo Run' })).toBeDisabled(); // only 3 in stock
    expect(
      items().getByRole('button', { name: 'Increase quantity of Charlie Cut' }),
    ).toBeDisabled(); // 5 is the limit
    expect(items().getByRole('button', { name: 'Increase quantity of Alpha Quest' })).toBeEnabled();
  });

  it('remove drops the line and the total; removing the last line shows the empty state', async () => {
    commerceBackend({ lines: [A, B] });
    await openCart();
    await userEvent.click(
      await items().findByRole('button', { name: 'Remove Alpha Quest from the cart' }),
    );
    await waitFor(() => expect(items().queryByText('Alpha Quest')).not.toBeInTheDocument());
    expect(summary().getByLabelText('Total')).toHaveTextContent(formatMoney(1000));

    await userEvent.click(items().getByRole('button', { name: 'Remove Bravo Run from the cart' }));
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the store' })).toHaveAttribute(
      'href',
      '/store',
    );
  });

  it("shows the server's reason when a change is refused, and keeps the line", async () => {
    commerceBackend({
      lines: [A],
      extra: { 'PATCH /api/cart/1': apiError(409, 'insufficient_stock', 'Only 2 left in stock') },
    });
    await openCart();
    await userEvent.click(
      await items().findByRole('button', { name: 'Increase quantity of Alpha Quest' }),
    );
    expect(await items().findByText('Only 2 left in stock')).toBeInTheDocument();
    expect(items().getByText('Alpha Quest')).toBeInTheDocument();
  });

  it('a line the server flags blocks checkout and says why', async () => {
    commerceBackend({
      lines: [A],
      issues: [{ offerId: 1, code: 'out_of_stock', message: 'Alpha Quest is out of stock' }],
    });
    await openCart();
    expect(await items().findByText('Alpha Quest is out of stock')).toBeInTheDocument();
    expect(summary().getByRole('link', { name: 'Go to checkout' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('a healthy cart links to checkout', async () => {
    commerceBackend({ lines: [A] });
    await openCart();
    await items().findByText('Alpha Quest');
    expect(summary().getByRole('link', { name: 'Go to checkout' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('shows an error with retry when the cart cannot be loaded', async () => {
    let failing = true;
    commerceBackend({
      extra: {
        'GET /api/cart': () =>
          failing
            ? apiError(500, 'internal_error', 'x')
            : { body: { lines: [], totalCents: 0, currency: 'eur', issues: [] } },
      },
    });
    await openCart({ list: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your cart');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });
});
