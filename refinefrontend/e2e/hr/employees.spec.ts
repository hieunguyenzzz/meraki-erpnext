import { test, expect } from "@playwright/test";
import { waitForTableLoad, clickFirstTableLink } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/hr/employees");
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible({
    timeout: 15_000,
  });
});

test("list loads with table and correct column headers", async ({ page }) => {
  const table = await waitForTableLoad(page);

  // DataTable headers (via DataTableColumnHeader buttons inside th)
  const headers = table.locator("thead th");
  await expect(headers.filter({ hasText: "Name" })).toBeVisible();
  await expect(headers.filter({ hasText: "Designation" })).toBeVisible();
  await expect(headers.filter({ hasText: "Department" })).toBeVisible();
  await expect(headers.filter({ hasText: "Status" })).toBeVisible();
});

test("table has at least 10 rows", async ({ page }) => {
  await waitForTableLoad(page);
  const rows = page.locator("table tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(10);
});

test("Active status badges visible", async ({ page }) => {
  await waitForTableLoad(page);
  await expect(page.locator("table").getByText("Active").first()).toBeVisible();
});

test("click first row navigates to detail with Personal Info and Employment cards", async ({
  page,
}) => {
  await waitForTableLoad(page);
  await clickFirstTableLink(page);

  await expect(page.getByText("Personal Info")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Employment")).toBeVisible();
});
