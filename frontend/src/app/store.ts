import { configureStore, createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { baseApi } from './api';
import { authReducer } from '../features/auth/authSlice';
import { authApi } from '../features/auth/authApi';
import { sessionExpired } from '../features/auth/authActions';

/** A fresh store (tests make their own). The app uses the single instance exported below. */
export function makeStore() {
  const listener = createListenerMiddleware();
  // Leaving a session (sign out, or it expired) must not leave that user's cart or orders in the cache for the next person.
  // An expiry only counts the FIRST time: resetting the cache makes mounted pages refetch, and if each of those 401s were to reset
  // it again we would loop forever.
  listener.startListening({
    matcher: isAnyOf(sessionExpired, authApi.endpoints.logout.matchFulfilled),
    effect: (action, api) => {
      const wasSignedIn = (api.getOriginalState() as RootState).auth.status === 'authenticated';
      if (wasSignedIn || !sessionExpired.match(action)) {
        api.dispatch(baseApi.util.resetApiState());
      }
    },
  });

  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authReducer,
    },
    middleware: (getDefault) =>
      getDefault().prepend(listener.middleware).concat(baseApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

export const store = makeStore();
