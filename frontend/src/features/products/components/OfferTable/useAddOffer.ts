import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import type { Offer } from '../../../../types/api.types';
import { addToCartRequest, selectLineState, selectQtyInCart } from '../../../cart/cartSlice';

/**
 * What every "add this offer to the cart" button needs: the state of that offer's line, and the action. Signed in or not, the same
 * action is dispatched: a visitor's items go to the cart kept in their browser and are merged into their account when they sign in.
 */
export function useAddOffer(offer: Offer, productSlug: string) {
  const dispatch = useAppDispatch();
  const line = useAppSelector(selectLineState(offer.id));
  const inCart = useAppSelector(selectQtyInCart(offer.id));

  const add = () => {
    dispatch(addToCartRequest({ offerId: offer.id, productSlug }));
  };

  return { add, pending: line?.pending ?? false, error: line?.error ?? null, inCart };
}
