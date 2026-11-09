import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { EmptyState } from '../../components/state/EmptyState';
import { ErrorState } from '../../components/state/ErrorState';
import { ActiveFilters } from './ActiveFilters';
import { tokens } from '../../theme/theme';
import { FilterSidebar } from './FilterSidebar';
import { ProductGrid, ProductGridSkeleton } from './ProductGrid';
import { FiltersButton, SortSelect, StoreSearch } from './StoreToolbar';
import { useGetFiltersQuery } from '../catalog/catalogApi';
import { useGetProductsQuery } from './storeApi';
import { PAGE_SIZE, activeFilterCount, cleared, facetsArg, productsArg } from './storeQuery';
import { useStoreQuery } from './useStoreQuery';

const SIDEBAR_WIDTH = tokens.layout.filterWidth;
const SIDEBAR_BG = tokens.color.filterPanel;

export function StorePage() {
  const { query, update } = useStoreQuery();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const theme = useTheme();
  const sidebarDocked = useMediaQuery(theme.breakpoints.up('lg'));

  const products = useGetProductsQuery(productsArg(query));
  // Option counts follow the filters (the API leaves each group's own choice out). The catalog-wide price range must not move while
  // you filter, so it comes from the unfiltered call, which is fetched once and then served from the cache.
  const facets = useGetFiltersQuery(facetsArg(query));
  const everything = useGetFiltersQuery('');
  const priceBounds =
    everything.data?.price.min != null && everything.data.price.max != null
      ? { min: everything.data.price.min, max: everything.data.price.max }
      : undefined;

  const pageCount = products.data ? Math.ceil(products.data.total / PAGE_SIZE) : 0;

  const sidebar = (
    <FilterSidebar
      query={query}
      facets={facets.data}
      priceBoundsCents={priceBounds}
      onChange={update}
    />
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
        Store
      </Typography>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'center' } }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <StoreSearch value={query.q} onCommit={(q) => update({ q }, { replace: true })} />
        </Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          {!sidebarDocked && (
            <FiltersButton count={activeFilterCount(query)} onClick={() => setDrawerOpen(true)} />
          )}
          <SortSelect value={query.sort} q={query.q} onChange={(sort) => update({ sort })} />
        </Stack>
      </Stack>

      <ActiveFilters query={query} labels={facets.data} onChange={update} />

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        {sidebarDocked && (
          <Box
            component="aside"
            aria-label="Filters"
            sx={{ width: SIDEBAR_WIDTH, flexShrink: 0, bgcolor: SIDEBAR_BG, p: 2 }}
          >
            {sidebar}
          </Box>
        )}

        <Box component="section" aria-label="Results" sx={{ flex: 1, minWidth: 0 }}>
          <Typography aria-live="polite" color="text.secondary" sx={{ mb: 2, minHeight: 24 }}>
            {products.data
              ? `${products.data.total} ${products.data.total === 1 ? 'game' : 'games'}`
              : ''}
          </Typography>

          {products.isError ? (
            <ErrorState
              error={products.error}
              title="We could not load the games"
              onRetry={() => void products.refetch()}
            />
          ) : products.data === undefined ? (
            <ProductGridSkeleton />
          ) : products.data.items.length === 0 ? (
            <EmptyState
              title={
                products.data.total === 0 ? 'No games match these filters' : 'There is no such page'
              }
              description={
                products.data.total === 0
                  ? 'Try removing a filter or searching for something else.'
                  : `This view has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`
              }
              action={
                products.data.total === 0 ? (
                  <Button variant="contained" onClick={() => update(cleared(query))}>
                    Clear all filters
                  </Button>
                ) : (
                  <Button variant="contained" onClick={() => update({ page: 1 })}>
                    Go to the first page
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ProductGrid items={products.data.items} busy={products.isFetching} />
              {pageCount > 1 && (
                <Pagination
                  count={pageCount}
                  page={query.page}
                  onChange={(_, page) => {
                    update({ page });
                    window.scrollTo({ top: 0 });
                  }}
                  color="primary"
                  sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}
                />
              )}
            </>
          )}
        </Box>
      </Box>

      {!sidebarDocked && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          slotProps={{ paper: { sx: { width: 'min(340px, 90vw)', bgcolor: SIDEBAR_BG, p: 2 } } }}
        >
          <Box
            component="aside"
            aria-label="Filters"
            sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h2" sx={{ fontSize: '1.25rem' }}>
                Filters
              </Typography>
              <IconButton aria-label="Close filters" onClick={() => setDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Stack>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>{sidebar}</Box>
            <Button variant="contained" size="large" onClick={() => setDrawerOpen(false)}>
              {products.data ? `Show ${products.data.total} games` : 'Show games'}
            </Button>
          </Box>
        </Drawer>
      )}
    </Stack>
  );
}
