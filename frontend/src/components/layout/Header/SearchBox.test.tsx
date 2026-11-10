import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Suggestion } from '../../../types/api.types';
import { apiError, fakeApi } from '../../../test/fakeApi';
import { renderWithProviders } from '../../../test/renderApp';
import { SearchBox } from './SearchBox';

const suggestion = (
  slug: string,
  name: string,
  platform = 'Steam',
  inStock = true,
): Suggestion => ({
  slug,
  name,
  coverUrl: `/api/images/products/${slug}.svg`,
  platform: { slug: platform.toLowerCase(), name: platform },
  inStock,
  score: 0.9,
});

const WITCHER = suggestion('the-witcher-3-steam-global', 'The Witcher 3: Wild Hunt');

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function setup(path = '/', debounceMs = 20) {
  return renderWithProviders(
    <>
      <SearchBox debounceMs={debounceMs} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
    { path },
  );
}

const box = () => screen.getByRole('combobox', { name: 'Search games' });

describe('SearchBox', () => {
  it('asks the server for suggestions once typing pauses, not for every keystroke', async () => {
    const api = fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [WITCHER] } } });
    setup('/', 250); // typing six characters in jsdom takes well under 250 ms, so they collapse into one request

    await userEvent.setup().type(box(), 'wither');
    await screen.findByRole('option', { name: /The Witcher 3/ });

    expect(api.callsTo('/search/suggest')).toEqual(['GET /api/search/suggest?q=wither']);
  });

  it('does not search for fewer than 2 characters', async () => {
    const api = fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [WITCHER] } } });
    setup();

    await userEvent.setup().type(box(), 'w');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(api.callsTo('/search/suggest')).toHaveLength(0);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows name, platform and an out-of-stock marker for each suggestion', async () => {
    fakeApi({
      'GET /api/search/suggest': {
        body: {
          suggestions: [
            WITCHER,
            suggestion('hollow-silksong-steam-global', 'Hollow Silksong', 'Xbox', false),
          ],
        },
      },
    });
    setup();

    await userEvent.setup().type(box(), 'hol');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('The Witcher 3: Wild Hunt');
    expect(options[0]).toHaveTextContent('Steam');
    expect(options[0]).not.toHaveTextContent('Out of stock');
    expect(options[1]).toHaveTextContent('Hollow Silksong');
    expect(options[1]).toHaveTextContent('Xbox');
    expect(options[1]).toHaveTextContent('Out of stock');
  });

  it('lists games that share a title on different platforms without clashing (no duplicate-key warning)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeApi({
      'GET /api/search/suggest': {
        body: {
          suggestions: [
            suggestion('dup-steam', 'Same Name', 'Steam'),
            suggestion('dup-xbox', 'Same Name', 'Xbox'),
          ],
        },
      },
    });
    setup();

    await userEvent.setup().type(box(), 'same');

    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
  });

  it('opens the product when a suggestion is chosen, and clears the box', async () => {
    fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [WITCHER] } } });
    setup('/store');
    const user = userEvent.setup();

    await user.type(box(), 'witcher');
    await user.click(await screen.findByRole('option', { name: /The Witcher 3/ }));

    expect(screen.getByTestId('where')).toHaveTextContent('/product/the-witcher-3-steam-global');
    expect(box()).toHaveValue('');
  });

  it('opens /search?q=... on Enter when no suggestion is highlighted', async () => {
    fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [WITCHER] } } });
    setup();
    const user = userEvent.setup();

    await user.type(box(), 'wither 3{Enter}');

    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=wither%203');
  });

  it('opens the highlighted suggestion on Enter (arrow keys work)', async () => {
    fakeApi({
      'GET /api/search/suggest': {
        body: { suggestions: [WITCHER, suggestion('b-steam', 'Second Game')] },
      },
    });
    setup();
    const user = userEvent.setup();

    await user.type(box(), 'game');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(screen.getByTestId('where')).toHaveTextContent('/product/b-steam');
  });

  it('does not search for blank input', async () => {
    fakeApi({});
    setup();

    await userEvent.setup().type(box(), '   {Enter}');

    expect(screen.getByTestId('where')).toHaveTextContent('/');
    expect(screen.getByTestId('where')).not.toHaveTextContent('search');
  });

  it('encodes what the user typed (no injection into the URL)', async () => {
    fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [] } } });
    setup();

    await userEvent.setup().type(box(), 'a&b=c#d{Enter}');

    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=a%26b%3Dc%23d');
  });

  it('says so when nothing matches', async () => {
    fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [] } } });
    setup();

    await userEvent.setup().type(box(), 'zzzzzq');

    expect(await screen.findByText('No games match "zzzzzq"')).toBeInTheDocument();
  });

  it('still lets the user search when the suggestion service fails', async () => {
    fakeApi({ 'GET /api/search/suggest': apiError(500, 'internal_error', 'boom') });
    setup();
    const user = userEvent.setup();

    await user.type(box(), 'witcher');
    expect(await screen.findByText(/Suggestions are unavailable/)).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=witcher');
  });

  it('shows the query on the search page and an empty box elsewhere', async () => {
    fakeApi({ 'GET /api/search/suggest': { body: { suggestions: [] } } });

    setup('/search?q=cyber%20punk');
    await waitFor(() => expect(box()).toHaveValue('cyber punk'));
  });

  it('starts empty on every other page', () => {
    fakeApi({});
    setup('/store?q=ignored');

    expect(box()).toHaveValue('');
  });
});
