import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/hr/leaves");
  await expect(page.getByRole("heading", { name: "Leave Management" })).toBeVisible({
    timeout: 15_000,
  });
});

test("page loads with Applications and Balances tabs", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Balances" })).toBeVisible();
});

test("Applications tab shows a DataTable with leave data", async ({ page }) => {
  // Wait for table to load (DataTable renders table after loading)
  const table = page.locator("table");
  await expect(table).toBeVisible({ timeout: 15_000 });

  // Check headers exist
  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Employee" })).toBeVisible();
  await expect(headers.filter({ hasText: "Status" })).toBeVisible();
});

test("Balances tab shows leave balance table", async ({ page }) => {
  await page.getByRole("tab", { name: "Balances" }).click();
  // Balances tab uses manual Table inside a Card
  await expect(page.getByText(/Leave Balances/)).toBeVisible({
    timeout: 15_000,
  });
});
