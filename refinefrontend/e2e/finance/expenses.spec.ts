import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/expenses");
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible({
    timeout: 15_000,
  });
});

test("page loads with Purchase Invoices count card", async ({ page }) => {
  await expect(page.locator("text=/Purchase Invoices \\(\\d+\\)/")).toBeVisible({
    timeout: 15_000,
  });
});

test("shows table or empty state", async ({ page }) => {
  // Either a table renders or "No purchase invoices found"
  const table = page.locator("table");
  const empty = page.getByText("No purchase invoices found");
  await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
});
