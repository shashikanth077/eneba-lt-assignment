import { call, put, takeLatest } from 'redux-saga/effects';
import { sendRegistrationEmail, sendVerificationEmail } from '../../services/email/emailService';
import { toApiError } from '../../services/api/apiErrorHandler';
import type { UserResponse } from '../../types/api.types';
import type { EmailResult } from '../../services/email/emailTypes';
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
  changePasswordFailure,
  changePasswordRequest,
  changePasswordSuccess,
  updateProfileFailure,
  updateProfileRequest,
  updateProfileSuccess,
  resendVerificationFailure,
  resendVerificationRequest,
  resendVerificationSuccess,
  signedOut,
  verifyEmailFailure,
  verifyEmailRequest,
  verifyEmailSuccess,
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
    // A welcome email to the account the SERVER created. It never throws, and nothing waits for it. (The verification e-mail is
    // sent by the server itself during register: its link is a secret.)
    yield call(sendRegistrationEmail, { user });
  } catch (error) {
    yield put(registerFailure(toApiError(error)));
  }
}

function* verifyEmail(action: ReturnType<typeof verifyEmailRequest>): Generator {
  try {
    yield call(authService.verifyEmail, action.payload);
    yield put(verifyEmailSuccess());
  } catch (error) {
    yield put(verifyEmailFailure(toApiError(error)));
  }
}

function* resendVerification(): Generator {
  const result = (yield call(sendVerificationEmail)) as EmailResult;
  yield put(result.status === 'sent' ? resendVerificationSuccess() : resendVerificationFailure());
}

function* updateProfile(action: ReturnType<typeof updateProfileRequest>): Generator {
  try {
    const { user } = (yield call(authService.updateProfile, action.payload)) as UserResponse;
    yield put(updateProfileSuccess(user));
  } catch (error) {
    yield put(updateProfileFailure(toApiError(error)));
  }
}

function* changePassword(action: ReturnType<typeof changePasswordRequest>): Generator {
  try {
    yield call(
      authService.changePassword,
      action.payload.currentPassword,
      action.payload.newPassword,
    );
    yield put(changePasswordSuccess());
  } catch (error) {
    yield put(changePasswordFailure(toApiError(error)));
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
  yield takeLatest(verifyEmailRequest.type, verifyEmail as never);
  yield takeLatest(resendVerificationRequest.type, resendVerification);
  yield takeLatest(updateProfileRequest.type, updateProfile as never);
  yield takeLatest(changePasswordRequest.type, changePassword as never);
  yield takeLatest(logoutRequest.type, logout);
}
