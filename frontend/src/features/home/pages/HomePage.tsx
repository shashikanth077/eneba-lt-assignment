import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { BlockBoundary } from '../BlockBoundary';
import { BannerSkeleton } from '../components/HeroBanner';
import { HomeBlocks, HomeEmpty } from '../components/HomeBlocks';
import { RailSkeleton } from '../components/ProductRail';
import { parseLayout } from '../blocks';
import { LAYOUT_KEY, fetchHomeLayoutRequest, selectHomeLayout } from '../homeSlice';
import styles from './HomePage.module.scss';

/** Shown while we do not yet know which blocks there are: the shapes every homepage has (a banner, then a row of games). */
function HomeSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <BannerSkeleton />
      <RailSkeleton />
    </div>
  );
}

function Layout() {
  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectHomeLayout);

  useEffect(() => {
    // always re-ask when the page is opened: the layout is cheap, and a change in the database should show on the next visit
    dispatch(fetchHomeLayoutRequest(LAYOUT_KEY, { force: true }));
  }, [dispatch]);

  if (entry?.data === undefined) {
    return entry?.status === 'failed' ? (
      <ErrorMessage
        error={entry.error}
        title="We could not load the homepage"
        onRetry={() => dispatch(fetchHomeLayoutRequest(LAYOUT_KEY, { force: true }))}
      />
    ) : (
      <HomeSkeleton />
    );
  }
  const blocks = parseLayout(entry.data); // throws on a body nobody expected: caught by the boundary below, inside the page
  return blocks.length === 0 ? <HomeEmpty /> : <HomeBlocks blocks={blocks} />;
}

/**
 * The homepage is not written here, it is assembled: ask the server which blocks to show (GET /api/home/layout), then let a renderer
 * per block type fetch and draw each one. Switching a block off or moving it in the database changes this page with no frontend change.
 */
export function HomePage() {
  return (
    <>
      <h1 className={styles.title}>KEYMART</h1>
      <BlockBoundary title="The homepage">
        <Layout />
      </BlockBoundary>
    </>
  );
}
