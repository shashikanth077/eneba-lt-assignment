import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { commerceBackend } from '../../../test/commerceBackend';
import { renderApp } from '../../../test/renderApp';

const progress = () => within(screen.getByRole('list', { name: 'Checkout progress' }));

describe('reduced checkout header', () => {
  it('replaces the full header on cart, checkout and payment pages: wordmark and progress, no search and no category bar', async () => {
    commerceBackend();
    renderApp('/cart');
    await screen.findByRole('list', { name: 'Checkout progress' });

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Categories and platforms' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'KEYMART home' })).toHaveAttribute('href', '/');
  });

  it.each([
    ['/cart', 'Cart'],
    ['/checkout', 'Payment'],
    ['/payment/success?order=1', 'Get your product'],
  ])('%s marks "%s" as the current step', async (path, label) => {
    commerceBackend();
    renderApp(path);
    await screen.findByRole('list', { name: 'Checkout progress' });

    const current = progress()
      .getAllByRole('listitem')
      .filter((item) => item.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(label);
  });

  it('the rest of the site keeps the full header', async () => {
    commerceBackend();
    renderApp('/');
    expect(await screen.findByRole('search')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Checkout progress' })).not.toBeInTheDocument();
  });
});
