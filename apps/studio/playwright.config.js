import { defineConfig, devices } from '@playwright/test';

const localBrowser = process.platform === 'win32' ? { channel: 'chrome' } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? [['github'], ['line']] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', grepInvert: /@mobile|@visual/, use: { ...devices['Desktop Chrome'], ...localBrowser, viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...localBrowser }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
    env: { ...process.env, VITE_PUBLISHER_URL: 'https://franz-lola-publisher.test.workers.dev' },
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
