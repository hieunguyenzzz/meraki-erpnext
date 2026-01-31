import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/invoices");
  await expect(page.getByRole("heading", { name: "Sales Invoices" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 100 and correct headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page.locator("text=/All Invoices \\(\\d+\\)/").textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(100);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Invoice");
  await expect(headers.nth(1)).toHaveText("Customer");
  await expect(headers.nth(2)).toHaveText("Date");
  await expect(headers.nth(3)).toHaveText("Amount");
  await expect(headers.nth(4)).toHaveText("Outstanding");
  await expect(headers.nth(5)).toHaveText("Status");
});

test("click first row navigates to detail with Invoice Details card", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Invoice Details")).toBeVisible({ timeout: 15_000 });
});

test("detail page shows Sales Order link", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Invoice Details")).toBeVisible({ timeout: 15_000 });
  // The invoice detail should show a Sales Order link pointing to /crm/weddings/
  await expect(page.locator('a[href*="/crm/weddings/"]')).toBeVisible({ timeout: 15_000 });
});
