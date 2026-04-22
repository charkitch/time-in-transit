import { test, expect } from '../fixtures/gamePage';

test.describe('Game Boot', () => {
  test('loads and reaches flight mode', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const mode = await gamePage.getUIMode();
    expect(mode).toBe('flight');

    const geometries = await gamePage.getGeometryCount();
    expect(geometries).toBeGreaterThan(0);
  });
});
