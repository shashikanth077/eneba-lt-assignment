import type { SerializedApiError } from '../../types/common.types';
import type { User } from '../../types/api.types';

/**
 * unknown        we have not asked the server yet (first load): ProtectedRoute waits instead of redirecting
 * authenticated  GET /auth/me (or a login/register) answered with a user
 * anonymous      the server said 401: no (valid) session
 * error          we could not find out (network down, 5xx): not the same as "signed out", so no redirect to login
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'error';

export interface FormRequestState {
  loading: boolean;
  error: SerializedApiError | null;
}

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  /**
   * The user pressed "Sign out" and the request is in flight. While true, a protected page must neither redirect to the login page
   * (that is for visitors who are NOT signed in) nor keep showing the account: the menu is taking the user home. It is plain state set
   * by the very action that starts the sign-out, so it does not depend on how React orders its renders.
   */
  signingOut: boolean;
  login: FormRequestState;
  register: FormRequestState;
  /** Opening the link from the verification e-mail (/verify-email?token=...). */
  verification: {
    status: 'idle' | 'verifying' | 'verified' | 'failed';
    error: SerializedApiError | null;
  };
  /** "Send me a new link" from the banner. */
  resend: { loading: boolean; sent: boolean; failed: boolean };
}

export interface Credentials {
  email: string;
  password: string;
}

export interface RegistrationData extends Credentials {
  displayName: string;
}
