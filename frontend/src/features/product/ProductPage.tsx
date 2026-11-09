import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useParams } from 'react-router-dom';
import type { ProductResponse } from '../../api/types';
import { getStatus } from '../../api/errors';
import { EmptyState } from '../../components/state/EmptyState';
import { ErrorState } from '../../components/state/ErrorState';
import { formatMoney } from '../../lib/money';
import { tokens } from '../../theme/theme';
import { OfferTable } from './OfferTable';
import { useGetProductQuery } from './productApi';

const COVER_RATIO = '267 / 337';

function ProductSkeleton() {
  return (
    <Box
      role="status"
      aria-label="Loading game"
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
      }}
    >
      <Skeleton variant="rectangular" sx={{ aspectRatio: COVER_RATIO, height: 'auto' }} />
      <Stack spacing={2}>
        <Skeleton variant="text" height={48} width="60%" />
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="rectangular" height={120} />
      </Stack>
    </Box>
  );
}

function ProductDetails({ data }: { data: ProductResponse }) {
  const { product, offers } = data;
  const cheapest = offers.filter((offer) => offer.stock > 0).map((offer) => offer.priceCents);
  const from = cheapest.length > 0 ? Math.min(...cheapest) : null;

  return (
    <Stack spacing={5}>
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 3, md: 4 },
          gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <Box
          component="img"
          src={product.coverUrl}
          alt={`Cover of ${product.name}`}
          sx={{
            width: '100%',
            maxWidth: { xs: 320, md: 'none' },
            aspectRatio: COVER_RATIO,
            objectFit: 'cover',
            border: '1px solid #3c2198',
          }}
        />
        <Stack spacing={2}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
            {product.name}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', gap: 1 }}
            aria-label="Platform and region"
          >
            <Chip label={product.platform.name} color="primary" />
            <Chip
              label={product.region.name}
              sx={{ bgcolor: tokens.color.regionTeal, color: '#000' }}
            />
            {product.genres.map((genre) => (
              <Chip key={genre} label={genre} variant="outlined" />
            ))}
          </Stack>
          <Typography color="text.secondary">
            {product.publisher} · Released {product.releaseDate}
          </Typography>
          <Typography>{product.description}</Typography>
          <Box>
            {from === null ? (
              <Typography sx={{ fontWeight: 800, fontSize: '1.375rem', color: 'text.secondary' }}>
                Out of stock
              </Typography>
            ) : (
              <>
                <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
                  From
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '1.75rem', lineHeight: 1.2 }}>
                  {formatMoney(from)}
                </Typography>
              </>
            )}
          </Box>
        </Stack>
      </Box>

      <Box component="section" aria-labelledby="offers-heading">
        <Typography id="offers-heading" variant="h2" sx={{ fontSize: '1.5rem', mb: 2 }}>
          Offers
        </Typography>
        {offers.length === 0 ? (
          <EmptyState
            minHeight={160}
            title="No seller has keys for this game right now"
            description="Check back later, or look at other games."
            action={
              <Button component={RouterLink} to="/store" variant="contained">
                Browse the store
              </Button>
            }
          />
        ) : (
          <OfferTable productName={product.name} regionName={product.region.name} offers={offers} />
        )}
      </Box>
    </Stack>
  );
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const query = useGetProductQuery(slug);

  if (query.data) return <ProductDetails data={query.data} />;
  if (query.isError) {
    return getStatus(query.error) === 404 ? (
      <EmptyState
        title="We could not find that game"
        description="It may have been removed, or the link is wrong."
        action={
          <Button component={RouterLink} to="/store" variant="contained">
            Browse the store
          </Button>
        }
      />
    ) : (
      <ErrorState
        error={query.error}
        title="We could not load this game"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <ProductSkeleton />;
}
