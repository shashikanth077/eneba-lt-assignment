import { baseApi } from '../../app/api';
import type { Paginated, ProductCard } from '../../api/types';

/**
 * The products endpoint takes the query string itself as their argument (built in storeQuery.ts), so RTK Query's cache key is the exact request:
 * going back to a view you already visited is served from the cache (60 s by default) with no new request.
 */
export const storeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProducts: build.query<Paginated<ProductCard>, string>({
      query: (queryString) => `/products?${queryString}`,
    }),
  }),
});

export const { useGetProductsQuery } = storeApi;
