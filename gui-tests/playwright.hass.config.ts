import { defineConfig, devices } from '@playwright/test'

const INGRESS_SESSION = 'hass-test-session'
const BASE_URL = `http://localhost:3002/api/hassio_ingress/${INGRESS_SESSION}/`

export default defineConfig({
  testDir: './src',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 60000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-hass',
      use: devices['Desktop Chrome'],
    },
  ],
  webServer: {
    command: `docker build -t txls-hass-test -f ../docker/Dockerfile.hass .. && docker rm -f txls-hass-test-container 2>/dev/null || true && docker run -d --name txls-hass-test-container -p 3002:3000 -e JWT_SECRET=test-secret-key-for-jwt-signing-in-tests-sufficiently-long txls-hass-test && sleep 5`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300000,
  },
})
