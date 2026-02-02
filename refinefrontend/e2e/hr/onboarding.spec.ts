import { test, expect } from "@playwright/test";

test("page loads with heading and table or empty state", async ({ page }) => {
  await page.goto("/hr/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible({
    timeout: 15_000,
  });

  // DataTable renders a table once data loads (with "No results." if empty)
  await expect(page.locator("table")).toBeVisible({ timeout: 15_000 });
});
