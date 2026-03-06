import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

test.describe('Onboarding', () => {
  test('onboard new user', async ({ page }) => {
    await page.goto('')
    await expect(page.getByText('TXLS')).toBeVisible()
    
    await page.waitForURL(/\/(onboard|login)/, { timeout: 10000 })
    
    if (page.url().includes('/login')) {
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Sign In' }).click()
    } else {
      await page.getByRole('textbox', { name: 'Full Name' }).fill(TEST_USER.name)
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(TEST_USER.password)
      await page.getByRole('textbox', { name: 'Confirm Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Create Account' }).click()
    }
    
    await page.waitForURL(/(\/onboard|\/login|hass-test-session\/?$)/, { timeout: 20000 })
    
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('button', { name: /TU/i }).first()).toBeVisible()
  })
})
