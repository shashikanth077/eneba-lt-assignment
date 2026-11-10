import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';
import type {
  Filters,
  Paginated,
  ProductCard,
  ProductResponse,
  SuggestResponse,
} from '../../types/api.types';
import { PAGE_SIZE } from '../../utils/constants';

/** `queryString` is built by productsQuery.ts (it is also the cache key, so equal views share one request). */
export const getProducts = async (queryString: string): Promise<Paginated<ProductCard>> =>
  (await apiClient.get<Paginated<ProductCard>>(`${endpoints.products}?${queryString}`)).data;

export const getFilters = async (queryString: string): Promise<Filters> =>
  (
    await apiClient.get<Filters>(
      queryString === '' ? endpoints.filters : `${endpoints.filters}?${queryString}`,
    )
  ).data;

export const getProduct = async (slug: string): Promise<ProductResponse> =>
  (await apiClient.get<ProductResponse>(endpoints.product(slug))).data;

export const searchProducts = async (q: string, page: number): Promise<Paginated<ProductCard>> =>
  (
    await apiClient.get<Paginated<ProductCard>>(endpoints.search, {
      params: { q, page, pageSize: PAGE_SIZE },
    })
  ).data;

export const getSuggestions = async (q: string): Promise<SuggestResponse> =>
  (await apiClient.get<SuggestResponse>(endpoints.suggest, { params: { q } })).data;
