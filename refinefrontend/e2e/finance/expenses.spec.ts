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

test("quick expense: creates and submits journal entry successfully", async ({ page }) => {
  // Open Quick Expense sheet via the dropdown
  await page.getByRole("button", { name: /Add Expense/i }).click();
  await page.getByRole("menuitem", { name: "Quick Expense" }).click();

  // Wait for sheet to open
  await expect(page.getByRole("heading", { name: "Add Quick Expense" })).toBeVisible({ timeout: 10_000 });

  // Fill in the form
  const today = new Date().toISOString().slice(0, 10);
  await page.locator("#quick-date").fill(today);
  await page.locator("#quick-description").fill("E2E test expense");
  await page.locator("#quick-amount").fill("10000");

  // Select a category (SelectTrigger renders as combobox)
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Office Expenses" }).click();

  // Submit
  await page.getByRole("button", { name: "Create Expense" }).click();

  // Verify success message appears
  await expect(page.getByText(/Journal Entry .* created successfully/)).toBeVisible({ timeout: 15_000 });
});
