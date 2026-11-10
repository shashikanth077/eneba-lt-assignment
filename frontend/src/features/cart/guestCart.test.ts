import { beforeEach, describe, expect, it } from 'vitest';
import { makeStore } from '../../app/store';
import { apiError, fakeApi } from '../../test/fakeApi';
import { loginSuccess, signedOut } from '../auth/authSlice';
import {
  addToCartRequest,
  removeLineRequest,
  selectCart,
  selectCartCount,
  selectCartState,
  selectLineState,
  setQuantityRequest,
} from './cartSlice';

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
const ada = { id: 7, email: 'ada@example.com', displayName: 'Ada', emailVerified: true };
const STORAGE_KEY = 'keymart:guest-cart:v1';

const offer = (id: number, priceCents: number, stock: number, seller = `Seller ${id}`) => ({
  id,
  seller: { id, name: seller, rating: 4.5 },
  priceCents,
  stock,
  deliveryType: 'instant' as const,
});
const game = (slug: string, name: string, offers: ReturnType<typeof offer>[]) => ({
  body: {
    product: {
      id: 1,
      slug,
      name,
      coverUrl: `/api/images/products/${slug}.svg`,
      platform: { slug: 'steam', name: 'Steam' },
      region: { slug: 'global', name: 'Global' },
      offerId: offers[0]?.id ?? null,
      fromPriceCents: offers[0]?.priceCents ?? null,
      offerCount: offers.length,
      inStock: offers.length > 0,
      description: '',
      releaseDate: '2026-01-01',
      genres: [],
      publisher: 'P',
    },
    offers,
  },
});
const emptyCart = { lines: [], totalCents: 0, currency: 'EUR', issues: [] };

beforeEach(() => localStorage.clear());

describe('the cart of a visitor who has not signed in', () => {
  const catalogue = () =>
    fakeApi({
      'GET /api/products/alpha': game('alpha', 'Alpha Quest', [
        offer(11, 1500, 8),
        offer(12, 1200, 2),
      ]),
      'GET /api/products/bravo': game('bravo', 'Bravo Run', [offer(21, 500, 3)]),
    });

  it('adds from the catalogue (price, seller, stock), without asking the cart API, and survives a refresh', async () => {
    const api = catalogue();
    const store = makeStore();

    store.dispatch(addToCartRequest({ offerId: 12, productSlug: 'alpha' }));
    await settle();

    expect(selectCartCount(store.getState())).toBe(1);
    expect(selectCart(store.getState())?.lines[0]).toMatchObject({
      offerId: 12,
      productName: 'Alpha Quest',
      sellerName: 'Seller 12',
      unitCents: 1200,
      qty: 1,
      available: 2,
    });
    expect(selectCartState(store.getState()).status).toBe('succeeded');
    expect(api.callsTo('/api/cart')).toHaveLength(0);
    expect(store.getState().ui.toasts.map((t) => t.message)).toContain('Added to your cart');

    const afterRefresh = makeStore(); // a new page load reads the browser's storage
    expect(selectCartCount(afterRefresh.getState())).toBe(1);
    expect(selectCart(afterRefresh.getState())?.totalCents).toBe(1200);
  });

  it('raises the quantity of a line already in the cart, but never above the stock or 5', async () => {
    catalogue();
    const store = makeStore();
    for (let i = 0; i < 2; i++)
      store.dispatch(addToCartRequest({ offerId: 12, productSlug: 'alpha' }));
    await settle();
    expect(selectCartCount(store.getState())).toBe(2);

    store.dispatch(addToCartRequest({ offerId: 12, productSlug: 'alpha' })); // only 2 in stock
    await settle();
    expect(selectLineState(12)(store.getState())?.error).toMatchObject({
      code: 'insufficient_stock',
      message: 'Only 2 left',
    });
    expect(selectCartCount(store.getState())).toBe(2);

    for (let i = 0; i < 6; i++)
      store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    await settle();
    expect(selectCart(store.getState())?.lines.find((l) => l.offerId === 11)?.qty).toBe(5);
    expect(selectLineState(11)(store.getState())?.error?.message).toMatch(/At most 5/);
  });

  it('refuses an out-of-stock or vanished offer', async () => {
    fakeApi({ 'GET /api/products/alpha': game('alpha', 'Alpha Quest', [offer(11, 1500, 0)]) });
    const store = makeStore();

    store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    store.dispatch(addToCartRequest({ offerId: 99, productSlug: 'alpha' }));
    await settle();

    expect(selectCartCount(store.getState())).toBe(0);
    expect(selectLineState(11)(store.getState())?.error?.code).toBe('out_of_stock');
    expect(selectLineState(99)(store.getState())?.error?.code).toBe('out_of_stock');
  });

  it('changes a quantity within the stock, and removes a line; both are kept', async () => {
    catalogue();
    const store = makeStore();
    store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    store.dispatch(addToCartRequest({ offerId: 21, productSlug: 'bravo' }));
    await settle();

    store.dispatch(setQuantityRequest({ offerId: 21, qty: 3 }));
    await settle();
    expect(selectCartCount(store.getState())).toBe(4);
    store.dispatch(setQuantityRequest({ offerId: 21, qty: 4 })); // only 3 in stock
    await settle();
    expect(selectLineState(21)(store.getState())?.error?.message).toBe('Only 3 left');

    store.dispatch(removeLineRequest(11));
    await settle();
    expect(selectCart(store.getState())?.lines.map((l) => l.offerId)).toEqual([21]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('ignores damaged storage instead of breaking', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(selectCartCount(makeStore().getState())).toBe(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ offerId: 'x' }, 7]));
    expect(selectCartCount(makeStore().getState())).toBe(0);
  });
});

