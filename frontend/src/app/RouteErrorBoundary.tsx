import { useRouteError } from 'react-router-dom';
import { ErrorMessage } from '../components/feedback/ErrorMessage';

/** Shown when a route throws while rendering or loading its lazy code. */
export function RouteErrorBoundary() {
  console.error(useRouteError());
  return (
    <ErrorMessage
      title="This page could not be shown"
      error={{
        status: 0,
        code: 'render_error',
        message: 'Something went wrong while showing this page. Reload to try again.',
        details: null,
      }}
      onRetry={() => window.location.reload()}
    />
  );
}
