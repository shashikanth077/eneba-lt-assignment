import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Button, Modal, Pagination } from '../../../components/common';
import { Sidebar } from '../../../components/layout/Sidebar';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import type { Paginated, ProductCard } from '../../../types/api.types';
import { ActiveFilters } from '../components/ActiveFilters';
import { ProductFilters } from '../components/ProductFilters';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductGrid';
import { ProductSearch } from '../components/ProductSearch';
import { ProductSort } from '../components/ProductSort';
import { PAGE_SIZE, activeFilterCount, cleared, facetsArg, productsArg } from '../productsQuery';
import { selectFacetsEntry, selectPriceBounds, selectProductsEntry } from '../productsSelectors';
import { fetchFacetsRequest, fetchProductsRequest } from '../productsSlice';
import { useStoreQuery } from '../useStoreQuery';
import styles from './ProductListingPage.module.scss';

/** /store. All view state is in the address (useStoreQuery); the page asks the store for the data of THIS address and renders what comes back. */
export function ProductListingPage() {
  const dispatch = useAppDispatch();
  const { query, update } = useStoreQuery();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const docked = useMediaQuery('(min-width: 1200px)');

  const key = productsArg(query);
  const facetKey = facetsArg(query);
  useEffect(() => {
    dispatch(fetchProductsRequest(key));
  }, [dispatch, key]);
  useEffect(() => {
    dispatch(fetchFacetsRequest(facetKey)); // option counts under the current filters
  }, [dispatch, facetKey]);
  useEffect(() => {
    dispatch(fetchFacetsRequest('')); // the whole catalogue: the price slider's bounds, which must not shrink while filtering
  }, [dispatch]);

  const entry = useAppSelector(selectProductsEntry(key));
  const facets = useAppSelector(selectFacetsEntry(facetKey))?.data;
  const priceBounds = useAppSelector(selectPriceBounds);

  // Keep showing the previous results (dimmed) while a new view loads, instead of a blank grid.
  const [previous, setPrevious] = useState<Paginated<ProductCard> | undefined>();
  if (entry?.data && entry.data !== previous) setPrevious(entry.data);
  const data = entry?.data ?? previous;
  const failed = entry?.status === 'failed';
  const loading = entry?.status === 'loading';
  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const filters = (
    <ProductFilters
      query={query}
      facets={facets}
      priceBoundsCents={priceBounds}
      onChange={update}
    />
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Store</h1>

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <ProductSearch value={query.q} onSearch={(q) => update({ q }, { replace: true })} />
        </div>
        <div className={styles.controls}>
          {!docked && (
            <Button
              variant="outline"
              startIcon={<SlidersHorizontal size={18} aria-hidden />}
              onClick={() => setDrawerOpen(true)}
            >
              Filters
              {activeFilterCount(query) > 0 && (
                <span className={styles.badge}>{activeFilterCount(query)}</span>
              )}
            </Button>
          )}
          <ProductSort value={query.sort} q={query.q} onChange={(sort) => update({ sort })} />
        </div>
      </div>

      <ActiveFilters query={query} labels={facets} onChange={update} />

      <div className={styles.layout}>
        {docked && <Sidebar label="Filters">{filters}</Sidebar>}

        <section className={styles.results} aria-label="Results">
          <p className={styles.count} aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? 'game' : 'games'}` : ''}
          </p>

          {failed ? (
            <ErrorMessage
              error={entry?.error}
              title="We could not load the games"
              onRetry={() => dispatch(fetchProductsRequest(key, { force: true }))}
            />
          ) : data === undefined ? (
            <ProductGridSkeleton />
          ) : data.items.length === 0 ? (
            <EmptyState
              title={data.total === 0 ? 'No games match these filters' : 'There is no such page'}
              description={
                data.total === 0
                  ? 'Try removing a filter or searching for something else.'
                  : `This view has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`
              }
              action={
                data.total === 0 ? (
                  <Button onClick={() => update(cleared(query))}>Clear all filters</Button>
                ) : (
                  <Button onClick={() => update({ page: 1 })}>Go to the first page</Button>
                )
              }
            />
          ) : (
            <>
              <ProductGrid items={data.items} busy={loading} />
              <div className={styles.pagination}>
                <Pagination
                  page={query.page}
                  pageCount={pageCount}
                  onChange={(page) => {
                    update({ page });
                    window.scrollTo({ top: 0 });
                  }}
                />
              </div>
            </>
          )}
        </section>
      </div>

      {!docked && (
        <Modal
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Filters"
          variant="drawer"
          footer={
            <Button size="lg" className={styles.drawerFooter} onClick={() => setDrawerOpen(false)}>
              {data ? `Show ${data.total} games` : 'Show games'}
            </Button>
          }
        >
          {filters}
        </Modal>
      )}
    </div>
  );
}
