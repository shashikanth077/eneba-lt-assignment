import { baseApi } from '../../app/api';
import type { Checkout } from '../../api/types';

export const checkoutApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Reserves the keys of the server-side cart and creates the payment. There is no request body on purpose: the server builds
     * the order and the amount from ITS copy of the cart, so nothing the browser says can change what is charged.
     */
    createCheckout: build.mutation<Checkout, void>({
      query: () => ({ url: '/checkout', method: 'POST' }),
      invalidatesTags: ['Orders'],
    }),
  }),
});

export const { useCreateCheckoutMutation } = checkoutApi;
