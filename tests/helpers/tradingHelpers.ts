import type { Page } from '@playwright/test';

/**
 * Get total cargo units held (sum of all quantities).
 */
export async function getCargoCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const state = window.__STORE__!.getState();
    const cargo = state.player.cargo ?? {};
    return Object.values(cargo).reduce((sum, qty) => sum + qty, 0);
  });
}

/**
 * Click BUY on a specific good's row in the station trade UI.
 * Assumes we're on the 'trade' tab and docked.
 */
export async function clickBuy(page: Page, good: string): Promise<void> {
  const row = page.locator('tr', { hasText: good });
  await row.getByText('BUY', { exact: true }).click();
}

/**
 * Click SELL on a specific good's row in the station trade UI.
 * Assumes we're on the 'trade' tab and docked.
 */
export async function clickSell(page: Page, good: string): Promise<void> {
  const row = page.locator('tr', { hasText: good });
  await row.getByText('SELL', { exact: true }).click();
}
