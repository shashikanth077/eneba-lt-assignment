import Box from '@mui/material/Box';
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { useBootstrapAuth } from '../../features/auth/useBootstrapAuth';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { CategoryNav } from './CategoryNav';
import { PageContainer } from './PageContainer';

/** The frame around every page: header (search, cart, account), category bar, content, footer. */
export function AppShell() {
  useBootstrapAuth();

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: -9999,
          '&:focus': {
            left: 8,
            top: 8,
            zIndex: 2000,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            px: 2,
            py: 1,
          },
        }}
      >
        Skip to content
      </Box>
      <AppHeader />
      <CategoryNav />
      <Box component="main" id="main" sx={{ flex: 1 }}>
        <PageContainer py={{ xs: 3, md: 5 }}>
          <Outlet />
        </PageContainer>
      </Box>
      <AppFooter />
      <ScrollRestoration />
    </Box>
  );
}
