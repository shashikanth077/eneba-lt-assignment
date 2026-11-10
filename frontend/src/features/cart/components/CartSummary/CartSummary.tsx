import { useAppSelector } from '../../../../app/hooks';
import { Alert, Button } from '../../../../components/common';
import type { Cart } from '../../../../types/api.types';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { selectCartCount } from '../../cartSlice';
import styles from './CartSummary.module.scss';

/** Item count and the SERVER's total (the browser never adds prices up itself), with the way on to checkout. */
export function CartSummary({ cart }: { cart: Cart }) {
  const itemCount = useAppSelector(selectCartCount);
  const blocked = cart.issues.length > 0;
  return (
    <section className={styles.summary} aria-labelledby="cart-summary-heading">
      <h2 id="cart-summary-heading" className={styles.heading}>
        Order summary
      </h2>
      <div className={styles.totalRow}>
        <span>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
        <span className={styles.total} aria-label="Total">
          {formatCurrency(cart.totalCents, cart.currency)}
        </span>
      </div>
      <p className={styles.note}>Prices and stock are checked again by the server when you pay.</p>
      {blocked && (
        <Alert severity="warning">
          Fix the items marked above (remove them or lower the quantity) to continue.
        </Alert>
      )}
      <Button to="/checkout" size="lg" linkDisabled={blocked}>
        Go to checkout
      </Button>
      <Button to="/store" variant="text">
        Continue shopping
      </Button>
    </section>
  );
}
