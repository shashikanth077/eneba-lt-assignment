import { Button } from '../../../../components/common';
import type { Cart } from '../../../../types/api.types';
import { formatCurrency } from '../../../../utils/formatCurrency';
import styles from './OrderSummary.module.scss';

/** What is being bought and the server's total. Read-only: changing the cart happens on the cart page. */
export function OrderSummary({ cart }: { cart: Cart }) {
  return (
    <section className={styles.summary} aria-labelledby="order-summary-heading">
      <h2 id="order-summary-heading" className={styles.heading}>
        Order summary
      </h2>
      <ul className={styles.lines}>
        {cart.lines.map((line) => (
          <li key={line.offerId} className={styles.line}>
            <div>
              <p className={styles.name}>
                {line.qty} × {line.productName}
              </p>
              <p className={styles.seller}>Sold by {line.sellerName}</p>
            </div>
            <strong>{formatCurrency(line.lineCents)}</strong>
          </li>
        ))}
      </ul>
      <div className={styles.total}>
        <span>Total</span>
        <strong>{formatCurrency(cart.totalCents, cart.currency)}</strong>
      </div>
      <Button to="/cart" variant="text" size="sm">
        Edit cart
      </Button>
    </section>
  );
}
