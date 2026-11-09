import { describe, expect, it } from 'vitest';
import { describeError, getApiError, getFieldErrors, getStatus } from './errors';

const apiError = (
  code: string,
  message: string,
  details: Record<string, unknown> | null = null,
  status = 422,
) => ({
  status,
  data: { error: { code, message, details } },
});

describe('api error helpers', () => {
  it('reads the backend error shape', () => {
    expect(getApiError(apiError('not_found', 'Nope'))?.code).toBe('not_found');
    expect(getApiError({ status: 500, data: 'plain text' })).toBeNull();
    expect(getApiError(undefined)).toBeNull();
  });

  it('reads the http status only when it is a number', () => {
    expect(getStatus({ status: 401 })).toBe(401);
    expect(getStatus({ status: 'FETCH_ERROR' })).toBeNull();
    expect(getStatus(null)).toBeNull();
  });

  it('extracts field messages from a 422', () => {
    const error = apiError('validation_failed', 'invalid', {
      fields: { email: ['Must be a valid email address'] },
    });

    expect(getFieldErrors(error)).toEqual({ email: ['Must be a valid email address'] });
    expect(getFieldErrors(apiError('not_found', 'x'))).toEqual({});
  });

  it('turns every kind of error into a readable sentence', () => {
    expect(
      describeError(apiError('invalid_credentials', 'Invalid email or password', null, 401)),
    ).toBe('Invalid email or password');
    expect(describeError(apiError('too_many_attempts', 'x', { retryAfterSeconds: 600 }, 429))).toBe(
      'Too many attempts. Try again in 10 min.',
    );
    expect(describeError({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })).toMatch(
      /Cannot reach the server/,
    );
    expect(describeError({ status: 'TIMEOUT_ERROR' })).toMatch(/too long/);
    expect(describeError({ status: 503, data: '<html>' })).toMatch(/our side/);
    expect(describeError(undefined)).toBe('Something went wrong. Try again.');
  });

  it('never exposes raw internals', () => {
    expect(describeError({ status: 500, data: 'SQLSTATE[HY000] stack trace' })).not.toMatch(
      /SQLSTATE/,
    );
  });
});
