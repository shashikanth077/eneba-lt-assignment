import { Skeleton } from '../../../../components/common';
import type { ProductCard as ProductCardData } from '../../../../types/api.types';
import { classNames } from '../../../../utils/classNames';
import { ProductCard } from '../ProductCard';
import styles from './ProductGrid.module.scss';

export function ProductGrid({ items, busy = false }: { items: ProductCardData[]; busy?: boolean }) {
  return (
    <ul
      className={classNames(styles.grid, busy && styles.busy)}
      aria-label="Games"
      aria-busy={busy}
    >
      {items.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder tiles while the first page loads. The container carries the label; the tiles are decoration. */
export function ProductGridSkeleton() {
  return (
    <div className={styles.grid} role="status" aria-label="Loading games">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className={styles.skeleton} />
      ))}
    </div>
  );
}
