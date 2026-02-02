import { test, expect } from "@playwright/test";
import { waitForTableLoad } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/journals");
  await expect(page.getByRole("heading", { name: "Journal Entries" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with correct column headers and data", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Name" })).toBeVisible();
  await expect(headers.filter({ hasText: "Date" })).toBeVisible();
  await expect(headers.filter({ hasText: "Type" })).toBeVisible();
  await expect(headers.filter({ hasText: "Debit" })).toBeVisible();
  await expect(headers.filter({ hasText: "Credit" })).toBeVisible();
  await expect(headers.filter({ hasText: "Status" })).toBeVisible();

  // Verify data rows exist
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("status badges visible", async ({ page }) => {
  await waitForTableLoad(page);
  // Journal entries may be "Draft" or "Submitted"
  const badges = page.locator("table tbody").getByText(/Draft|Submitted/);
  await expect(badges.first()).toBeVisible();
});
