import type { AppDispatch } from '../../app/store';
import { authApi } from './authApi';

/** Asks the server "who am I?" (the session cookie is HttpOnly, so the page cannot know without asking). */
export function checkSession(dispatch: AppDispatch, { force = false } = {}) {
  return dispatch(
    authApi.endpoints.getMe.initiate(undefined, { subscribe: false, forceRefetch: force }),
  );
}
