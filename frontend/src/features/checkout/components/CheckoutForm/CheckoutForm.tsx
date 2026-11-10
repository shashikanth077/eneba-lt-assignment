import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Alert, Button } from '../../../../components/common';
import { describeApiError } from '../../../../services/api/apiErrorHandler';
import type { Cart } from '../../../../types/api.types';
import type { SerializedApiError } from '../../../../types/common.types';
import { createCheckoutRequest, selectCheckout } from '../../checkoutSlice';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { PaymentMethod } from '../PaymentMethod';
import styles from './CheckoutForm.module.scss';

interface ShortageItem {
  offerId: number;
  code: string;
  requested: number;
  available: number;
}

/** What went wrong when the server refused to start the payment, in words that name the games. */
function CheckoutProblem({ error, cart }: { error: SerializedApiError; cart: Cart }) {
  const items = (error.details?.items ?? []) as ShortageItem[];
  if (error.code === 'out_of_stock' && Array.isArray(items)) {
    return (
      <Alert
        severity="warning"
        role="alert"
        action={
          <Button to="/cart" variant="text" size="sm">
            Back to cart
          </Button>
        }
      >
        Some items are no longer available, so nothing was reserved or charged.
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.offerId}>
              {cart.lines.find((line) => line.offerId === item.offerId)?.productName ??
                `Offer ${item.offerId}`}
              : you want {item.requested}, {item.available} left
            </li>
          ))}
        </ul>
      </Alert>
    );
  }
  return (
    <Alert severity="error" role="alert">
      {describeApiError(error)}
    </Alert>
  );
}

/**
 * Step 1 reserves the keys (`POST /api/checkout`, no body: the server computes the amount), step 2 is Stripe's payment form for that
 * reservation. Visiting the page holds no stock; only "Continue to payment" does.
 */
export function CheckoutForm({ cart }: { cart: Cart }) {
  const dispatch = useAppDispatch();
  const { status, checkout, error } = useAppSelector(selectCheckout);
  const blocked = cart.issues.length > 0;

  return (
    <section className={styles.panel} aria-labelledby="payment-heading">
      <h2 id="payment-heading" className={styles.heading}>
        Payment
      </h2>
      {checkout ? (
        <>
          <p>
            Amount to pay (calculated by the server):{' '}
            <strong>{formatCurrency(checkout.totalCents, checkout.currency)}</strong>
          </p>
          <PaymentMethod checkout={checkout} />
        </>
      ) : (
        <>
          {blocked && (
            <Alert severity="warning">
              Some items in your cart cannot be bought as they are. Fix them in the cart first.
            </Alert>
          )}
          {error && <CheckoutProblem error={error} cart={cart} />}
          <p className={styles.note}>
            Continuing reserves your keys for a few minutes while you pay.
          </p>
          <Button
            size="lg"
            disabled={blocked}
            loading={status === 'loading'}
            onClick={() => dispatch(createCheckoutRequest())}
          >
            {status === 'loading' ? 'Reserving your keys…' : 'Continue to payment'}
          </Button>
        </>
      )}
    </section>
  );
}
