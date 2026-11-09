import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RemoveIcon from '@mui/icons-material/Remove';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { describeError } from '../../api/errors';
import type { Cart, CartIssue, CartLine } from '../../api/types';
import { EmptyState } from '../../components/state/EmptyState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { formatMoney } from '../../lib/money';
import { tokens } from '../../theme/theme';
import { useGetCartQuery, useRemoveCartLineMutation, useSetCartQuantityMutation } from './cartApi';

/** The server allows 1-5 of one offer (docs/CHECKOUT.md); the buttons also stop at the stock that exists. */
export const MAX_QTY = 5;

function LineRow({ line, issue }: { line: CartLine; issue?: CartIssue }) {
  const [setQuantity, quantity] = useSetCartQuantityMutation();
  const [remove, removal] = useRemoveCartLineMutation();
  const busy = quantity.isLoading || removal.isLoading;
  const max = Math.max(1, Math.min(MAX_QTY, line.available));
  const error = quantity.error ?? removal.error;

  return (
    <Paper
      component="li"
      sx={{
        p: 2,
        bgcolor: tokens.color.surfaceInset,
        display: 'grid',
        gap: 1.5,
        listStyle: 'none',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'center',
          gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) auto auto auto' },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component={RouterLink}
            to={`/product/${line.productSlug}`}
            sx={{
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {line.productName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sold by {line.sellerName} · {formatMoney(line.unitCents)} each
          </Typography>
        </Box>

        <Stack
          direction="row"
          role="group"
          aria-label={`Quantity of ${line.productName}`}
          sx={{ alignItems: 'center', gap: 0.5 }}
        >
          <IconButton
            size="small"
            aria-label={`Decrease quantity of ${line.productName}`}
            disabled={busy || line.qty <= 1}
            onClick={() => void setQuantity({ offerId: line.offerId, qty: line.qty - 1 })}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
          <Typography
            aria-live="polite"
            sx={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}
          >
            {line.qty}
          </Typography>
          <IconButton
            size="small"
            aria-label={`Increase quantity of ${line.productName}`}
            disabled={busy || line.qty >= max}
            onClick={() => void setQuantity({ offerId: line.offerId, qty: line.qty + 1 })}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Typography sx={{ fontWeight: 800, minWidth: 80, textAlign: 'right' }}>
          {formatMoney(line.lineCents)}
        </Typography>

        <IconButton
          aria-label={`Remove ${line.productName} from the cart`}
          disabled={busy}
          onClick={() => void remove(line.offerId)}
        >
          <DeleteIcon />
        </IconButton>
      </Box>
      {issue && <Alert severity="warning">{issue.message}</Alert>}
      {error !== undefined && <Alert severity="error">{describeError(error)}</Alert>}
    </Paper>
  );
}

function CartContents({ cart }: { cart: Cart }) {
  const issues = new Map(cart.issues.map((issue) => [issue.offerId, issue]));
  const blocked = cart.issues.length > 0;
  const itemCount = cart.lines.reduce((sum, line) => sum + line.qty, 0);

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' },
        alignItems: 'start',
      }}
    >
      <Stack component="ul" spacing={1.5} aria-label="Cart items" sx={{ m: 0, p: 0 }}>
        {cart.lines.map((line) => (
          <LineRow key={line.offerId} line={line} issue={issues.get(line.offerId)} />
        ))}
      </Stack>

      <Paper
        component="section"
        aria-labelledby="summary-heading"
        sx={{ p: 3, display: 'grid', gap: 2 }}
      >
        <Typography id="summary-heading" variant="h2" sx={{ fontSize: '1.125rem' }}>
          Order summary
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography color="text.secondary">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.25rem' }} aria-label="Total">
            {formatMoney(cart.totalCents, cart.currency)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Prices and stock are checked again by the server when you pay.
        </Typography>
        {blocked && (
          <Alert severity="warning">
            Fix the items marked above (remove them or lower the quantity) to continue.
          </Alert>
        )}
        <Button
          component={RouterLink}
          to="/checkout"
          variant="contained"
          size="large"
          disabled={blocked}
          aria-disabled={blocked}
          onClick={(event) => blocked && event.preventDefault()}
        >
          Go to checkout
        </Button>
        <Button component={RouterLink} to="/store" variant="text">
          Continue shopping
        </Button>
      </Paper>
    </Box>
  );
}

export function CartPage() {
  const cart = useGetCartQuery();

  return (
    <Stack spacing={3}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
        Your cart
      </Typography>
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
        {(data) => <CartContents cart={data} />}
      </QueryBoundary>
    </Stack>
  );
}
