import { test, expect } from '../fixtures/gamePage';
import { waitForUIMode } from '../helpers/gameHelpers';

test.describe('Combat & Death', () => {
  test('death screen appears with message', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__GAME__!.triggerDeath(['TEST DEATH', 'Destroyed by test.']);
    });

    // Death screen should show "SHIP DESTROYED" and our custom message
    await expect(gamePage.page.getByText('SHIP DESTROYED')).toBeVisible();
    await expect(gamePage.page.getByText('TEST DEATH')).toBeVisible();
    await expect(gamePage.page.getByText('Destroyed by test.')).toBeVisible();

    // All three action buttons should be visible (autosave may be unavailable in tests)
    await expect(gamePage.page.getByText(/LOAD AUTOSAVE|NO AUTOSAVE/)).toBeVisible();
    await expect(gamePage.page.getByText('LOAD SAVE')).toBeVisible();
    await expect(gamePage.page.getByText('NEW GAME')).toBeVisible();
  });

  test('click LOAD SAVE from death screen opens main menu', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__GAME__!.triggerDeath(['TEST DEATH', 'Destroyed by test.']);
    });

    await expect(gamePage.page.getByText('SHIP DESTROYED')).toBeVisible();

    await gamePage.page.getByText('LOAD SAVE').click();

    expect(await gamePage.getUIMode()).toBe('menu');
  });

  test('click NEW GAME from death screen', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__GAME__!.triggerDeath(['TEST DEATH', 'Destroyed by test.']);
    });

    await expect(gamePage.page.getByText('SHIP DESTROYED')).toBeVisible();

    // Click new game
    await gamePage.page.getByText('NEW GAME').click();

    await waitForUIMode(gamePage.page, 'flight', 30_000);

    const state = await gamePage.getPlayerState();
    expect(state.credits).toBe(1000);
    expect(state.fuel).toBe(7);

    const cargo = await gamePage.getCargo();
    expect(Object.keys(cargo).length).toBe(0);
  });

  test('death clears hyperspace countdown', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setHyperspaceCountdown(5);
    });

    await gamePage.page.evaluate(() => {
      window.__GAME__!.triggerDeath(['TEST DEATH', 'Destroyed by test.']);
    });

    const countdown = await gamePage.page.evaluate(() =>
      window.__STORE__!.getState().ui.hyperspaceCountdown,
    );
    expect(countdown).toBe(0);
  });
});
