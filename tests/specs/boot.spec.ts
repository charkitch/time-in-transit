import { test, expect } from '../fixtures/gamePage';

test.describe('Game Boot', () => {
  test('loads and reaches flight mode', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const mode = await gamePage.getUIMode();
    expect(mode).toBe('flight');

    const geometries = await gamePage.getGeometryCount();
    expect(geometries).toBeGreaterThan(0);
  });

  test('main menu exposes music controls', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setUIMode('menu');
    });
    await gamePage.page.getByRole('button', { name: 'CONTROLS' }).click();

    await expect(gamePage.page.getByRole('button', { name: /MUSIC: (ON|OFF)/ })).toBeVisible();
    await expect(gamePage.page.getByLabel('MUSIC VOLUME')).toBeVisible();
  });
});
