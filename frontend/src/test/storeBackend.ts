import type { FacetOption, Filters } from '../types/api.types';
import { apiError, fakeApi, type FakeApi, type FakeRoutes } from './fakeApi';

const PLATFORMS = ['steam', 'xbox', 'playstation'] as const;
const REGIONS = ['global', 'europe'] as const;
const GENRES = ['Action', 'RPG', 'Horror', 'Puzzle'] as const;
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface Game {
  id: number;
  name: string;
  platform: string;
  region: string;
  genre: string;
  priceCents: number;
}

/** 30 games with a pattern simple enough to predict any filter's result by hand: price = 500 + 200 * (id - 1) cents (5.00 .. 63.00 EUR). */
export const GAMES: Game[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  name: `Game ${String(index + 1).padStart(2, '0')}`,
  platform: PLATFORMS[index % 3],
  region: REGIONS[index % 2],
  genre: GENRES[index % 4],
  priceCents: 500 + index * 200,
}));

export const PAGE = 24;

interface Wanted {
  platform: string[];
  region: string[];
  genre: string[];
  min: number | null;
  max: number | null;
  q: string;
}

function wantedFrom(url: URL): Wanted {
  const number = (key: string) =>
    url.searchParams.has(key) ? Number(url.searchParams.get(key)) : null;
  return {
    platform: url.searchParams.getAll('platform[]'),
    region: url.searchParams.getAll('region[]'),
    genre: url.searchParams.getAll('genre[]'),
    min: number('price_min'),
    max: number('price_max'),
    q: url.searchParams.get('q') ?? '',
  };
}

/** `skip` leaves one group out, like the real facets endpoint does for the group being counted. */
function matching(wanted: Wanted, skip?: 'platform' | 'region' | 'genre'): Game[] {
  return GAMES.filter(
    (game) =>
      (skip === 'platform' ||
        wanted.platform.length === 0 ||
        wanted.platform.includes(game.platform)) &&
      (skip === 'region' || wanted.region.length === 0 || wanted.region.includes(game.region)) &&
      (skip === 'genre' || wanted.genre.length === 0 || wanted.genre.includes(game.genre)) &&
      (wanted.min === null || game.priceCents >= wanted.min) &&
      (wanted.max === null || game.priceCents <= wanted.max) &&
      game.name.toLowerCase().includes(wanted.q.toLowerCase()),
  );
}

function facet(
  values: readonly string[],
  games: Game[],
  pick: (game: Game) => string,
  label = cap,
): FacetOption[] {
  return values
    .map((value) => ({
      value,
      label: label(value),
      count: games.filter((game) => pick(game) === value).length,
    }))
    .filter((option) => option.count > 0);
}

export const toCard = (game: Game) => ({
  id: game.id,
  slug: `game-${game.id}`,
  name: game.name,
  coverUrl: `/api/images/products/game-${game.id}.svg`,
  platform: { slug: game.platform, name: cap(game.platform) },
  region: { slug: game.region, name: cap(game.region) },
  fromPriceCents: game.priceCents,
  offerCount: 1,
  inStock: true,
});

const SORTERS: Record<string, (a: Game, b: Game) => number> = {
  popular: (a, b) => a.id - b.id,
  price_asc: (a, b) => a.priceCents - b.priceCents,
  price_desc: (a, b) => b.priceCents - a.priceCents,
  newest: (a, b) => b.id - a.id,
  discount: (a, b) => a.id - b.id,
  relevance: (a, b) => a.id - b.id,
};

/** An in-memory copy of GET /api/products and GET /api/filters over GAMES. `extra` adds or replaces routes. */
export function storeBackend(extra: FakeRoutes = {}): FakeApi {
  return fakeApi({
    'GET /api/auth/me': apiError(401, 'unauthorized', 'x'),
    'GET /api/products': ({ url }) => {
      const wanted = wantedFrom(url);
      const sort = url.searchParams.get('sort') ?? 'popular';
      const page = Number(url.searchParams.get('page') ?? '1');
      const all = matching(wanted).sort(SORTERS[sort] ?? SORTERS.popular);
      return {
        body: {
          items: all.slice((page - 1) * PAGE, page * PAGE).map(toCard),
          page,
          pageSize: PAGE,
          total: all.length,
        },
      };
    },
    'GET /api/filters': ({ url }): { body: Filters } => {
      const wanted = wantedFrom(url);
      const prices = matching({ ...wanted, min: null, max: null }).map((game) => game.priceCents);
      return {
        body: {
          platforms: facet(PLATFORMS, matching(wanted, 'platform'), (game) => game.platform),
          regions: facet(REGIONS, matching(wanted, 'region'), (game) => game.region),
          genres: facet(
            GENRES,
            matching(wanted, 'genre'),
            (game) => game.genre,
            (genre) => genre,
          ),
          price: prices.length
            ? { min: Math.min(...prices), max: Math.max(...prices) }
            : { min: null, max: null },
        },
      };
    },
    ...extra,
  });
}
