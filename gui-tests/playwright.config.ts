import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: [
    {
      command: 'cd ../server && npm run dev',
      url: 'http://localhost:3001/api/config',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        JWT_SECRET: process.env.JWT_SECRET || 'test-secret-key-for-jwt-signing-in-tests-sufficiently-long',
        DB_CONNECTION_STRING: ':memory:',
      },
    },
    {
      command: 'cd ../client && npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
