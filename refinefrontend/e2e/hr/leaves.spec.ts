import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/hr/leaves");
  await expect(page.getByRole("heading", { name: "Leave Management" })).toBeVisible({
    timeout: 15_000,
  });
});

test("page loads with Applications and Balances tabs", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Balances" })).toBeVisible();
});

test("Applications tab shows leave applications with count", async ({ page }) => {
  await expect(page.locator("text=/Leave Applications \\(\\d+\\)/")).toBeVisible({
    timeout: 15_000,
  });
});

test("Balances tab shows leave allocations with count", async ({ page }) => {
  await page.getByRole("tab", { name: "Balances" }).click();
  await expect(page.locator("text=/Leave Allocations \\(\\d+\\)/")).toBeVisible({
    timeout: 15_000,
  });
});

test("status filter dropdown present", async ({ page }) => {
  await expect(page.getByRole("combobox")).toBeVisible();
});
