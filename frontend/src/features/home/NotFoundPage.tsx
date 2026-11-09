import Button from '@mui/material/Button';
import { Link as RouterLink } from 'react-router-dom';
import { EmptyState } from '../../components/state/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Back to home
        </Button>
      }
    />
  );
}
