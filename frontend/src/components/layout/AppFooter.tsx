import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { tokens } from '../../theme/theme';
import { Logo } from '../Logo';
import { PageContainer } from './PageContainer';

const COLUMNS = [
  {
    title: 'Shop',
    links: [
      { label: 'All games', to: '/store' },
      { label: 'Deals', to: '/store?sort=discount' },
      { label: 'New releases', to: '/store?sort=newest' },
      { label: 'Search', to: '/search' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Register', to: '/register' },
      { label: 'My orders', to: '/account/orders' },
      { label: 'Cart', to: '/cart' },
    ],
  },
];

export function AppFooter() {
  return (
    <Box component="footer" sx={{ bgcolor: tokens.color.footer, mt: 6, py: { xs: 4, md: 6 } }}>
      <PageContainer>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr' },
            gap: { xs: 3, md: 6 },
          }}
        >
          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
            <Logo size={28} />
            <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 420 }}>
              KEYMART is a student project built for the Eneba internship assignment, styled after
              eneba.com. Payments run in Stripe test mode: no real money is involved and no real
              keys are sold.
            </Typography>
          </Box>
          {COLUMNS.map((column) => (
            <Box key={column.title} component="nav" aria-label={column.title}>
              <Typography variant="subtitle1" component="h2" sx={{ mb: 1.5 }}>
                {column.title}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      component={RouterLink}
                      to={link.to}
                      underline="hover"
                      sx={{ color: tokens.color.textSecondary }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
          © {new Date().getFullYear()} KEYMART · demo project
        </Typography>
      </PageContainer>
    </Box>
  );
}
