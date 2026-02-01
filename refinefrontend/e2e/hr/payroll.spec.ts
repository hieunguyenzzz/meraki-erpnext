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
    await expect(page.getByRole("link", { name: "Payroll" })).toBeVisible();
  });

  test("shows Generate Payroll button or salary slips table", async ({ page }) => {
    const generateBtn = page.getByRole("button", { name: /Generate Payroll/ });
    const slipsTable = page.locator("table");

    // Either the generate button is visible (no PE) or a table is shown (PE exists)
    const hasButton = await generateBtn.isVisible().catch(() => false);
    const hasTable = await slipsTable.isVisible().catch(() => false);

    expect(hasButton || hasTable).toBeTruthy();
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
    const generateBtn = page.getByRole("button", { name: /Generate Payroll/ });
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

    // Capture the PE name from the page text for cleanup
    const peText = await page.getByText(/HR-PRUN-\d{4}-\d+/).first().textContent();
    const peMatch = peText?.match(/HR-PRUN-\S+/);
    const peName = peMatch?.[0];

    // Cleanup: delete salary slips and PE
    if (peName) {
      const slipsRes = await request.get(
        `/api/resource/Salary Slip?filters=[["payroll_entry","=","${peName}"]]&fields=["name"]&limit_page_length=0`
      );
      if (slipsRes.ok()) {
        const slips = (await slipsRes.json()).data ?? [];
        for (const slip of slips) {
          await request.delete(`/api/resource/Salary Slip/${slip.name}`);
        }
      }
      await request.delete(`/api/resource/Payroll Entry/${peName}`);
    }
  });
});
