import { Button } from '../../../../components/common';
import { describeApiError } from '../../../../services/api/apiErrorHandler';
import type { Offer } from '../../../../types/api.types';
import { isBuyable } from '../../offers';
import { useAddOffer } from './useAddOffer';
import styles from './OfferTable.module.scss';

/** The add-to-cart button of one offer row. Works without signing in (the cart is kept in the browser until checkout). */
export function AddToCartButton({ offer, productSlug }: { offer: Offer; productSlug: string }) {
  const { add, pending, error, inCart } = useAddOffer(offer, productSlug);
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
      <Button loading={pending} aria-label={`Add to cart, offer from ${seller}`} onClick={add}>
        {pending ? 'Adding…' : 'Add to cart'}
      </Button>
      {inCart > 0 && <span className={styles.inCart}>In your cart: {inCart}</span>}
      {error && (
        <span role="alert" className={styles.error}>
          {describeApiError(error)}
        </span>
      )}
    </div>
  );
}
