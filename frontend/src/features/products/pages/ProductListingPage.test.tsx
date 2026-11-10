import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';
import { storeBackend } from '../../../test/storeBackend';
import { PRICE_DEBOUNCE_MS } from '../components/PriceRangeSlider';
import { SEARCH_DEBOUNCE_MS } from '../../../utils/constants';

/** useMediaQuery reads window.matchMedia, which jsdom lacks: `desktop` decides whether the sidebar is docked (lg and up) or a drawer. */
function screenSize(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
}

beforeEach(() => screenSize(true));
afterEach(() => vi.unstubAllGlobals());

/** Opens the store and waits for the first answer: a grid of games, or (`results: false`) whatever else the page shows. */
async function openStore(path = '/store', { results = true } = {}) {
  const view = renderApp(path);
  await screen.findByRole('main');
  if (results) await within(screen.getByRole('main')).findByRole('list', { name: 'Games' });
  return view;
}

const main = () => within(screen.getByRole('main'));
const gameNames = () =>
  within(main().getByRole('list', { name: 'Games' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('link').getAttribute('href'));
const productCalls = (api: { callsTo: (p: string) => string[] }) => api.callsTo('/api/products');
const lastProductQuery = (api: { callsTo: (p: string) => string[] }) =>
  new URLSearchParams((productCalls(api).at(-1) ?? '').split('?')[1]);
const searchBox = () => main().getByRole('searchbox', { name: 'Search games in the store' });
const sortBox = () => main().getByRole('combobox', { name: 'Sort by' });
const slider = (name: 'Minimum price' | 'Maximum price') => main().getByRole('slider', { name });
const urlOf = (router: { state: { location: { pathname: string; search: string } } }) =>
  router.state.location.pathname + router.state.location.search;

describe('reloading a filtered URL reproduces the view', () => {
  const FILTERED =
    '/store?q=game&platform=steam&platform=xbox&region=global&genre=Action&price_min=1000&price_max=4000&sort=price_desc&page=1';

  it('asks the API for exactly what the address says', async () => {
    const api = storeBackend();
    await openStore(FILTERED);

    const sent = lastProductQuery(api);
    expect(sent.get('q')).toBe('game');
    expect(sent.getAll('platform[]')).toEqual(['steam', 'xbox']);
    expect(sent.getAll('region[]')).toEqual(['global']);
    expect(sent.getAll('genre[]')).toEqual(['Action']);
    expect(sent.get('price_min')).toBe('1000');
    expect(sent.get('price_max')).toBe('4000');
    expect(sent.get('sort')).toBe('price_desc');
  });

  it('shows every control in the state the address describes', async () => {
    storeBackend();
    await openStore(FILTERED);
    await main().findByRole('checkbox', { name: /^Steam/ });

    expect(main().getByRole('checkbox', { name: /^Steam/ })).toBeChecked();
    expect(main().getByRole('checkbox', { name: /^Xbox/ })).toBeChecked();
    expect(main().getByRole('checkbox', { name: /^Playstation/ })).not.toBeChecked();
    expect(main().getByRole('checkbox', { name: /^Global/ })).toBeChecked();
    expect(main().getByRole('checkbox', { name: /^Action/ })).toBeChecked();
    expect(searchBox()).toHaveValue('game');
    expect(sortBox()).toHaveDisplayValue('Price: high to low');
    await waitFor(() => expect(slider('Minimum price')).toHaveValue('10'));
    expect(slider('Maximum price')).toHaveValue('40');

    const chips = within(main().getByRole('region', { name: 'Active filters' }));
    for (const label of ['Search: game', 'Steam', 'Xbox', 'Global', 'Action', /10.*40/]) {
      expect(chips.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows the same games when the same address is opened twice (a reload)', async () => {
    storeBackend();
    const first = await openStore(FILTERED);
    const before = gameNames();
    first.unmount();

    await openStore(FILTERED);
    expect(gameNames()).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('opens the right page of a paginated view', async () => {
    const api = storeBackend();
    await openStore('/store?page=2');

    expect(lastProductQuery(api).get('page')).toBe('2');
    expect(gameNames()).toEqual([
      '/product/game-25',
      '/product/game-26',
      '/product/game-27',
      '/product/game-28',
      '/product/game-29',
      '/product/game-30',
    ]);
    expect(main().getByRole('button', { name: /page 2/ })).toHaveAttribute('aria-current', 'page');
  });

  it('copes with a broken address: nonsense is repaired and the page still renders', async () => {
    const api = storeBackend();
    await openStore('/store?page=-3&sort=nonsense&price_min=abc&platform=');

    const sent = lastProductQuery(api);
    expect(sent.get('page')).toBe('1');
    expect(sent.get('sort')).toBe('popular');
    expect(sent.has('price_min')).toBe(false);
    expect(gameNames()).toHaveLength(24);
  });

  it('keeps a chosen value the API no longer lists, so it can still be undone', async () => {
    storeBackend();
    await openStore('/store?platform=nintendo', { results: false });

    expect(await main().findByRole('checkbox', { name: /^nintendo/ })).toBeChecked();
    expect(await main().findByText('No games match these filters')).toBeInTheDocument();
  });
});

describe('every change goes to the address, and Back/Forward walk through them', () => {
  it('ticking a box adds it to the address and refilters; unticking removes it', async () => {
    const api = storeBackend();
    const { router } = await openStore();
    await main().findByRole('checkbox', { name: /^Steam/ });

    await userEvent.click(main().getByRole('checkbox', { name: /^Steam/ }));
    expect(urlOf(router)).toBe('/store?platform=steam');
    await waitFor(() => expect(gameNames()).toHaveLength(10));
    expect(lastProductQuery(api).getAll('platform[]')).toEqual(['steam']);

    await userEvent.click(main().getByRole('checkbox', { name: /^Steam/ }));
    expect(urlOf(router)).toBe('/store');
  });

  it('a new filter returns to page 1, but changing the page keeps the filters', async () => {
    storeBackend();
    const { router } = await openStore('/store?page=2');

    await userEvent.click(main().getByRole('checkbox', { name: /^Global/ }));
    expect(urlOf(router)).toBe('/store?region=global');
  });

  it('changing the page keeps the filters', async () => {
    storeBackend();
    const { router } = await openStore('/store?price_max=6000');

    await userEvent.click(main().getByRole('button', { name: /page 2/ }));
    expect(urlOf(router)).toBe('/store?price_max=6000&page=2');
  });

  it('sorting changes the address and the order of the games', async () => {
    storeBackend();
    const { router } = await openStore();
    expect(gameNames()[0]).toBe('/product/game-1');

    await userEvent.selectOptions(sortBox(), 'Price: high to low');

    expect(urlOf(router)).toBe('/store?sort=price_desc');
    await waitFor(() => expect(gameNames()[0]).toBe('/product/game-30'));
  });

  it('Back and Forward restore the earlier views, controls included', async () => {
    storeBackend();
    const { router } = await openStore();
    await main().findByRole('checkbox', { name: /^Steam/ });

    await userEvent.click(main().getByRole('checkbox', { name: /^Steam/ }));
    await userEvent.click(main().getByRole('checkbox', { name: /^Action/ }));
    expect(urlOf(router)).toBe('/store?platform=steam&genre=Action');

    await router.navigate(-1);
    await waitFor(() => expect(urlOf(router)).toBe('/store?platform=steam'));
    await waitFor(() =>
      expect(main().getByRole('checkbox', { name: /^Action/ })).not.toBeChecked(),
    );
    expect(main().getByRole('checkbox', { name: /^Steam/ })).toBeChecked();

    await router.navigate(-1);
    await waitFor(() => expect(urlOf(router)).toBe('/store'));
    await waitFor(() => expect(main().getByRole('checkbox', { name: /^Steam/ })).not.toBeChecked());
    expect(main().queryByRole('region', { name: 'Active filters' })).not.toBeInTheDocument();

    await router.navigate(1);
    await waitFor(() => expect(main().getByRole('checkbox', { name: /^Steam/ })).toBeChecked());
  });

  it('paging changes the address; each page is its own history entry', async () => {
    storeBackend();
    const { router } = await openStore();

    await userEvent.click(main().getByRole('button', { name: /page 2/ }));
    expect(urlOf(router)).toBe('/store?page=2');
    await waitFor(() => expect(gameNames()).toHaveLength(6));

    await router.navigate(-1);
    await waitFor(() => expect(gameNames()).toHaveLength(24));
  });
});

describe('active filter chips', () => {
  it('removing a chip removes that filter only', async () => {
    storeBackend();
    const { router } = await openStore('/store?platform=steam&region=global&genre=Action');
    const chips = () => within(main().getByRole('region', { name: 'Active filters' }));

    await userEvent.click(chips().getByLabelText('Remove Global'));
    expect(urlOf(router)).toBe('/store?platform=steam&genre=Action');
    await waitFor(() =>
      expect(main().getByRole('checkbox', { name: /^Global/ })).not.toBeChecked(),
    );
  });

  it('Clear all removes every filter but keeps the sort', async () => {
    storeBackend();
    const { router } = await openStore('/store?q=game&platform=steam&price_max=2000&sort=newest');

    await userEvent.click(main().getByRole('button', { name: 'Clear all' }));
    expect(urlOf(router)).toBe('/store?sort=newest');
    expect(searchBox()).toHaveValue('');
  });

  it('there are no chips when nothing is filtered', async () => {
    storeBackend();
    await openStore();
    expect(main().queryByRole('region', { name: 'Active filters' })).not.toBeInTheDocument();
  });
});

describe('the price slider is debounced', () => {
  it('many quick moves make one request and one address change, after the slider rests', async () => {
    const api = storeBackend();
    const { router } = await openStore();
    await waitFor(() => expect(slider('Maximum price')).toHaveValue('63'));
    const before = productCalls(api).length;

    for (const value of ['60', '50', '40', '30']) {
      fireEvent.change(slider('Maximum price'), { target: { value } });
    }
    expect(slider('Maximum price')).toHaveValue('30'); // the thumb follows at once
    expect(urlOf(router)).toBe('/store'); // but nothing has been asked yet
    expect(productCalls(api)).toHaveLength(before);

    await waitFor(() => expect(urlOf(router)).toBe('/store?price_max=3000'), {
      timeout: PRICE_DEBOUNCE_MS * 4,
    });
    await waitFor(() => expect(gameNames()).toHaveLength(13)); // 5.00 .. 30.00 in 2.00 steps
    expect(productCalls(api)).toHaveLength(before + 1);
    expect(lastProductQuery(api).get('price_max')).toBe('3000');
  });

  it('moving a thumb back to the end of the range drops the price filter', async () => {
    storeBackend();
    const { router } = await openStore('/store?price_max=3000');
    await waitFor(() => expect(slider('Maximum price')).toHaveValue('30'));

    fireEvent.change(slider('Maximum price'), { target: { value: '63' } });
    await waitFor(() => expect(urlOf(router)).toBe('/store'), { timeout: PRICE_DEBOUNCE_MS * 4 });
  });

  it('the slider follows Back', async () => {
    storeBackend();
    const { router } = await openStore();
    await userEvent.click(await main().findByRole('checkbox', { name: /^Steam/ }));
    fireEvent.change(slider('Maximum price'), { target: { value: '30' } });
    await waitFor(() => expect(urlOf(router)).toContain('price_max=3000'), { timeout: 2000 });

    await router.navigate(-1);
    await waitFor(() => expect(urlOf(router)).toBe('/store?platform=steam'));
    await waitFor(() => expect(slider('Maximum price')).toHaveValue('63'));
    // and it must not bounce back to the newer value afterwards
    await new Promise((resolve) => setTimeout(resolve, PRICE_DEBOUNCE_MS + 200));
    expect(urlOf(router)).toBe('/store?platform=steam');
    expect(slider('Maximum price')).toHaveValue('63');

    await router.navigate(1);
    await waitFor(() => expect(slider('Maximum price')).toHaveValue('30'));
  });

  it('the price range does not shrink while other filters narrow the results', async () => {
    storeBackend();
    await openStore('/store?platform=steam');
    await waitFor(() => expect(slider('Maximum price')).toHaveAttribute('max', '63'));
    expect(slider('Minimum price')).toHaveAttribute('min', '5');
  });
});

describe('search inside the store', () => {
  it('waits for a pause in typing, then filters and updates the address', async () => {
    const api = storeBackend();
    const { router } = await openStore();
    const before = productCalls(api).length;

    await userEvent.type(searchBox(), 'game 1');
    expect(productCalls(api)).toHaveLength(before);

    await waitFor(() => expect(urlOf(router)).toBe('/store?q=game+1'), {
      timeout: SEARCH_DEBOUNCE_MS * 4,
    });
    await waitFor(() => expect(gameNames()).toHaveLength(10)); // Game 10 .. Game 19
    expect(productCalls(api)).toHaveLength(before + 1);
  });

  it('offers "Best match" only while there is a search text', async () => {
    storeBackend();
    await openStore('/store?q=game');
    expect(within(sortBox()).getByRole('option', { name: 'Best match' })).toBeInTheDocument();
    expect(sortBox()).toHaveDisplayValue('Best match');
  });

  it('removing the search chip empties the box', async () => {
    storeBackend();
    await openStore('/store?q=game');
    await userEvent.click(
      within(main().getByRole('region', { name: 'Active filters' })).getByLabelText(
        'Remove Search: game',
      ),
    );
    await waitFor(() => expect(searchBox()).toHaveValue(''));
  });
});

describe('caching', () => {
  it('going back to a view already seen does not ask the API again', async () => {
    const api = storeBackend();
    const { router } = await openStore();
    await userEvent.click(await main().findByRole('checkbox', { name: /^Steam/ }));
    await waitFor(() => expect(gameNames()).toHaveLength(10));
    const asked = productCalls(api).length;

    await router.navigate(-1);
    await waitFor(() => expect(gameNames()).toHaveLength(24));
    await router.navigate(1);
    await waitFor(() => expect(gameNames()).toHaveLength(10));

    expect(productCalls(api)).toHaveLength(asked);
  });

  it('the unfiltered facet request (price range) is made once, not once per filter change', async () => {
    const api = storeBackend();
    await openStore();
    await userEvent.click(await main().findByRole('checkbox', { name: /^Steam/ }));
    await userEvent.click(await main().findByRole('checkbox', { name: /^Action/ }));
    await waitFor(() => expect(gameNames().length).toBeGreaterThan(0));

    expect(api.calls.filter((call) => call === 'GET /api/filters')).toHaveLength(1); // shared with the navigation bar
  });
});

describe('states', () => {
  it('shows a skeleton while the first page loads', async () => {
    storeBackend({ 'GET /api/products': () => new Promise(() => undefined) });
    renderApp('/store');
    expect(await screen.findByRole('status', { name: 'Loading games' })).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    let failing = true;
    storeBackend({
      'GET /api/products': () =>
        failing
          ? apiError(500, 'internal_error', 'boom')
          : { body: { items: [], page: 1, pageSize: 24, total: 0 } },
    });
    renderApp('/store');
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the games');

    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No games match these filters')).toBeInTheDocument();
  });

  it('empty results offer a way out', async () => {
    storeBackend();
    const { router } = await openStore('/store?q=zzz', { results: false });
    await main().findByText('No games match these filters');
    await userEvent.click(main().getAllByRole('button', { name: /clear all/i })[0]);
    expect(urlOf(router)).toBe('/store');
  });

  it('a page past the end says so and links to page 1', async () => {
    storeBackend();
    const { router } = await openStore('/store?page=9', { results: false });
    await main().findByText('There is no such page');
    await userEvent.click(main().getByRole('button', { name: 'Go to the first page' }));
    expect(urlOf(router)).toBe('/store');
  });
});

describe('on a phone the filters live in a drawer', () => {
  beforeEach(() => screenSize(false));

  it('has a Filters button with the active count and no docked sidebar', async () => {
    storeBackend();
    await openStore('/store?platform=steam&genre=Action');

    expect(main().getByRole('button', { name: /Filters/ })).toHaveTextContent('2');
    expect(main().queryByRole('checkbox', { name: /^Steam/ })).not.toBeInTheDocument();
  });

  it('opens the same filters in a drawer, applies changes at once and closes with the result count', async () => {
    storeBackend();
    const { router } = await openStore();

    await userEvent.click(main().getByRole('button', { name: /Filters/ }));
    const drawer = within(await screen.findByRole('dialog'));
    await userEvent.click(await drawer.findByRole('checkbox', { name: /^Steam/ }));
    expect(urlOf(router)).toBe('/store?platform=steam');

    const show = await drawer.findByRole('button', { name: 'Show 10 games' });
    await userEvent.click(show);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
