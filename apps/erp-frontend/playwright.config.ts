import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 3,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
        env: {
          ...process.env,
          VITE_ENABLE_MSW: process.env.VITE_ENABLE_MSW ?? 'true',
          VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? '/api/v1',
        },
        url: E2E_BASE_URL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
