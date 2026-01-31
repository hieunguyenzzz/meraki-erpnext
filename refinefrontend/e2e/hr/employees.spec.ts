import { test, expect } from "@playwright/test";
import { waitForTableLoad, getCountFromTitle, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/hr/employees");
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with count >= 10 and correct headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  const cardTitle = await page.locator("text=/All Employees \\(\\d+\\)/").textContent();
  const count = getCountFromTitle(cardTitle ?? "");
  expect(count).toBeGreaterThanOrEqual(10);

  const headers = table.locator("thead th");
  await expect(headers.nth(0)).toHaveText("Name");
  await expect(headers.nth(1)).toHaveText("Designation");
  await expect(headers.nth(2)).toHaveText("Department");
  await expect(headers.nth(3)).toHaveText("Status");
});

test("Active status badges visible", async ({ page }) => {
  await waitForTableLoad(page);
  await expect(page.locator("text=Active").first()).toBeVisible();
});

test("click first row navigates to detail with Personal Info and Employment cards", async ({
  page,
}) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Personal Info")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Employment")).toBeVisible();
});
