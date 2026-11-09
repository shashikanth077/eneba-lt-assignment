import { baseApi } from '../../app/api';
import type { Filters } from '../../api/types';

export const catalogApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Option lists with counts. The argument is the query string of the filters to count under ('' = the whole catalog), see storeQuery.ts.
     * The navigation bar asks with '' and the store page asks with '' for its price range, so those two share one request and one cache entry.
     */
    getFilters: build.query<Filters, string>({
      query: (queryString) => (queryString === '' ? '/filters' : `/filters?${queryString}`),
    }),
  }),
});

export const { useGetFiltersQuery } = catalogApi;
