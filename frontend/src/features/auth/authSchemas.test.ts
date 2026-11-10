import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from './authSchemas';

/** The messages a person sees, by field. */
const problems = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );

describe('email rule', () => {
  it('accepts ordinary addresses, with surrounding spaces', () => {
    for (const ok of ['ana@example.com', ' ana@example.com ', 'a.b+c@sub.example.co.uk']) {
      expect(loginSchema.safeParse({ email: ok, password: 'x' }).success, ok).toBe(true);
    }
  });
  it('rejects empty, malformed and over-long addresses', () => {
    for (const bad of [
      '',
      '   ',
      'ana',
      'ana@',
      '@example.com',
      'ana@example',
      'a b@example.com',
      'ana@@example.com',
      `${'a'.repeat(250)}@example.com`,
    ]) {
      expect(problems(loginSchema.safeParse({ email: bad, password: 'x' })).email, bad).toBeTypeOf(
        'string',
      );
    }
  });
});

describe('loginSchema', () => {
  it('needs an email and any password, and reports every problem at once', () => {
    expect(loginSchema.safeParse({ email: 'ana@example.com', password: 'x' }).success).toBe(true);
    expect(
      Object.keys(problems(loginSchema.safeParse({ email: '', password: '' }))).sort(),
    ).toEqual(['email', 'password']);
  });
});

describe('registerSchema', () => {
  const ok = { displayName: 'Ana', email: 'ana@example.com', password: '12345678' };
  it('needs 2 to 50 characters for the name after trimming', () => {
    expect(registerSchema.safeParse({ ...ok, displayName: 'Al' }).success).toBe(true);
    expect(
      problems(registerSchema.safeParse({ ...ok, displayName: ' A ' })).displayName,
    ).toBeTypeOf('string');
    expect(registerSchema.safeParse({ ...ok, displayName: 'x'.repeat(50) }).success).toBe(true);
    expect(
      problems(registerSchema.safeParse({ ...ok, displayName: 'x'.repeat(51) })).displayName,
    ).toBeTypeOf('string');
  });
  it('needs a password of 8 to 128 characters, and reports every problem at once', () => {
    expect(registerSchema.safeParse(ok).success).toBe(true);
    expect(
      Object.keys(
        problems(registerSchema.safeParse({ displayName: '', email: 'x', password: '1234567' })),
      ).sort(),
    ).toEqual(['displayName', 'email', 'password']);
    expect(
      problems(registerSchema.safeParse({ ...ok, password: 'x'.repeat(129) })).password,
    ).toMatch(/at most/);
  });
});
