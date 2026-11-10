import axios from 'axios';
import type { SerializedApiError } from '../../types/common.types';
import type { ApiErrorBody } from '../../types/api.types';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/** Turns whatever a request threw into the one error shape the store keeps. Never leaks internals into the message. */
export function toApiError(error: unknown): SerializedApiError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const body: unknown = error.response.data;
      if (isApiErrorBody(body)) {
        return { status: error.response.status, ...body.error };
      }
      return {
        status: error.response.status,
        code: 'http_error',
        message:
          error.response.status >= 500
            ? 'Something went wrong on our side. Try again.'
            : 'Something went wrong. Try again.',
        details: null,
      };
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        status: 0,
        code: 'timeout',
        message: 'The server took too long to answer. Try again.',
        details: null,
      };
    }
    return {
      status: 0,
      code: 'network_error',
      message: 'Cannot reach the server. Check your connection and try again.',
      details: null,
    };
  }
  return { status: 0, code: 'unknown', message: 'Something went wrong. Try again.', details: null };
}

/** A sentence a person can read. Rate limits are given with the wait. */
export function describeApiError(error: SerializedApiError | null | undefined): string {
  if (!error) return 'Something went wrong. Try again.';
  if (error.code === 'too_many_attempts' || error.code === 'rate_limited') {
    const wait = Number(error.details?.retryAfterSeconds);
    if (Number.isFinite(wait) && wait > 0) {
      return `Too many attempts. Try again in ${wait < 60 ? `${Math.ceil(wait)} s` : `${Math.ceil(wait / 60)} min`}.`;
    }
  }
  return error.message;
}

/** Field-level messages of a 422 response: { email: ['Must be a valid email address'] }. */
export function getFieldErrors(
  error: SerializedApiError | null | undefined,
): Record<string, string[]> {
  const fields = error?.details?.fields;
  return typeof fields === 'object' && fields !== null ? (fields as Record<string, string[]>) : {};
}
