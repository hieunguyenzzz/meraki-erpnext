import { test, expect } from "@playwright/test";

const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TestPass123";

test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated visit redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("invalid credentials show error", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  await page.getByLabel("Email or Username").fill("wrong@user.com");
  await page.getByLabel("Password").fill("wrongpassword");

  // Submit and wait for API response
  await Promise.all([
    page.waitForResponse((resp) => resp.url().includes("/api/method/login")),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  await expect(page.getByText("Invalid username or password")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page).toHaveURL(/\/login/);
});

test("valid login redirects to Dashboard", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or Username").fill("Administrator");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByLabel("Password").press("Enter");

  await expect(page.getByText("Welcome,")).toBeVisible({
    timeout: 30_000,
  });
});
