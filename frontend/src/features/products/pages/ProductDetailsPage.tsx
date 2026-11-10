import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Button, Skeleton } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import type { ProductResponse } from '../../../types/api.types';
import { classNames } from '../../../utils/classNames';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { BuyBox } from '../components/BuyBox';
import { OfferTable } from '../components/OfferTable';
import { isBuyable } from '../offers';
import { selectProductEntry } from '../productsSelectors';
import { recordViewed } from '../../home/recentlyViewed';
import { fetchProductRequest } from '../productsSlice';
import styles from './ProductDetailsPage.module.scss';

function ProductSkeleton() {
  return (
    <div className={styles.top} role="status" aria-label="Loading game">
      <Skeleton className={styles.skeletonCover} />
      <div className={styles.info}>
        <Skeleton style={{ height: 48, width: '60%' }} />
        <Skeleton style={{ height: 24, width: '30%' }} />
        <Skeleton style={{ height: 120 }} />
      </div>
    </div>
  );
}

function ProductDetails({ data }: { data: ProductResponse }) {
  const { product, offers } = data;
  useEffect(() => recordViewed(product.slug), [product.slug]); // feeds the homepage's "Recently viewed"
  const buyable = offers.filter(isBuyable);
  const cheapest =
    buyable.length > 0
      ? buyable.reduce((best, offer) => (offer.priceCents < best.priceCents ? offer : best))
      : null;

  return (
    <div className={styles.page}>
      <Breadcrumbs
        crumbs={[
          { label: 'Store', to: '/store' },
          {
            label: product.platform.name,
            to: `/store?platform=${encodeURIComponent(product.platform.slug)}`,
          },
          { label: product.name },
        ]}
      />
      <div className={styles.top}>
        <img src={product.coverUrl} alt={`Cover of ${product.name}`} className={styles.cover} />
        <div className={styles.info}>
          <h1 className={styles.title}>{product.name}</h1>
          <div className={styles.badges} role="group" aria-label="Platform and region">
            <span className={classNames(styles.badge, styles.platform)}>
              {product.platform.name}
            </span>
            <span className={classNames(styles.badge, styles.region)}>{product.region.name}</span>
            {product.genres.map((genre) => (
              <span key={genre} className={classNames(styles.badge, styles.genre)}>
                {genre}
              </span>
            ))}
          </div>
          <p className={styles.meta}>
            {product.publisher} · Released {product.releaseDate}
          </p>
          <p>{product.description}</p>
        </div>
        <BuyBox cheapest={cheapest} offerCount={buyable.length} productSlug={product.slug} />
      </div>

      <section aria-labelledby="offers-heading">
        <h2 id="offers-heading" className={styles.offersTitle}>
          Offers
        </h2>
        {offers.length === 0 ? (
          <EmptyState
            minHeight={160}
            title="No seller has keys for this game right now"
            description="Check back later, or look at other games."
            action={<Button to="/store">Browse the store</Button>}
          />
        ) : (
          <OfferTable
            productSlug={product.slug}
            productName={product.name}
            regionName={product.region.name}
            offers={offers}
          />
        )}
      </section>
    </div>
  );
}

export function ProductDetailsPage() {
  const { slug = '' } = useParams();
  const dispatch = useAppDispatch();
  const entry = useAppSelector(selectProductEntry(slug));

  useEffect(() => {
    dispatch(fetchProductRequest(slug));
  }, [dispatch, slug]);

  if (entry?.data) return <ProductDetails data={entry.data} />;
  if (entry?.status === 'failed') {
    return entry.error?.status === 404 ? (
      <EmptyState
        title="We could not find that game"
        description="It may have been removed, or the link is wrong."
        action={<Button to="/store">Browse the store</Button>}
      />
    ) : (
      <ErrorMessage
        error={entry.error}
        title="We could not load this game"
        onRetry={() => dispatch(fetchProductRequest(slug, { force: true }))}
      />
    );
  }
  return <ProductSkeleton />;
}
