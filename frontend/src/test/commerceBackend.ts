import type { Cart, CartLine, OrderDetail, OrderSummary } from '../types/api.types';
import { apiError, fakeApi, type FakeApi, type FakeResponse, type FakeRoutes } from './fakeApi';
import { SIGNED_IN } from './shopBackend';

export const line = (
  offerId: number,
  name: string,
  unitCents: number,
  qty = 1,
  over: Partial<CartLine> = {},
): CartLine => ({
  offerId,
  productSlug: `${name.toLowerCase().replace(/\W+/g, '-')}-steam-global`,
  productName: name,
  sellerName: `Seller ${offerId}`,
  unitCents,
  qty,
  lineCents: unitCents * qty,
  available: 10,
  ...over,
});

export const order = (
  id: number,
  status: OrderDetail['status'],
  over: Partial<OrderDetail> = {},
): OrderDetail => ({
  id,
  status,
  totalCents: 3000,
  currency: 'EUR',
  createdAt: '2026-01-02T10:00:00Z',
  items: [
    {
      productSlug: 'alpha-quest-steam-global',
      productName: 'Alpha Quest',
      sellerName: 'GameNest',
      unitPriceCents: 1500,
      qty: 2,
    },
  ],
  ...over,
});

export type CommerceApi = FakeApi & { cart: Cart; orders: Map<number, OrderDetail> };

/**
 * A server-side cart that behaves like the real one (PATCH sets the quantity, DELETE removes a line, totals are recomputed by
 * the "server"), plus orders that tests can change between polls: `api.orders.set(7, order(7, 'paid', ...))`.
 */
export function commerceBackend({
  lines = [],
  orders = [],
  issues = [],
  extra = {},
}: {
  lines?: CartLine[];
  orders?: OrderDetail[];
  issues?: Cart['issues'];
  extra?: FakeRoutes;
} = {}): CommerceApi {
  const cart: Cart = { lines: [...lines], totalCents: 0, currency: 'eur', issues };
  const store = new Map(orders.map((o) => [o.id, o]));
  const recompute = () => {
    cart.totalCents = cart.lines.reduce((sum, l) => sum + l.lineCents, 0);
  };
  recompute();

  const routes: FakeRoutes = {
    'GET /api/filters': {
      body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
    },
    'GET /api/auth/me': SIGNED_IN,
    'GET /api/cart': () => ({ body: cart }),
    'GET /api/orders': () => {
      const items: OrderSummary[] = [...store.values()]
        .sort((a, b) => b.id - a.id)
        .map((o) => ({
          id: o.id,
          status: o.status,
          totalCents: o.totalCents,
          createdAt: o.createdAt,
          itemCount: o.items.reduce((n, i) => n + i.qty, 0),
        }));
      return { body: { items, page: 1, pageSize: 10, total: items.length } };
    },
  };
  // The fake matches exact paths, so every id that can come up gets its own routes.
  for (let id = 1; id <= 30; id += 1) {
    routes[`PATCH /api/cart/${id}`] = ({ body }): FakeResponse => {
      const target = cart.lines.find((l) => l.offerId === id);
      if (!target) return apiError(404, 'not_found', 'That item is not in your cart');
      target.qty = (body as { qty: number }).qty;
      target.lineCents = target.qty * target.unitCents;
      recompute();
      return { body: cart };
    };
    routes[`DELETE /api/cart/${id}`] = (): FakeResponse => {
      cart.lines = cart.lines.filter((l) => l.offerId !== id);
      recompute();
      return { body: cart };
    };
    routes[`GET /api/orders/${id}`] = (): FakeResponse => {
      const found = store.get(id);
      return found ? { body: { order: found } } : apiError(404, 'not_found', 'Order not found');
    };
  }
  const api = fakeApi({ ...routes, ...extra });
  return Object.assign(api, { cart, orders: store });
}
