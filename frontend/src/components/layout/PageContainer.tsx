import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { tokens } from '../../theme/theme';

/** The centred 1440px column used by the header, the nav bar, the page content and the footer, so everything lines up. */
export function PageContainer({
  children,
  py = 0,
}: {
  children: ReactNode;
  py?: number | Record<string, number>;
}) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: tokens.layout.containerMax,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        py,
      }}
    >
      {children}
    </Box>
  );
}
