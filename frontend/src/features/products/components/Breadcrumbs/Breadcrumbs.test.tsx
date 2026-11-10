import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../test/renderApp';
import { Breadcrumbs } from './Breadcrumbs';

describe('Breadcrumbs', () => {
  it('links every crumb but the last, which is the current page', () => {
    renderWithProviders(
      <Breadcrumbs
        crumbs={[
          { label: 'Store', to: '/store' },
          { label: 'Steam', to: '/store?platform=steam' },
          { label: 'Game' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Store' })).toHaveAttribute('href', '/store');
    expect(screen.getByRole('link', { name: 'Steam' })).toHaveAttribute(
      'href',
      '/store?platform=steam',
    );
    expect(screen.queryByRole('link', { name: 'Game' })).not.toBeInTheDocument();
    expect(screen.getByText('Game')).toHaveAttribute('aria-current', 'page');
  });
});
