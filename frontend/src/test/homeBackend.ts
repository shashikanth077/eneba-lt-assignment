import type { HomeBlockMeta } from '../types/api.types';
import { apiError, fakeApi, type FakeApi, type FakeRoutes } from './fakeApi';

export const block = (
  id: string,
  type: string,
  title: string,
  endpoint: string,
  config: Record<string, unknown> = {},
): HomeBlockMeta => ({
  id,
  type,
  title,
  endpoint,
  config,
});

export const HERO = block('banner', 'hero', 'Featured', '/api/home/banners', { autoplayMs: 6000 });
export const BEST = block('best_sellers', 'carousel', 'Best sellers', '/api/home/best-sellers', {
  limit: 10,
});
export const DEALS = block('deals', 'carousel', 'Hot deals', '/api/home/deals', { limit: 10 });
export const NEW = block('new_releases', 'carousel', 'New releases', '/api/home/new-releases', {
  limit: 10,
});

export const card = (id: number, name: string, over: Record<string, unknown> = {}) => ({
  id,
  slug: `${name.toLowerCase().replace(/\W+/g, '-')}-steam-global`,
  name,
  coverUrl: `/api/images/products/${id}.svg`,
  platform: { slug: 'steam', name: 'Steam' },
  region: { slug: 'global', name: 'Global' },
  fromPriceCents: 1000 + id,
  offerCount: 2,
  inStock: true,
  ...over,
});

export const banners = {
  items: [
    {
      id: 1,
      imageUrl: '/api/images/banners/a.svg',
      title: 'Fresh drops',
      subtitle: 'The newest games',
      ctaLabel: 'Shop new',
      href: '/store?sort=newest',
    },
    {
      id: 2,
      imageUrl: '/api/images/banners/b.svg',
      title: 'Weekend deals',
      subtitle: 'Up to -60%',
      ctaLabel: 'See deals',
      href: '/store?sort=discount',
    },
    {
      id: 3,
      imageUrl: '/api/images/banners/c.svg',
      title: 'Steam keys',
      subtitle: 'From 4.99',
      ctaLabel: 'Browse Steam',
      href: '/store?platform=steam',
    },
  ],
};

/** The pieces of the API the homepage needs. `routes` override or add endpoints; the app shell's own calls are answered too. */
export function homeBackend(layout: HomeBlockMeta[] | unknown, routes: FakeRoutes = {}): FakeApi {
  return fakeApi({
    'GET /api/filters': {
      body: { platforms: [], regions: [], genres: [], price: { min: null, max: null } },
    },
    'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    'GET /api/home/layout': { body: Array.isArray(layout) ? { blocks: layout } : layout },
    'GET /api/home/banners': { body: banners },
    'GET /api/home/best-sellers': {
      body: { items: [card(1, 'Alpha Quest'), card(2, 'Bravo Run')] },
    },
    'GET /api/home/deals': {
      body: {
        items: [
          card(3, 'Charlie Cut', {
            discountPct: 50,
            originalPriceCents: 4000,
            fromPriceCents: 2000,
          }),
        ],
      },
    },
    'GET /api/home/new-releases': { body: { items: [card(4, 'Delta Dawn')] } },
    ...routes,
  });
}
