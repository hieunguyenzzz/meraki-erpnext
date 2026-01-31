import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 15_000,
  });
});

test("sidebar shows Meraki branding", async ({ page }) => {
  await expect(page.getByText("Meraki")).toBeVisible();
});

test("sidebar shows CRM, HR, Finance sections", async ({ page }) => {
  await expect(page.getByText("CRM")).toBeVisible();
  await expect(page.getByText("HR")).toBeVisible();
  await expect(page.getByText("Finance")).toBeVisible();
});

test("CRM links visible", async ({ page }) => {
  const sidebar = page.locator("aside, [data-sidebar]").first();
  await expect(sidebar.getByText("Customers")).toBeVisible();
  await expect(sidebar.getByText("Weddings")).toBeVisible();
  await expect(sidebar.getByText("Leads")).toBeVisible();
  await expect(sidebar.getByText("Opportunities")).toBeVisible();
});

test("HR links visible", async ({ page }) => {
  const sidebar = page.locator("aside, [data-sidebar]").first();
  await expect(sidebar.getByText("Employees")).toBeVisible();
  await expect(sidebar.getByText("Leave Management")).toBeVisible();
  await expect(sidebar.getByText("Onboarding")).toBeVisible();
});

test("Finance links visible", async ({ page }) => {
  const sidebar = page.locator("aside, [data-sidebar]").first();
  await expect(sidebar.getByText("Invoices")).toBeVisible();
  await expect(sidebar.getByText("Expenses")).toBeVisible();
  await expect(sidebar.getByText("Payments")).toBeVisible();
  await expect(sidebar.getByText("Journal Entries")).toBeVisible();
  await expect(sidebar.getByText("Overview")).toBeVisible();
});

test("clicking sidebar links navigates correctly", async ({ page }) => {
  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page).toHaveURL(/\/crm\/customers/);

  await page.getByRole("link", { name: "Employees" }).click();
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
  await expect(page).toHaveURL(/\/hr\/employees/);

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Revenue Overview" })).toBeVisible();
  await expect(page).toHaveURL(/\/finance\/overview/);
});

test("logout redirects to /login", async ({ page }) => {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});
