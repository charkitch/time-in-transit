import type { Page } from '@playwright/test';
import { waitForUIMode } from './gameHelpers';

/**
 * Trigger docking by calling prepareLanding directly via the dev bridge.
 * We can't position the ship near a station in headless tests,
 * so this is the one place we use the dev bridge to set up the scenario.
 */
export async function triggerDocking(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__STORE__!.getState();
    const systemId = state.currentSystemId;
    const mainStationPlanetId = state.currentSystem?.mainStationPlanetId;
    const stationId = mainStationPlanetId ? `station-${mainStationPlanetId}` : undefined;
    window.__GAME__!.interaction.prepareLanding(systemId, stationId);
  });
  // On revisit the dialog auto-advances immediately, so wait for landing OR docked.
  await page.waitForFunction(
    () => {
      const mode = window.__STORE__?.getState()?.ui?.mode;
      return mode === 'landing' || mode === 'docked';
    },
    null,
    { timeout: 30_000 },
  );
}

/**
 * Click the first visible, enabled choice button in the landing dialog.
 */
export async function completeCurrentLanding(page: Page): Promise<void> {
  await page.locator('button:visible:not([disabled])').first().click();
}

/**
 * Click the UNDOCK button in the station UI.
 */
export async function undock(page: Page): Promise<void> {
  await page.getByText('UNDOCK').click();
  await waitForUIMode(page, 'flight');
}

/**
 * Dock, click through all landing event steps, arrive at station UI.
 * Events may have multiple moments (nextMoment chains), so we loop until
 * the mode leaves 'landing'.
 */
export async function dockAndComplete(page: Page): Promise<void> {
  await triggerDocking(page);
  let attempts = 0;
  while (await page.evaluate(() => window.__STORE__?.getState()?.ui?.mode) === 'landing' && attempts++ < 10) {
    await completeCurrentLanding(page);
  }
  await waitForUIMode(page, 'docked');
}
