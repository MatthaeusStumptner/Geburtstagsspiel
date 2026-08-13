import { defineConfig } from '@playwright/test';

const localBrowser = process.platform === 'win32' ? { channel: 'chrome' } : {};

export default defineConfig({
  testDir: './e2e',
  outputDir: './output/playwright/rendering-runner',
  fullyParallel: false,
  workers: 1,
  timeout: 1_200_000,
  expect: { timeout: 15_000 },
  grep: /@rendering-gate/,
  reporter: 'line',
  use: {
    ...localBrowser,
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});
