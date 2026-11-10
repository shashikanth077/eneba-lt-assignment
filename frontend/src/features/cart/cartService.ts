import apiClient from '../../services/api/apiClient';
import { endpoints } from '../../services/api/apiEndpoints';
import type { Cart } from '../../types/api.types';

export const getCart = async (): Promise<Cart> => (await apiClient.get<Cart>(endpoints.cart)).data;

/** Adds `qty` (default 1) of one offer; adding an offer already in the cart raises its quantity. The server answers with the whole cart. */
export const addToCart = async (offerId: number, qty = 1): Promise<Cart> =>
  (await apiClient.post<Cart>(endpoints.cart, { offerId, qty })).data;

/** Sets the quantity of a line. There is no price in any of these requests: the server reads prices itself. */
export const setCartQuantity = async (offerId: number, qty: number): Promise<Cart> =>
  (await apiClient.patch<Cart>(endpoints.cartLine(offerId), { qty })).data;

export const removeCartLine = async (offerId: number): Promise<Cart> =>
  (await apiClient.delete<Cart>(endpoints.cartLine(offerId))).data;
