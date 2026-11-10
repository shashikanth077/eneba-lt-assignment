import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { card } from '../../../../test/homeBackend';
import { renderWithProviders } from '../../../../test/renderApp';
import { ProductCard } from './ProductCard';

type Product = Parameters<typeof ProductCard>[0]['product'];
const show = (over: Record<string, unknown> = {}) =>
  renderWithProviders(<ProductCard product={card(1, 'Alpha Quest', over) as unknown as Product} />);

describe('ProductCard (reference anatomy)', () => {
  it('shows the platform strip over the cover, then title, region and the From price', () => {
    show();
    const link = screen.getByRole('link', { name: /Alpha Quest.*Global.*From/ });
    expect(link).toHaveAttribute('href', '/product/alpha-quest-steam-global');
    expect(link).toHaveTextContent('Alpha Quest');
    expect(link).toHaveTextContent('Global');
    expect(link).toHaveTextContent('From');
    expect(screen.getByText('Steam')).toBeInTheDocument();
  });

  it('the cover is decoration (empty alt) and lazy loaded', () => {
    show();
    const cover = document.querySelector('img');
    expect(cover).toHaveAttribute('alt', '');
    expect(cover).toHaveAttribute('loading', 'lazy');
  });

  it('colours the region label by token class: Global is teal, any other region pink', () => {
    const { unmount } = show();
    expect(screen.getByText('Global').className).toMatch(/global/);
    unmount();
    show({ region: { slug: 'europe', name: 'Europe' } });
    expect(screen.getByText('Europe').className).not.toMatch(/global/);
  });

  it('gives the title its full text as a tooltip, since it is clamped to two lines', () => {
    show({ name: 'A very long title that will be cut after two lines in the grid' });
    expect(
      screen.getByTitle('A very long title that will be cut after two lines in the grid'),
    ).toBeInTheDocument();
  });
});

describe('ProductCard actions', () => {
  it('lists "Add to cart" before "View offers", and the cover itself links to the game', () => {
    const product = card(1, 'Plain Game') as unknown as Parameters<
      typeof ProductCard
    >[0]['product'];
    const { container } = renderWithProviders(<ProductCard product={{ ...product, offerId: 5 }} />);

    const actions = container.querySelector('article span:has(> button)');
    const labels = Array.from(actions?.children ?? []).map((el) => el.textContent);
    expect(labels).toEqual(['Add to cart', 'View offers']);
    expect(container.querySelector('a[aria-hidden="true"]')).toHaveAttribute(
      'href',
      `/product/${product.slug}`,
    );
  });
});
