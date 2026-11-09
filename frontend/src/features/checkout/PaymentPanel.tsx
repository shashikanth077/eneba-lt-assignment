import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance } from '@stripe/stripe-js';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Checkout } from '../../api/types';
import { formatMoney } from '../../lib/money';
import { tokens } from '../../theme/theme';
import { markReceiptDue } from '../email/receiptFlag';
import { getStripe } from './stripe';

const appearance: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: tokens.color.yellow,
    colorBackground: tokens.color.surfaceInput,
    colorText: tokens.color.textPrimary,
    fontFamily: 'Montserrat, Helvetica Neue, Arial, sans-serif',
    borderRadius: '2px',
  },
};

function PayForm({ checkout }: { checkout: Checkout }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const orderPage = `/account/orders/${checkout.orderId}`;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || paying) return;
    setPaying(true);
    setFailure(null);
    // Written before the call: a card that needs a redirect (3-D Secure) leaves this page and comes back to the order page.
    markReceiptDue(checkout.orderId);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${orderPage}` },
      redirect: 'if_required',
    });
    if (error) {
      // Declined card, wrong number, authentication failed: show Stripe's own wording and let the buyer try another card.
      setFailure(error.message ?? 'The payment did not go through. Try again or use another card.');
      setPaying(false);
      return;
    }
    // Paid or still processing. Whether the money really arrived is decided by Stripe's webhook, not by this page: the order page
    // asks the server and keeps asking until the order says paid.
    navigate(orderPage, { replace: true });
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2 }}>
      <PaymentElement />
      {failure && (
        <Alert severity="error" role="alert">
          {failure}
        </Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={!stripe || !elements || paying}
      >
        {paying ? 'Processing…' : `Pay ${formatMoney(checkout.totalCents, checkout.currency)}`}
      </Button>
      <Typography variant="caption" color="text.secondary">
        Test mode: pay with card 4242 4242 4242 4242, any future date, any CVC. No real money moves.
      </Typography>
    </Box>
  );
}

/** Stripe's Payment Element for one reserved order. The amount charged is the one the SERVER put on the PaymentIntent. */
export function PaymentPanel({ checkout }: { checkout: Checkout }) {
  const stripe = getStripe();
  if (stripe === null) {
    return (
      <Alert severity="error">
        Payments are not set up in this environment (a Stripe test publishable key is missing).
      </Alert>
    );
  }
  const until = new Date(checkout.reservedUntil);
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Your keys are reserved until{' '}
        {until.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </Typography>
      <Elements stripe={stripe} options={{ clientSecret: checkout.clientSecret, appearance }}>
        <PayForm checkout={checkout} />
      </Elements>
    </Box>
  );
}
