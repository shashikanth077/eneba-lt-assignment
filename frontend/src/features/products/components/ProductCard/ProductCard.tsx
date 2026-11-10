import { Link } from 'react-router-dom';
import { PriceDisplay } from '../../../../components/common';
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
      <img src={coverUrl} alt="" loading="lazy" className={styles.cover} />
      <span className={styles.strip}>{platform.name}</span>
      <span className={styles.body}>
        <span className={styles.title} title={name}>
          {name}
        </span>
        <span className={styles.region}>{region.name}</span>
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
