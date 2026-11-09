import Box from '@mui/material/Box';
import { QueryBoundary } from '../../components/state/QueryBoundary';
import { BlockBoundary } from './BlockBoundary';
import { BannerSkeleton } from './BannerCarousel';
import { HomeBlocks, HomeEmpty } from './HomeBlocks';
import { RailSkeleton } from './ProductRail';
import { parseLayout } from './blocks';
import { useGetHomeLayoutQuery } from './homeApi';

/** Visually hidden but read by screen readers: every page needs one h1. */
const visuallyHidden = {
  position: 'absolute',
  width: '1px', // strings on purpose: in MUI's sx a bare number <= 1 means a percentage, so `width: 1` would be 100%
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * The homepage is not written here, it is assembled: ask the server which blocks to show (GET /api/home/layout), then let a renderer
 * per block type fetch and draw each one. Switching a block off or moving it in the database changes this page with no frontend change.
 */
export function HomePage() {
  // always re-ask when the page is opened: the layout is cheap, and a change in the database should show on the next visit
  const layout = useGetHomeLayoutQuery(undefined, { refetchOnMountOrArgChange: true });

  return (
    <>
      <Box component="h1" sx={visuallyHidden}>
        KEYMART
      </Box>
      {/* a layout response nobody expected must show an error inside the page, not replace the whole app */}
      <BlockBoundary title="The homepage">
        <QueryBoundary
          query={layout}
          loading={<HomeSkeleton />}
          errorTitle="We could not load the homepage"
          isEmpty={(data) => parseLayout(data).length === 0}
          empty={<HomeEmpty />}
        >
          {(data) => <HomeBlocks blocks={parseLayout(data)} />}
        </QueryBoundary>
      </BlockBoundary>
    </>
  );
}

/** Shown while we do not yet know which blocks there are: the shapes every homepage has (a banner, then a row of games). */
function HomeSkeleton() {
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: { xs: 4, md: 6 } }}
      aria-busy="true"
    >
      <BannerSkeleton />
      <RailSkeleton />
    </Box>
  );
}
