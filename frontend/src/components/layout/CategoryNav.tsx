import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useGetFiltersQuery } from '../../features/catalog/catalogApi';
import { tokens } from '../../theme/theme';
import { PageContainer } from './PageContainer';

/** Fixed shortcuts: they are routes of the app, not catalog content. */
const SHORTCUTS = [
  { label: 'All games', to: '/store' },
  { label: 'Deals', to: '/store?sort=discount' },
  { label: 'New releases', to: '/store?sort=newest' },
];

/**
 * The bar under the header. Platforms and categories (genres) come from GET /api/filters, so they always match what the catalog
 * really holds. If that request fails the bar still works with the fixed shortcuts. On a phone it scrolls sideways.
 */
export function CategoryNav() {
  const { data, isLoading } = useGetFiltersQuery();
  const location = useLocation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const here = location.pathname + location.search;

  const links = [
    ...SHORTCUTS,
    ...(data?.platforms ?? []).map((platform) => ({
      label: platform.label,
      to: `/store?platform=${encodeURIComponent(platform.value)}`,
    })),
  ];

  return (
    <Box
      component="nav"
      aria-label="Categories and platforms"
      sx={{ bgcolor: tokens.color.navBar }}
    >
      <PageContainer>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.5, md: 1 },
            minHeight: { xs: 48, md: tokens.layout.navBarHeight },
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          <Button
            color="inherit"
            startIcon={<CategoryOutlinedIcon />}
            onClick={(event) => setAnchor(event.currentTarget)}
            disabled={!data || data.genres.length === 0}
            aria-haspopup="menu"
            sx={{ flexShrink: 0 }}
          >
            Categories
          </Button>
          {links.map((link) => (
            <Button
              key={link.to}
              component={RouterLink}
              to={link.to}
              color="inherit"
              aria-current={here === link.to ? 'page' : undefined}
              sx={{
                flexShrink: 0,
                fontWeight: 600,
                borderBottom: '3px solid',
                borderColor: here === link.to ? 'primary.main' : 'transparent',
                borderRadius: 0,
              }}
            >
              {link.label}
            </Button>
          ))}
          {isLoading &&
            [72, 64, 80].map((width) => (
              <Skeleton key={width} width={width} height={28} sx={{ flexShrink: 0 }} />
            ))}
        </Box>
      </PageContainer>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {(data?.genres ?? []).map((genre) => (
          <MenuItem
            key={genre.value}
            component={RouterLink}
            to={`/store?genre=${encodeURIComponent(genre.value)}`}
            onClick={() => setAnchor(null)}
          >
            {genre.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
