import { baseApi } from '../../app/api';
import type { Paginated, ProductCard, SuggestResponse } from '../../api/types';
import { PAGE_SIZE } from '../store/storeQuery';

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    suggest: build.query<SuggestResponse, string>({
      query: (q) => ({ url: '/search/suggest', params: { q } }),
    }),
    /** Ranked results (every item carries `score`, out-of-stock matches included). */
    search: build.query<Paginated<ProductCard>, { q: string; page: number }>({
      query: ({ q, page }) => ({ url: '/search', params: { q, page, pageSize: PAGE_SIZE } }),
    }),
  }),
});

export const { useSuggestQuery, useSearchQuery } = searchApi;
