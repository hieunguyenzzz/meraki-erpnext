import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Wait for the DataTable to finish loading (skeleton disappears, table appears).
 */
export async function waitForTableLoad(page: Page): Promise<Locator> {
  const table = page.locator("table");
  await expect(table).toBeVisible({ timeout: 15_000 });
  return table;
}

/**
 * Click the first link in the first table row.
 */
export async function clickFirstTableLink(page: Page): Promise<void> {
  const table = page.locator("table");
  await table.locator("tbody tr").first().locator("a").first().click();
}
