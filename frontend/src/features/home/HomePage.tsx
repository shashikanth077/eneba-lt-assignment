import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Logo } from '../../components/Logo';
import { ApiStatus } from '../health/ApiStatus';

/** Placeholder until the config-driven homepage blocks are built. */
export function HomePage() {
  return (
    <Container maxWidth={false} sx={{ maxWidth: 1440, py: 8 }}>
      <Stack spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Logo size={48} />
        <Typography variant="h1">Digital game keys, cheaper.</Typography>
        <Typography color="text.secondary">
          Placeholder page. The storefront is coming soon.
        </Typography>
        <ApiStatus />
      </Stack>
    </Container>
  );
}
