import { Link } from 'react-router-dom';
import { PriceDisplay } from '../../../../components/common';
import { classNames } from '../../../../utils/classNames';
import type { ProductCardProps } from './ProductCard.types';
import styles from './ProductCard.module.scss';

/** The tile every list of games uses (homepage rails, store grid, search results). Pure view: no store, no requests. */
export function ProductCard({ product }: ProductCardProps) {
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
    <Link to={`/product/${slug}`} className={styles.card}>
      <span className={styles.media}>
        <img src={coverUrl} alt="" loading="lazy" className={styles.cover} />
        <span className={styles.strip}>{platform.name}</span>
      </span>
      <span className={styles.body}>
        <span className={styles.title} title={name}>
          {name}
        </span>
        <span className={classNames(styles.region, region.slug === 'global' && styles.global)}>
          {region.name}
        </span>
        <span className={styles.price}>
          {!inStock || fromPriceCents === null ? (
            <span className={styles.soldOut}>Out of stock</span>
          ) : (
            <PriceDisplay
              from
              cents={fromPriceCents}
              originalCents={originalPriceCents}
              discountPct={discountPct}
            />
          )}
        </span>
      </span>
    </Link>
  );
}
