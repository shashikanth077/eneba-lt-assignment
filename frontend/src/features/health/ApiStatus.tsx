import Chip from '@mui/material/Chip';
import { isApiErrorBody } from '../../app/api';
import { useGetHealthQuery } from './healthApi';

/** Temporary scaffold check: proves SPA -> /api -> PHP -> MySQL works end to end. */
export function ApiStatus() {
  const { data, error, isLoading } = useGetHealthQuery();

  if (isLoading) return <Chip label="API: checking…" />;
  if (data) return <Chip color="success" label={`API: ${data.status} · db ${data.db}`} />;

  const body = error && 'data' in error ? error.data : undefined;
  const reason = isApiErrorBody(body) ? body.error.code : 'unreachable';
  return <Chip color="error" label={`API: ${reason}`} />;
}
