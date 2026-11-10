import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';
import type { OrderDetail, OrderSummary, Paginated } from '../../types/api.types';
import { ORDERS_PAGE_SIZE } from '../../utils/constants';

export const getOrders = async (page: number): Promise<Paginated<OrderSummary>> =>
  (
    await apiClient.get<Paginated<OrderSummary>>(endpoints.orders, {
      params: { page, pageSize: ORDERS_PAGE_SIZE },
    })
  ).data;

/** One order, with its keys once it is paid (and only for its owner: anybody else gets 404). */
export const getOrder = async (id: number): Promise<{ order: OrderDetail }> =>
  (await apiClient.get<{ order: OrderDetail }>(endpoints.order(id))).data;
