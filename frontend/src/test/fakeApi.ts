import { vi } from 'vitest';

export interface FakeResponse {
  status?: number;
  body?: unknown;
}

export type FakeHandler = (request: { url: URL; method: string; body: unknown }) => FakeResponse;
export type FakeRoutes = Record<string, FakeHandler | FakeResponse>;

export interface FakeApi {
  /** every request made so far, as "METHOD /path?query" */
  calls: string[];
  callsTo: (path: string) => string[];
}

/**
 * Replaces fetch with an in-memory API. Routes are keyed "METHOD /api/path" (query ignored); a route may be a fixed response or a
 * function that decides (e.g. to answer differently after login). Anything unrouted answers 404 so a missing mock is loud.
 */
export function fakeApi(routes: FakeRoutes): FakeApi {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request | string | URL) => {
      const request = input instanceof Request ? input : new Request(String(input));
      const url = new URL(request.url);
      const text = request.method === 'GET' ? '' : await request.text();
      calls.push(`${request.method} ${url.pathname}${url.search}`);

      const route = routes[`${request.method} ${url.pathname}`];
      const reply: FakeResponse = !route
        ? {
            status: 404,
            body: { error: { code: 'not_found', message: 'No such mock', details: null } },
          }
        : typeof route === 'function'
          ? route({ url, method: request.method, body: text ? JSON.parse(text) : null })
          : route;
      const status = reply.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );

  return { calls, callsTo: (path) => calls.filter((call) => call.split('?')[0].endsWith(path)) };
}

export const apiError = (
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
): FakeResponse => ({
  status,
  body: { error: { code, message, details } },
});
