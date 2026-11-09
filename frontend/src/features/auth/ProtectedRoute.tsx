import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { ErrorState } from '../../components/state/ErrorState';
import { LoadingState } from '../../components/state/LoadingState';
import { loginUrl } from '../../lib/redirect';
import { checkSession } from './session';

/**
 * Layout route that only lets signed-in users through. Signed-out visitors go to /login?next=<where they wanted to go>,
 * and the login page sends them back there afterwards. While we do not know yet (first load) it waits instead of redirecting,
 * so a signed-in user who refreshes /account/orders is never bounced to the login page.
 */
export function ProtectedRoute() {
  const { status, signingOut } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const location = useLocation();

  // Once THIS mounted route has seen the user sign out, it stays in "leaving" mode until it is unmounted, even after the flag in the store
  // clears: the logout can finish while this page is still on screen (the router has already moved on, React has not caught up yet),
  // and redirecting to /login at that moment would beat the navigation home. A later visit mounts a fresh instance, which redirects as usual.
  // If the logout fails the user is still signed in, so leaving mode ends.
  const [leaving, setLeaving] = useState(false);
  if (signingOut && !leaving) setLeaving(true);
  if (leaving && !signingOut && status === 'authenticated') setLeaving(false);
  if (leaving || signingOut) return <LoadingState label="Signing out…" />;
  if (status === 'unknown') return <LoadingState label="Checking your session…" />;
  if (status === 'error') {
    return (
      <ErrorState
        title="We could not check your session"
        error={{ status: 'FETCH_ERROR' }}
        onRetry={() => void checkSession(dispatch, { force: true })}
      />
    );
  }
  if (status === 'anonymous')
    return <Navigate to={loginUrl(location.pathname + location.search)} replace />;
  return <Outlet />;
}
