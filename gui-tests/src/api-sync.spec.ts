import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

test.describe('API Sync', () => {
  test.beforeEach(async ({ page }) => {
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
      } else if (page.url().includes('/login')) {
        await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
        await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
        await page.getByRole('button', { name: 'Sign In' }).click()
      }
    } catch {
      // HASS ingress auto-login: already on home page
    }
    
    await page.waitForURL(/\/|\/portfolio|\/accounts|hass-test-session\/?$/, { timeout: 20000 })
    await page.waitForLoadState('networkidle')
    
    await page.getByRole('button', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('account page shows import or sync options', async ({ page }) => {
    const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
    const count = await accountCards.count()
    
    if (count === 0) {
      const addAccountCard = page.locator('.MuiCard-root').filter({ has: page.locator('text=Add Account') })
      await addAccountCard.click()
      await page.waitForTimeout(300)
      await page.getByRole('combobox').click()
      await page.getByRole('option').first().click()
      await page.getByRole('button', { name: 'Create' }).click()
      await page.waitForTimeout(500)
    }
    
    await page.getByRole('button', { name: 'View Details' }).first().click()
    await expect(page.getByText('Loading account...')).not.toBeVisible({ timeout: 10000 })
    
    await expect(page.getByRole('heading', { name: /Bitpanda|Trade Republic/ })).toBeVisible({ timeout: 10000 })
  })
})
