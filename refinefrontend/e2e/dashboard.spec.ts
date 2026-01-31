import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 15_000,
  });
});

test("renders heading and 4 metric cards", async ({ page }) => {
  const main = page.getByRole("main");
  await expect(main.getByText("Total customers")).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText("Total sales orders")).toBeVisible();
  await expect(main.getByText("Active employees")).toBeVisible();
  await expect(main.getByText("Total invoiced")).toBeVisible();
});

test("metric values load (not placeholders)", async ({ page }) => {
  // Wait for at least one metric value to not be "..."
  await expect(page.getByText("Total customers")).toBeVisible({ timeout: 15_000 });
  // The "..." placeholder should disappear once data loads
  const cards = page.locator('[class*="text-2xl"]');
  await expect(cards.first()).not.toHaveText("...", { timeout: 15_000 });
});

test("Monthly Revenue chart renders", async ({ page }) => {
  await expect(page.locator(".recharts-responsive-container").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("Weddings by Month chart renders", async ({ page }) => {
  await expect(page.locator(".recharts-responsive-container").nth(1)).toBeVisible({
    timeout: 15_000,
  });
});
