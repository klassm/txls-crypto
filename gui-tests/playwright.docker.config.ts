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
    command: process.env.CI
      ? 'docker rm -f txls-docker-test-container 2>/dev/null || true && docker run --add-host=host.docker.internal:host-gateway --name txls-docker-test-container -p 3002:3000 -e JWT_SECRET=test-secret-key-for-jwt-signing-in-tests-sufficiently-long -e NODE_ENV=test -e DB_CONNECTION_STRING=mysql://root:root@host.docker.internal:3306/txls_test txls-docker-test'
      : 'docker build -t txls-docker-test -f ../docker/Dockerfile .. && docker rm -f txls-docker-test-container 2>/dev/null || true && docker run --name txls-docker-test-container -p 3002:3000 -e JWT_SECRET=test-secret-key-for-jwt-signing-in-tests-sufficiently-long -e NODE_ENV=test txls-docker-test',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
