import type { Cart, Offer, ProductResponse } from '../types/api.types';
import { apiError, fakeApi, type FakeApi, type FakeRoutes } from './fakeApi';

export const offer = (
  id: number,
  seller: string,
  priceCents: number,
  rating = 4.5,
  stock = 20,
  extra: Partial<Offer> = {},
): Offer => ({
  id,
  seller: { id: id * 10, name: seller, rating },
  priceCents,
  stock,
  deliveryType: 'instant',
  ...extra,
});

export const productResponse = (
  offers: Offer[],
  slug = 'tides-of-stormhaven-steam-global',
): ProductResponse => ({
  product: {
    id: 1,
    slug,
    name: 'Tides of Stormhaven',
    coverUrl: `/api/images/products/${slug}.svg`,
    platform: { slug: 'steam', name: 'Steam' },
    region: { slug: 'global', name: 'Global' },
    offerId: offers[0]?.id ?? null,
    fromPriceCents: offers.length ? Math.min(...offers.map((o) => o.priceCents)) : null,
    offerCount: offers.length,
    inStock: offers.length > 0,
    description: 'A platformer about the sea.',
    releaseDate: '2025-11-28',
    genres: ['Platformer'],
    publisher: 'Foxglove Works',
  },
  offers,
});

export const SIGNED_IN = {
  body: { user: { id: 1, email: 'ana@example.com', displayName: 'Ana' } },
};

/**
 * The slice of the API the product and search pages use, with a working in-memory cart: POST /api/cart adds one of the offer
 * (like the real server), GET /api/cart returns the lines. `signedIn: false` answers 401 to /auth/me and to the cart.
 */
export function shopBackend({
  product,
  signedIn = true,
  extra = {},
}: {
  product?: ProductResponse;
  signedIn?: boolean;
  extra?: FakeRoutes;
}): FakeApi & { cart: Cart } {
  const cart: Cart = { lines: [], totalCents: 0, currency: 'eur', issues: [] };
  const known = new Map((product?.offers ?? []).map((o) => [o.id, o]));
  const recompute = () => {
    cart.totalCents = cart.lines.reduce((sum, line) => sum + line.lineCents, 0);
  };

  const api = fakeApi({
    'GET /api/filters': {
      body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
    },
    'GET /api/auth/me': signedIn ? SIGNED_IN : apiError(401, 'unauthorized', 'x'),
    ...(product ? { [`GET /api/products/${product.product.slug}`]: { body: product } } : {}),
    'GET /api/cart': () => (signedIn ? { body: cart } : apiError(401, 'unauthorized', 'x')),
    'POST /api/cart': ({ body }) => {
      const { offerId } = body as { offerId: number };
      const found = known.get(offerId);
      if (!found) return apiError(404, 'not_found', 'No such offer');
      const line = cart.lines.find((l) => l.offerId === offerId);
      if (line) {
        line.qty += 1;
        line.lineCents = line.qty * line.unitCents;
      } else {
        cart.lines.push({
          offerId,
          productSlug: product?.product.slug ?? '',
          productName: product?.product.name ?? '',
          sellerName: found.seller.name,
          unitCents: found.priceCents,
          qty: 1,
          lineCents: found.priceCents,
          available: found.stock,
        });
      }
      recompute();
      return { status: 201, body: cart };
    },
    ...extra,
  });
  return Object.assign(api, { cart });
}
