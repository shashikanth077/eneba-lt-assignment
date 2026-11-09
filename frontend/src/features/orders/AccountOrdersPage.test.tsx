import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { commerceBackend, order } from '../../test/commerceBackend';
import { renderApp } from '../../test/renderApp';

describe('order list', () => {
  it('lists the orders newest first, with status and total, each linking to its page; no key is on the list', async () => {
    commerceBackend({
      orders: [
        order(5, 'paid', {
          items: [
            {
              productSlug: 'a',
              productName: 'A',
              sellerName: 'S',
              unitPriceCents: 1500,
              qty: 2,
              keys: ['LEAK-LEAK-LEAK'],
            },
          ],
        }),
        order(6, 'pending'),
      ],
    });
    renderApp('/account/orders');
    const list = within(await screen.findByRole('list', { name: 'Orders' }));

    const links = list.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/account/orders/6',
      '/account/orders/5',
    ]);
    expect(links[0]).toHaveTextContent('Waiting for payment');
    expect(links[1]).toHaveTextContent('Paid');
    expect(screen.queryByText(/LEAK-LEAK/)).not.toBeInTheDocument();
  });

  it('has an empty state', async () => {
    commerceBackend();
    renderApp('/account/orders');
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});
