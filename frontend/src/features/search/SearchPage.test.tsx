import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiError } from '../../test/fakeApi';
import { card } from '../../test/homeBackend';
import { renderApp } from '../../test/renderApp';
import { shopBackend } from '../../test/shopBackend';

const result = (id: number, name: string, score: number, over: Record<string, unknown> = {}) => ({
  ...card(id, name, over),
  score,
});
const page = (items: unknown[], total = items.length, pageNumber = 1) => ({
  body: { items, page: pageNumber, pageSize: 24, total },
});

async function openSearch(path: string) {
  const view = renderApp(path);
  await screen.findByRole('main');
  return view;
}
const main = () => within(screen.getByRole('main'));

describe('search results', () => {
  it('lists the matches for ?q= with a count, linked cards and no "did you mean" when the match is strong', async () => {
    const api = shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': page([
          result(1, 'Tides of Stormhaven', 0.85),
          result(2, 'Garden of Stormhaven', 0.84),
        ]),
      },
    });
    await openSearch('/search?q=stormhaven');

    expect(
      await main().findByRole('heading', { level: 1, name: 'Results for “stormhaven”' }),
    ).toBeInTheDocument();
    expect(await main().findByRole('link', { name: /Tides of Stormhaven/ })).toHaveAttribute(
      'href',
      '/product/tides-of-stormhaven-steam-global',
    );
    expect(main().getByText('2 games')).toBeInTheDocument();
    expect(main().queryByText(/Did you mean/)).not.toBeInTheDocument();
    const asked = new URLSearchParams(api.callsTo('/api/search')[0].split('?')[1]);
    expect(asked.get('q')).toBe('stormhaven');
    expect(asked.get('page')).toBe('1');
  });

  it('a weak best match shows "Did you mean" with a link that searches for the corrected words', async () => {
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': page([
          result(1, 'Tides of Stormhaven', 0.64),
          result(2, 'Garden of Stormhaven', 0.64),
        ]),
      },
    });
    await openSearch('/search?q=stormhavn');

    const hint = (await main().findByText(/Did you mean/)).closest('[role=status]') as HTMLElement;
    expect(hint).toHaveTextContent('Did you mean stormhaven?');
    expect(within(hint).getByRole('link', { name: 'stormhaven' })).toHaveAttribute(
      'href',
      '/search?q=stormhaven',
    );
    expect(main().getByRole('link', { name: /Tides of Stormhaven/ })).toBeInTheDocument(); // the weak matches are still shown
  });

  it('following the suggestion runs the corrected search', async () => {
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': ({ url }) =>
          url.searchParams.get('q') === 'stormhaven'
            ? page([result(1, 'Tides of Stormhaven', 0.85)])
            : page([result(1, 'Tides of Stormhaven', 0.64)]),
      },
    });
    const { router } = await openSearch('/search?q=stormhavn');
    await userEvent.click(await main().findByRole('link', { name: 'stormhaven' }));

    await waitFor(() => expect(router.state.location.search).toBe('?q=stormhaven'));
    await waitFor(() => expect(main().queryByText(/Did you mean/)).not.toBeInTheDocument());
    expect(main().getByRole('heading', { level: 1 })).toHaveTextContent('Results for “stormhaven”');
  });

  it('a weak match with nothing useful to suggest still explains itself', async () => {
    shopBackend({
      signedIn: false,
      extra: { 'GET /api/search': page([result(1, 'Tides of Stormhaven', 0.5)]) },
    });
    await openSearch('/search?q=qqqq');
    expect(await main().findByText(/We found no close match/)).toBeInTheDocument();
  });

  it('shows out-of-stock matches as out of stock', async () => {
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': page([
          result(1, 'Sold Out Saga', 0.95, { inStock: false, fromPriceCents: null }),
        ]),
      },
    });
    await openSearch('/search?q=sold');
    expect(await main().findByRole('link', { name: /Sold Out Saga/ })).toHaveTextContent(
      'Out of stock',
    );
  });

  it('pages through the results in the address, and never shows "did you mean" after page 1', async () => {
    const items = Array.from({ length: 24 }, (_, i) => result(i + 1, `Game ${i + 1}`, 0.9));
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': ({ url }) =>
          url.searchParams.get('page') === '2'
            ? page([result(25, 'Game 25', 0.3)], 25, 2)
            : page(items, 25),
      },
    });
    const { router } = await openSearch('/search?q=game');
    await userEvent.click(await main().findByRole('button', { name: /page 2/ }));

    expect(router.state.location.search).toBe('?q=game&page=2');
    expect(await main().findByRole('link', { name: /Game 25/ })).toBeInTheDocument();
    expect(main().queryByText(/Did you mean|no close match/)).not.toBeInTheDocument(); // 0.3 is weak, but this is page 2
  });
});

describe('empty and edge states', () => {
  it('no matches: an empty state that names the query and links to the store', async () => {
    shopBackend({ signedIn: false, extra: { 'GET /api/search': page([]) } });
    await openSearch('/search?q=zzzzz');

    expect(await main().findByText('No games found for “zzzzz”')).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Browse the store' })).toHaveAttribute(
      'href',
      '/store',
    );
    expect(main().queryByRole('list', { name: 'Games' })).not.toBeInTheDocument();
  });

  it('no query: asks for one and makes no request', async () => {
    const api = shopBackend({ signedIn: false });
    await openSearch('/search');
    expect(await main().findByText('Search for a game')).toBeInTheDocument();
    expect(api.callsTo('/api/search')).toHaveLength(0);
  });

  it('a blank or whitespace query counts as no query', async () => {
    const api = shopBackend({ signedIn: false });
    await openSearch('/search?q=%20%20');
    expect(await main().findByText('Search for a game')).toBeInTheDocument();
    expect(api.callsTo('/api/search')).toHaveLength(0);
  });

  it('a page past the end says so', async () => {
    shopBackend({ signedIn: false, extra: { 'GET /api/search': page([], 5, 9) } });
    const { router } = await openSearch('/search?q=game&page=9');
    await userEvent.click(await main().findByRole('button', { name: 'Go to the first page' }));
    expect(router.state.location.search).toBe('?q=game');
  });

  it('shows a skeleton while searching and an error with retry when it fails', async () => {
    let failing = true;
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': () => (failing ? apiError(500, 'internal_error', 'x') : page([])),
      },
    });
    await openSearch('/search?q=game');
    expect(await screen.findByRole('alert')).toHaveTextContent('The search failed');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await main().findByText('No games found for “game”')).toBeInTheDocument();
  });

  it('the header search box leads here', async () => {
    shopBackend({
      signedIn: false,
      extra: {
        'GET /api/search': page([result(1, 'Tides of Stormhaven', 0.9)]),
        'GET /api/search/suggest': { body: { suggestions: [] } },
      },
    });
    const { router } = await openSearch('/');
    await userEvent.type(screen.getByRole('combobox', { name: /search/i }), 'tides{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(await main().findByRole('link', { name: /Tides of Stormhaven/ })).toBeInTheDocument();
  });
});
