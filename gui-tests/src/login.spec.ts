import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

async function ensureUserExists(page: import('@playwright/test').Page) {
  await page.goto('')
  
  try {
    await page.waitForURL(/\/(onboard|login)/, { timeout: 5000 })
    
    if (page.url().includes('/onboard')) {
      await page.getByRole('textbox', { name: 'Full Name' }).fill(TEST_USER.name)
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(TEST_USER.password)
      await page.getByRole('textbox', { name: 'Confirm Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Create Account' }).click()
      await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 20000 })
    } else if (page.url().includes('/login')) {
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Sign In' }).click()
      await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 20000 })
    }
  } catch {
    // HASS ingress auto-login: already on home page
    await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 5000 })
  }
}

async function logout(page: import('@playwright/test').Page, baseURL: string | undefined) {
  const isHassIngress = baseURL?.includes('hassio_ingress')
  
  await page.getByRole('button', { name: /TU/i }).first().click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  
  if (isHassIngress) {
    await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 10000 })
  } else {
    await page.waitForURL(/\/login/, { timeout: 10000 })
  }
}

test.describe('Login', () => {
  test('login with valid credentials', async ({ page, baseURL }) => {
    test.skip(!!baseURL?.includes('hassio_ingress'), 'HASS ingress auto-login makes this test irrelevant')
    await ensureUserExists(page)
    await logout(page, baseURL)
    
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('login fails with invalid password', async ({ page, baseURL }) => {
    test.skip(!!baseURL?.includes('hassio_ingress'), 'HASS ingress auto-login makes this test irrelevant')
    await ensureUserExists(page)
    await logout(page, baseURL)
    
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword123!')
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
    await expect(page.url()).toContain('/login')
  })

  test('redirect to home when accessing /login while authenticated', async ({ page }) => {
    await ensureUserExists(page)
    
    await page.goto('./login')
    await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })
})
