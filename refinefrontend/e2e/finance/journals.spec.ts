import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/finance/journals");
  await expect(page.getByRole("heading", { name: "Journal Entries" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 15 and correct headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page
    .locator("text=/All Journal Entries \\(\\d+\\)/")
    .textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(15);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Name");
  await expect(headers.nth(1)).toHaveText("Date");
  await expect(headers.nth(2)).toHaveText("Type");
  await expect(headers.nth(3)).toHaveText("Debit");
  await expect(headers.nth(4)).toHaveText("Credit");
  await expect(headers.nth(5)).toHaveText("Status");
  await expect(headers.nth(6)).toHaveText("Remark");
});

test("status badges visible", async ({ page }) => {
  await waitForTableLoad(page);
  // Journal entries may be "Draft" or "Submitted" — verify at least one status badge exists
  const badges = page.locator("table tbody").locator("text=/Draft|Submitted/");
  await expect(badges.first()).toBeVisible();
});
