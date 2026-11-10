import { Button, PriceDisplay } from '../../../../components/common';
import { describeApiError } from '../../../../services/api/apiErrorHandler';
import type { Offer } from '../../../../types/api.types';
import { useFormatPrice } from '../../../settings/useFormatPrice';
import { useAddOffer } from '../OfferTable/useAddOffer';
import styles from './BuyBox.module.scss';

/** The panel beside the details (as in the reference): the lowest price, how many sellers there are, and one button for the cheapest offer. */
export function BuyBox({
  cheapest,
  offerCount,
  productSlug,
}: {
  cheapest: Offer | null;
  offerCount: number;
  productSlug: string;
}) {
  if (cheapest === null) {
    return (
      <aside className={styles.box} aria-label="Buy">
        <p className={styles.sold}>Out of stock</p>
      </aside>
    );
  }
  return <BuyCheapest cheapest={cheapest} offerCount={offerCount} productSlug={productSlug} />;
}

function BuyCheapest({
  cheapest,
  offerCount,
  productSlug,
}: {
  cheapest: Offer;
  offerCount: number;
  productSlug: string;
}) {
  const { add, pending, error, inCart } = useAddOffer(cheapest, productSlug);
  const formatPrice = useFormatPrice();
  return (
    <aside className={styles.box} aria-label="Buy">
      <PriceDisplay
        from
        cents={cheapest.priceCents}
        originalCents={cheapest.originalPriceCents}
        size="lg"
      />
      <Button
        size="lg"
        fullWidth
        loading={pending}
        aria-label="Add to cart, cheapest offer"
        onClick={add}
      >
        {pending ? 'Adding…' : 'Add to cart'}
      </Button>
      {inCart > 0 && <p className={styles.note}>In your cart: {inCart}</p>}
      {/* the same failure is announced (role="alert") on the offer's row below; announcing it twice would be noise */}
      {error && <p className={styles.error}>{describeApiError(error)}</p>}
      <p className={styles.offers}>
        {offerCount === 1 ? '1 offer' : `${offerCount} offers`} from{' '}
        {formatPrice(cheapest.priceCents)}
      </p>
      <p className={styles.note}>
        Instant delivery: your key appears on the order page as soon as the payment is confirmed.
      </p>
    </aside>
  );
}
