import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../../../utils/formatCurrency';
import { apiError } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';
import { offer, productResponse, shopBackend } from '../../../test/shopBackend';

const SLUG = 'tides-of-stormhaven-steam-global';
const THREE = [
  offer(1, 'GameNest', 5509, 4.4, 31),
  offer(2, 'TurboKeys', 6089, 4.6, 35),
  offer(3, 'Nova Keys', 6439, 4.8, 3),
];

async function openProduct(slug = SLUG) {
  const view = renderApp(`/product/${slug}`);
  await screen.findByRole('main');
  return view;
}
const main = () => within(screen.getByRole('main'));
/** The cart link in the header (the footer has a "Cart" link too). */
const cartLink = (name: string) => within(screen.getByRole('banner')).findByRole('link', { name });
const fromPrice = () => main().getByText('From').parentElement as HTMLElement;
const table = () => main().getByRole('table', { name: /Offers for Tides of Stormhaven/ });
/** Seller names in the order the rows are shown. */
const sellers = () =>
  within(table())
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent?.replace('Best price', ''));

describe('product details', () => {
  it('shows the cover, name, platform and region badges, genres, publisher and description', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();

    expect(
      await main().findByRole('heading', { level: 1, name: 'Tides of Stormhaven' }),
    ).toBeInTheDocument();
    expect(main().getByRole('img', { name: 'Cover of Tides of Stormhaven' })).toHaveAttribute(
      'src',
      `/api/images/products/${SLUG}.svg`,
    );
    const badges = within(main().getByLabelText('Platform and region'));
    expect(badges.getByText('Steam')).toBeInTheDocument();
    expect(badges.getByText('Global')).toBeInTheDocument();
    expect(badges.getByText('Platformer')).toBeInTheDocument();
    expect(main().getByText(/Foxglove Works/)).toHaveTextContent('Released 2025-11-28');
    expect(main().getByText('A platformer about the sea.')).toBeInTheDocument();
    expect(fromPrice()).toHaveTextContent(formatCurrency(5509)); // "From" the cheapest offer
  });

  it('shows a skeleton while loading', async () => {
    shopBackend({
      product: productResponse(THREE),
      extra: { [`GET /api/products/${SLUG}`]: () => new Promise(() => undefined) },
    });
    renderApp(`/product/${SLUG}`);
    expect(await screen.findByRole('status', { name: 'Loading game' })).toBeInTheDocument();
  });

  it('says so when the game does not exist', async () => {
    shopBackend({ extra: { 'GET /api/products/nope': apiError(404, 'not_found', 'x') } });
    await openProduct('nope');
    expect(await main().findByText('We could not find that game')).toBeInTheDocument();
  });

  it('shows an error with retry when the server fails', async () => {
    let failing = true;
    shopBackend({
      product: productResponse(THREE),
      extra: {
        [`GET /api/products/${SLUG}`]: () =>
          failing ? apiError(500, 'internal_error', 'x') : { body: productResponse(THREE) },
      },
    });
    await openProduct();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this game');
    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await main().findByRole('table')).toBeInTheDocument();
  });
});

describe('offers table: accessible markup', () => {
  it('has a caption, column headers and the seller as the row header', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    await main().findByRole('table');

    expect(table()).toHaveAccessibleName(/Offers for Tides of Stormhaven\. 3 sellers/);
    const headers = within(table()).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent?.trim())).toEqual([
      'Seller',
      'Region',
      'Rating',
      'Stock',
      'Price',
      'Buy',
    ]);
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col');
    expect(
      within(table())
        .getAllByRole('rowheader')
        .map((r) => r.getAttribute('scope')),
    ).toEqual(['row', 'row', 'row']);
    expect(main().getByRole('region', { name: 'Offers' })).toBeInTheDocument();
  });

  it('gives each row its price, region, rating and stock', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    const row = within(
      (await main().findByRole('rowheader', { name: /GameNest/ })).closest('tr') as HTMLElement,
    );

    expect(row.getByText(formatCurrency(5509))).toBeInTheDocument();
    expect(row.getByText('Global')).toBeInTheDocument();
    expect(row.getByRole('img', { name: 'Rated 4.4 out of 5' })).toBeInTheDocument();
    expect(row.getByText('In stock (31)')).toBeInTheDocument();
  });

  it('every action button names its seller', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    expect(
      await main().findByRole('button', { name: 'Add to cart, offer from TurboKeys' }),
    ).toBeInTheDocument();
  });
});

