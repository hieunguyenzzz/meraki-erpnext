import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome,")).toBeVisible({
    timeout: 15_000,
  });
});

test("renders welcome heading and 2 stat cards", async ({ page }) => {
  const main = page.getByRole("main");
  await expect(main.getByText("Active Leads")).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText("Active Employees")).toBeVisible();
});

test("stat values load (not skeleton)", async ({ page }) => {
  await expect(page.getByText("Active Leads")).toBeVisible({ timeout: 15_000 });
  // The skeleton placeholder should disappear once data loads
  const values = page.locator('[class*="text-2xl"]');
  await expect(values.first()).toBeVisible({ timeout: 15_000 });
});
