import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { Link as RouterLink } from 'react-router-dom';
import { PagePlaceholder } from '../../components/layout/PagePlaceholder';

/** Placeholder until the config-driven homepage blocks (GET /api/home/layout) are rendered. */
export function HomePage() {
  return (
    <PagePlaceholder title="Digital game keys, cheaper.">
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/store" variant="contained">
          Browse the store
        </Button>
        <Button component={RouterLink} to="/store?sort=discount" variant="outlined">
          See the deals
        </Button>
      </Box>
    </PagePlaceholder>
  );
}
