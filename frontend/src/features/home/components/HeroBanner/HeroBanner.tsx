import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Button, Skeleton } from '../../../../components/common';
import { ErrorMessage } from '../../../../components/feedback/ErrorMessage';
import { useMediaQuery } from '../../../../hooks/useMediaQuery';
import type { BannerItem } from '../../../../types/api.types';
import { autoplayMsOf, blockQueryPath, parseBanners } from '../../blocks';
import type { BlockProps } from '../../homeTypes';
import { fetchHomeBlockRequest, selectHomeBlock } from '../../homeSlice';
import styles from './HeroBanner.module.scss';

export function BannerSkeleton() {
  return (
    <div role="status" aria-label="Loading banners">
      <Skeleton className={styles.skeleton} />
    </div>
  );
}

/** Renderer for blocks of type "hero": the banners table as a carousel. Own data, own skeleton, own error state. */
export function BannerCarousel({ block }: BlockProps) {
  const dispatch = useAppDispatch();
  const path = blockQueryPath(block.endpoint);
  useEffect(() => {
    if (path !== null) dispatch(fetchHomeBlockRequest(path));
  }, [dispatch, path]);
  const entry = useAppSelector(selectHomeBlock(path ?? ''));

  if (path === null)
    return <ErrorMessage title={`${block.title} is misconfigured`} minHeight={220} />;
  if (entry?.data === undefined) {
    return entry?.status === 'failed' ? (
      <ErrorMessage
        error={entry.error}
        title={`We could not load ${block.title.toLowerCase()}`}
        minHeight={220}
        onRetry={() => dispatch(fetchHomeBlockRequest(path, { force: true }))}
      />
    ) : (
      <BannerSkeleton />
    );
  }
  // A payload of the wrong shape throws here and is caught by this block's own error boundary (see HomeBlocks).
  const banners = parseBanners(entry.data);
  if (banners.length === 0) return null; // a hero with no banners disappears instead of showing an empty frame
  return <Slides label={block.title} banners={banners} autoplayMs={autoplayMsOf(block.config)} />;
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
  const [hoverPaused, setHoverPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const count = banners.length;
  const current = banners[Math.min(index, count - 1)];
  const autoplaying =
    autoplayMs !== null && !hoverPaused && !userPaused && !reducedMotion && count > 1;

  useEffect(() => {
    if (!autoplaying || autoplayMs === null) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), autoplayMs);
    return () => clearInterval(timer);
  }, [autoplaying, autoplayMs, count]);

  const go = (next: number) => setIndex((next + count) % count);

  return (
    <section
      className={styles.hero}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      <div key={current.id} className={styles.slide} aria-live={autoplaying ? 'off' : 'polite'}>
        <img src={current.imageUrl} alt="" className={styles.image} />
        <div className={styles.shade} />
        <div className={styles.content}>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.subtitle}>{current.subtitle}</p>
          {current.href && current.ctaLabel && (
            <div>
              <Button to={current.href} variant="secondary" size="lg">
                {current.ctaLabel}
              </Button>
            </div>
          )}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.prev}`}
            aria-label="Previous banner"
            onClick={() => go(index - 1)}
          >
            <ChevronLeft aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            aria-label="Next banner"
            onClick={() => go(index + 1)}
          >
            <ChevronRight aria-hidden />
          </button>
          <div className={styles.controls}>
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                className={styles.dot}
                aria-label={`Show banner ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
            {autoplayMs !== null && !reducedMotion && (
              <button
                type="button"
                className={styles.playPause}
                aria-label={userPaused ? 'Play banner rotation' : 'Pause banner rotation'}
                onClick={() => setUserPaused((paused) => !paused)}
              >
                {userPaused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
