import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../lib/money';
import { block, card, homeBackend } from '../../test/homeBackend';
import { renderWithProviders } from '../../test/renderApp';
import { ProductCard } from '../../components/ProductCard';
import { ProductRail } from './ProductRail';

const rail = (title = 'Hot deals', endpoint = '/api/home/deals') =>
  block('deals', 'carousel', title, endpoint);

describe('ProductRail', () => {
  it('shows the block title and a linked card per game with its platform, region and price', async () => {
    homeBackend([], {
      'GET /api/home/deals': {
        body: {
          items: [
            card(1, 'Alpha Quest', { fromPriceCents: 1999 }),
            card(2, 'Bravo Run', {
              platform: { slug: 'xbox', name: 'Xbox' },
              region: { slug: 'europe', name: 'Europe' },
            }),
          ],
        },
      },
    });
    renderWithProviders(<ProductRail block={rail()} />);

    expect(await screen.findByRole('heading', { name: 'Hot deals' })).toBeInTheDocument();
    const first = screen.getByRole('link', { name: /Alpha Quest/ });
    expect(first).toHaveAttribute('href', '/product/alpha-quest-steam-global');
    expect(first).toHaveTextContent('Steam · Global');
    expect(first).toHaveTextContent(formatMoney(1999));
    expect(screen.getByRole('link', { name: /Bravo Run/ })).toHaveTextContent('Xbox · Europe');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the crossed-out price and the discount on a deal', async () => {
    homeBackend([], {
      'GET /api/home/deals': {
        body: {
          items: [
            card(3, 'Charlie Cut', {
              discountPct: 50,
              originalPriceCents: 4000,
              fromPriceCents: 2000,
            }),
          ],
        },
      },
    });
    renderWithProviders(<ProductRail block={rail()} />);

    const link = await screen.findByRole('link', { name: /Charlie Cut/ });
    expect(link).toHaveTextContent(formatMoney(4000));
    expect(link).toHaveTextContent('-50%');
    expect(link).toHaveTextContent(formatMoney(2000));
  });

  it('has scroll buttons named after the section', async () => {
    homeBackend([], { 'GET /api/home/deals': { body: { items: [card(1, 'A')] } } });
    renderWithProviders(<ProductRail block={rail()} />);

    await screen.findByRole('heading', { name: 'Hot deals' });
    expect(screen.getByRole('button', { name: 'Scroll Hot deals left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll Hot deals right' })).toBeInTheDocument();
  });

  it('drops malformed cards but keeps the valid ones', async () => {
    homeBackend([], {
      'GET /api/home/deals': { body: { items: [card(1, 'Good Game'), { id: 'broken' }, null] } },
    });
    renderWithProviders(<ProductRail block={rail()} />);

    expect(await screen.findByRole('link', { name: /Good Game/ })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('ProductCard', () => {
  const base = card(1, 'Plain Game') as unknown as Parameters<typeof ProductCard>[0]['product'];
  const wrap = (product: typeof base) => renderWithProviders(<ProductCard product={product} />);

  it('shows an out-of-stock marker instead of a price', () => {
    wrap({ ...base, inStock: false, fromPriceCents: null });

    const link = screen.getByRole('link');
    expect(within(link).getByText('Out of stock')).toBeInTheDocument();
    expect(link).not.toHaveTextContent('€');
  });

  it('shows just the price when there is no deal', () => {
    wrap(base);

    expect(screen.getByRole('link')).toHaveTextContent(formatMoney(base.fromPriceCents ?? 0));
    expect(screen.getByRole('link')).not.toHaveTextContent('-');
  });

  it('shows a discount even when the crossed-out price is unknown (catalog cards)', () => {
    wrap({ ...base, discountPct: 17 });

    expect(screen.getByRole('link')).toHaveTextContent('-17%');
  });
});
