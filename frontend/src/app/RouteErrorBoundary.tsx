import { useRouteError } from 'react-router-dom';
import { ErrorState } from '../components/state/ErrorState';

/** Shown when a route throws while rendering or loading its lazy code. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error(error);

  return (
    <ErrorState
      title="This page could not be shown"
      error={error}
      onRetry={() => window.location.reload()}
    />
  );
}
