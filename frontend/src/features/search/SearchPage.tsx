import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../components/state/EmptyState';
import { ErrorState } from '../../components/state/ErrorState';
import { WEAK_SCORE, suggestQuery } from '../../lib/didYouMean';
import { ProductGrid, ProductGridSkeleton } from '../store/ProductGrid';
import { PAGE_SIZE } from '../store/storeQuery';
import { useSearchQuery } from './searchApi';

const MAX_QUERY_LENGTH = 100;

function parsePage(raw: string | null): number {
  return /^\d{1,6}$/.test(raw ?? '') ? Math.max(1, Number(raw)) : 1;
}

/** /search?q=...&page=...: results of the typo-tolerant search, "did you mean" when the best match is weak, and an empty state. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(params.get('page'));
  const search = useSearchQuery({ q, page }, { skip: q === '' });

  const goToPage = (next: number) => {
    setParams(next > 1 ? { q, page: String(next) } : { q });
    window.scrollTo({ top: 0 });
  };

  if (q === '') {
    return (
      <EmptyState
        title="Search for a game"
        description="Type a title in the search box at the top. Typos and partial names work."
        action={
          <Button component={RouterLink} to="/store" variant="contained">
            Browse the store
          </Button>
        }
      />
    );
  }

  const data = search.data;
  const top = data?.items[0];
  const weak = page === 1 && top?.score !== undefined && top.score < WEAK_SCORE;
  const suggestion = weak && top ? suggestQuery(q, top.name) : null;
  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <Stack spacing={2}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
        Results for “{q}”
      </Typography>

      {search.isError ? (
        <ErrorState
          error={search.error}
          title="The search failed"
          onRetry={() => void search.refetch()}
        />
      ) : data === undefined ? (
        <ProductGridSkeleton />
      ) : data.total === 0 ? (
        <EmptyState
          title={`No games found for “${q}”`}
          description="Check the spelling, try fewer words, or browse the whole store with filters."
          action={
            <Button component={RouterLink} to="/store" variant="contained">
              Browse the store
            </Button>
          }
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          title="There is no such page"
          description={`This search has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`}
          action={
            <Button variant="contained" onClick={() => goToPage(1)}>
              Go to the first page
            </Button>
          }
        />
      ) : (
        <>
          <Typography color="text.secondary" aria-live="polite">
            {data.total} {data.total === 1 ? 'game' : 'games'}
          </Typography>
          {weak && (
            <Alert severity="info" role="status">
              {suggestion ? (
                <>
                  Did you mean{' '}
                  <Link
                    component={RouterLink}
                    to={`/search?q=${encodeURIComponent(suggestion)}`}
                    sx={{ fontWeight: 800 }}
                  >
                    {suggestion}
                  </Link>
                  ? These are the closest matches to what you typed.
                </>
              ) : (
                'We found no close match. These are the closest games.'
              )}
            </Alert>
          )}
          <ProductGrid items={data.items} busy={search.isFetching} />
          {pageCount > 1 && (
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, next) => goToPage(next)}
              color="primary"
              sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}
            />
          )}
        </>
      )}
    </Stack>
  );
}
