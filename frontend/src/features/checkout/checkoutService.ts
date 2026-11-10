import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';
import type { Checkout } from '../../types/api.types';

/**
 * Reserves the keys of the server-side cart and creates the payment. There is no request body on purpose: the server builds the
 * order and the amount from ITS copy of the cart, so nothing the browser says can change what is charged.
 */
export const createCheckout = async (): Promise<Checkout> =>
  (await apiClient.post<Checkout>(endpoints.checkout)).data;
