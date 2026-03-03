import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

async function ensureUserExists(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForURL(/\/(onboard|login)/, { timeout: 10000 })
  
  if (page.url().includes('/onboard')) {
    await page.getByRole('textbox', { name: 'Full Name' }).fill(TEST_USER.name)
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(TEST_USER.password)
    await page.getByRole('textbox', { name: 'Confirm Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Create Account' }).click()
    await page.waitForURL('/', { timeout: 20000 })
  } else if (page.url().includes('/login')) {
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('/', { timeout: 20000 })
  }
}

async function logout(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /TU/i }).first().click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  await page.waitForURL('/login', { timeout: 10000 })
}

test.describe('Login', () => {
  test('login with valid credentials', async ({ page }) => {
    await ensureUserExists(page)
    await logout(page)
    
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('login fails with invalid password', async ({ page }) => {
    await ensureUserExists(page)
    await logout(page)
    
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill('WrongPassword123!')
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
    await expect(page.url()).toContain('/login')
  })

  test('redirect to home when accessing /login while authenticated', async ({ page }) => {
    await ensureUserExists(page)
    
    await page.goto('/login')
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })
})
