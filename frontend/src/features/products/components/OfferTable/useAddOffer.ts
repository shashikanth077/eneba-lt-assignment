import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import type { Offer } from '../../../../types/api.types';
import { loginUrl } from '../../../../utils/redirect';
import { selectIsAuthenticated } from '../../../auth/authSlice';
import { addToCartRequest, selectLineState, selectQtyInCart } from '../../../cart/cartSlice';

/** What every "add this offer to the cart" button needs: the state of that offer's line, and an action that sends a signed-out visitor to sign in first. */
export function useAddOffer(offer: Offer) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useAppSelector(selectIsAuthenticated);
  const line = useAppSelector(selectLineState(offer.id));
  const inCart = useAppSelector(selectQtyInCart(offer.id));

  const add = () => {
    if (!signedIn) {
      navigate(loginUrl(location.pathname + location.search));
      return;
    }
    dispatch(addToCartRequest({ offerId: offer.id }));
  };

  return { add, pending: line?.pending ?? false, error: line?.error ?? null, inCart };
}
