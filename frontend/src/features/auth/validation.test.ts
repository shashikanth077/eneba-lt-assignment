import { describe, expect, it } from 'vitest';
import { validateDisplayName, validateEmail, validateLogin, validateRegister } from './validation';

describe('validateEmail', () => {
  it('accepts ordinary addresses, with surrounding spaces', () => {
    for (const ok of ['ana@example.com', ' ana@example.com ', 'a.b+c@sub.example.co.uk']) {
      expect(validateEmail(ok)).toBeUndefined();
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
      expect(validateEmail(bad), bad).toBeTypeOf('string');
    }
  });
});

describe('validateDisplayName', () => {
  it('needs 2 to 50 characters after trimming', () => {
    expect(validateDisplayName('Al')).toBeUndefined();
    expect(validateDisplayName(' A ')).toBeTypeOf('string');
    expect(validateDisplayName('x'.repeat(50))).toBeUndefined();
    expect(validateDisplayName('x'.repeat(51))).toBeTypeOf('string');
  });
});

describe('validateLogin / validateRegister', () => {
  it('login needs an email and any password, and reports every problem at once', () => {
    expect(validateLogin({ email: 'ana@example.com', password: 'x' })).toEqual({});
    expect(Object.keys(validateLogin({ email: '', password: '' })).sort()).toEqual([
      'email',
      'password',
    ]);
  });
  it('register also needs a name and a password of at least 8 characters', () => {
    expect(
      validateRegister({ displayName: 'Ana', email: 'ana@example.com', password: '12345678' }),
    ).toEqual({});
    expect(
      Object.keys(validateRegister({ displayName: '', email: 'x', password: '1234567' })).sort(),
    ).toEqual(['displayName', 'email', 'password']);
    expect(
      validateRegister({ displayName: 'Ana', email: 'ana@example.com', password: 'x'.repeat(201) })
        .password,
    ).toMatch(/at most/);
  });
});
