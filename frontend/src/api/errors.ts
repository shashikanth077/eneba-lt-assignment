import type { ApiErrorBody } from './types';

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/** The backend's {error:{code,message,details}} if this RTK Query error carries one. */
export function getApiError(error: unknown): ApiErrorBody['error'] | null {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data: unknown }).data;
    if (isApiErrorBody(data)) return data.error;
  }
  return null;
}

/** HTTP status of an RTK Query error, or null (network failure, parsing error...). */
export function getStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === 'number' ? status : null;
}

/** Field-level messages of a 422 response: { email: ['Must be a valid email address'] }. */
export function getFieldErrors(error: unknown): Record<string, string[]> {
  const fields = getApiError(error)?.details?.fields;
  return typeof fields === 'object' && fields !== null ? (fields as Record<string, string[]>) : {};
}

/** A sentence a person can read. Never leaks internals; falls back to a generic message. */
export function describeError(error: unknown): string {
  const api = getApiError(error);
  if (api) {
    if (api.code === 'too_many_attempts' || api.code === 'rate_limited') {
      const wait = Number(api.details?.retryAfterSeconds);
      return Number.isFinite(wait) && wait > 0
        ? `Too many attempts. Try again in ${wait < 60 ? `${Math.ceil(wait)} s` : `${Math.ceil(wait / 60)} min`}.`
        : api.message;
    }
    return api.message;
  }
  const status = (error as { status?: unknown } | undefined)?.status;
  if (status === 'FETCH_ERROR')
    return 'Cannot reach the server. Check your connection and try again.';
  if (status === 'TIMEOUT_ERROR') return 'The server took too long to answer. Try again.';
  if (typeof status === 'number' && status >= 500)
    return 'Something went wrong on our side. Try again.';
  return 'Something went wrong. Try again.';
}
