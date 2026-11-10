import { useEffect } from 'react';
import { useAppDispatch } from '../../app/hooks';
import { bootstrapRequest } from './authSlice';

/** Runs once when the app starts: finds out whether the browser already has a valid session (the cookie is HttpOnly, so we must ask). */
export function useBootstrapAuth(): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(bootstrapRequest());
  }, [dispatch]);
}
