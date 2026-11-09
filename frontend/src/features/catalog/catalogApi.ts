import { baseApi } from '../../app/api';
import type { Filters } from '../../api/types';

export const catalogApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Platform and genre options (with counts) for the navigation bar; later also the store's filter sidebar. */
    getFilters: build.query<Filters, void>({ query: () => '/filters' }),
  }),
});

export const { useGetFiltersQuery } = catalogApi;
