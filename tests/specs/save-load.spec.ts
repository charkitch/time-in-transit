import { test, expect } from '../fixtures/gamePage';
import { clearSaveData, waitForUIMode } from '../helpers/gameHelpers';

test.describe('Save & Load', () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.page.goto('/');
    await clearSaveData(gamePage.page);
  });

  test('save persists to localStorage', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      (window as any).__STORE__.getState().saveGame();
    });

    const saveData = await gamePage.page.evaluate(() =>
      localStorage.getItem('space-game-save'),
    );
    expect(saveData).not.toBeNull();
    expect(() => JSON.parse(saveData!)).not.toThrow();
  });

  test('state survives page reload', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // Modify credits
    await gamePage.page.evaluate(() => {
      (window as any).__STORE__.getState().addCredits(500);
    });
    const before = await gamePage.getPlayerState();

    // Save and reload
    await gamePage.page.evaluate(() => {
      (window as any).__STORE__.getState().saveGame();
    });
    await gamePage.page.reload();
    await gamePage.waitForGameReady();

    const after = await gamePage.getPlayerState();
    expect(after.credits).toBe(before.credits);
  });

  test('clear save starts fresh', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // Modify and save
    await gamePage.page.evaluate(() => {
      const store = (window as any).__STORE__.getState();
      store.addCredits(9999);
      store.saveGame();
    });

    // Clear save and reload
    await clearSaveData(gamePage.page);
    await gamePage.page.reload();
    await gamePage.waitForGameReady();

    const state = await gamePage.getPlayerState();
    expect(state.credits).toBe(1000); // STARTING_CREDITS
  });

  test('ephemeral state not saved', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // Set heat (ephemeral)
    const heatBefore = await gamePage.page.evaluate(() => {
      const store = (window as any).__STORE__.getState();
      store.setHeat(50);
      return (window as any).__STORE__.getState().player.heat;
    });
    expect(heatBefore).toBe(50);

    // Save and reload
    await gamePage.page.evaluate(() => {
      (window as any).__STORE__.getState().saveGame();
    });
    await gamePage.page.reload();
    await gamePage.waitForGameReady();

    // Heat should reset (not persisted)
    const heatAfter = await gamePage.getHeat();
    expect(heatAfter).not.toBe(50);
  });

  test('corrupted spatial save falls back to safe spawn on load', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const store = (window as any).__STORE__.getState();
      store.saveGame();

      const raw = localStorage.getItem('space-game-save');
      if (!raw) throw new Error('expected save data before corruption injection');
      const data = JSON.parse(raw);
      data.shipPosition = { x: null, y: null, z: null };
      data.shipQuaternion = { x: 0, y: 0, z: 0, w: 1 };
      data.shipVelocity = { x: 0, y: 0, z: 0 };
      localStorage.setItem('space-game-save', JSON.stringify(data));
    });

    await gamePage.page.reload();
    await gamePage.waitForGameReady();

    const shipPos = await gamePage.page.evaluate(() => {
      const p = (window as any).__GAME__?.['sceneRenderer']?.shipGroup?.position;
      return p ? { x: p.x, y: p.y, z: p.z } : null;
    });
    expect(shipPos).not.toBeNull();
    expect(Number.isFinite(shipPos!.x)).toBe(true);
    expect(Number.isFinite(shipPos!.y)).toBe(true);
    expect(Number.isFinite(shipPos!.z)).toBe(true);
    expect(shipPos).not.toEqual({ x: 0, y: 0, z: 0 });
  });

  test('save omits invalid ship spatial fields', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const saveHasSpatial = await gamePage.page.evaluate(() => {
      const store = (window as any).__STORE__.getState();
      store.setPlayerPosition({ x: NaN, y: 0, z: 0 });
      store.setPlayerQuaternion({ x: 0, y: 0, z: 0, w: 1 });
      store.setPlayerVelocity({ x: 0, y: 0, z: 0 });
      store.saveGame();

      const raw = localStorage.getItem('space-game-save');
      if (!raw) return { hasPosition: true, hasQuaternion: true, hasVelocity: true };
      const data = JSON.parse(raw);
      return {
        hasPosition: Object.prototype.hasOwnProperty.call(data, 'shipPosition'),
        hasQuaternion: Object.prototype.hasOwnProperty.call(data, 'shipQuaternion'),
        hasVelocity: Object.prototype.hasOwnProperty.call(data, 'shipVelocity'),
      };
    });

    expect(saveHasSpatial.hasPosition).toBe(false);
    expect(saveHasSpatial.hasQuaternion).toBe(false);
    expect(saveHasSpatial.hasVelocity).toBe(false);
  });

  test('context restore does not save during hyperspace mode', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const store = (window as any).__STORE__;
      const originalSaveGame = store.getState().saveGame;
      (window as any).__SAVE_CALLS__ = 0;
      store.setState({
        saveGame: () => {
          (window as any).__SAVE_CALLS__ += 1;
          return originalSaveGame();
        },
      });
      store.getState().setUIMode('hyperspace');

      const renderer = (window as any).__GAME__['sceneRenderer'].renderer;
      (window as any).__TEST_LOSE_CTX_EXT__ = renderer.getContext().getExtension('WEBGL_lose_context');
      (window as any).__TEST_LOSE_CTX_EXT__.loseContext();
    });

    await gamePage.page.evaluate(() => {
      (window as any).__TEST_LOSE_CTX_EXT__.restoreContext();
    });
    await waitForUIMode(gamePage.page, 'flight', 30_000);

    const saveCalls = await gamePage.page.evaluate(() => (window as any).__SAVE_CALLS__ ?? 0);
    expect(saveCalls).toBe(0);
  });
});
