import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/overview");
  await expect(page.getByRole("heading", { name: "Revenue Overview" })).toBeVisible({
    timeout: 15_000,
  });
});

test("summary cards: Total Revenue, Total Expenses, Net Profit", async ({ page }) => {
  await expect(page.getByText("Total Revenue")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Total Expenses")).toBeVisible();
  await expect(page.getByText("Net Profit")).toBeVisible();
});

test("Revenue vs Expenses chart renders", async ({ page }) => {
  await expect(page.locator(".recharts-responsive-container")).toBeVisible({
    timeout: 15_000,
  });
});

test("monthly breakdown DataTable with correct headers", async ({ page }) => {
  // Wait for data to load and DataTable to render
  const table = page.locator("table");
  await expect(table).toBeVisible({ timeout: 15_000 });
  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Month" })).toBeVisible();
  await expect(headers.filter({ hasText: "Revenue" })).toBeVisible();
  await expect(headers.filter({ hasText: "Expenses" })).toBeVisible();
  await expect(headers.filter({ hasText: "Net" })).toBeVisible();
});
