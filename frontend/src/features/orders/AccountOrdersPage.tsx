import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../components/state/EmptyState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { formatMoney } from '../../lib/money';
import { useListOrdersQuery } from './ordersApi';
import { STATUS_COLOR, STATUS_LABEL } from './orderStatus';

const PAGE_SIZE = 10;

/** Order history, newest first, page in the address. Each order opens its own page (keys are shown only there). */
export function AccountOrdersPage() {
  const [params, setParams] = useSearchParams();
  const page = /^\d{1,6}$/.test(params.get('page') ?? '')
    ? Math.max(1, Number(params.get('page')))
    : 1;
  const orders = useListOrdersQuery(page);

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
          <>
            <Box
              component="ul"
              aria-label="Orders"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}
            >
              {data.items.map((order) => (
                <Paper
                  component="li"
                  key={order.id}
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 2,
                    justifyContent: 'space-between',
                    p: 0,
                  }}
                >
                  <Box
                    component={RouterLink}
                    to={`/account/orders/${order.id}`}
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      p: 2,
                      width: '100%',
                      color: 'inherit',
                      textDecoration: 'none',
                      '&:hover, &:focus-visible': { bgcolor: 'action.hover' },
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
                        label={STATUS_LABEL[order.status]}
                      />
                      <Typography sx={{ fontWeight: 800 }}>
                        {formatMoney(order.totalCents)}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
            {data.total > PAGE_SIZE && (
              <Pagination
                count={Math.ceil(data.total / PAGE_SIZE)}
                page={page}
                onChange={(_, next) => setParams(next > 1 ? { page: String(next) } : {})}
                color="primary"
                sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}
              />
            )}
          </>
        )}
      </QueryBoundary>
    </>
  );
}
