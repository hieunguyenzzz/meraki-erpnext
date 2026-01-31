import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Wait for "Loading..." text to disappear and return the table locator.
 */
export async function waitForTableLoad(page: Page): Promise<Locator> {
  await expect(page.getByText("Loading...")).toBeHidden({ timeout: 15_000 });
  return page.locator("table");
}

/**
 * Extract the count from a card title like "All Customers (132)".
 */
export function getCountFromTitle(text: string): number {
  const match = text.match(/\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Click the first link in the first table row.
 */
export async function clickFirstTableLink(page: Page): Promise<void> {
  const table = page.locator("table");
  await table.locator("tbody tr").first().locator("a").first().click();
}
