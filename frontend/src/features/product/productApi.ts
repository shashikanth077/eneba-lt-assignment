import { baseApi } from '../../app/api';
import type { ProductResponse } from '../../api/types';

export const productApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getProduct: build.query<ProductResponse, string>({
      query: (slug) => `/products/${encodeURIComponent(slug)}`,
    }),
  }),
});

export const { useGetProductQuery } = productApi;
