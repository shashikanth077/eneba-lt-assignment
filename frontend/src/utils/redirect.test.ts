import { describe, expect, it } from 'vitest';
import { loginUrl, safeNext } from './redirect';

describe('loginUrl', () => {
  it('carries the target in ?next, encoded', () => {
    expect(loginUrl('/account/orders')).toBe('/login?next=%2Faccount%2Forders');
    expect(loginUrl('/store?platform=steam&sort=newest')).toBe(
      '/login?next=%2Fstore%3Fplatform%3Dsteam%26sort%3Dnewest',
    );
  });
});

describe('safeNext', () => {
  it.each([
    ['/account/orders', '/account/orders'],
    ['/store?platform=steam', '/store?platform=steam'],
    ['/product/some-game', '/product/some-game'],
  ])('keeps the same-site path %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    ['//evil.example/steal'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['evil.example'],
    ['/\t/evil.example'],
    ['/path\nwith-newline'],
    [''],
    [null],
    [undefined],
  ])('falls back to the default for %j', (input) => {
    expect(safeNext(input)).toBe('/');
  });

  it('never bounces back into the auth pages', () => {
    expect(safeNext('/login')).toBe('/');
    expect(safeNext('/login?next=%2Fcart')).toBe('/');
    expect(safeNext('/register')).toBe('/');
  });

  it('accepts a custom fallback', () => {
    expect(safeNext('https://x.y', '/home')).toBe('/home');
  });
});
