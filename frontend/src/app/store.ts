import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { sessionExpired } from '../features/auth/authSlice';
import { setUnauthorizedHandler } from '../services/api/apiClient';
import { rootReducer } from './rootReducer';
import { rootSaga } from './rootSaga';

/** A fresh store with its own saga middleware (tests make their own). The app uses the single instance exported below. */
export function makeStore() {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(sagaMiddleware),
  });
  sagaMiddleware.run(rootSaga);
  // A 401 from any endpoint other than the auth probes means the session ended: tell the auth slice (see services/api/apiClient.ts).
  // Only the FIRST expiry counts: other slices reset themselves on it, and a late 401 from a request that was already in flight
  // must not bounce a visitor who has already signed in again.
  setUnauthorizedHandler(() => {
    if (store.getState().auth.status === 'authenticated') store.dispatch(sessionExpired());
  });
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];

export const store = makeStore();
