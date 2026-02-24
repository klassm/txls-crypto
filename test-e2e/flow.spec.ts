import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

async function deleteAccount(page: import('@playwright/test').Page) {
  const accountCard = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) }).first()
  const allButtons = accountCard.locator('button')
  const count = await allButtons.count()
  
  for (let i = 0; i < count; i++) {
    const btn = allButtons.nth(i)
    const text = await btn.textContent()
    if (!text || text.trim() === '') {
      page.once('dialog', async (dialog) => {
        await dialog.accept()
      })
      await btn.click()
      return true
    }
  }
  return false
}

test.describe('Application Flow', () => {
  test('complete full user flow', async ({ page }) => {
    await test.step('Navigate to app and onboard', async () => {
      await page.goto('/')
      await expect(page.getByText('TXLS')).toBeVisible()
      
      await page.waitForTimeout(1000)
      
      await page.getByRole('textbox', { name: 'Full Name' }).fill(TEST_USER.name)
      await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
      await page.getByRole('textbox', { name: 'Email' }).fill(TEST_USER.email)
      await page.getByRole('textbox', { name: 'Password', exact: true }).fill(TEST_USER.password)
      await page.getByRole('textbox', { name: 'Confirm Password' }).fill(TEST_USER.password)
      await page.getByRole('button', { name: 'Create Account' }).click()
      await page.waitForURL(/\/$/, { timeout: 10000 })

      await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 10000 })
    })

    await test.step('Clean up existing accounts', async () => {
      const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
      const deleteCount = await accountCards.count()
      
      for (let i = 0; i < deleteCount; i++) {
        await deleteAccount(page)
        await page.waitForTimeout(500)
      }
    })

    await test.step('Create new account', async () => {
      await page.getByRole('heading', { name: 'Add Account' }).click()

      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Add New Account')).toBeVisible()

      await page.getByRole('combobox').click()
      await page.getByRole('option').first().click()

      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()

      await expect(page.getByRole('button', { name: 'View Details' }).first()).toBeVisible({ timeout: 10000 })
    })

    await test.step('Navigate to tax calculations', async () => {
      await page.getByRole('button', { name: 'Tax Calculations' }).click()
      await page.waitForURL('**/tax', { timeout: 10000 })
      await expect(page.getByRole('heading', { name: 'Tax Calculations' })).toBeVisible()
    })
  })
})
