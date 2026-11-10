import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { describeApiError, getFieldErrors, toApiError } from './apiErrorHandler';

const response = (status: number, data: unknown): AxiosResponse => ({
  status,
  data,
  statusText: '',
  headers: {},
  config: { headers: new AxiosHeaders() },
});
const httpError = (status: number, data: unknown) =>
  new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, response(status, data));
const body = (code: string, message: string, details: Record<string, unknown> | null = null) => ({
  error: { code, message, details },
});

describe('toApiError', () => {
  it('keeps the backend error shape and adds the HTTP status', () => {
    expect(
      toApiError(
        httpError(422, body('validation_failed', 'invalid', { fields: { email: ['bad'] } })),
      ),
    ).toEqual({
      status: 422,
      code: 'validation_failed',
      message: 'invalid',
      details: { fields: { email: ['bad'] } },
    });
  });

  it('never leaks a non-API body: 5xx and 4xx get a generic sentence', () => {
    expect(toApiError(httpError(500, '<html>stack trace</html>')).message).toBe(
      'Something went wrong on our side. Try again.',
    );
    expect(toApiError(httpError(404, 'plain')).message).toBe('Something went wrong. Try again.');
  });

  it('tells a network failure and a timeout apart', () => {
    expect(toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatchObject({
      status: 0,
      code: 'network_error',
    });
    expect(toApiError(new AxiosError('timeout', 'ECONNABORTED'))).toMatchObject({
      status: 0,
      code: 'timeout',
    });
  });

  it('copes with anything else that was thrown', () => {
    expect(toApiError(new Error('boom'))).toMatchObject({ code: 'unknown', status: 0 });
    expect(toApiError('weird')).toMatchObject({ code: 'unknown' });
  });

  it('produces plain data, so it can live in the store', () => {
    const error = toApiError(httpError(409, body('out_of_stock', 'x', { items: [] })));
    expect(JSON.parse(JSON.stringify(error))).toEqual(error);
  });
});

describe('describeApiError', () => {
  const e = (
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
    status = 429,
  ) => ({ status, code, message, details });

  it('uses the server message, and gives rate limits as a wait', () => {
    expect(describeApiError(e('invalid_credentials', 'Invalid email or password', null, 401))).toBe(
      'Invalid email or password',
    );
    expect(describeApiError(e('too_many_attempts', 'x', { retryAfterSeconds: 600 }))).toBe(
      'Too many attempts. Try again in 10 min.',
    );
    expect(describeApiError(e('rate_limited', 'x', { retryAfterSeconds: 42 }))).toBe(
      'Too many attempts. Try again in 42 s.',
    );
    expect(describeApiError(e('rate_limited', 'Too many requests'))).toBe('Too many requests');
  });

  it('has a fallback for nothing at all', () => {
    expect(describeApiError(null)).toBe('Something went wrong. Try again.');
  });
});

describe('getFieldErrors', () => {
  it('extracts field messages from a 422 and is empty otherwise', () => {
    expect(
      getFieldErrors({
        status: 422,
        code: 'v',
        message: 'm',
        details: { fields: { email: ['Must be valid'] } },
      }),
    ).toEqual({ email: ['Must be valid'] });
    expect(getFieldErrors({ status: 404, code: 'n', message: 'm', details: null })).toEqual({});
    expect(getFieldErrors(null)).toEqual({});
  });
});
