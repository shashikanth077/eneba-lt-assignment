import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In production Vercel rewrites /api/* to the API, so the SPA always calls the same origin.
// In development this proxy plays the same role, which keeps cookies first-party.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['node_modules', 'dist', 'e2e'], // e2e/*.spec.ts belongs to Playwright
      css: false,
      restoreMocks: true,
    },
    server: {
      port: 5173,
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
