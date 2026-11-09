import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { getStatus } from '../../api/errors';
import type { OrderDetail } from '../../api/types';
import { baseApi } from '../../app/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { EmptyState } from '../../components/state/EmptyState';
import { ErrorState } from '../../components/state/ErrorState';
import { LoadingState } from '../../components/state/LoadingState';
import { formatMoney } from '../../lib/money';
import { tokens } from '../../theme/theme';
import { sendOrderReceipt } from '../email/emailjs';
import { takeReceiptDue } from '../email/receiptFlag';
import { KeyReveal } from './KeyReveal';
import { useGetOrderQuery } from './ordersApi';
import { STATUS_COLOR, STATUS_LABEL } from './orderStatus';

/** How often the order is asked for while the payment is still being confirmed, and for how long before we stop and say so. */
export const POLL_EVERY_MS = 2000;
export const POLL_GIVE_UP_MS = 120_000;

function StatusNotice({
  order,
  gaveUp,
  onCheck,
}: {
  order: OrderDetail;
  gaveUp: boolean;
  onCheck: () => void;
}) {
  switch (order.status) {
    case 'pending':
      return gaveUp ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={onCheck}>
              Check again
            </Button>
          }
        >
          We have not received the payment confirmation yet. If you paid, it can take a little
          longer: check again in a minute. You are not charged twice.
        </Alert>
      ) : (
        <Alert severity="info" role="status" icon={<CircularProgress size={20} aria-hidden />}>
          Payment received, waiting for confirmation… This usually takes a few seconds. Your keys
          appear here as soon as it is confirmed; you can stay on this page.
        </Alert>
      );
    case 'paid':
      return (
        <Alert severity="success" role="status">
          Payment confirmed. Your keys are below.
        </Alert>
      );
    case 'failed':
      return (
        <Alert severity="error">
          The payment did not go through and you were not charged. You can try again from your cart.
        </Alert>
      );
    case 'expired':
      return (
        <Alert severity="warning">
          This order expired before it was paid, and the keys went back on sale. Start a new order
          from your cart.
        </Alert>
      );
    case 'canceled':
      return <Alert severity="warning">This order was replaced by a newer checkout.</Alert>;
    case 'refund_needed':
      return (
        <Alert severity="warning">
          The keys ran out while your payment was being confirmed. We are refunding you
          automatically.
        </Alert>
      );
    case 'refunded':
      return <Alert severity="info">This order was refunded.</Alert>;
  }
}

function OrderView({
  order,
  gaveUp,
  onCheck,
}: {
  order: OrderDetail;
  gaveUp: boolean;
  onCheck: () => void;
}) {
  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
          Order #{order.id}
        </Typography>
        <Chip label={STATUS_LABEL[order.status]} color={STATUS_COLOR[order.status]} />
      </Stack>
      <Typography color="text.secondary">
        Placed {new Date(order.createdAt).toLocaleString()}
        {order.paidAt && ` · paid ${new Date(order.paidAt).toLocaleString()}`}
      </Typography>

      <StatusNotice order={order} gaveUp={gaveUp} onCheck={onCheck} />

      <Stack component="ul" spacing={2} aria-label="Items" sx={{ m: 0, p: 0 }}>
        {order.items.map((item) => (
          <Paper
            key={`${item.productSlug}-${item.sellerName}`}
            component="li"
            sx={{
              p: 2.5,
              bgcolor: tokens.color.surfaceInset,
              listStyle: 'none',
              display: 'grid',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography
                  component={RouterLink}
                  to={`/product/${item.productSlug}`}
                  sx={{ fontWeight: 700, color: 'inherit' }}
                >
                  {item.qty} × {item.productName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sold by {item.sellerName} · {formatMoney(item.unitPriceCents, order.currency)}{' '}
                  each
                </Typography>
              </Box>
              <Typography sx={{ fontWeight: 800 }}>
                {formatMoney(item.unitPriceCents * item.qty, order.currency)}
              </Typography>
            </Box>
            {item.keys && (
              <Stack spacing={1} role="group" aria-label={`Keys for ${item.productName}`}>
                {item.keys.map((key, index) => (
                  <KeyReveal
                    key={index}
                    value={key}
                    label={`${item.productName}, key ${index + 1} of ${item.keys?.length ?? 0}`}
                  />
                ))}
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>

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
          {formatMoney(order.totalCents, order.currency)}
        </Typography>
      </Box>
      <Button
        component={RouterLink}
        to="/account/orders"
        variant="text"
        sx={{ alignSelf: 'flex-start' }}
      >
        All my orders
      </Button>
    </Stack>
  );
}

/**
 * One order. While it is `pending` (Stripe has taken the card but its webhook has not reached the server yet) the page asks the
 * server every 2 s and flips to the keys by itself; it gives up after 2 minutes and offers a manual check instead of polling forever.
 * What this page shows is only ever what the server says: the browser's own idea of "I paid" never unlocks a key.
 */
export function OrderPage() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [gaveUp, setGaveUp] = useState(false);

  const query = useGetOrderQuery(id, { skip: !valid });
  const status = query.data?.order.status;
  const waiting = status === 'pending' && !gaveUp;

  // Re-run the query by hand while waiting (a setInterval per page, stopped the moment the status changes or the page closes).
  const { refetch } = query;
  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => void refetch(), POLL_EVERY_MS);
    const stop = setTimeout(() => setGaveUp(true), POLL_GIVE_UP_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, refetch]);

  // The order just became paid: the cart lost the bought lines (so the header badge must refetch) and the list changed.
  // Then, once, the confirmation email, built from the order WITHOUT its keys (see emailjs.ts).
  const order = query.data?.order;
  useEffect(() => {
    if (order?.status !== 'paid') return;
    dispatch(baseApi.util.invalidateTags(['Cart', 'Orders']));
    if (user && takeReceiptDue(order.id)) void sendOrderReceipt(order, user);
  }, [order, user, dispatch]);

  if (!valid) return <NotFound />;
  if (order) {
    return (
      <OrderView
        order={order}
        gaveUp={gaveUp}
        onCheck={() => {
          setGaveUp(false);
          void refetch();
        }}
      />
    );
  }
  if (query.isError) {
    return getStatus(query.error) === 404 ? (
      <NotFound />
    ) : (
      <ErrorState
        error={query.error}
        title="We could not load this order"
        onRetry={() => void refetch()}
      />
    );
  }
  return <LoadingState label="Loading your order…" />;
}

function NotFound() {
  return (
    <EmptyState
      title="We could not find that order"
      description="It may belong to another account, or the link is wrong."
      action={
        <Button component={RouterLink} to="/account/orders" variant="contained">
          My orders
        </Button>
      }
    />
  );
}
