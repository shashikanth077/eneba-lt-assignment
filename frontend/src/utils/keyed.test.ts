import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '../app/store';
import { fakeApi } from '../test/fakeApi';
import { fetchProductRequest } from '../features/products/productsSlice';
import {
  CACHE_TTL_MS,
  isFresh,
  keyedFailed,
  keyedRequested,
  keyedSucceeded,
  type Keyed,
} from './keyed';

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const productBody = { product: { slug: 'a' }, offers: [] };
afterEach(() => vi.useRealTimers());

describe('keyed cache reducers', () => {
  const request = (key: string, force = false, now = 1000) => ({ key, force, now });

  it('request marks loading but keeps the last good data, so a screen can keep showing it', () => {
    const state: Keyed<string> = {};
    keyedSucceeded(state, { key: 'k', data: 'old' });
    keyedRequested(state, request('k', true));
    expect(state.k).toMatchObject({ status: 'loading', data: 'old' });
  });

  it('a fresh entry is left alone by a normal request, a forced request refreshes it', () => {
    const state: Keyed<string> = {};
    keyedSucceeded(state, { key: 'k', data: 'x' });
    keyedRequested(state, request('k', false, Date.now()));
    expect(state.k.status).toBe('succeeded');
    keyedRequested(state, request('k', true, Date.now()));
    expect(state.k.status).toBe('loading');
  });

  it('a stale entry (older than the TTL) is asked for again', () => {
    const state: Keyed<string> = {};
    keyedSucceeded(state, { key: 'k', data: 'x' });
    const later = Date.now() + CACHE_TTL_MS + 1;
    expect(isFresh(state.k, later)).toBe(false);
    keyedRequested(state, request('k', false, later));
    expect(state.k.status).toBe('loading');
  });

  it('a failure keeps the stale data and records the error', () => {
    const state: Keyed<string> = {};
    keyedSucceeded(state, { key: 'k', data: 'old' });
    keyedFailed(state, {
      key: 'k',
      error: { status: 500, code: 'x', message: 'm', details: null },
    });
    expect(state.k).toMatchObject({ status: 'failed', data: 'old', error: { code: 'x' } });
  });
});

describe('keyed saga: caching and de-duplication', () => {
  it('asks the server once for a key, then serves repeats from the cache', async () => {
    const api = fakeApi({ 'GET /api/products/a': { body: productBody } });
    const store = makeStore();

    store.dispatch(fetchProductRequest('a'));
    await settle();
    expect(store.getState().products.details.a.status).toBe('succeeded');

    store.dispatch(fetchProductRequest('a'));
    store.dispatch(fetchProductRequest('a'));
    await settle();
    expect(api.callsTo('/api/products/a')).toHaveLength(1);
  });

  it('two requests for the same key at the same time share one HTTP request', async () => {
    const api = fakeApi({ 'GET /api/products/a': async () => ({ body: productBody }) });
    const store = makeStore();

    store.dispatch(fetchProductRequest('a'));
    store.dispatch(fetchProductRequest('a'));
    await settle();
    expect(api.callsTo('/api/products/a')).toHaveLength(1);
  });

  it('different keys are separate entries; a forced request asks again', async () => {
    const api = fakeApi({
      'GET /api/products/a': { body: productBody },
      'GET /api/products/b': { body: productBody },
    });
    const store = makeStore();

    store.dispatch(fetchProductRequest('a'));
    store.dispatch(fetchProductRequest('b'));
    await settle();
    expect(Object.keys(store.getState().products.details).sort()).toEqual(['a', 'b']);

    store.dispatch(fetchProductRequest('a', { force: true }));
    await settle();
    expect(api.callsTo('/api/products/a')).toHaveLength(2);
  });

  it('a failure is stored as plain data on that key, and a retry (forced) can succeed', async () => {
    let failing = true;
    fakeApi({
      'GET /api/products/a': () =>
        failing
          ? { status: 404, body: { error: { code: 'not_found', message: 'No', details: null } } }
          : { body: productBody },
    });
    const store = makeStore();

    store.dispatch(fetchProductRequest('a'));
    await settle();
    expect(store.getState().products.details.a).toMatchObject({
      status: 'failed',
      error: { status: 404, code: 'not_found' },
    });

    failing = false;
    store.dispatch(fetchProductRequest('a', { force: true }));
    await settle();
    expect(store.getState().products.details.a).toMatchObject({ status: 'succeeded' });
    expect(store.getState().products.details.a.error).toBeUndefined();
  });

  it('a key that failed is not stuck: the in-flight marker is cleared', async () => {
    let failing = true;
    const api = fakeApi({
      'GET /api/products/a': () => (failing ? { status: 500, body: {} } : { body: productBody }),
    });
    const store = makeStore();
    store.dispatch(fetchProductRequest('a'));
    await settle();
    failing = false;
    store.dispatch(fetchProductRequest('a'));
    await settle();
    expect(api.callsTo('/api/products/a')).toHaveLength(2);
    expect(store.getState().products.details.a.status).toBe('succeeded');
  });

  it('stores are independent: a pending request in one never blocks another', async () => {
    fakeApi({ 'GET /api/products/a': () => new Promise(() => undefined) });
    const first = makeStore();
    first.dispatch(fetchProductRequest('a'));
    await settle();

    fakeApi({ 'GET /api/products/a': { body: productBody } });
    const second = makeStore();
    second.dispatch(fetchProductRequest('a'));
    await settle();
    expect(second.getState().products.details.a.status).toBe('succeeded');
  });
});