describe('signing in merges the visitor cart into the account cart', () => {
  it('adds every line through POST /api/cart (the server checks stock), empties the guest cart and loads the account cart', async () => {
    const posts: unknown[] = [];
    const api = fakeApi({
      'GET /api/products/alpha': game('alpha', 'Alpha Quest', [offer(11, 1500, 8)]),
      'GET /api/products/bravo': game('bravo', 'Bravo Run', [offer(21, 500, 3)]),
      'POST /api/cart': ({ body }) => {
        posts.push(body);
        return { status: 201, body: emptyCart };
      },
      'GET /api/cart': { body: { lines: [], totalCents: 0, currency: 'EUR', issues: [] } },
    });
    const store = makeStore();
    store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    store.dispatch(addToCartRequest({ offerId: 21, productSlug: 'bravo' }));
    await settle();
    store.dispatch(setQuantityRequest({ offerId: 21, qty: 2 }));
    await settle();

    store.dispatch(loginSuccess(ada));
    await settle();

    expect(posts).toEqual([
      { offerId: 11, qty: 1 },
      { offerId: 21, qty: 2 },
    ]);
    expect(api.callsTo('/api/cart').length).toBeGreaterThanOrEqual(3);
    expect(store.getState().cart.guest).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(store.getState().cart.merging).toBe(false);
    expect(store.getState().ui.toasts.map((t) => t.message)).toContain(
      'The items you chose before signing in are in your cart',
    );
  });

  it('reports a line the server refuses and still merges the others', async () => {
    fakeApi({
      'GET /api/products/alpha': game('alpha', 'Alpha Quest', [offer(11, 1500, 8)]),
      'GET /api/products/bravo': game('bravo', 'Bravo Run', [offer(21, 500, 3)]),
      'POST /api/cart': ({ body }) =>
        (body as { offerId: number }).offerId === 11
          ? apiError(409, 'insufficient_stock', 'Only 0 left')
          : { status: 201, body: emptyCart },
      'GET /api/cart': { body: emptyCart },
    });
    const store = makeStore();
    store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    store.dispatch(addToCartRequest({ offerId: 21, productSlug: 'bravo' }));
    await settle();

    store.dispatch(loginSuccess(ada));
    await settle();

    const messages = store.getState().ui.toasts.map((t) => t.message);
    expect(messages.some((m) => m.includes('Alpha Quest (Only 0 left)'))).toBe(true);
    expect(store.getState().cart.guest).toEqual([]);
  });

  it("does nothing extra for a visitor with an empty cart, and a signed-in cart is the server's", async () => {
    const api = fakeApi({ 'GET /api/cart': { body: emptyCart } });
    const store = makeStore();

    store.dispatch(loginSuccess(ada));
    await settle();

    expect(api.calls.filter((c) => c.startsWith('POST'))).toHaveLength(0);
    expect(selectCart(store.getState())).toEqual(emptyCart);
  });

  it('signing out leaves no cart behind for the next person', async () => {
    fakeApi({
      'GET /api/products/alpha': game('alpha', 'Alpha Quest', [offer(11, 1500, 8)]),
      'POST /api/cart': { status: 201, body: emptyCart },
      'GET /api/cart': { body: emptyCart },
    });
    const store = makeStore();
    store.dispatch(addToCartRequest({ offerId: 11, productSlug: 'alpha' }));
    await settle();
    store.dispatch(loginSuccess(ada));
    await settle();

    store.dispatch(signedOut());

    expect(selectCartCount(store.getState())).toBe(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
