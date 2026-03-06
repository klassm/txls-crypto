import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

async function deleteAccount(page: import('@playwright/test').Page) {
  const accountCard = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) }).first()
  const deleteButton = accountCard.locator('button').filter({ hasNotText: /View Details/i }).first()
  
  if (await deleteButton.count() > 0) {
    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })
    await deleteButton.click()
    await page.waitForTimeout(500)
    return true
  }
  return false
}

test.describe('Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('')
    await page.waitForURL(/\/(onboard|login)/, { timeout: 10000 })
    
    if (page.url().includes('/onboard')) {
      await page.getByRole('textbox', { name: 'Full Name' }).fill(TEST_USER.name)
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(TEST_USER.password)
      await page.getByRole('textbox', { name: 'Confirm Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Create Account' }).click()
      await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 20000 })
    }
    
    if (page.url().includes('/login')) {
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Sign In' }).click()
      await page.waitForURL(/(\/$|hass-test-session\/?$)/, { timeout: 10000 })
    }
    
    await page.waitForLoadState('networkidle')
  })

  test('create and delete account', async ({ page }) => {
    const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
    const deleteCount = await accountCards.count()
    
    for (let i = 0; i < deleteCount; i++) {
      await deleteAccount(page)
      await page.waitForTimeout(300)
    }
    
    await page.waitForLoadState('networkidle')
    
    const addAccountCard = page.locator('.MuiCard-root').filter({ has: page.locator('text=Add Account') })
    await expect(addAccountCard).toBeVisible({ timeout: 10000 })
    await addAccountCard.click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Add New Account')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('option').first().click()

    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await expect(page.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 10000 })
    
    await deleteAccount(page)
    await page.waitForTimeout(300)
    
    await expect(addAccountCard).toBeVisible({ timeout: 10000 })
  })
})
