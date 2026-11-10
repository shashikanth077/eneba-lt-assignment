import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../../app/store';
import type { User } from '../../types/api.types';
import type { SerializedApiError } from '../../types/common.types';
import type { AuthState, Credentials, RegistrationData } from './authTypes';

const initialState: AuthState = {
  status: 'unknown',
  user: null,
  signingOut: false,
  login: { loading: false, error: null },
  register: { loading: false, error: null },
  profile: { loading: false, error: null, saved: false },
  password: { loading: false, error: null, saved: false },
  verification: { status: 'idle', error: null },
  resend: { loading: false, sent: false, failed: false },
};

const signedIn = (state: AuthState, user: User): void => {
  state.status = 'authenticated';
  state.user = user;
  state.signingOut = false;
};

const signedOutState = (state: AuthState): void => {
  state.status = 'anonymous';
  state.user = null;
  state.signingOut = false;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // "Who am I?" on first load
    bootstrapRequest: () => undefined,
    bootstrapSuccess: (state, action: PayloadAction<User>) => signedIn(state, action.payload),
    bootstrapAnonymous: signedOutState,
    bootstrapFailure: (state) => {
      state.status = 'error';
    },

    loginRequest: {
      reducer: (state) => {
        state.login = { loading: true, error: null };
      },
      prepare: (credentials: Credentials) => ({ payload: credentials }),
    },
    loginSuccess: (state, action: PayloadAction<User>) => {
      signedIn(state, action.payload);
      state.login = { loading: false, error: null };
    },
    loginFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.login = { loading: false, error: action.payload };
    },

    registerRequest: {
      reducer: (state) => {
        state.register = { loading: true, error: null };
      },
      prepare: (data: RegistrationData) => ({ payload: data }),
    },
    registerSuccess: (state, action: PayloadAction<User>) => {
      signedIn(state, action.payload);
      state.register = { loading: false, error: null };
    },
    registerFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.register = { loading: false, error: action.payload };
    },

    /** Starts a sign-out. The flag is set by this very action, before the router has moved anywhere. */
    logoutRequest: (state) => {
      state.signingOut = true;
    },
    /** The server ended the session (or the sign-out request finished, whatever it answered). */
    signedOut: signedOutState,
    /** Any request answered 401 although we thought we were signed in: the cookie expired or was revoked. */
    sessionExpired: signedOutState,

    updateProfileRequest: {
      reducer: (state) => {
        state.profile = { loading: true, error: null, saved: false };
      },
      prepare: (displayName: string) => ({ payload: displayName }),
    },
    updateProfileSuccess: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.profile = { loading: false, error: null, saved: true };
    },
    updateProfileFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.profile = { loading: false, error: action.payload, saved: false };
    },

    changePasswordRequest: {
      reducer: (state) => {
        state.password = { loading: true, error: null, saved: false };
      },
      prepare: (values: { currentPassword: string; newPassword: string }) => ({ payload: values }),
    },
    changePasswordSuccess: (state) => {
      state.password = { loading: false, error: null, saved: true };
    },
    changePasswordFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.password = { loading: false, error: action.payload, saved: false };
    },

    verifyEmailRequest: {
      reducer: (state) => {
        state.verification = { status: 'verifying', error: null };
      },
      prepare: (token: string) => ({ payload: token }),
    },
    verifyEmailSuccess: (state) => {
      state.verification = { status: 'verified', error: null };
      if (state.user) state.user.emailVerified = true;
    },
    verifyEmailFailure: (state, action: PayloadAction<SerializedApiError>) => {
      state.verification = { status: 'failed', error: action.payload };
    },

    resendVerificationRequest: (state) => {
      state.resend = { loading: true, sent: false, failed: false };
    },
    resendVerificationSuccess: (state) => {
      state.resend = { loading: false, sent: true, failed: false };
    },
    resendVerificationFailure: (state) => {
      state.resend = { loading: false, sent: false, failed: true };
    },

    clearAuthErrors: (state) => {
      state.login.error = null;
      state.register.error = null;
    },
  },
});

export const {
  bootstrapRequest,
  bootstrapSuccess,
  bootstrapAnonymous,
  bootstrapFailure,
  loginRequest,
  loginSuccess,
  loginFailure,
  registerRequest,
  registerSuccess,
  registerFailure,
  logoutRequest,
  signedOut,
  sessionExpired,
  updateProfileRequest,
  updateProfileSuccess,
  updateProfileFailure,
  changePasswordRequest,
  changePasswordSuccess,
  changePasswordFailure,
  verifyEmailRequest,
  verifyEmailSuccess,
  verifyEmailFailure,
  resendVerificationRequest,
  resendVerificationSuccess,
  resendVerificationFailure,
  clearAuthErrors,
} = authSlice.actions;
export const authReducer = authSlice.reducer;

export const selectAuth = (state: RootState): AuthState => state.auth;
export const selectAuthStatus = (state: RootState) => state.auth.status;
export const selectUser = (state: RootState): User | null => state.auth.user;
export const selectIsAuthenticated = (state: RootState): boolean =>
  state.auth.status === 'authenticated';
export const selectSigningOut = (state: RootState): boolean => state.auth.signingOut;