describe('sorting and best price', () => {
  it('starts sorted by price, cheapest first, with the cheapest marked "Best price"', async () => {
    shopBackend({ product: productResponse([THREE[2], THREE[1], THREE[0]]) });
    await openProduct();
    await main().findByRole('table');

    expect(sellers()).toEqual(['GameNest', 'TurboKeys', 'Nova Keys']);
    expect(within(table()).getByRole('columnheader', { name: /Price/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(within(table()).getAllByText('Best price')).toHaveLength(1);
    expect(
      within(within(table()).getByRole('rowheader', { name: /GameNest/ })).getByText('Best price'),
    ).toBeInTheDocument();
  });

  it('sorts by rating, stock and seller, and flips direction on a second click', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    await main().findByRole('table');
    const header = (name: RegExp) => within(table()).getByRole('columnheader', { name });

    await userEvent.click(within(header(/Rating/)).getByRole('button'));
    expect(sellers()).toEqual(['Nova Keys', 'TurboKeys', 'GameNest']);
    expect(header(/Rating/)).toHaveAttribute('aria-sort', 'descending');
    expect(header(/Price/)).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(within(header(/Rating/)).getByRole('button'));
    expect(sellers()).toEqual(['GameNest', 'TurboKeys', 'Nova Keys']);
    expect(header(/Rating/)).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(within(header(/Stock/)).getByRole('button'));
    expect(sellers()).toEqual(['TurboKeys', 'GameNest', 'Nova Keys']);

    await userEvent.click(within(header(/Seller/)).getByRole('button'));
    expect(sellers()).toEqual(['GameNest', 'Nova Keys', 'TurboKeys']);

    await userEvent.click(within(header(/Price/)).getByRole('button'));
    await userEvent.click(within(header(/Price/)).getByRole('button'));
    expect(sellers()).toEqual(['Nova Keys', 'TurboKeys', 'GameNest']);
  });

  it('keeps "Best price" on the cheapest offer whatever the sort order', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    await main().findByRole('table');
    await userEvent.click(
      within(within(table()).getByRole('columnheader', { name: /Rating/ })).getByRole('button'),
    );
    const best = within(table()).getByText('Best price').closest('th') as HTMLElement;
    expect(best).toHaveTextContent('GameNest');
  });

  it('marks every offer that ties for the lowest price', async () => {
    shopBackend({
      product: productResponse([offer(1, 'A', 1000), offer(2, 'B', 1000), offer(3, 'C', 2000)]),
    });
    await openProduct();
    await main().findByRole('table');
    expect(within(table()).getAllByText('Best price')).toHaveLength(2);
  });

  it('shows the crossed-out price of a discounted offer', async () => {
    shopBackend({
      product: productResponse([
        offer(1, 'A', 1000, 4.5, 5, { originalPriceCents: 2000 }),
        offer(2, 'B', 1500),
      ]),
    });
    await openProduct();
    expect(
      await within(await main().findByRole('table')).findByText(formatCurrency(2000)),
    ).toBeInTheDocument();
  });
});

describe('edge cases', () => {
  it('a single offer: no "Best price" and a note that there is nothing to compare, but it can be bought', async () => {
    shopBackend({ product: productResponse([offer(1, 'GameNest', 5509)]) });
    await openProduct();
    await main().findByRole('table');

    expect(table()).toHaveAccessibleName(/1 seller\./);
    expect(within(table()).queryByText('Best price')).not.toBeInTheDocument();
    expect(main().getByText(/Only one seller has this game/)).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Add to cart, offer from GameNest' })).toBeEnabled();
  });

  it('an out-of-stock offer cannot be bought, is never "Best price", and the rest still compare', async () => {
    shopBackend({
      product: productResponse([
        offer(1, 'Gone', 500, 5, 0),
        offer(2, 'Cheap', 1000),
        offer(3, 'Dear', 2000),
      ]),
    });
    await openProduct();
    await main().findByRole('table');

    const gone = within(
      within(table()).getByRole('rowheader', { name: /Gone/ }).closest('tr') as HTMLElement,
    );
    expect(gone.getByText('Out of stock')).toBeInTheDocument();
    expect(gone.getByRole('button', { name: 'Gone: out of stock' })).toBeDisabled();
    expect(within(table()).getAllByText('Best price')).toHaveLength(1);
    expect(within(table()).getByText('Best price').closest('th')).toHaveTextContent('Cheap');
    expect(fromPrice()).toHaveTextContent(formatCurrency(1000)); // "From" ignores the empty offer: 10.00, not 5.00
  });

  it('warns when only a few keys are left', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();
    expect(await main().findByText('Only 3 left')).toBeInTheDocument();
  });

  it('a game nobody sells right now: says so, offers a way out, shows no table', async () => {
    shopBackend({ product: productResponse([]) });
    await openProduct();

    expect(
      await main().findByText('No seller has keys for this game right now'),
    ).toBeInTheDocument();
    expect(main().queryByRole('table')).not.toBeInTheDocument();
    expect(main().getByText('Out of stock')).toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Browse the store' })).toHaveAttribute(
      'href',
      '/store',
    );
  });
});

