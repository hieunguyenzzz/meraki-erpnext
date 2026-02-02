import { test, expect } from "@playwright/test";

test.describe("Payroll Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/hr/payroll");
    await expect(page.getByRole("heading", { name: "Payroll" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("page loads with Current Month and History tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Current Month" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  });

  test("sidebar shows Payroll link under HR", async ({ page }) => {
    const sidebar = page.locator("aside").first();
    await expect(sidebar.getByText("Payroll")).toBeVisible();
  });

  test("shows Generate button, salary slips table, or no-payroll message", async ({ page }) => {
    const generateBtn = page.getByRole("button", { name: /Generate for/ });
    const slipsTable = page.locator("table");
    const noPayrollMsg = page.getByText("No payroll entry for");

    // Wait for loading to finish
    await page.waitForTimeout(3_000);

    const hasButton = await generateBtn.isVisible().catch(() => false);
    const hasTable = await slipsTable.isVisible().catch(() => false);
    const hasMsg = await noPayrollMsg.isVisible().catch(() => false);

    expect(hasButton || hasTable || hasMsg).toBeTruthy();
  });

  test("History tab shows payroll entries table or empty state", async ({ page }) => {
    await page.getByRole("tab", { name: "History" }).click();

    const table = page.locator("table");
    const emptyMsg = page.getByText("No payroll entries found");

    const hasTable = await table.isVisible().catch(() => false);
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);

    expect(hasTable || hasEmpty).toBeTruthy();
  });
});

test.describe("Payroll Generation (integration)", () => {
  test.setTimeout(90_000);

  test("generates payroll for current month", async ({ page, request }) => {
    await page.goto("/hr/payroll");
    await expect(page.getByRole("heading", { name: "Payroll" })).toBeVisible({
      timeout: 15_000,
    });

    // Check if generate button exists (no PE for current month)
    const generateBtn = page.getByRole("button", { name: /Generate for/ });
    const btnVisible = await generateBtn.isVisible().catch(() => false);

    if (!btnVisible) {
      test.skip();
      return;
    }

    // Click generate
    await generateBtn.click();

    // Wait for the salary slips table to appear (4 API calls run sequentially)
    await expect(page.locator("table")).toBeVisible({ timeout: 60_000 });

    // Verify salary slip rows show up
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Verify table has expected columns
    await expect(page.locator("table th").filter({ hasText: "Employee" })).toBeVisible();
    await expect(page.locator("table th").filter({ hasText: "Gross Pay" })).toBeVisible();
    await expect(page.locator("table th").filter({ hasText: "Net Pay" })).toBeVisible();
    await expect(page.locator("table th").filter({ hasText: "Status" })).toBeVisible();

    // Verify Draft badges appear on salary slips
    await expect(page.getByText("Draft").first()).toBeVisible();

    // Verify Submit All button appears
    await expect(page.getByRole("button", { name: "Submit All" })).toBeVisible();

    // Cleanup: find PE for current month via API, then delete slips + PE
    const today = new Date();
    const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const peListRes = await request.get(
      `/api/resource/Payroll Entry?filters=[["start_date","=","${start}"],["company","=","Meraki Wedding Planner"]]&fields=["name"]&limit_page_length=1`
    );
    if (peListRes.ok()) {
      const entries = (await peListRes.json()).data ?? [];
      for (const pe of entries) {
        const slipsRes = await request.get(
          `/api/resource/Salary Slip?filters=[["payroll_entry","=","${pe.name}"]]&fields=["name"]&limit_page_length=0`
        );
        if (slipsRes.ok()) {
          const slips = (await slipsRes.json()).data ?? [];
          for (const slip of slips) {
            await request.delete(`/api/resource/Salary Slip/${slip.name}`);
          }
        }
        await request.delete(`/api/resource/Payroll Entry/${pe.name}`);
      }
    }
  });
});
