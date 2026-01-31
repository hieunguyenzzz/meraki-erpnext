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

test("Monthly Breakdown table with correct headers", async ({ page }) => {
  await expect(page.getByText("Monthly Breakdown")).toBeVisible({ timeout: 15_000 });

  const table = page.locator("table");
  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Month");
  await expect(headers.nth(1)).toHaveText("Revenue");
  await expect(headers.nth(2)).toHaveText("Expenses");
  await expect(headers.nth(3)).toHaveText("Net");
});
