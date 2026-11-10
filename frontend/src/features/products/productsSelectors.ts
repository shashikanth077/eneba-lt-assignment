import type { RootState } from '../../app/store';
import type {
  Filters,
  Paginated,
  ProductCard,
  ProductResponse,
  SuggestResponse,
} from '../../types/api.types';
import type { Entry } from '../../utils/keyed';

export const selectProductsEntry =
  (key: string) =>
  (state: RootState): Entry<Paginated<ProductCard>> | undefined =>
    state.products.list[key];
export const selectFacetsEntry =
  (key: string) =>
  (state: RootState): Entry<Filters> | undefined =>
    state.products.facets[key];
export const selectProductEntry =
  (slug: string) =>
  (state: RootState): Entry<ProductResponse> | undefined =>
    state.products.details[slug];
export const selectSearchEntry =
  (key: string) =>
  (state: RootState): Entry<Paginated<ProductCard>> | undefined =>
    state.products.search[key];
export const selectSuggestionsEntry =
  (term: string) =>
  (state: RootState): Entry<SuggestResponse> | undefined =>
    state.products.suggestions[term];

/** The whole-catalogue price range, which stays put while filters narrow the results. */
export function selectPriceBounds(state: RootState): { min: number; max: number } | undefined {
  const price = state.products.facets['']?.data?.price;
  return price && price.min !== null && price.max !== null
    ? { min: price.min, max: price.max }
    : undefined;
}

/** The cache key of one search page. */
export const searchKey = (q: string, page: number): string => JSON.stringify([q, page]);
