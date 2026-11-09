import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { describeError, getApiError } from '../../api/errors';
import type { Cart } from '../../api/types';
import { EmptyState } from '../../components/state/EmptyState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { formatMoney } from '../../lib/money';
import { useGetCartQuery } from '../cart/cartApi';
import { useCreateCheckoutMutation } from './checkoutApi';
import { PaymentPanel } from './PaymentPanel';

interface ShortageItem {
  offerId: number;
  code: string;
  requested: number;
  available: number;
}

/** What went wrong when the server refused to start the payment, in words that name the games. */
function CheckoutProblem({ error, cart }: { error: unknown; cart: Cart }) {
  const api = getApiError(error);
  const items = (api?.details?.items ?? []) as ShortageItem[];
  if (api?.code === 'out_of_stock' && Array.isArray(items)) {
    return (
      <Alert
        severity="warning"
        role="alert"
        action={
          <Button component={RouterLink} to="/cart" color="inherit" size="small">
            Back to cart
          </Button>
        }
      >
        Some items are no longer available, so nothing was reserved or charged.
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {items.map((item) => {
            const line = cart.lines.find((l) => l.offerId === item.offerId);
            return (
              <li key={item.offerId}>
                {line?.productName ?? `Offer ${item.offerId}`}: you want {item.requested},{' '}
                {item.available} left
              </li>
            );
          })}
        </Box>
      </Alert>
    );
  }
  return (
    <Alert severity="error" role="alert">
      {describeError(error)}
    </Alert>
  );
}

function Summary({ cart }: { cart: Cart }) {
  return (
    <Paper
      component="section"
      aria-labelledby="summary-heading"
      sx={{ p: 3, display: 'grid', gap: 2 }}
    >
      <Typography id="summary-heading" variant="h2" sx={{ fontSize: '1.125rem' }}>
        Order summary
      </Typography>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 1.5 }}>
        {cart.lines.map((line) => (
          <Box
            component="li"
            key={line.offerId}
            sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>
                {line.qty} × {line.productName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Sold by {line.sellerName}
              </Typography>
            </Box>
            <Typography sx={{ fontWeight: 700 }}>{formatMoney(line.lineCents)}</Typography>
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: 1,
          borderColor: 'divider',
          pt: 2,
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Total</Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }}>
          {formatMoney(cart.totalCents, cart.currency)}
        </Typography>
      </Box>
      <Button component={RouterLink} to="/cart" variant="text" size="small">
        Edit cart
      </Button>
    </Paper>
  );
}

function CheckoutContents({ cart }: { cart: Cart }) {
  const [start, { data: checkout, error, isLoading, reset }] = useCreateCheckoutMutation();
  const blocked = cart.issues.length > 0;

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
        alignItems: 'start',
      }}
    >
      <Summary cart={cart} />
      <Paper
        component="section"
        aria-labelledby="payment-heading"
        sx={{ p: 3, display: 'grid', gap: 2 }}
      >
        <Typography id="payment-heading" variant="h2" sx={{ fontSize: '1.125rem' }}>
          Payment
        </Typography>
        {checkout ? (
          <>
            <Typography>
              Amount to pay (calculated by the server):{' '}
              <strong>{formatMoney(checkout.totalCents, checkout.currency)}</strong>
            </Typography>
            <PaymentPanel checkout={checkout} />
          </>
        ) : (
          <>
            {blocked && (
              <Alert severity="warning">
                Some items in your cart cannot be bought as they are. Fix them in the cart first.
              </Alert>
            )}
            {error !== undefined && <CheckoutProblem error={error} cart={cart} />}
            <Typography variant="body2" color="text.secondary">
              Continuing reserves your keys for a few minutes while you pay.
            </Typography>
            <Button
              variant="contained"
              size="large"
              disabled={isLoading || blocked}
              onClick={() => {
                reset();
                void start();
              }}
            >
              {isLoading ? 'Reserving your keys…' : 'Continue to payment'}
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}

export function CheckoutPage() {
  const cart = useGetCartQuery();

  return (
    <Stack spacing={3}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
        Checkout
      </Typography>
      <QueryBoundary
        query={cart}
        isEmpty={(data) => data.lines.length === 0}
        loadingLabel="Loading your order…"
        errorTitle="We could not load your order"
        empty={
          <EmptyState
            title="Your cart is empty"
            description="Add a game to your cart before checking out."
            action={
              <Button component={RouterLink} to="/store" variant="contained">
                Browse the store
              </Button>
            }
          />
        }
      >
        {(data) => <CheckoutContents cart={data} />}
      </QueryBoundary>
    </Stack>
  );
}
