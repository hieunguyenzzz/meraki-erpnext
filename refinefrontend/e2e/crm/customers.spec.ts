import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/crm/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 100 and correct headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page.locator("text=/All Customers \\(\\d+\\)/").textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(100);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Name");
  await expect(headers.nth(1)).toHaveText("Group");
  await expect(headers.nth(2)).toHaveText("Phone");
  await expect(headers.nth(3)).toHaveText("Email");
});

test("click first row navigates to detail with Customer Info card", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Customer Info")).toBeVisible({ timeout: 15_000 });
});

test("detail page shows Sales Orders section", async ({ page }) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText(/Sales Orders/)).toBeVisible({ timeout: 15_000 });
});
