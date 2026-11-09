import { baseApi } from '../../app/api';
import type { Cart } from '../../api/types';

export const cartApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCart: build.query<Cart, void>({ query: () => '/cart', providesTags: ['Cart'] }),
    /** Adds `qty` (default 1) of one offer. Adding an offer that is already in the cart increases its quantity. */
    addToCart: build.mutation<Cart, { offerId: number; qty?: number }>({
      query: (body) => ({ url: '/cart', method: 'POST', body }),
      invalidatesTags: ['Cart'], // the header badge and the cart page refetch
    }),
  }),
});

export const { useGetCartQuery, useAddToCartMutation } = cartApi;
