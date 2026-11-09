import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

interface LoadingStateProps {
  /** Shown under the spinner and announced to screen readers. */
  label?: string;
  /** Reserve vertical space so the page does not jump when content arrives. */
  minHeight?: number | string;
}

export function LoadingState({ label = 'Loading…', minHeight = 240 }: LoadingStateProps) {
  return (
    <Stack
      role="status"
      aria-live="polite"
      spacing={2}
      sx={{ alignItems: 'center', justifyContent: 'center', minHeight, py: 4 }}
    >
      <CircularProgress color="primary" />
      <Typography color="text.secondary">{label}</Typography>
    </Stack>
  );
}
