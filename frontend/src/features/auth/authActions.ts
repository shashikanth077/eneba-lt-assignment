import { createAction } from '@reduxjs/toolkit';

/** The server answered 401 to a request that needed a session: the cookie expired or was revoked. */
export const sessionExpired = createAction('auth/sessionExpired');
