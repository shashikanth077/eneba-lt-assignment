import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

/** Shape of every error the backend returns: { error: { code, message, details } }. */
export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown> | null };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/**
 * The one RTK Query API instance. Feature folders add endpoints with `baseApi.injectEndpoints`.
 * Same-origin `/api` + cookies: Vercel rewrite in production, Vite proxy in development.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    credentials: 'same-origin',
    // Required by the backend CSRF check on state-changing requests (see ARCHITECTURE.md).
    headers: { 'X-Requested-With': 'fetch' },
  }),
  tagTypes: [],
  endpoints: () => ({}),
});
