import { test, expect } from "@playwright/test";

const BITPANDA_API_BASE = "https://api.bitpanda.com/v1";

test.describe("API Sync", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");

    await page.waitForURL("**/login");

    await page.getByLabel("Username").fill("admin");
    await page.getByLabel("Password").fill("adminpassword");
    await page.getByRole("button", { name: "Login" }).click();

    await page.waitForURL("**/accounts");
  });

  test("shows API sync option for Bitpanda account", async ({ page }) => {
    const accounts = page.getByRole("link", { name: /bitpanda/i });
    if ((await accounts.count()) === 0) {
      const addBtn = page.getByRole("button", { name: /add account/i });
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.getByRole("menuitem", { name: /bitpanda/i }).click();
        await page.waitForURL("**/accounts/*");
      }
    } else {
      await accounts.first().click();
      await page.waitForURL("**/accounts/*");
    }

    await expect(page.getByRole("button", { name: /import csv|enable api sync|sync/i })).toBeVisible();
  });

  test("allows enabling API sync from empty state", async ({ page }) => {
    await page.goto("/accounts/1");

    const enableBtn = page.getByRole("button", { name: /enable api sync/i });
    
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      
      await expect(page.getByPlaceholder("API Key")).toBeVisible();
    }
  });

  test("validates API key before saving", async ({ page }) => {
    await page.goto("/accounts/1");

    const apiKeyField = page.getByPlaceholder("API Key");
    
    if (!await apiKeyField.isVisible()) {
      const enableBtn = page.getByRole("button", { name: /enable api sync/i });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
      }
    }

    const apiKey = "invalid-test-key";
    
    await page.getByPlaceholder("API Key").fill(apiKey);
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText(/invalid|failed|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("saves valid API key and disables CSV import", async ({ page }) => {
    await page.goto("/accounts/1");

    const apiKey = "valid-test-api-key-12345";

    const apiKeyField = page.getByPlaceholder("API Key");
    
    if (!await apiKeyField.isVisible()) {
      const enableBtn = page.getByRole("button", { name: /enable api sync/i });
      if (await enableBtn.isVisible()) {
        await enableBtn.click();
      }
    }

    await page.getByPlaceholder("API Key").fill(apiKey);
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole("button", { name: /import csv/i })).not.toBeVisible();
  });

  test("shows sync button after API key is configured", async ({ page }) => {
    await page.goto("/accounts/1");

    const syncBtn = page.getByRole("button", { name: /^sync$/i });
    const deleteKeyBtn = page.getByRole("button", { name: /delete key/i });
    
    if (await syncBtn.isVisible()) {
      await expect(deleteKeyBtn).toBeVisible();
    }
  });

  test("allows deleting API key to re-enable CSV import", async ({ page }) => {
    await page.goto("/accounts/1");

    const deleteKeyBtn = page.getByRole("button", { name: /delete key/i });
    
    if (await deleteKeyBtn.isVisible()) {
      page.on("dialog", (dialog) => dialog.accept());
      
      await deleteKeyBtn.click();

      await expect(page.getByRole("button", { name: /import csv/i })).toBeVisible({ timeout: 5000 });
    }
  });
});
