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
    /** Sets the quantity of a line. The server answers with the whole cart, recomputed from live prices. */
    setCartQuantity: build.mutation<Cart, { offerId: number; qty: number }>({
      query: ({ offerId, qty }) => ({ url: `/cart/${offerId}`, method: 'PATCH', body: { qty } }),
      invalidatesTags: ['Cart'],
    }),
    removeCartLine: build.mutation<Cart, number>({
      query: (offerId) => ({ url: `/cart/${offerId}`, method: 'DELETE' }),
      invalidatesTags: ['Cart'],
    }),
  }),
});

export const {
  useGetCartQuery,
  useAddToCartMutation,
  useSetCartQuantityMutation,
  useRemoveCartLineMutation,
} = cartApi;
