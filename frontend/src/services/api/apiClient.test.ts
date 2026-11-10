import { describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../../test/fakeApi';
import apiClient, { setUnauthorizedHandler } from './apiClient';

describe('apiClient', () => {
  it('sends the CSRF header the backend requires and talks to /api', async () => {
    let seen: Headers | undefined;
    const requests: string[] = [];
    vi.stubGlobal('fetch', async (input: Request) => {
      seen = input.headers;
      requests.push(new URL(input.url).pathname);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await apiClient.get('/health');
    expect(requests).toEqual(['/api/health']);
    expect(seen?.get('x-requested-with')).toBe('fetch');
    vi.unstubAllGlobals();
  });

  it('reports a 401 from an ordinary endpoint, but not from the auth probes', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fakeApi({
      'GET /api/orders': {
        status: 401,
        body: { error: { code: 'unauthorized', message: 'x', details: null } },
      },
      'GET /api/auth/me': {
        status: 401,
        body: { error: { code: 'unauthorized', message: 'x', details: null } },
      },
      'POST /api/auth/login': {
        status: 401,
        body: { error: { code: 'invalid_credentials', message: 'x', details: null } },
      },
    });

    await expect(apiClient.get('/auth/me')).rejects.toBeTruthy();
    await expect(apiClient.post('/auth/login', {})).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();

    await expect(apiClient.get('/orders?page=1')).rejects.toBeTruthy();
    expect(handler).toHaveBeenCalledOnce();
    setUnauthorizedHandler(() => undefined);
  });

  it('rejects on any error status, so sagas can catch it', async () => {
    fakeApi({ 'GET /api/cart': { status: 500, body: {} } });
    await expect(apiClient.get('/cart')).rejects.toMatchObject({ response: { status: 500 } });
  });
});
