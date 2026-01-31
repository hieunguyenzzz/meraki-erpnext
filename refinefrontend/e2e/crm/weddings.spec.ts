import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/crm/weddings");
  await expect(page.getByRole("heading", { name: "Weddings" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 100 and correct headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page.locator("text=/All Weddings \\(\\d+\\)/").textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(100);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Order");
  await expect(headers.nth(1)).toHaveText("Customer");
  await expect(headers.nth(2)).toHaveText("Date");
  await expect(headers.nth(3)).toHaveText("Amount");
  await expect(headers.nth(4)).toHaveText("Status");
});

test("status badges visible", async ({ page }) => {
  await waitForTableLoad(page);
  await expect(page.locator("text=Completed").first()).toBeVisible();
});

test("click first row navigates to detail with Wedding Details and PaymentSummary", async ({
  page,
}) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Wedding Details")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Items")).toBeVisible();
  await expect(page.getByText("Payment Summary")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Total Invoiced")).toBeVisible();
  await expect(page.getByText("Total Paid")).toBeVisible();
});
