import { test as setup, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123";

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  const usernameInput = page.getByLabel("Email or Username");
  await expect(usernameInput).toBeVisible({ timeout: 10_000 });

  await usernameInput.fill("Administrator");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
    timeout: 30_000,
  });

  await page.context().storageState({ path: "./e2e/.auth/admin.json" });
});
