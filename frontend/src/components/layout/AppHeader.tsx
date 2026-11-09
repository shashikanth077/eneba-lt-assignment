import Box from '@mui/material/Box';
import { Link as RouterLink } from 'react-router-dom';
import { Logo } from '../Logo';
import { AccountMenu } from './AccountMenu';
import { CartButton } from './CartButton';
import { PageContainer } from './PageContainer';
import { SearchBox } from './SearchBox';

/**
 * Mobile first: logo and actions on the first row, the search box full width under them.
 * From the md breakpoint everything sits on one row: logo | search | cart | account.
 */
export function AppHeader() {
  return (
    <Box component="header" sx={{ bgcolor: 'background.default' }}>
      <PageContainer>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'auto 1fr auto', md: 'auto minmax(0, 1fr) auto' },
            gridTemplateAreas: {
              xs: '"logo . actions" "search search search"',
              md: '"logo search actions"',
            },
            alignItems: 'center',
            columnGap: { xs: 2, md: 4 },
            rowGap: 1.5,
            py: { xs: 1.5, md: 3 },
          }}
        >
          <Box
            component={RouterLink}
            to="/"
            aria-label="KEYMART home"
            sx={{ gridArea: 'logo', color: 'inherit', textDecoration: 'none' }}
          >
            <Logo size={32} />
          </Box>
          <Box sx={{ gridArea: 'search', maxWidth: 760 }}>
            <SearchBox />
          </Box>
          <Box
            sx={{
              gridArea: 'actions',
              display: 'flex',
              alignItems: 'center',
              gap: { xs: 0.5, md: 1.5 },
            }}
          >
            <CartButton />
            <AccountMenu />
          </Box>
        </Box>
      </PageContainer>
    </Box>
  );
}
