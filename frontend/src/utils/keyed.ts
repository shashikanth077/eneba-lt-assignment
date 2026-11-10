import type { PayloadAction } from '@reduxjs/toolkit';
import type { SerializedApiError } from '../types/common.types';

/**
 * A tiny request cache for the store, so a screen can ask for "the products of THIS query" and the answer is remembered per query:
 * going Back to a view seen a moment ago costs no request, and two components asking for the same thing share one request.
 * (This is what RTK Query used to do for us; here it is thirty lines we can read.)
 */
export interface Entry<T> {
  status: 'loading' | 'succeeded' | 'failed';
  /** The last good answer. Kept while a refresh runs or after a failure, so the screen can keep showing it. */
  data?: T;
  error?: SerializedApiError;
  fetchedAt?: number;
}
export type Keyed<T> = Record<string, Entry<T>>;

export const CACHE_TTL_MS = 60_000;

export interface KeyedRequest {
  key: string;
  /** Ignore a fresh cached answer and ask again (e.g. the homepage layout on every visit). */
  force: boolean;
  /** Time of the dispatch, taken in the action creator so reducers stay pure. */
  now: number;
}

/** Action `prepare` callback for every keyed request action. */
export const prepareKeyedRequest = (
  key: string,
  options?: { force?: boolean },
): { payload: KeyedRequest } => ({
  payload: { key, force: options?.force ?? false, now: Date.now() },
});

export const isFresh = (entry: Entry<unknown> | undefined, now: number): boolean =>
  entry?.status === 'succeeded' &&
  entry.fetchedAt !== undefined &&
  now - entry.fetchedAt < CACHE_TTL_MS;

export function keyedRequested<T>(state: Keyed<T>, { key, force, now }: KeyedRequest): void {
  const entry = state[key];
  if (!force && isFresh(entry, now)) return; // a cache hit: leave it as it is, the saga will not fetch either
  state[key] = { ...entry, status: 'loading', error: undefined };
}

export function keyedSucceeded<T>(state: Keyed<T>, { key, data }: { key: string; data: T }): void {
  state[key] = { status: 'succeeded', data, fetchedAt: Date.now() };
}

export function keyedFailed<T>(
  state: Keyed<T>,
  { key, error }: { key: string; error: SerializedApiError },
): void {
  state[key] = { ...state[key], status: 'failed', error };
}

/**
 * The three case reducers every keyed resource needs, for a slice whose `pick(state)` returns the Keyed map:
 *   fetchXRequest: list.request, fetchXSuccess: list.success, fetchXFailure: list.failure
 */
export function keyedCaseReducers<S, T>(pick: (state: S) => Keyed<T>) {
  return {
    request: {
      reducer: (state: S, action: PayloadAction<KeyedRequest>) =>
        keyedRequested(pick(state), action.payload),
      prepare: prepareKeyedRequest,
    },
    success: (state: S, action: PayloadAction<{ key: string; data: T }>) =>
      keyedSucceeded(pick(state), action.payload),
    failure: (state: S, action: PayloadAction<{ key: string; error: SerializedApiError }>) =>
      keyedFailed(pick(state), action.payload),
  };
}
