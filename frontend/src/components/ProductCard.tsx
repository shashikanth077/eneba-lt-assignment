import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import type { HomeProduct } from '../api/types';
import { formatMoney } from '../lib/money';
import { tokens } from '../theme/theme';

/** The product tile used by every list of games (homepage rails now; the store grid and search results next). */
export function ProductCard({ product }: { product: HomeProduct }) {
  const {
    slug,
    name,
    coverUrl,
    platform,
    region,
    fromPriceCents,
    discountPct,
    originalPriceCents,
    inStock,
  } = product;

  return (
    <Box
      component={RouterLink}
      to={`/product/${slug}`}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: tokens.color.card,
        border: '1px solid #3c2198',
        color: 'text.primary',
        textDecoration: 'none',
        '&:hover, &:focus-visible': { borderColor: tokens.color.yellow },
      }}
    >
      <Box
        component="img"
        src={coverUrl}
        alt=""
        loading="lazy"
        sx={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }}
      />
      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.875rem',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            minHeight: '2.6em',
          }}
        >
          {name}
        </Typography>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, textTransform: 'uppercase', color: tokens.color.regionTeal }}
        >
          {platform.name} · {region.name}
        </Typography>
        <Box sx={{ mt: 'auto', pt: 1 }}>
          {!inStock || fromPriceCents === null ? (
            <Chip size="small" label="Out of stock" />
          ) : (
            <>
              {discountPct !== undefined && originalPriceCents !== undefined && (
                <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
                  <Box
                    component="span"
                    sx={{ textDecoration: 'line-through', color: 'text.secondary' }}
                  >
                    {formatMoney(originalPriceCents)}
                  </Box>{' '}
                  <Box component="span" sx={{ color: tokens.color.green, fontWeight: 800 }}>
                    -{discountPct}%
                  </Box>
                </Typography>
              )}
              <Typography sx={{ fontWeight: 800, fontSize: '1.125rem' }}>
                {discountPct !== undefined && originalPriceCents === undefined && (
                  <Box
                    component="span"
                    sx={{ color: tokens.color.green, fontSize: '0.75rem', mr: 0.75 }}
                  >
                    -{discountPct}%
                  </Box>
                )}
                {formatMoney(fromPriceCents)}
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
