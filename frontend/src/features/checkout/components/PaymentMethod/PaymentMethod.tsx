import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance } from '@stripe/stripe-js';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button } from '../../../../components/common';
import { markReceiptDue } from '../../../../services/email/receiptFlag';
import type { Checkout } from '../../../../types/api.types';
import { STRIPE_THEME } from '../../../../utils/constants';
import { formatCurrency } from '../../../../utils/formatCurrency';
import { formatTime } from '../../../../utils/formatDate';
import { getStripe } from '../../stripe';
import styles from './PaymentMethod.module.scss';

const appearance: Appearance = { theme: 'night', variables: { ...STRIPE_THEME } };

function PayForm({ checkout }: { checkout: Checkout }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Where the buyer lands after paying (also Stripe's return_url for redirect-based methods): that page asks the server and waits.
  const resultPath = `/payment/success?order=${checkout.orderId}`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setFailure(null);
    // Written before the call: a card that needs a redirect (3-D Secure) leaves this page and comes back to the result page.
    markReceiptDue(checkout.orderId);
    // Stripe.js talks to Stripe directly (card data never touches our servers), so this is the one request that is not a saga + Axios call.
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${resultPath}` },
      redirect: 'if_required',
    });
    if (error) {
      // Declined card, wrong number, authentication failed: show Stripe's own wording and let the buyer try another card.
      setFailure(error.message ?? 'The payment did not go through. Try again or use another card.');
      setPaying(false);
      return;
    }
    // Paid or still processing. Whether the money really arrived is decided by Stripe's webhook, not by this page: the result page
    // asks the server and keeps asking until the order says paid.
    navigate(resultPath, { replace: true });
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <PaymentElement />
      {failure && <Alert severity="error">{failure}</Alert>}
      <Button type="submit" size="lg" disabled={!stripe || !elements} loading={paying}>
        {paying ? 'Processing…' : `Pay ${formatCurrency(checkout.totalCents, checkout.currency)}`}
      </Button>
      <p className={styles.note}>
        Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC. No real money moves.
      </p>
    </form>
  );
}

/** Stripe's Payment Element for one reserved order. The amount charged is the one the SERVER put on the PaymentIntent. */
export function PaymentMethod({ checkout }: { checkout: Checkout }) {
  const stripe = getStripe();
  if (stripe === null) {
    return (
      <Alert severity="error">
        Payments are not set up in this environment (a Stripe test publishable key is missing).
      </Alert>
    );
  }
  return (
    <div className={styles.panel}>
      <p className={styles.reserved}>
        Your keys are reserved until {formatTime(checkout.reservedUntil)}.
      </p>
      <Elements stripe={stripe} options={{ clientSecret: checkout.clientSecret, appearance }}>
        <PayForm checkout={checkout} />
      </Elements>
    </div>
  );
}
