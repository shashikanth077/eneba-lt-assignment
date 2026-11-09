import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/** The narrow centred panel both the login and the register page use. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper sx={{ maxWidth: 460, mx: 'auto', p: { xs: 2.5, sm: 4 } }}>
      <Typography
        variant="h2"
        component="h1"
        sx={{ mb: 3, fontSize: { xs: '1.5rem', sm: '1.75rem' } }}
      >
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
