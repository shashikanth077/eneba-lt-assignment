import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/hooks';
import { Alert, Button, Pagination } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';
import { ErrorMessage } from '../../../components/feedback/ErrorMessage';
import { WEAK_SCORE, suggestQuery } from '../../../utils/didYouMean';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductGrid';
import { MAX_QUERY_LENGTH, PAGE_SIZE } from '../productsQuery';
import { searchKey, selectSearchEntry } from '../productsSelectors';
import { searchProductsRequest } from '../productsSlice';
import styles from './SearchResultsPage.module.scss';

const parsePage = (raw: string | null): number =>
  /^\d{1,6}$/.test(raw ?? '') ? Math.max(1, Number(raw)) : 1;

/** /search?q=...&page=...: results of the typo-tolerant search, "did you mean" when the best match is weak, and an empty state. */
export function SearchResultsPage() {
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  const page = parsePage(params.get('page'));
  const key = searchKey(q, page);

  useEffect(() => {
    if (q !== '') dispatch(searchProductsRequest(key));
  }, [dispatch, key, q]);
  const entry = useAppSelector(selectSearchEntry(key));

  const goToPage = (next: number) => {
    setParams(next > 1 ? { q, page: String(next) } : { q });
    window.scrollTo({ top: 0 });
  };

  if (q === '') {
    return (
      <EmptyState
        title="Search for a game"
        description="Type a title in the search box at the top. Typos and partial names work."
        action={<Button to="/store">Browse the store</Button>}
      />
    );
  }

  const data = entry?.data;
  const top = data?.items[0];
  const weak = page === 1 && top?.score !== undefined && top.score < WEAK_SCORE;
  const suggestion = weak && top ? suggestQuery(q, top.name) : null;
  const pageCount = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  let body;
  if (entry?.status === 'failed') {
    body = (
      <ErrorMessage
        error={entry.error}
        title="The search failed"
        onRetry={() => dispatch(searchProductsRequest(key, { force: true }))}
      />
    );
  } else if (data === undefined) {
    body = <ProductGridSkeleton />;
  } else if (data.total === 0) {
    body = (
      <EmptyState
        title={`No games found for “${q}”`}
        description="Check the spelling, try fewer words, or browse the whole store with filters."
        action={<Button to="/store">Browse the store</Button>}
      />
    );
  } else if (data.items.length === 0) {
    body = (
      <EmptyState
        title="There is no such page"
        description={`This search has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`}
        action={<Button onClick={() => goToPage(1)}>Go to the first page</Button>}
      />
    );
  } else {
    body = (
      <>
        <p className={styles.count} aria-live="polite">
          {data.total} {data.total === 1 ? 'game' : 'games'}
        </p>
        {weak && (
          <Alert severity="info" role="status">
            {suggestion ? (
              <>
                Did you mean{' '}
                <Link to={`/search?q=${encodeURIComponent(suggestion)}`} className="inline">
                  <strong>{suggestion}</strong>
                </Link>
                ? These are the closest matches to what you typed.
              </>
            ) : (
              'We found no close match. These are the closest games.'
            )}
          </Alert>
        )}
        <ProductGrid items={data.items} busy={entry?.status === 'loading'} />
        <div className={styles.pagination}>
          <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <h1>Results for “{q}”</h1>
      {body}
    </div>
  );
}
