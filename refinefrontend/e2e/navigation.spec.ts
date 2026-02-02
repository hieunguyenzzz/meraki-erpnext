import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome,")).toBeVisible({
    timeout: 15_000,
  });
});

test("sidebar shows Meraki branding", async ({ page }) => {
  await expect(page.getByText("Meraki")).toBeVisible();
});

test("sidebar shows CRM, HR, Finance sections", async ({ page }) => {
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByText("CRM")).toBeVisible();
  await expect(sidebar.getByText("HR")).toBeVisible();
  await expect(sidebar.getByText("Finance")).toBeVisible();
});

test("CRM links visible", async ({ page }) => {
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByText("Kanban")).toBeVisible();
});

test("HR links visible", async ({ page }) => {
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByText("Employees")).toBeVisible();
  await expect(sidebar.getByText("Leave Management")).toBeVisible();
  await expect(sidebar.getByText("Payroll")).toBeVisible();
  await expect(sidebar.getByText("Onboarding")).toBeVisible();
});

test("Finance links visible", async ({ page }) => {
  const sidebar = page.locator("aside").first();
  await expect(sidebar.getByText("Invoices")).toBeVisible();
  await expect(sidebar.getByText("Expenses")).toBeVisible();
  await expect(sidebar.getByText("Payments")).toBeVisible();
  await expect(sidebar.getByText("Journal Entries")).toBeVisible();
  await expect(sidebar.getByText("Overview")).toBeVisible();
});

test("clicking sidebar links navigates correctly", async ({ page }) => {
  await page.getByRole("link", { name: "Kanban" }).click();
  await expect(page.getByRole("heading", { name: "CRM Kanban" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/crm/);

  await page.getByRole("link", { name: "Employees" }).click();
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/hr\/employees/);

  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Revenue Overview" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/finance\/overview/);
});

test("logout via user dropdown redirects to /login", async ({ page }) => {
  // Click the avatar button to open user dropdown
  const avatarButton = page.locator("header").getByRole("button").last();
  await avatarButton.click();
  await page.getByText("Log out").click();
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});
