import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { block, card } from '../../test/homeBackend';
import { renderApp } from '../../test/renderApp';
import { recordViewed } from './recentlyViewed';

const filters = {
  body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
};
const CATEGORIES = block('categories', 'shortcuts', 'Categories', '/api/home/categories', {
  genres: 4,
});
const RECENT = block('recently_viewed', 'recent', 'Recently viewed', '', { limit: 6 });
const UPCOMING = block('upcoming', 'carousel', 'Upcoming games', '/api/home/upcoming', {
  limit: 10,
});
const layout = (...blocks: unknown[]) => ({ body: { blocks } });

beforeEach(() => localStorage.clear());

describe('homepage sections', () => {
  it('shows the category strip: Games and the platforms, each a link into the store', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'GET /api/home/layout': layout(CATEGORIES),
      'GET /api/home/categories': {
        body: {
          items: [
            { id: 'games', label: 'Games', to: '/store', icon: 'games' },
            { id: 'platform-steam', label: 'Steam', to: '/store?platform=steam', icon: 'steam' },
            { id: 'genre-rpg', label: 'RPG', to: '/store?genre=RPG', icon: 'genre' },
            { id: 'bad', label: 'Evil', to: 'https://evil.example', icon: 'x' },
          ],
        },
      },
    });
    renderApp('/');

    const strip = await screen.findByRole('navigation', { name: 'Categories' }, { timeout: 3000 });
    expect(within(strip).getByRole('link', { name: 'Games' })).toHaveAttribute('href', '/store');
    expect(within(strip).getByRole('link', { name: 'Steam' })).toHaveAttribute(
      'href',
      '/store?platform=steam',
    );
    expect(within(strip).queryByRole('link', { name: 'Evil' })).toBeNull(); // only on-site paths are accepted
  });

  it('recently viewed lists the games this visitor opened (newest first) and asks the catalogue for exactly those', async () => {
    recordViewed('alpha-quest-steam-global');
    recordViewed('bravo-run-steam-global');
    let asked = '';
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'GET /api/home/layout': layout(RECENT),
      'GET /api/products': ({ url }) => {
        asked = url.search;
        return {
          body: {
            items: [card(1, 'Alpha Quest'), card(2, 'Bravo Run')],
            page: 1,
            pageSize: 6,
            total: 2,
          },
        };
      },
    });
    renderApp('/');

    const heading = await screen.findByRole(
      'heading',
      { name: 'Recently viewed' },
      { timeout: 3000 },
    );
    const row = heading.closest('section') as HTMLElement;
    const names = within(row)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names[0]).toContain('Bravo Run'); // viewed last = first
    expect(decodeURIComponent(asked)).toContain('slug[]=bravo-run-steam-global');
    expect(decodeURIComponent(asked)).toContain('slug[]=alpha-quest-steam-global');
  });

  it('recently viewed shows nothing (and asks nothing) for a visitor with no history', async () => {
    const api = fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'GET /api/home/layout': layout(RECENT, UPCOMING),
      'GET /api/home/upcoming': {
        body: { items: [card(3, 'Soon Game', { releaseDate: '2099-01-15' })] },
      },
    });
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Upcoming games' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recently viewed' })).toBeNull();
    expect(api.callsTo('/api/products')).toHaveLength(0);
  });

  it('an upcoming game says when it comes out', async () => {
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'GET /api/home/layout': layout(UPCOMING),
      'GET /api/home/upcoming': {
        body: { items: [card(3, 'Soon Game', { releaseDate: '2099-01-15' })] },
      },
    });
    renderApp('/');

    expect(
      await screen.findByText('Releases 15 Jan 2099', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });
});

describe('language and currency settings', () => {
  const setup = () =>
    fakeApi({
      'GET /api/filters': filters,
      'GET /api/auth/me': () => apiError(401, 'unauthorized', 'x'),
      'GET /api/home/layout': layout(UPCOMING),
      'GET /api/home/upcoming': {
        body: { items: [card(3, 'Soon Game', { fromPriceCents: 1000 })] },
      },
    });

  it('defaults to euros, switches catalogue prices to another currency on Save and remembers it', async () => {
    setup();
    const { unmount } = renderApp('/');
    const header = await screen.findByRole('banner');
    expect(
      await within(header).findByRole('button', { name: /Language and currency: English, EUR/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/10\.00/, undefined, { timeout: 3000 })).toBeInTheDocument();

    await userEvent
      .setup()
      .click(within(header).getByRole('button', { name: /Language and currency/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Update your settings' });
    expect(within(dialog).getByLabelText('Language')).toHaveValue('en');
    await userEvent.setup().selectOptions(within(dialog).getByLabelText('Currency'), 'USD');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/10\.80/)).toBeInTheDocument()); // 10.00 EUR x 1.08
    expect(within(header).getByRole('button', { name: /English, USD/ })).toBeInTheDocument();
    unmount();

    setup();
    renderApp('/'); // a new page load keeps the choice
    expect(await screen.findByText(/10\.80/, undefined, { timeout: 3000 })).toBeInTheDocument();
  });

  it('Cancel changes nothing', async () => {
    setup();
    renderApp('/');
    const header = await screen.findByRole('banner');
    await userEvent
      .setup()
      .click(await within(header).findByRole('button', { name: /Language and currency/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Update your settings' });
    await userEvent.setup().selectOptions(within(dialog).getByLabelText('Currency'), 'GBP');
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(within(header).getByRole('button', { name: /English, EUR/ })).toBeInTheDocument();
  });
});
