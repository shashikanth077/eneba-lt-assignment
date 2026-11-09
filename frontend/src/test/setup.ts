import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// RTK Query builds `new Request('/api/...')`. Browsers resolve that against the page; Node's Request needs an absolute URL.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input,
      init,
    );
  }
} as typeof Request;

// jsdom has no layout engine; MUI's popper and menus only need these to exist.
window.scrollTo = () => undefined;
