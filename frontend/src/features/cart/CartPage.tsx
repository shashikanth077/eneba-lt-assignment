import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { PagePlaceholder } from '../../components/layout/PagePlaceholder';
import { EmptyState } from '../../components/state/EmptyState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { formatMoney } from '../../lib/money';
import { useGetCartQuery } from './cartApi';

/** Placeholder with real data: proves the protected cart route, the API slice and the shared loading/error/empty states work together. */
export function CartPage() {
  const cart = useGetCartQuery();

  return (
    <QueryBoundary
      query={cart}
      isEmpty={(data) => data.lines.length === 0}
      loadingLabel="Loading your cart…"
      errorTitle="We could not load your cart"
      empty={
        <EmptyState
          title="Your cart is empty"
          description="Find something you like and add it to your cart."
          action={
            <Button component={RouterLink} to="/store" variant="contained">
              Browse the store
            </Button>
          }
        />
      }
    >
      {(data) => (
        <PagePlaceholder title="Cart">
          <Typography>
            {data.lines.length} {data.lines.length === 1 ? 'item' : 'items'} ·{' '}
            {formatMoney(data.totalCents, data.currency)}
          </Typography>
        </PagePlaceholder>
      )}
    </QueryBoundary>
  );
}
