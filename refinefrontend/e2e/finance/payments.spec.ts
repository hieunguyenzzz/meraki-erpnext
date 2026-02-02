import { test, expect } from "@playwright/test";
import { waitForTableLoad, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/payments");
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with correct headers and data rows", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Name" })).toBeVisible();
  await expect(headers.filter({ hasText: "Type" })).toBeVisible();
  await expect(headers.filter({ hasText: "Party" })).toBeVisible();

  // Verify data rows exist
  const rows = table.locator("tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test("click first row navigates to detail with Payment Details card", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Payment Details")).toBeVisible({ timeout: 15_000 });
});

test("detail page has FileAttachments card with Upload File button", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Payment Details")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Upload File/i })).toBeVisible({
    timeout: 15_000,
  });
});
