import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Container maxWidth={false} sx={{ maxWidth: 1440, py: 8 }}>
      <Stack spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h1">Page not found</Typography>
        <Button component={Link} to="/" variant="contained">
          Back to home
        </Button>
      </Stack>
    </Container>
  );
}
