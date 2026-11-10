import type {
  Filters,
  Paginated,
  ProductCard,
  ProductResponse,
  SuggestResponse,
} from '../../types/api.types';
import type { Keyed } from '../../utils/keyed';

export interface ProductsState {
  /** Listing pages of /store, one entry per query string (see productsQuery.productsArg). */
  list: Keyed<Paginated<ProductCard>>;
  /** Option lists with counts, one entry per set of filters; the entry '' is the whole catalogue (price bounds, navigation bar). */
  facets: Keyed<Filters>;
  /** Product pages, by slug. */
  details: Keyed<ProductResponse>;
  /** Search results, one entry per query + page (see searchKey). */
  search: Keyed<Paginated<ProductCard>>;
  /** Autocomplete suggestions, by the text typed. */
  suggestions: Keyed<SuggestResponse>;
}
