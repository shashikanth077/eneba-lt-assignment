import type { ProductCard as ProductCardData } from '../../../../types/api.types';

export interface ProductCardProps {
  /** Catalogue and search items fit; deals add the crossed-out price. */
  product: ProductCardData & { originalPriceCents?: number };
}
