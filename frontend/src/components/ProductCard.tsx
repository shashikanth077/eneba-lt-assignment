import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import type { HomeProduct } from '../api/types';
import { formatMoney } from '../lib/money';
import { tokens } from '../theme/theme';

const COVER_RATIO = '267 / 337'; // measured card cover, DESIGN_TOKENS.md section 3

/**
 * The product tile used by every list of games (homepage rails, store grid, search results). Anatomy from DESIGN_TOKENS.md section 6:
 * cover, platform strip, then title, region label and price. The reference also shows a cashback badge and line; this shop has no
 * cashback, so they are left out rather than faked.
 */
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
        sx={{ width: '100%', aspectRatio: COVER_RATIO, objectFit: 'cover', display: 'block' }}
      />
      <Typography
        component="div"
        sx={{
          bgcolor: tokens.color.footer,
          height: 27,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'text.secondary',
        }}
      >
        {platform.name}
      </Typography>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}>
        <Typography
          title={name}
          sx={{
            fontWeight: 700,
            fontSize: '0.875rem',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </Typography>
        <Typography
          variant="caption"
          sx={{ fontWeight: 700, textTransform: 'uppercase', color: tokens.color.regionTeal }}
        >
          {region.name}
        </Typography>
        <Box sx={{ mt: 'auto', pt: 1 }}>
          {!inStock || fromPriceCents === null ? (
            <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>Out of stock</Typography>
          ) : (
            <>
              <Typography variant="caption" component="div" sx={{ fontWeight: 600, minHeight: 20 }}>
                From
                {originalPriceCents !== undefined && (
                  <Box
                    component="span"
                    sx={{ textDecoration: 'line-through', color: 'text.secondary', ml: 0.75 }}
                  >
                    {formatMoney(originalPriceCents)}
                  </Box>
                )}
                {discountPct !== undefined && (
                  <Box
                    component="span"
                    sx={{ color: tokens.color.green, fontWeight: 800, ml: 0.75 }}
                  >
                    -{discountPct}%
                  </Box>
                )}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.375rem', lineHeight: 1.2 }}>
                {formatMoney(fromPriceCents)}
              </Typography>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
