import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { useSearchParams } from 'react-router-dom';
import { PagePlaceholder } from '../../components/layout/PagePlaceholder';

/** Placeholder: shows the filters it was opened with (the navigation bar links here with ?platform=, ?genre=, ?sort=). */
export function StorePage() {
  const [params] = useSearchParams();
  const entries = [...params.entries()];

  return (
    <PagePlaceholder title="Store">
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {entries.length === 0 ? (
          <Chip label="No filters" />
        ) : (
          entries.map(([key, value]) => <Chip key={`${key}=${value}`} label={`${key}: ${value}`} />)
        )}
      </Stack>
    </PagePlaceholder>
  );
}
