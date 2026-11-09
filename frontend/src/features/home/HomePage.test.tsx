import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError } from '../../test/fakeApi';
import { BEST, block, card, DEALS, HERO, homeBackend, NEW } from '../../test/homeBackend';
import { renderApp } from '../../test/renderApp';

/** Opens the homepage and waits until the app shell (and so the <main> region) is on screen. */
async function openHome() {
  const view = renderApp('/');
  await screen.findByRole('main');
  return view;
}

/** Queries limited to the page content (the footer has headings of its own). */
const main = () => within(screen.getByRole('main'));
/** The headings of the sections, in the order they appear on the page. */
const sectionTitles = () =>
  main()
    .getAllByRole('heading', { level: 2 })
    .map((h) => h.textContent);

afterEach(() => vi.useRealTimers());

describe('homepage = the layout from the API, nothing else', () => {
  it('draws every block of the layout, in the layout order', async () => {
    homeBackend([HERO, BEST, DEALS, NEW]);
    await openHome();

    await main().findByRole('heading', { name: 'New releases' });
    expect(sectionTitles()).toEqual(['Fresh drops', 'Best sellers', 'Hot deals', 'New releases']);
    expect(main().getByText('Alpha Quest')).toBeInTheDocument();
    expect(main().getByText('Charlie Cut')).toBeInTheDocument();
    expect(main().getByText('Delta Dawn')).toBeInTheDocument();
  });

  it('REORDERING the layout reorders the page: same code, different answer from the API', async () => {
    homeBackend([NEW, HERO, DEALS, BEST]);
    await openHome();

    await main().findByRole('heading', { name: 'Best sellers' });
    expect(sectionTitles()).toEqual(['New releases', 'Fresh drops', 'Hot deals', 'Best sellers']);
  });

  it('DISABLING a block removes it, and its data is never even requested', async () => {
    const api = homeBackend([HERO, BEST, NEW]); // "deals" is switched off in the database, so the layout does not list it
    await openHome();

    await main().findByRole('heading', { name: 'New releases' });
    expect(main().queryByText('Hot deals')).not.toBeInTheDocument();
    expect(main().queryByText('Charlie Cut')).not.toBeInTheDocument();
    expect(api.callsTo('/home/deals')).toHaveLength(0);
  });

  it('a NEW block with an existing type needs no frontend change: its own endpoint is fetched and drawn', async () => {
    const api = homeBackend(
      [HERO, block('staff', 'carousel', 'Staff picks', '/api/home/staff-picks'), NEW],
      {
        'GET /api/home/staff-picks': {
          body: { items: [card(7, 'Echo Edge'), card(8, 'Foxtrot Fall')] },
        },
      },
    );
    await openHome();

    await main().findByText('Echo Edge');
    expect(sectionTitles()).toContain('Staff picks');
    expect(api.callsTo('/home/staff-picks')).toHaveLength(1);
  });

  it('every block fetches its own endpoint, exactly once', async () => {
    const api = homeBackend([HERO, BEST, DEALS, NEW]);
    await openHome();

    await main().findByText('Delta Dawn');
    for (const path of [
      '/home/banners',
      '/home/best-sellers',
      '/home/deals',
      '/home/new-releases',
      '/home/layout',
    ]) {
      expect(api.callsTo(path), path).toHaveLength(1);
    }
  });

  it('skips a block type it has no renderer for, and the rest of the page is fine', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = homeBackend([HERO, block('quiz', 'quiz', 'Game quiz', '/api/home/quiz'), BEST]);
    await openHome();

    await main().findByText('Alpha Quest');
    expect(main().queryByText('Game quiz')).not.toBeInTheDocument();
    expect(api.callsTo('/home/quiz')).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no renderer for block type "quiz"'));
  });

  it('does not mistake a block type named like a built-in property ("constructor", "toString") for a renderer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    homeBackend([
      block('a', 'constructor', 'Sneaky one', '/api/home/a'),
      block('b', 'toString', 'Sneaky two', '/api/home/b'),
      BEST,
    ]);
    await openHome();

    await main().findByText('Alpha Quest');
    expect(main().queryByText('Sneaky one')).not.toBeInTheDocument();
    expect(main().queryByText(/could not be shown/)).not.toBeInTheDocument(); // skipped quietly, not crashed into an error panel
    expect(warn).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('ignores layout entries that are not valid blocks', async () => {
    homeBackend({ blocks: [null, { id: 'x' }, 'text', BEST] });
    await openHome();

    await main().findByText('Alpha Quest');
    expect(sectionTitles()).toEqual(['Best sellers']);
  });

  it('coming back to the homepage re-asks for the layout, so a database change shows without a reload', async () => {
    let layout = [HERO, BEST];
    homeBackend([], { 'GET /api/home/layout': () => ({ body: { blocks: layout } }) });
    const { router } = await openHome();
    await main().findByText('Alpha Quest');
    expect(sectionTitles()).toEqual(['Fresh drops', 'Best sellers']);

    await router.navigate('/store');
    await screen.findByRole('heading', { name: 'Store' }); // really left the homepage (it unmounted), like a visitor who clicked a link
    layout = [NEW, DEALS]; // somebody edits home_blocks while the visitor browses
    await router.navigate('/');

    await main().findByText('Delta Dawn');
    expect(sectionTitles()).toEqual(['New releases', 'Hot deals']);
  });

  it('shows a calm message when every block is switched off', async () => {
    homeBackend([]);
    await openHome();

    expect(await screen.findByText('Nothing to show yet')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});

describe('a failing block never breaks the page', () => {
  it('shows an error for the block whose request failed, with its own retry, while the others render', async () => {
    let healthy = false;
    const api = homeBackend([HERO, BEST, DEALS], {
      'GET /api/home/best-sellers': () =>
        healthy
          ? { body: { items: [card(1, 'Alpha Quest')] } }
          : apiError(500, 'internal_error', 'boom'),
    });
    await openHome();

    expect(await main().findByText('We could not load best sellers')).toBeInTheDocument();
    expect(main().getByText('Charlie Cut')).toBeInTheDocument(); // deals is fine
    expect(main().getByRole('heading', { name: 'Fresh drops' })).toBeInTheDocument(); // so is the banner
    expect(screen.getByRole('banner')).toBeInTheDocument(); // and the shell

    healthy = true;
    await userEvent.setup().click(main().getByRole('button', { name: 'Try again' }));

    expect(await main().findByText('Alpha Quest')).toBeInTheDocument();
    expect(main().queryByText('We could not load best sellers')).not.toBeInTheDocument();
    expect(api.callsTo('/home/best-sellers')).toHaveLength(2);
  });

  it('survives a block whose data nobody expected (caught by its own boundary)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    homeBackend([HERO, DEALS, NEW], { 'GET /api/home/deals': { body: { items: 'not a list' } } });
    await openHome();

    expect(await main().findByText('Hot deals could not be shown')).toBeInTheDocument();
    expect(await main().findByText('Delta Dawn')).toBeInTheDocument();
    expect(main().getByRole('heading', { name: 'Fresh drops' })).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });

  it('survives a network failure of one block', async () => {
    homeBackend([HERO, NEW, BEST], {
      'GET /api/home/new-releases': () => Promise.reject(new TypeError('Failed to fetch')) as never,
    });
    await openHome();

    expect(await main().findByText('Alpha Quest')).toBeInTheDocument();
    expect(await main().findByText('We could not load new releases')).toBeInTheDocument();
  });

  it('refuses an endpoint that is not an API path: it is never fetched', async () => {
    const api = homeBackend([
      block('x', 'carousel', 'Elsewhere', 'https://evil.example/steal'),
      BEST,
    ]);
    await openHome();

    await main().findByText('Alpha Quest');
    expect(await main().findByText('Elsewhere is misconfigured')).toBeInTheDocument();
    expect(api.calls.some((call) => call.includes('evil'))).toBe(false);
  });

  it('a block with nothing in it disappears instead of showing an empty heading', async () => {
    homeBackend([HERO, DEALS, BEST], { 'GET /api/home/deals': { body: { items: [] } } });
    await openHome();

    await main().findByText('Alpha Quest');
    expect(main().queryByText('Hot deals')).not.toBeInTheDocument();
    expect(main().queryByText('Nothing here yet')).not.toBeInTheDocument(); // not even a generic "empty" panel
  });

  it('an unusable layout shows an error INSIDE the shell, and a failed layout request can be retried', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    homeBackend({ blocks: 'nope' });
    const first = await openHome();

    expect(await screen.findByText('The homepage could not be shown')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
    first.unmount();

    let up = false;
    homeBackend([BEST], {
      'GET /api/home/layout': () => (up ? { body: { blocks: [BEST] } } : { status: 503, body: {} }),
    });
    await openHome();
    expect(await screen.findByText('We could not load the homepage')).toBeInTheDocument();

    up = true;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await main().findByText('Alpha Quest')).toBeInTheDocument();
  });
});

describe('skeletons', () => {
  it('shows a page skeleton until the layout arrives, then a skeleton per block until its own data arrives', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    homeBackend([HERO, BEST], {
      'GET /api/home/layout': () => gate.then(() => ({ body: { blocks: [HERO, BEST] } })) as never,
      'GET /api/home/best-sellers': () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ body: { items: [card(1, 'Alpha Quest')] } }), 150),
        ) as never,
    });
    await openHome();

    await waitFor(() => expect(screen.getByLabelText('Loading banners')).toBeInTheDocument()); // page skeleton: hero + rail shapes
    expect(screen.getByRole('status', { name: 'Loading games' })).toBeInTheDocument();

    release?.();
    expect(await main().findByRole('heading', { name: 'Fresh drops' })).toBeInTheDocument(); // the banner arrived first
    expect(screen.getByRole('status', { name: 'Loading games' })).toBeInTheDocument(); // best sellers is still loading: its OWN skeleton
    expect(await main().findByText('Alpha Quest')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading games' })).not.toBeInTheDocument();
  });
});
