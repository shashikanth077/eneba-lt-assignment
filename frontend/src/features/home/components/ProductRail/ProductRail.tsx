import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../../../app/hooks';
import { Skeleton } from '../../../../components/common';
import { ErrorMessage } from '../../../../components/feedback/ErrorMessage';
import { ProductCard } from '../../../products/components/ProductCard';
import { blockQueryPath, parseProducts } from '../../blocks';
import type { BlockProps } from '../../homeTypes';
import { fetchHomeBlockRequest, selectHomeBlock } from '../../homeSlice';
import styles from './ProductRail.module.scss';

export function RailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading games">
      <Skeleton className={styles.skeletonTitle} />
      <div className={styles.skeletonRow}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={styles.item}>
            <Skeleton className={styles.skeletonCard} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Renderer for blocks of type "carousel": a titled, horizontally scrolling row of games (best sellers, deals, new releases...). */
export function ProductRail({ block }: BlockProps) {
  const dispatch = useAppDispatch();
  const path = blockQueryPath(block.endpoint);
  useEffect(() => {
    if (path !== null) dispatch(fetchHomeBlockRequest(path));
  }, [dispatch, path]);
  const entry = useAppSelector(selectHomeBlock(path ?? ''));

  if (path === null)
    return <ErrorMessage title={`${block.title} is misconfigured`} minHeight={160} />;
  if (entry?.data === undefined) {
    return entry?.status === 'failed' ? (
      <ErrorMessage
        error={entry.error}
        title={`We could not load ${block.title.toLowerCase()}`}
        minHeight={160}
        onRetry={() => dispatch(fetchHomeBlockRequest(path, { force: true }))}
      />
    ) : (
      <RailSkeleton />
    );
  }
  const products = parseProducts(entry.data);
  if (products.length === 0) return null; // a section with nothing in it (no deals today) disappears instead of showing an empty heading
  return <Rail title={block.title} products={products} />;
}

function Rail({ title, products }: { title: string; products: ReturnType<typeof parseProducts> }) {
  const headingId = useId();
  const rail = useRef<HTMLUListElement>(null);
  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy?.({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: 'smooth',
    });

  return (
    <section aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.scrollers}>
          <button
            type="button"
            className={styles.scroll}
            aria-label={`Scroll ${title} left`}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft aria-hidden />
          </button>
          <button
            type="button"
            className={styles.scroll}
            aria-label={`Scroll ${title} right`}
            onClick={() => scroll(1)}
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
      <ul ref={rail} className={styles.rail}>
        {products.map((product) => (
          <li key={product.id} className={styles.item}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
