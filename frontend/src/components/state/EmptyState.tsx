import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Usually a button or link that gets the user out of the dead end. */
  action?: ReactNode;
  minHeight?: number | string;
}

export function EmptyState({ title, description, action, minHeight = 240 }: EmptyStateProps) {
  return (
    <Stack
      spacing={2}
      sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight, py: 4 }}
    >
      <InboxOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      {description && (
        <Typography color="text.secondary" sx={{ maxWidth: 480 }}>
          {description}
        </Typography>
      )}
      {action}
    </Stack>
  );
}
