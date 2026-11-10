import { Button } from '../../../components/common';
import { EmptyState } from '../../../components/feedback/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={<Button to="/">Back to home</Button>}
    />
  );
}
