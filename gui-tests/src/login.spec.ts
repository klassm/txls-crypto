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
}

async function logout(page: import('@playwright/test').Page, baseURL: string | undefined) {
  const isHassIngress = baseURL?.includes('hassio_ingress')
  
  await page.getByRole('button', { name: /TU/i }).first().click()
  await page.getByRole('menuitem', { name: 'Logout' }).click()
  
  if (isHassIngress) {
    await page.waitForURL(/\/$|hass-test-session\/?$/, { timeout: 10000 })
  } else {
    await page.waitForURL(/\/login/, { timeout: 10000 })
  }
}

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureUserExists(page)
  })

  test('navigation links are visible and work', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Portfolio' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accounts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tax' })).toBeVisible()
  })

  test('can navigate to Portfolio page', async ({ page }) => {
    await page.getByRole('button', { name: 'Portfolio' }).click()
    await page.waitForURL(/\/portfolio/)
    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  })

  test('can navigate to Accounts page', async ({ page }) => {
    await page.getByRole('button', { name: 'Accounts' }).click()
    await page.waitForURL(/\/accounts/)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  })

  test('can navigate to Tax page', async ({ page }) => {
    await page.getByRole('button', { name: 'Tax' }).click()
    await page.waitForURL(/\/tax/)
    await expect(page.getByRole('heading', { name: 'Tax Calculations' })).toBeVisible()
  })

  test('logo click navigates to portfolio when accounts exist', async ({ page }) => {
    // First check if we have accounts
    await page.getByRole('button', { name: 'Accounts' }).click()
    const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
    const hasAccounts = (await accountCards.count()) > 0

    if (hasAccounts) {
      await page.locator('img[alt="TXLS Logo"]').click()
      await expect(page).toHaveURL(/\/portfolio/)
    }
  })

  test('logo click navigates to accounts when no accounts exist', async ({ page }) => {
    // Delete all accounts first
    await page.getByRole('button', { name: 'Accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
    
    const accountCards = page.locator('.MuiCard-root').filter({ has: page.getByRole('button', { name: 'View Details' }) })
    const deleteButtons = page.locator('button').filter({ has: page.locator('svg path[d*="M6 19c0"]') })
    
    while ((await accountCards.count()) > 0) {
      const deleteBtn = deleteButtons.first()
      if (await deleteBtn.isVisible()) {
        page.once('dialog', async (dialog) => {
          await dialog.accept()
        })
        await deleteBtn.click()
        await page.waitForTimeout(300)
      } else {
        break
      }
    }

    await page.locator('img[alt="TXLS Logo"]').click()
    await expect(page).toHaveURL(/\/accounts/)
  })
})

test.describe('Login', () => {
  test('login with valid credentials', async ({ page, baseURL }) => {
    test.skip(!!baseURL?.includes('hassio_ingress'), 'HASS ingress auto-login makes this test irrelevant')
    await ensureUserExists(page)
    await logout(page, baseURL)
    
    await page.getByRole('textbox', { name: 'Username' }).fill(TEST_USER.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(TEST_USER.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await page.waitForURL(/\/|\/portfolio|\/accounts|hass-test-session\/?$/, { timeout: 10000 })
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
})

test.describe('Onboarding', () => {
  test('unauthenticated user sees onboarding form in HASS ingress', async ({ page, baseURL }) => {
    test.skip(!!baseURL?.includes('hassio_ingress'), 'HASS ingress auto-login makes this test irrelevant')
    await page.goto('')
    
    await page.waitForURL(/\/(onboard|login)/, { timeout: 10000 })
    
    await expect(page.locator('body')).toContainText(/Setup your admin account|Sign In/i, { timeout: 5000 })
    
    const hasOnboardForm = await page.getByRole('textbox', { name: 'Full Name' }).isVisible().catch(() => false)
    const hasLoginForm = await page.getByRole('textbox', { name: 'Username' }).isVisible().catch(() => false)
    
    expect(hasOnboardForm || hasLoginForm).toBe(true)
  })

  test('onboard new user', async ({ page }) => {
    await ensureUserExists(page)
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('button', { name: /TU/i }).first()).toBeVisible()
  })

  test('authentication persists after page reload in HASS ingress', async ({ page, baseURL }) => {
    test.skip(!baseURL?.includes('hassio_ingress'), 'This test is only relevant for HASS ingress')
    await ensureUserExists(page)
    
    const config = await page.evaluate(async () => {
      const path = window.location.pathname
      const ingressMatch = path.match(/^(\/api\/hassio_ingress\/[^/]+)/)
      const base = ingressMatch ? ingressMatch[1] : ''
      const response = await fetch(base + '/api/config', { credentials: 'include' })
      return response.json()
    })
    
    expect(config.user).not.toBeNull()
    expect(config.user.username).toBe(TEST_USER.username)
  })
})
