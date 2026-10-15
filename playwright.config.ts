import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}/`;

/**
 * E2E suite. Runs against the optimized production build (`vite preview`)
 * on Chromium desktop and Chromium mobile (landscape touch device).
 * Every test gets a fresh browser context, so storage, service worker and
 * mocked server data start empty.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // WebGL runs on the CPU (SwiftShader) in headless Chromium; more workers only add contention.
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7 landscape'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
