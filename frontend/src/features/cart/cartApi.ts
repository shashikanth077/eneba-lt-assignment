import { baseApi } from '../../app/api';
import type { Cart } from '../../api/types';

export const cartApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCart: build.query<Cart, void>({ query: () => '/cart', providesTags: ['Cart'] }),
  }),
});

export const { useGetCartQuery } = cartApi;
