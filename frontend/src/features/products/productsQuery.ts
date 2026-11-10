/**
 * The store's whole view state, and its two translations: URL <-> StoreQuery <-> API request.
 * The URL is the single source of truth, so a page is reproduced exactly by its address (reload, share, back/forward).
 *
 * URL:  /store?q=witch&platform=steam&platform=xbox&region=europe&genre=Action&price_min=500&price_max=3000&sort=price_asc&page=2
 * Repeated keys for multi-select filters, prices in cents (same unit as the API), defaults left out so addresses stay short.
 */

import { PAGE_SIZE } from '../../utils/constants';

export { PAGE_SIZE };
export const MAX_QUERY_LENGTH = 100;

export type SortKey = 'popular' | 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'discount';

export interface StoreQuery {
  q: string;
  platforms: string[];
  regions: string[];
  genres: string[];
  priceMin: number | null;
  priceMax: number | null;
  sort: SortKey;
  page: number;
}

const SORTS: readonly SortKey[] = [
  'popular',
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'discount',
];

/** `relevance` only exists for a text search (the API answers 422 for it otherwise), and it is the default when searching. */
export const defaultSort = (q: string): SortKey => (q === '' ? 'popular' : 'relevance');
export const sortsFor = (q: string): SortKey[] =>
  SORTS.filter((sort) => sort !== 'relevance' || q !== '');

const isSortKey = (value: string | null): value is SortKey =>
  value !== null && (SORTS as readonly string[]).includes(value);

/** Same value twice or an empty one is noise; sorting makes ?platform=a&platform=b and ?platform=b&platform=a one cache entry. */
const cleanList = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))].sort();

const parseCents = (value: string | null): number | null =>
  value !== null && /^\d{1,9}$/.test(value) ? Number(value) : null;

/** Anything a person may have typed or an old link may carry is repaired, never trusted: the page must always be able to render. */
export function parseStoreQuery(params: URLSearchParams): StoreQuery {
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  let priceMin = parseCents(params.get('price_min'));
  let priceMax = parseCents(params.get('price_max'));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }
  const requested = params.get('sort');
  const sort =
    isSortKey(requested) && (requested !== 'relevance' || q !== '') ? requested : defaultSort(q);
  const pageNumber = /^\d{1,6}$/.test(params.get('page') ?? '') ? Number(params.get('page')) : 1;

  return {
    q,
    platforms: cleanList(params.getAll('platform')),
    regions: cleanList(params.getAll('region')),
    genres: cleanList(params.getAll('genre')),
    priceMin,
    priceMax,
    sort,
    page: Math.max(1, pageNumber),
  };
}

/** The canonical address for a view; parse(toSearchParams(x)) equals x. */
export function toSearchParams(query: StoreQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q !== '') params.set('q', query.q);
  query.platforms.forEach((value) => params.append('platform', value));
  query.regions.forEach((value) => params.append('region', value));
  query.genres.forEach((value) => params.append('genre', value));
  if (query.priceMin !== null) params.set('price_min', String(query.priceMin));
  if (query.priceMax !== null) params.set('price_max', String(query.priceMax));
  if (query.sort !== defaultSort(query.q)) params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

/** The filters that narrow the result set (not sort, not page). */
export type StoreFilters = Pick<
  StoreQuery,
  'q' | 'platforms' | 'regions' | 'genres' | 'priceMin' | 'priceMax'
>;

function filterParams(filters: StoreFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q !== '') params.set('q', filters.q);
  filters.platforms.forEach((value) => params.append('platform[]', value));
  filters.regions.forEach((value) => params.append('region[]', value));
  filters.genres.forEach((value) => params.append('genre[]', value));
  if (filters.priceMin !== null) params.set('price_min', String(filters.priceMin));
  if (filters.priceMax !== null) params.set('price_max', String(filters.priceMax));
  return params;
}

/** Query string for GET /api/products. Also the RTK Query cache key: equal views share one cache entry. */
export function productsArg(query: StoreQuery): string {
  const params = filterParams(query);
  params.set('sort', query.sort);
  params.set('page', String(query.page));
  params.set('pageSize', String(PAGE_SIZE));
  return params.toString();
}

/** Query string for GET /api/filters: option counts under the current filters (the API leaves each group's own selection out). */
export function facetsArg(filters: StoreFilters): string {
  return filterParams(filters).toString();
}

export const hasActiveFilters = (query: StoreQuery): boolean =>
  query.q !== '' ||
  query.platforms.length > 0 ||
  query.regions.length > 0 ||
  query.genres.length > 0 ||
  query.priceMin !== null ||
  query.priceMax !== null;

export function activeFilterCount(query: StoreQuery): number {
  return (
    (query.q !== '' ? 1 : 0) +
    query.platforms.length +
    query.regions.length +
    query.genres.length +
    (query.priceMin !== null || query.priceMax !== null ? 1 : 0)
  );
}

/** What "Clear all" changes: every filter, but not the chosen sort. */
export const cleared = (query: StoreQuery): Partial<StoreQuery> => ({
  ...query,
  q: '',
  platforms: [],
  regions: [],
  genres: [],
  priceMin: null,
  priceMax: null,
  sort: query.sort === 'relevance' ? 'popular' : query.sort,
  page: 1,
});
