import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** Standard body for a route whose real screen is built in a later step. */
export function PagePlaceholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.125rem' } }}>
        {title}
      </Typography>
      <Typography color="text.secondary">
        This screen is built in a later step. The shell, routing and data layer around it are ready.
      </Typography>
      {children}
    </Stack>
  );
}
