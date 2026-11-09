import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import type { OrderStatus } from '../../api/types';
import { EmptyState } from '../../components/state/EmptyState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { formatMoney } from '../../lib/money';
import { useListOrdersQuery } from './ordersApi';

const STATUS_COLOR: Record<OrderStatus, 'success' | 'warning' | 'error' | 'default'> = {
  paid: 'success',
  pending: 'warning',
  failed: 'error',
  refund_needed: 'error',
  refunded: 'default',
  expired: 'default',
  canceled: 'default',
};

/** Order history (list only; the detail page with keys comes later). Protected: reached through ProtectedRoute. */
export function AccountOrdersPage() {
  const orders = useListOrdersQuery();

  return (
    <>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' }, mb: 3 }}>
        My orders
      </Typography>
      <QueryBoundary
        query={orders}
        isEmpty={(data) => data.items.length === 0}
        loadingLabel="Loading your orders…"
        errorTitle="We could not load your orders"
        empty={
          <EmptyState
            title="No orders yet"
            description="When you buy a game key, your order shows up here."
            action={
              <Button component={RouterLink} to="/store" variant="contained">
                Browse the store
              </Button>
            }
          />
        }
      >
        {(data) => (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
            {data.items.map((order) => (
              <Paper
                component="li"
                key={order.id}
                sx={{
                  p: 2,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 2,
                  justifyContent: 'space-between',
                }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Order #{order.id}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(order.createdAt).toLocaleString()} · {order.itemCount}{' '}
                    {order.itemCount === 1 ? 'item' : 'items'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Chip
                    size="small"
                    color={STATUS_COLOR[order.status]}
                    label={order.status.replace('_', ' ')}
                  />
                  <Typography sx={{ fontWeight: 800 }}>{formatMoney(order.totalCents)}</Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </QueryBoundary>
    </>
  );
}
