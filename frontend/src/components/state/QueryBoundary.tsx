import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

/** The parts of an RTK Query result this component needs (every useXQuery() hook returns them). */
interface QueryLike<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

interface QueryBoundaryProps<T> {
  query: QueryLike<T>;
  /** Decides whether the loaded data counts as "nothing to show". Omit when data is never empty. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  children: (data: T) => ReactNode;
}

/**
 * One place for the three states every screen needs: loading, error (with retry) and empty. Screens only write the happy path.
 * Stale data keeps showing while a refetch runs; the spinner is only for the first load.
 */
export function QueryBoundary<T>({
  query,
  isEmpty,
  empty,
  loadingLabel,
  errorTitle,
  children,
}: QueryBoundaryProps<T>) {
  if (query.data !== undefined) {
    return isEmpty?.(query.data) ? (
      (empty ?? <EmptyState title="Nothing here yet" />)
    ) : (
      <>{children(query.data)}</>
    );
  }
  if (query.isError) {
    return (
      <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />
    );
  }
  return <LoadingState label={loadingLabel} />;
}
