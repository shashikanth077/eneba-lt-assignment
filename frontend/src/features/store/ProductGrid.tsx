import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import type { ProductCard as ProductCardData } from '../../api/types';
import { ProductCard } from '../../components/ProductCard';
import { tokens } from '../../theme/theme';

// 2 columns on a phone, 4 from the point where the sidebar is docked (card width 267 + gap 24, DESIGN_TOKENS.md).
const columns = {
  xs: 'repeat(2, minmax(0, 1fr))',
  sm: 'repeat(3, minmax(0, 1fr))',
  md: 'repeat(4, minmax(0, 1fr))',
  lg: 'repeat(4, minmax(0, 1fr))', // 1440px container: (1440 - 48 - 264 - 24) / 4 = 276, about the measured 267
};

const gridSx = {
  display: 'grid',
  gridTemplateColumns: columns,
  gap: { xs: 1.5, md: 3 },
  p: 0,
  m: 0,
  listStyle: 'none',
};

export function ProductGrid({ items, busy }: { items: ProductCardData[]; busy: boolean }) {
  return (
    <Box
      component="ul"
      aria-label="Games"
      aria-busy={busy}
      sx={{ ...gridSx, opacity: busy ? 0.55 : 1, transition: 'opacity 120ms' }}
    >
      {items.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </Box>
  );
}

export function ProductGridSkeleton() {
  return (
    <Box role="status" aria-label="Loading games" sx={gridSx}>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton
          key={index}
          variant="rectangular"
          sx={{ aspectRatio: '267 / 440', height: 'auto', bgcolor: tokens.color.card }}
        />
      ))}
    </Box>
  );
}
