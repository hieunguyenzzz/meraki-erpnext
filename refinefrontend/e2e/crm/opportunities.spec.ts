import { test, expect } from "@playwright/test";
import { waitForTableLoad } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/crm/opportunities");
  await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible({
    timeout: 15_000,
  });
});

test("page loads with count card", async ({ page }) => {
  await waitForTableLoad(page);
  await expect(page.locator("text=/All Opportunities \\(\\d+\\)/")).toBeVisible();
});

test("status filter dropdown present", async ({ page }) => {
  await expect(page.getByRole("combobox")).toBeVisible();
});
