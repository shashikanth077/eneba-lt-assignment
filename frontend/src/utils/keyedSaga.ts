import type { Action } from '@reduxjs/toolkit';
import { call, put, select, takeEvery } from 'redux-saga/effects';
import { toApiError } from '../services/api/apiErrorHandler';
import type { SerializedApiError } from '../types/common.types';
import { isFresh, type Entry, type KeyedRequest } from './keyed';

interface KeyedSagaOptions<T, S> {
  /** The request action creator: `request.type` is what the saga listens to. */
  request: { type: string };
  success: (payload: { key: string; data: T }) => Action;
  failure: (payload: { key: string; error: SerializedApiError }) => Action;
  /** Where the slice keeps this resource. */
  entry: (state: S, key: string) => Entry<T> | undefined;
  /** The service call (an Axios request). */
  fetch: (key: string) => Promise<T>;
}

/**
 * Builds the watcher saga of one keyed resource: on each request, skip when the cache is fresh or the same key is already being
 * fetched, otherwise call the service and put success or failure. The component never knows any of this.
 */
export function createKeyedWatcher<T, S>(options: KeyedSagaOptions<T, S>) {
  function* worker(inFlight: Set<string>, action: Action & { payload: KeyedRequest }): Generator {
    const { key, force, now } = action.payload;
    const entry = (yield select((state: S) => options.entry(state, key))) as Entry<T> | undefined;
    if (!force && isFresh(entry, now)) return;
    if (inFlight.has(key)) return;

    inFlight.add(key);
    try {
      const data = (yield call(options.fetch, key)) as T;
      yield put(options.success({ key, data }));
    } catch (error) {
      yield put(options.failure({ key, error: toApiError(error) }));
    } finally {
      inFlight.delete(key);
    }
  }

  return function* watch(): Generator {
    // One set per running saga (so per store): requests in flight in one store must never suppress another store's.
    const inFlight = new Set<string>();
    yield takeEvery(options.request.type, function* (action: Action): Generator {
      yield* worker(inFlight, action as Action & { payload: KeyedRequest });
    });
  };
}
