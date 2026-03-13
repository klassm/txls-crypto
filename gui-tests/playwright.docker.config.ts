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
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-docker',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: {
    command: 'docker build -t txls-docker-test -f ../docker/Dockerfile .. && docker rm -f txls-docker-test-container 2>/dev/null || true && docker run -d --name txls-docker-test-container -p 3002:3000 -e JWT_SECRET=test-secret-key-for-jwt-signing-in-tests-sufficiently-long -e NODE_ENV=test txls-docker-test && sleep 5',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
})
