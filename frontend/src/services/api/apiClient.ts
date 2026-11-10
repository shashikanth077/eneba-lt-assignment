import axios, { type AxiosInstance } from 'axios';
import { AUTH_PROBES } from './apiEndpoints';

/**
 * The one HTTP client. Same-origin `/api` + cookies: Vercel rewrites it in production, the Vite proxy in development, so the session
 * cookie is first-party. Components never import this: only the feature `*Service.ts` files do, and only sagas call those.
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    // Required by the backend's CSRF check on state-changing requests (docs/ARCHITECTURE.md).
    'X-Requested-With': 'fetch',
  },
  // The fetch adapter (instead of XHR) keeps one code path in the browser and in tests, which replace `fetch` with an in-memory API.
  adapter: 'fetch',
  env: { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) },
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler = () => undefined;

/** The store registers what should happen when the session turns out to be gone (set once, in app/store.ts). */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

/**
 * One rule: a 401 from any endpoint other than the auth probes means the session has ended, so tell the store. The ProtectedRoute then
 * sends the visitor to the login page and back, instead of every screen having to handle it.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const path = (error.config?.url ?? '').split('?')[0];
      if (!AUTH_PROBES.includes(path)) onUnauthorized();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
