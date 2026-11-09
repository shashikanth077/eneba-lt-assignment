import { baseApi } from '../../app/api';
import type { SuggestResponse } from '../../api/types';

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    suggest: build.query<SuggestResponse, string>({
      query: (q) => ({ url: '/search/suggest', params: { q } }),
    }),
  }),
});

export const { useSuggestQuery } = searchApi;
