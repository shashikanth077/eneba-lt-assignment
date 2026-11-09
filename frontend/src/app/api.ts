import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { sessionExpired } from '../features/auth/authActions';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  credentials: 'same-origin',
  // Required by the backend CSRF check on state-changing requests (see ARCHITECTURE.md).
  headers: { 'X-Requested-With': 'fetch' },
});

/** Calls that are SUPPOSED to be able to answer 401 (a wrong password, "who am I?" while signed out). */
const AUTH_PROBES = ['/auth/me', '/auth/login', '/auth/register', '/auth/logout'];

/**
 * fetchBaseQuery plus one rule: a 401 from any other endpoint means the session is gone, so tell the auth slice. The
 * ProtectedRoute then sends the user to the login page and back, instead of every screen having to handle it.
 */
const baseQueryWithSession: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extra,
) => {
  const result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !AUTH_PROBES.includes(url)) {
    api.dispatch(sessionExpired());
  }
  return result;
};

/**
 * The one RTK Query API instance. Feature folders add endpoints with `baseApi.injectEndpoints`.
 * Same-origin `/api` + cookies: Vercel rewrite in production, Vite proxy in development.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithSession,
  tagTypes: ['Cart', 'Orders'],
  endpoints: () => ({}),
});
