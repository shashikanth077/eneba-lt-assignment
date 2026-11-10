import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Button } from '../../../../components/common';
import { describeApiError } from '../../../../services/api/apiErrorHandler';
import type { Offer } from '../../../../types/api.types';
import { loginUrl } from '../../../../utils/redirect';
import { selectIsAuthenticated } from '../../../auth/authSlice';
import { addToCartRequest, selectLineState, selectQtyInCart } from '../../../cart/cartSlice';
import { isBuyable } from '../../offers';
import styles from './OfferTable.module.scss';

/** The add-to-cart button of one offer row. Signed-out visitors are sent to sign in and come back to this page. */
export function AddToCartButton({ offer }: { offer: Offer }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useAppSelector(selectIsAuthenticated);
  const line = useAppSelector(selectLineState(offer.id));
  const inCart = useAppSelector(selectQtyInCart(offer.id));
  const seller = offer.seller.name;

  if (!isBuyable(offer)) {
    return (
      <Button variant="outline" disabled aria-label={`${seller}: out of stock`}>
        Unavailable
      </Button>
    );
  }

  return (
    <div className={styles.action}>
      <Button
        loading={line?.pending}
        aria-label={`Add to cart, offer from ${seller}`}
        onClick={() => {
          if (!signedIn) {
            navigate(loginUrl(location.pathname + location.search));
            return;
          }
          dispatch(addToCartRequest({ offerId: offer.id }));
        }}
      >
        {line?.pending ? 'Adding…' : 'Add to cart'}
      </Button>
      {inCart > 0 && <span className={styles.inCart}>In your cart: {inCart}</span>}
      {line?.error && (
        <span role="alert" className={styles.error}>
          {describeApiError(line.error)}
        </span>
      )}
    </div>
  );
}
