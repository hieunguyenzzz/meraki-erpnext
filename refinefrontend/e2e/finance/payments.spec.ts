import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/payments");
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 100 and headers start with Name/Type/Party", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page.locator("text=/All Payments \\(\\d+\\)/").textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(100);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Name");
  await expect(headers.nth(1)).toHaveText("Type");
  await expect(headers.nth(2)).toHaveText("Party");
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
