import { defineConfig } from '@playwright/test';

const API = 'http://127.0.0.1:8080';
const WEB = 'http://localhost:5173';
const inCi = Boolean(process.env.CI);

// The test starts the real stack itself: PHP API + Vite. The database must already exist (see .github/workflows/ci.yml).
// Stripe is not available without an account, so the API gets no secret key and a known webhook secret; the test plays
// Stripe's part with a signed webhook (see e2e/purchase.spec.ts).
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  retries: inCi ? 1 : 0,
  reporter: inCi ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    // Locally a browser may already be installed somewhere else (PW_CHROMIUM); in CI `playwright install` provides it.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: [
    {
      command: 'php -S 127.0.0.1:8080 -t public public/index.php',
      cwd: '../backend',
      url: `${API}/api/health`,
      reuseExistingServer: !inCi,
      env: {
        ...(process.env as Record<string, string>),
        APP_URL: WEB,
        CORS_ALLOWED_ORIGINS: WEB,
        COOKIE_SECURE: 'false',
        RATE_LIMITS_ENABLED: 'false',
        STRIPE_SECRET_KEY: '',
        STRIPE_WEBHOOK_SECRET: 'whsec_e2e',
      },
    },
    {
      command: 'npm run dev -- --host localhost',
      url: WEB,
      reuseExistingServer: !inCi,
      env: { ...(process.env as Record<string, string>), VITE_API_PROXY_TARGET: API },
    },
  ],
});
