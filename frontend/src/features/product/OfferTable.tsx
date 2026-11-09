import StarIcon from '@mui/icons-material/Star';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Offer } from '../../api/types';
import { describeError } from '../../api/errors';
import { useAppSelector } from '../../app/hooks';
import { formatMoney } from '../../lib/money';
import { loginUrl } from '../../lib/redirect';
import { visuallyHidden } from '../../lib/visuallyHidden';
import { tokens } from '../../theme/theme';
import { useAddToCartMutation, useGetCartQuery } from '../cart/cartApi';
import {
  DEFAULT_OFFER_SORT,
  LOW_STOCK_AT,
  bestPriceOfferIds,
  isBuyable,
  nextSort,
  sortOffers,
  type OfferSort,
  type OfferSortKey,
} from './offers';

interface OfferTableProps {
  productName: string;
  regionName: string;
  offers: Offer[];
}

const COLUMNS: { key: OfferSortKey; label: string }[] = [
  { key: 'seller', label: 'Seller' },
  { key: 'rating', label: 'Rating' },
  { key: 'stock', label: 'Stock' },
  { key: 'price', label: 'Price' },
];

function StockText({ stock }: { stock: number }) {
  if (stock <= 0)
    return <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>Out of stock</Typography>;
  if (stock <= LOW_STOCK_AT)
    return (
      <Typography sx={{ fontWeight: 700, color: tokens.color.yellow }}>
        Only {stock} left
      </Typography>
    );
  return <Typography>In stock ({stock})</Typography>;
}

/** The add-to-cart button of one row. Signed-out visitors are sent to sign in and come back to this page. */
function AddToCart({ offer, sellerName }: { offer: Offer; sellerName: string }) {
  const signedIn = useAppSelector((state) => state.auth.status === 'authenticated');
  const navigate = useNavigate();
  const location = useLocation();
  const [add, { isLoading, error, reset }] = useAddToCartMutation();
  const cart = useGetCartQuery(undefined, { skip: !signedIn });
  const inCart = cart.data?.lines.find((line) => line.offerId === offer.id)?.qty ?? 0;

  if (!isBuyable(offer)) {
    return (
      <Button variant="outlined" disabled aria-label={`${sellerName}: out of stock`}>
        Unavailable
      </Button>
    );
  }

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: { sm: 'flex-end' } }}
    >
      <Button
        variant="contained"
        disabled={isLoading}
        aria-label={`Add ${sellerName}'s offer to cart`}
        onClick={() => {
          if (!signedIn) {
            navigate(loginUrl(location.pathname + location.search));
            return;
          }
          reset();
          void add({ offerId: offer.id });
        }}
      >
        {isLoading ? 'Adding…' : 'Add to cart'}
      </Button>
      {inCart > 0 && (
        <Typography variant="caption" sx={{ color: tokens.color.green, fontWeight: 700 }}>
          In your cart: {inCart}
        </Typography>
      )}
      {error !== undefined && (
        <Typography role="alert" variant="caption" color="error">
          {describeError(error)}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Every seller's offer for one game. Accessible table: a caption, column headers (`th scope="col"`), the seller as the row
 * header, and sortable columns whose header carries `aria-sort`. "Best price" is text and a border, never colour alone.
 */
export function OfferTable({ productName, regionName, offers }: OfferTableProps) {
  const [sort, setSort] = useState<OfferSort>(DEFAULT_OFFER_SORT);
  const rows = sortOffers(offers, sort);
  const best = bestPriceOfferIds(offers);

  return (
    <>
      <TableContainer>
        <Table sx={{ minWidth: 640, '& td, & th': { borderColor: 'divider' } }}>
          <Box component="caption" sx={visuallyHidden}>
            Offers for {productName}. {offers.length} {offers.length === 1 ? 'seller' : 'sellers'}.
            Use the column buttons to sort.
          </Box>
          <TableHead>
            <TableRow>
              {COLUMNS.slice(0, 1).map((column) => (
                <SortableHeader key={column.key} column={column} sort={sort} onSort={setSort} />
              ))}
              <TableCell scope="col">Region</TableCell>
              {COLUMNS.slice(1).map((column) => (
                <SortableHeader key={column.key} column={column} sort={sort} onSort={setSort} />
              ))}
              <TableCell scope="col" align="right">
                <Box component="span" sx={visuallyHidden}>
                  Buy
                </Box>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((offer) => {
              const isBest = best.has(offer.id);
              return (
                <TableRow
                  key={offer.id}
                  data-best={isBest || undefined}
                  sx={{
                    opacity: isBuyable(offer) ? 1 : 0.6,
                    '& > *': isBest ? { bgcolor: tokens.color.surfaceInset } : undefined,
                    '& > th': isBest
                      ? { borderLeft: `4px solid ${tokens.color.yellow}` }
                      : undefined,
                  }}
                >
                  <TableCell component="th" scope="row" sx={{ fontWeight: 700 }}>
                    {offer.seller.name}
                    {isBest && (
                      <Chip
                        label="Best price"
                        size="small"
                        color="primary"
                        sx={{ ml: 1, height: 22 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>{regionName}</TableCell>
                  <TableCell>
                    <Box
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                      aria-label={`Rated ${offer.seller.rating.toFixed(1)} out of 5`}
                      role="img"
                    >
                      <StarIcon fontSize="small" sx={{ color: tokens.color.yellow }} aria-hidden />
                      {offer.seller.rating.toFixed(1)}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <StockText stock={offer.stock} />
                  </TableCell>
                  <TableCell>
                    {offer.originalPriceCents !== undefined && (
                      <Typography
                        variant="caption"
                        component="div"
                        sx={{ textDecoration: 'line-through', color: 'text.secondary' }}
                      >
                        {formatMoney(offer.originalPriceCents)}
                      </Typography>
                    )}
                    <Typography sx={{ fontWeight: 800, fontSize: '1.125rem' }}>
                      {formatMoney(offer.priceCents)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <AddToCart offer={offer} sellerName={offer.seller.name} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {offers.length === 1 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Only one seller has this game right now, so there is no price to compare.
        </Alert>
      )}
    </>
  );
}

function SortableHeader({
  column,
  sort,
  onSort,
}: {
  column: { key: OfferSortKey; label: string };
  sort: OfferSort;
  onSort: (sort: OfferSort) => void;
}) {
  const active = sort.key === column.key;
  return (
    <TableCell
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <TableSortLabel
        active={active}
        direction={active ? sort.direction : 'asc'}
        onClick={() => onSort(nextSort(sort, column.key))}
      >
        {column.label}
      </TableSortLabel>
    </TableCell>
  );
}
