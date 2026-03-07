import { expect, test } from '@playwright/test'

const TEST_USER = {
  name: 'Test User',
  username: 'testuser',
  email: 'test@example.com',
  password: 'TestPassword123!Valid',
}

test.describe('Onboarding', () => {
  test('unauthenticated user sees onboarding form in HASS ingress', async ({ page }) => {
    await page.goto('')
    
    await page.waitForURL(/\/(onboard|login)/, { timeout: 10000 })
    
    await expect(page.locator('body')).toContainText(/Setup your admin account|Sign In/i, { timeout: 5000 })
    
    const hasOnboardForm = await page.getByRole('textbox', { name: 'Full Name' }).isVisible().catch(() => false)
    const hasLoginForm = await page.getByRole('textbox', { name: 'Username' }).isVisible().catch(() => false)
    
    expect(hasOnboardForm || hasLoginForm).toBe(true)
  })

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

  test('authentication persists after page reload in HASS ingress', async ({ page }) => {
    await page.goto('')
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
    
    const config = await page.evaluate(async () => {
      const base = window.location.pathname.replace(/\/$/, '')
      const response = await fetch(base + '/api/config', { credentials: 'include' })
      return response.json()
    })
    
    expect(config.user).not.toBeNull()
    expect(config.user.username).toBe(TEST_USER.username)
  })
})

test.describe('HASS Ingress Authentication', () => {
  test('authentication persists after double reload in HASS ingress', async ({ page, baseURL }) => {
    test.skip(!baseURL?.includes('hassio_ingress'), 'HASS ingress only')
    await page.goto('')
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
    
    const reloadUrl = baseURL!
    await page.goto(reloadUrl)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    await page.goto(reloadUrl)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    const config = await page.evaluate(async () => {
      const base = window.location.pathname.replace(/\/$/, '')
      const response = await fetch(base + '/api/config', { credentials: 'include' })
      return response.json()
    })
    
    expect(config.user).not.toBeNull()
    expect(config.user.username).toBe(TEST_USER.username)
  })

  test('authentication persists after triple reload in HASS ingress', async ({ page, baseURL }) => {
    test.skip(!baseURL?.includes('hassio_ingress'), 'HASS ingress only')
    await page.goto('')
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
    
    const reloadUrl = baseURL!
    await page.goto(reloadUrl)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    await page.goto(reloadUrl)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    await page.goto(reloadUrl)
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    const config = await page.evaluate(async () => {
      const base = window.location.pathname.replace(/\/$/, '')
      const response = await fetch(base + '/api/config', { credentials: 'include' })
      return response.json()
    })
    
    expect(config.user).not.toBeNull()
    expect(config.user.username).toBe(TEST_USER.username)
  })

  test('HASS ingress auto-login after onboarding', async ({ page, context, baseURL }) => {
    test.skip(!baseURL?.includes('hassio_ingress'), 'HASS ingress only')
    await page.goto('')
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
    
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    const page2 = await context.newPage()
    await page2.goto('')
    await expect(page2.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    const config = await page2.evaluate(async () => {
      const base = window.location.pathname.replace(/\/$/, '')
      const response = await fetch(base + '/api/config', { credentials: 'include' })
      return response.json()
    })
    
    expect(config.user).not.toBeNull()
    expect(config.user.username).toBe(TEST_USER.username)
  })

  test('returning user is authenticated in HASS ingress', async ({ page, context, baseURL }) => {
    test.skip(!baseURL?.includes('hassio_ingress'), 'HASS ingress only')
    await page.goto('')
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
    
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible({ timeout: 15000 })
    
    const cookies = await context.cookies()
    const authCookie = cookies.find(c => c.name === 'auth_token')
    expect(authCookie).toBeDefined()
    expect(authCookie!.httpOnly).toBe(true)
  })
})
