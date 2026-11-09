import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { skipToken } from '@reduxjs/toolkit/query';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type { BannerItem } from '../../api/types';
import { ErrorState } from '../../components/state/ErrorState';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { tokens } from '../../theme/theme';
import { autoplayMsOf, blockQueryPath, parseBanners } from './blocks';
import { useGetHomeBlockQuery } from './homeApi';
import type { BlockProps } from './types';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const HEIGHT = { xs: 220, sm: 280, md: 340, lg: tokens.layout.heroHeight };

export function BannerSkeleton() {
  return (
    <Skeleton
      variant="rectangular"
      animation="wave"
      sx={{ height: HEIGHT, width: '100%' }}
      aria-label="Loading banners"
    />
  );
}

/** Renderer for blocks of type "hero": the banners table as a carousel. Own data, own skeleton, own error state. */
export function BannerCarousel({ block }: BlockProps) {
  const path = blockQueryPath(block.endpoint);
  const query = useGetHomeBlockQuery(path ?? skipToken);

  if (path === null)
    return <ErrorState title={`${block.title} is misconfigured`} minHeight={HEIGHT.xs} />;

  return (
    <QueryBoundary
      query={query}
      loading={<BannerSkeleton />}
      errorTitle={`We could not load ${block.title.toLowerCase()}`}
      errorMinHeight={HEIGHT.xs}
      isEmpty={(data) => parseBanners(data).length === 0}
      empty={null}
    >
      {(data) => (
        <Slides
          label={block.title}
          banners={parseBanners(data)}
          autoplayMs={autoplayMsOf(block.config)}
        />
      )}
    </QueryBoundary>
  );
}

function Slides({
  label,
  banners,
  autoplayMs,
}: {
  label: string;
  banners: BannerItem[];
  autoplayMs: number | null;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const count = banners.length;
  const current = banners[Math.min(index, count - 1)];
  const autoplaying = autoplayMs !== null && !paused && !reducedMotion && count > 1;

  useEffect(() => {
    if (!autoplaying || autoplayMs === null) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoplayMs);
    return () => clearInterval(timer);
  }, [autoplaying, autoplayMs, count]);

  const go = (next: number) => setIndex((next + count) % count);

  return (
    <Box
      component="section"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      sx={{
        position: 'relative',
        height: HEIGHT,
        overflow: 'hidden',
        bgcolor: tokens.color.surface,
      }}
    >
      <Box
        key={current.id}
        aria-live={autoplaying ? 'off' : 'polite'}
        sx={{
          position: 'absolute',
          inset: 0,
          animation: reducedMotion ? 'none' : `${fadeIn} 400ms ease`,
        }}
      >
        <Box
          component="img"
          src={current.imageUrl}
          alt=""
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)',
          }}
        />
        <Box
          sx={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 1.5,
            px: { xs: 2, sm: 8 },
            maxWidth: { xs: '100%', md: '60%' },
          }}
        >
          <Typography
            variant="h2"
            component="h2"
            sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.75rem' }, lineHeight: 1.1 }}
          >
            {current.title}
          </Typography>
          <Typography
            sx={{ fontSize: { xs: '0.875rem', md: '1.25rem' }, fontWeight: 600, opacity: 0.9 }}
          >
            {current.subtitle}
          </Typography>
          {current.href && current.ctaLabel && (
            <Box>
              <Button
                component={RouterLink}
                to={current.href}
                variant="contained"
                color="secondary"
                size="large"
              >
                {current.ctaLabel}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {count > 1 && (
        <>
          <IconButton aria-label="Previous banner" onClick={() => go(index - 1)} sx={arrow('left')}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton aria-label="Next banner" onClick={() => go(index + 1)} sx={arrow('right')}>
            <ChevronRightIcon />
          </IconButton>
          <Box
            sx={{
              position: 'absolute',
              bottom: 12,
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            {banners.map((banner, i) => (
              <Box
                key={banner.id}
                component="button"
                type="button"
                aria-label={`Show banner ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
                sx={{
                  width: 10,
                  height: 10,
                  p: 0,
                  borderRadius: '50%',
                  border: 0,
                  cursor: 'pointer',
                  bgcolor: i === index ? tokens.color.yellow : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

const arrow = (side: 'left' | 'right') => ({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  [side]: 8,
  bgcolor: 'rgba(0,0,0,0.45)',
  color: '#fff',
  display: { xs: 'none', sm: 'inline-flex' },
  '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
});
