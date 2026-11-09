import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { skipToken } from '@reduxjs/toolkit/query';
import { useId, useRef } from 'react';
import { ProductCard } from '../../components/ProductCard';
import { ErrorState } from '../../components/state/ErrorState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { blockQueryPath, parseProducts } from './blocks';
import { useGetHomeBlockQuery } from './homeApi';
import type { BlockProps } from './types';

const CARD_WIDTH = { xs: 150, sm: 180, md: 210, lg: 230 };

export function RailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Box aria-label="Loading games" role="status">
      <Skeleton variant="text" width={220} sx={{ fontSize: '2rem', mb: 1 }} />
      <Box sx={{ display: 'flex', gap: 2, overflow: 'hidden' }}>
        {Array.from({ length: count }, (_, i) => (
          <Box key={i} sx={{ flex: '0 0 auto', width: CARD_WIDTH }}>
            <Skeleton
              variant="rectangular"
              animation="wave"
              sx={{ aspectRatio: '3 / 4', width: '100%', height: 'auto' }}
            />
            <Skeleton variant="text" sx={{ mt: 1 }} />
            <Skeleton variant="text" width="60%" />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Renderer for blocks of type "carousel": a titled, horizontally scrolling row of games (best sellers, deals, new releases...). */
export function ProductRail({ block }: BlockProps) {
  const path = blockQueryPath(block.endpoint);
  const query = useGetHomeBlockQuery(path ?? skipToken);

  if (path === null)
    return <ErrorState title={`${block.title} is misconfigured`} minHeight={160} />;

  return (
    <QueryBoundary
      query={query}
      loading={<RailSkeleton />}
      errorTitle={`We could not load ${block.title.toLowerCase()}`}
      errorMinHeight={160}
      isEmpty={(data) => parseProducts(data).length === 0}
      empty={null} // a section with nothing in it (no deals today) disappears instead of showing an empty heading
    >
      {(data) => <Rail title={block.title} products={parseProducts(data)} />}
    </QueryBoundary>
  );
}

function Rail({ title, products }: { title: string; products: ReturnType<typeof parseProducts> }) {
  const headingId = useId();
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy?.({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: 'smooth',
    });

  return (
    <Box component="section" aria-labelledby={headingId}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography
          id={headingId}
          variant="h2"
          component="h2"
          sx={{ fontSize: { xs: '1.375rem', md: '1.75rem' } }}
        >
          {title}
        </Typography>
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
          <IconButton aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>
      <Box
        ref={rail}
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          pb: 1,
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          scrollbarWidth: 'thin',
        }}
      >
        {products.map((product) => (
          <Box
            component="li"
            key={product.id}
            sx={{ flex: '0 0 auto', width: CARD_WIDTH, scrollSnapAlign: 'start' }}
          >
            <ProductCard product={product} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
