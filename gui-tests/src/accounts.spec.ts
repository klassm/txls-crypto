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
    
    // Navigate to accounts page
    await page.getByRole('button', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('create and delete account', async ({ page }) => {
    const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
    const deleteCount = await accountCards.count()
    
    for (let i = 0; i < deleteCount; i++) {
      await deleteAccount(page)
      await page.waitForTimeout(500)
    }
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    
    const addAccountCard = page.locator('.MuiCard-root').filter({ has: page.locator('text=Add Account') })
    await expect(addAccountCard).toBeVisible({ timeout: 10000 })
    await addAccountCard.click()
    await page.waitForTimeout(300)

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Add New Account')).toBeVisible()

    await page.getByRole('combobox').click()
    await page.getByRole('option').first().click()

    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    await expect(page.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 10000 })
    
    await page.getByRole('button', { name: 'View Details' }).first().click()
    await expect(page.getByText('Loading account...')).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /Bitpanda|Trade Republic/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/No transactions found|Import CSV/)).toBeVisible()
    
    await page.goBack()
    await expect(page.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 10000 })
    
    await deleteAccount(page)
    await page.waitForTimeout(300)
    
    await expect(addAccountCard).toBeVisible({ timeout: 10000 })
  })
})
