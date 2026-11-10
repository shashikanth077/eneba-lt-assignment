import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { fetchProductsRequest } from '../../products/productsSlice';
import { selectProductsEntry } from '../../products/productsSelectors';
import { loadRecentSlugs } from '../recentlyViewed';
import type { BlockProps } from '../homeTypes';
import { parseProducts } from '../blocks';
import { Rail } from './ProductRail/ProductRail';

/**
 * Renderer for blocks of type "recent": the games this visitor opened, newest first. The history lives in the browser; the cards come
 * from GET /api/products?slug[]=... so they are as fresh as any other list. With no history the section is not shown.
 */
export function RecentlyViewed({ block }: BlockProps) {
  const dispatch = useAppDispatch();
  const limit = typeof block.config?.limit === 'number' ? block.config.limit : 6;
  const slugs = useMemo(() => loadRecentSlugs().slice(0, limit), [limit]);
  const query = useMemo(
    () =>
      new URLSearchParams([
        ...slugs.map((s) => ['slug[]', s]),
        ['pageSize', String(limit)],
      ]).toString(),
    [slugs, limit],
  );

  useEffect(() => {
    if (slugs.length > 0) dispatch(fetchProductsRequest(query));
  }, [dispatch, query, slugs.length]);
  const entry = useAppSelector(selectProductsEntry(query));

  if (slugs.length === 0 || entry?.data === undefined) return null;
  const byslug = new Map(parseProducts(entry.data).map((p) => [p.slug, p]));
  const products = slugs.flatMap((slug) => (byslug.has(slug) ? [byslug.get(slug)!] : []));
  return products.length === 0 ? null : <Rail title={block.title} products={products} />;
}
