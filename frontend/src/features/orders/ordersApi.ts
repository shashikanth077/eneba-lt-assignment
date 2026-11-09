import { baseApi } from '../../app/api';
import type { OrderDetail, OrderSummary, Paginated } from '../../api/types';

export const ordersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listOrders: build.query<Paginated<OrderSummary>, number | void>({
      query: (page) => `/orders?page=${page ?? 1}&pageSize=10`,
      providesTags: ['Orders'],
    }),
    /**
     * One order, with its keys once it is paid. `keepUnusedDataFor: 0`: the moment the order page closes, the keys leave the
     * browser's memory too (the default would keep them cached for a minute).
     */
    getOrder: build.query<{ order: OrderDetail }, number>({
      query: (id) => `/orders/${id}`,
      providesTags: ['Orders'],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useListOrdersQuery, useGetOrderQuery } = ordersApi;
