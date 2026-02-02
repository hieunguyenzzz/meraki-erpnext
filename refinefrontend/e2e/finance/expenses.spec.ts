import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible({
    timeout: 15_000,
  });
});

test("shows table or empty state", async ({ page }) => {
  // DataTable renders a table once data loads (with "No results." if empty)
  await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
});

test("table has correct column headers when data exists", async ({ page }) => {
  const table = page.locator("table");
  await expect(table).toBeVisible({ timeout: 15_000 });

  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Name" })).toBeVisible();
  await expect(headers.filter({ hasText: "Supplier" })).toBeVisible();
  await expect(headers.filter({ hasText: "Date" })).toBeVisible();
  await expect(headers.filter({ hasText: "Status" })).toBeVisible();
});
