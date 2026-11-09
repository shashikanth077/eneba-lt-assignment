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
  /** Shown when `isEmpty` says so. `null` renders nothing at all; leave it out for a generic empty state. */
  empty?: ReactNode;
  /** Replaces the spinner, e.g. with a skeleton shaped like the content. */
  loading?: ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  errorMinHeight?: number | string;
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
  loading,
  loadingLabel,
  errorTitle,
  errorMinHeight,
  children,
}: QueryBoundaryProps<T>) {
  if (query.data !== undefined) {
    if (!isEmpty?.(query.data)) return <>{children(query.data)}</>;
    return empty === undefined ? <EmptyState title="Nothing here yet" /> : <>{empty}</>; // null = render nothing
  }
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        title={errorTitle}
        minHeight={errorMinHeight}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <>{loading ?? <LoadingState label={loadingLabel} />}</>;
}
