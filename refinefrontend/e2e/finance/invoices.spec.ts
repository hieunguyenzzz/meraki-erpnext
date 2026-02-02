import { test, expect } from "@playwright/test";
import { waitForTableLoad, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/invoices");
  await expect(page.getByRole("heading", { name: "Sales Invoices" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with correct column headers and data", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Invoice" })).toBeVisible();
  await expect(headers.filter({ hasText: "Customer" })).toBeVisible();
  await expect(headers.filter({ hasText: "Date" })).toBeVisible();
  await expect(headers.filter({ hasText: "Amount" })).toBeVisible();
  await expect(headers.filter({ hasText: "Outstanding" })).toBeVisible();
  await expect(headers.filter({ hasText: "Status" })).toBeVisible();

  // Verify data rows exist
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("click first row navigates to detail with Invoice Details card", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Invoice Details")).toBeVisible({ timeout: 15_000 });
});
