import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,        // pyodide cold-load can be 5-15s; give E2E generous budget
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'node scripts/dev-server.mjs',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