describe('add to cart', () => {
  it('adding two offers from different sellers puts both in the cart and updates the header badge', async () => {
    const api = shopBackend({ product: productResponse(THREE) });
    await openProduct();
    await main().findByRole('table');
    await cartLink('Cart'); // empty cart: no count yet

    await userEvent.click(main().getByRole('button', { name: 'Add to cart, offer from GameNest' }));
    expect(await cartLink('Cart, 1 items')).toBeInTheDocument();
    await userEvent.click(
      main().getByRole('button', { name: 'Add to cart, offer from TurboKeys' }),
    );
    expect(await cartLink('Cart, 2 items')).toBeInTheDocument();

    expect(api.cart.lines.map((line) => [line.sellerName, line.qty])).toEqual([
      ['GameNest', 1],
      ['TurboKeys', 1],
    ]);
    expect(api.callsTo('/api/cart').filter((call) => call.startsWith('POST'))).toHaveLength(2);
    const row = (name: RegExp) =>
      within(within(table()).getByRole('rowheader', { name }).closest('tr') as HTMLElement);
    expect(row(/GameNest/).getByText('In your cart: 1')).toBeInTheDocument();
    expect(row(/Nova Keys/).queryByText(/In your cart/)).not.toBeInTheDocument();
  });

  it('sends the offer id, and adding the same offer again raises its quantity', async () => {
    const api = shopBackend({ product: productResponse(THREE) });
    await openProduct();
    const button = await main().findByRole('button', { name: 'Add to cart, offer from Nova Keys' });

    await userEvent.click(button);
    await screen.findByText('In your cart: 1');
    await userEvent.click(button);
    expect(await screen.findByText('In your cart: 2')).toBeInTheDocument();
    expect(await cartLink('Cart, 2 items')).toBeInTheDocument();
    expect(api.cart.lines).toHaveLength(1);
  });

  it("shows the server's reason when an offer cannot be added", async () => {
    shopBackend({
      product: productResponse(THREE),
      extra: { 'POST /api/cart': apiError(409, 'insufficient_stock', 'Only 3 left in stock') },
    });
    await openProduct();
    await userEvent.click(
      await main().findByRole('button', { name: 'Add to cart, offer from GameNest' }),
    );
    expect(await main().findByRole('alert')).toBeInTheDocument();
    expect(main().getByRole('button', { name: 'Add to cart, offer from GameNest' })).toBeEnabled(); // can try again
  });

  it('a signed-out visitor is sent to sign in and brought back to this game', async () => {
    const api = shopBackend({ product: productResponse(THREE), signedIn: false });
    const { router } = await openProduct();
    await userEvent.click(
      await main().findByRole('button', { name: 'Add to cart, offer from GameNest' }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(`/product/${SLUG}`)}`);
    expect(api.callsTo('/api/cart').filter((call) => call.startsWith('POST'))).toHaveLength(0);
  });
});

describe('buy box and breadcrumbs (reference layout)', () => {
  it('shows breadcrumbs down to the game, and a buy box with the lowest price and the number of offers', async () => {
    shopBackend({ product: productResponse(THREE) });
    await openProduct();

    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Steam' })).toHaveAttribute(
      'href',
      '/store?platform=steam',
    );
    const box = within(await screen.findByRole('complementary', { name: 'Buy' }));
    expect(box.getByText(formatCurrency(5509))).toBeInTheDocument();
    expect(box.getByText(`3 offers from ${formatCurrency(5509)}`)).toBeInTheDocument();
  });

  it('its button adds the CHEAPEST offer to the cart', async () => {
    const api = shopBackend({ product: productResponse(THREE) });
    await openProduct();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add to cart, cheapest offer' }),
    );

    await waitFor(() =>
      expect(api.cart.lines.map((line) => line.sellerName)).toEqual(['GameNest']),
    );
  });

  it('with nothing in stock it says so and has no button', async () => {
    shopBackend({ product: productResponse([]) });
    await openProduct();
    const box = within(await screen.findByRole('complementary', { name: 'Buy' }));
    expect(box.getByText('Out of stock')).toBeInTheDocument();
    expect(box.queryByRole('button')).not.toBeInTheDocument();
  });
});
