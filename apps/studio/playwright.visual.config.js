import { defineConfig, devices } from '@playwright/test';

const localBrowser = process.platform === 'win32' ? { channel: 'chrome' } : {};

export default defineConfig({
  testDir: './e2e',
  outputDir: './output/playwright/videos',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  grep: /@visual/,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    ...localBrowser,
    baseURL: 'http://127.0.0.1:4191',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4191 --strictPort',
    env: { ...process.env, VITE_PUBLISHER_URL: 'https://franz-lola-publisher.test.workers.dev' },
    url: 'http://127.0.0.1:4191',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
