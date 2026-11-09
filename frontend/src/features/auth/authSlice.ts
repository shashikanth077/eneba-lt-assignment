import { createSlice } from '@reduxjs/toolkit';
import type { User } from '../../api/types';
import { getStatus } from '../../api/errors';
import { authApi } from './authApi';
import { sessionExpired } from './authActions';

/**
 * unknown        we have not asked the server yet (first load): ProtectedRoute waits instead of redirecting
 * authenticated  GET /auth/me (or a login/register) answered with a user
 * anonymous      the server said 401: no (valid) session
 * error          we could not find out (network down, 5xx): not the same as "signed out", so no redirect to login
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'error';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  /**
   * The user pressed "Sign out" and the request is in flight. While true, a protected page must neither redirect to the login
   * page (that is for visitors who are NOT signed in) nor keep showing the account: the menu is taking the user home.
   * This is plain state set before anything else happens, so it does not depend on how React orders its renders.
   */
  signingOut: boolean;
}

const initialState: AuthState = { status: 'unknown', user: null, signingOut: false };

const signedIn = (_: AuthState, action: { payload: { user: User } }): AuthState => ({
  status: 'authenticated',
  user: action.payload.user,
  signingOut: false,
});
const signedOut = (): AuthState => ({ status: 'anonymous', user: null, signingOut: false });

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signOutStarted: (state) => {
      state.signingOut = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sessionExpired, signedOut)
      .addMatcher(authApi.endpoints.getMe.matchFulfilled, signedIn)
      .addMatcher(authApi.endpoints.login.matchFulfilled, signedIn)
      .addMatcher(authApi.endpoints.register.matchFulfilled, signedIn)
      .addMatcher(authApi.endpoints.logout.matchFulfilled, signedOut)
      .addMatcher(authApi.endpoints.logout.matchRejected, (state) => {
        state.signingOut = false; // the server did not confirm: the user is still signed in
      })
      .addMatcher(authApi.endpoints.getMe.matchRejected, (state, action) =>
        getStatus(action.payload) === 401 ? signedOut() : { ...state, status: 'error' as const },
      );
  },
});

export const authReducer = authSlice.reducer;
export const { signOutStarted } = authSlice.actions;
