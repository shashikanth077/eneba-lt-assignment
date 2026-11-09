import { baseApi } from '../../app/api';
import type { OrderSummary, Paginated } from '../../api/types';

export const ordersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listOrders: build.query<Paginated<OrderSummary>, void>({
      query: () => '/orders',
      providesTags: ['Orders'],
    }),
  }),
});

export const { useListOrdersQuery } = ordersApi;
