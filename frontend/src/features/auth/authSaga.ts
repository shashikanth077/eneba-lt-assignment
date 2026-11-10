import { call, put, takeLatest } from 'redux-saga/effects';
import { sendWelcomeEmail } from '../../services/email/emailjs';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { UserResponse } from '../../types/api.types';
import * as authService from './authService';
import {
  bootstrapAnonymous,
  bootstrapFailure,
  bootstrapRequest,
  bootstrapSuccess,
  loginFailure,
  loginRequest,
  loginSuccess,
  logoutRequest,
  registerFailure,
  registerRequest,
  registerSuccess,
  signedOut,
} from './authSlice';

function* bootstrap(): Generator {
  try {
    const { user } = (yield call(authService.getMe)) as UserResponse;
    yield put(bootstrapSuccess(user));
  } catch (error) {
    // 401 simply means "nobody is signed in". Anything else means we could not find out, which is not the same thing.
    yield put(toApiError(error).status === 401 ? bootstrapAnonymous() : bootstrapFailure());
  }
}

function* login(action: ReturnType<typeof loginRequest>): Generator {
  try {
    const { user } = (yield call(authService.login, action.payload)) as UserResponse;
    yield put(loginSuccess(user));
  } catch (error) {
    yield put(loginFailure(toApiError(error)));
  }
}

function* register(action: ReturnType<typeof registerRequest>): Generator {
  try {
    const { user } = (yield call(authService.register, action.payload)) as UserResponse;
    yield put(registerSuccess(user));
    // A welcome email to the account the SERVER created. sendWelcomeEmail never throws, and nothing waits for it.
    yield call(sendWelcomeEmail, user);
  } catch (error) {
    yield put(registerFailure(toApiError(error)));
  }
}

function* logout(): Generator {
  try {
    yield call(authService.logout);
  } catch {
    // Whatever the server said, this browser is done with the session.
  }
  yield put(signedOut());
}

export function* authSaga(): Generator {
  yield takeLatest(bootstrapRequest.type, bootstrap);
  yield takeLatest(loginRequest.type, login as never);
  yield takeLatest(registerRequest.type, register as never);
  yield takeLatest(logoutRequest.type, logout);
}
