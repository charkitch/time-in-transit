import { test, expect } from '../fixtures/gamePage';
import {
  triggerDocking,
  completeCurrentLanding,
  undock,
  dockAndComplete,
} from '../helpers/dockingHelpers';
import { waitForUIMode } from '../helpers/gameHelpers';

test.describe('Docking', () => {
  test('dock at station shows landing dialog, click through to station', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await triggerDocking(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('landing');

    // Landing dialog should have at least one visible choice button
    await expect(gamePage.page.locator('button:visible:not([disabled])').first()).toBeVisible();

    // Click through all event steps to reach the station
    let attempts = 0;
    while (await gamePage.getUIMode() === 'landing' && attempts++ < 10) {
      await completeCurrentLanding(gamePage.page);
    }
    await waitForUIMode(gamePage.page, 'docked');
    expect(await gamePage.getUIMode()).toBe('docked');

    // Station UI should show station name and UNDOCK button
    await expect(gamePage.page.getByText('STATION')).toBeVisible();
    await expect(gamePage.page.getByText('UNDOCK')).toBeVisible();
  });

  test('click UNDOCK returns to flight', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('docked');

    await undock(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('full cycle: dock → undock → dock again', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await dockAndComplete(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('docked');

    await undock(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('flight');

    await dockAndComplete(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('docked');
  });
});
