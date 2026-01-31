import { test, expect } from "@playwright/test";

test("page loads with Employee Onboarding count card", async ({ page }) => {
  await page.goto("/hr/onboarding");
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("text=/Employee Onboarding \\(\\d+\\)/")).toBeVisible({
    timeout: 15_000,
  });
});
