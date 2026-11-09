import Typography from '@mui/material/Typography';
import { useSearchParams } from 'react-router-dom';
import { PagePlaceholder } from '../../components/layout/PagePlaceholder';

/** Placeholder: the header search box sends Enter here as /search?q=... */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';

  return (
    <PagePlaceholder title={q ? `Results for “${q}”` : 'Search'}>
      {!q && (
        <Typography color="text.secondary">
          Type in the search box at the top to find a game.
        </Typography>
      )}
    </PagePlaceholder>
  );
}
