import { useEffect } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { checkSession } from './session';

/** Runs once when the app starts: finds out whether the browser already has a valid session. */
export function useBootstrapAuth(): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void checkSession(dispatch);
  }, [dispatch]);
}
