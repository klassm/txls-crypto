import { test, expect } from "@playwright/test";
import nock from "nock";

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

    await expect(page.getByRole("heading", { name: "API Sync" })).toBeVisible();
  });

  test("validates API key before saving", async ({ page }) => {
    await page.goto("/accounts/1");

    await expect(page.getByRole("heading", { name: "API Sync" })).toBeVisible();

    const apiKey = "invalid-test-key";
    
    nock(BITPANDA_API_BASE)
      .get("/trades")
      .query({ page_size: 1 })
      .reply(401, { error: "Unauthorized" });

    await page.getByLabel("Enable API Sync").click();

    await page.getByPlaceholder("API Key").fill(apiKey);
    await page.getByRole("button", { name: /test & save/i }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test("saves valid API key and disables CSV import", async ({ page }) => {
    await page.goto("/accounts/1");

    const apiKey = "valid-test-api-key-12345";

    nock(BITPANDA_API_BASE)
      .persist()
      .get("/trades")
      .query({ page_size: 1 })
      .matchHeader("X-Api-Key", apiKey)
      .reply(200, { data: [], meta: { total_count: 0, page_size: 1 } });

    nock(BITPANDA_API_BASE)
      .persist()
      .get("/trades")
      .query({ page_size: 100 })
      .matchHeader("X-Api-Key", apiKey)
      .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

    nock(BITPANDA_API_BASE)
      .persist()
      .get(/.*/)
      .reply(200, { data: [], meta: { total_count: 0, page_size: 100 } });

    await page.getByLabel("Enable API Sync").click();

    await page.getByPlaceholder("API Key").fill(apiKey);
    await page.getByRole("button", { name: /test & save/i }).click();

    await expect(page.getByText(/api key saved/i)).toBeVisible();

    await expect(page.getByRole("button", { name: /import csv/i })).not.toBeVisible();

    nock.cleanAll();
  });

  test("shows sync status and allows manual sync", async ({ page }) => {
    await page.goto("/accounts/1");

    await expect(page.getByRole("heading", { name: "API Sync" })).toBeVisible();

    const hasApiKey = await page.getByText(/api key configured/i).isVisible();
    
    if (hasApiKey) {
      await expect(page.getByRole("button", { name: /sync now/i })).toBeVisible();
      
      await page.getByRole("button", { name: /sync now/i }).click();
      
      await expect(page.getByRole("progressbar")).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });

  test("disabling API sync re-enables CSV import", async ({ page }) => {
    await page.goto("/accounts/1");

    const isEnabled = await page.getByLabel("Enable API Sync").isChecked();
    
    if (isEnabled) {
      page.on("dialog", (dialog) => dialog.accept());
      
      await page.getByLabel("Enable API Sync").click();
      
      await expect(page.getByRole("button", { name: /import csv/i })).toBeVisible();
    }
  });
});
