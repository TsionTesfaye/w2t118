/**
 * Playwright E2E Test Configuration
 *
 * Tests run against the Vite production preview server (npm run build + preview).
 * Each test file gets a fresh browser context with empty localStorage and IndexedDB,
 * ensuring complete isolation between tests.
 *
 * Run:
 *   npm run test:e2e           — run all browser E2E tests (headless)
 *   npm run test:e2e:ui        — run with Playwright UI (headed, interactive)
 *   npm run test:e2e:debug     — run with browser visible + slow-mo
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './browser_tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Run tests in files sequentially — IndexedDB state is per-browser-context,
   * but we avoid parallel workers to prevent port conflicts with the webServer. */
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  /* Start the Vite preview server before running tests.
   * The build must already have been run (`npm run build`).
   * In CI, run `npm run build && npm run test:e2e`. */
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
