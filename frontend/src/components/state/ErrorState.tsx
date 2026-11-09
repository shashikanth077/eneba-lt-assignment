import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { describeError } from '../../api/errors';

interface ErrorStateProps {
  /** An RTK Query / thrown error; turned into a readable sentence. Omit to show the generic message. */
  error?: unknown;
  title?: string;
  /** When given, a "Try again" button is shown. */
  onRetry?: () => void;
  minHeight?: number | string;
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  minHeight = 240,
}: ErrorStateProps) {
  return (
    <Stack
      role="alert"
      spacing={2}
      sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight, py: 4 }}
    >
      <ErrorOutlinedIcon sx={{ fontSize: 48 }} color="error" />
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
        {describeError(error)}
      </Typography>
      {onRetry && (
        <Button variant="contained" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Stack>
  );
}
