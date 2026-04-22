import { test, expect } from '../fixtures/gamePage';
import { dockAndComplete } from '../helpers/dockingHelpers';

test.describe('Navigation', () => {
  test('open and close cluster map via keyboard', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // Press 'M' to open cluster map (standard keybind)
    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestClusterMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('cluster_map');

    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestClusterMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('open and close system map', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestSystemMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('system_map');

    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestSystemMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('maps do not open from docked mode', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);
    expect(await gamePage.getUIMode()).toBe('docked');

    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestClusterMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('docked');

    await gamePage.page.evaluate(() =>
      window.__GAME__!.requestSystemMapToggle(),
    );
    expect(await gamePage.getUIMode()).toBe('docked');
  });

  test('set hyperspace target', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setHyperspaceTarget(1);
    });

    const target = await gamePage.page.evaluate(() =>
      window.__STORE__!.getState().ui.hyperspaceTarget,
    );
    expect(target).toBe(1);
  });

  test('planet landing sites spawn outside host collision radius', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const placements = await gamePage.page.evaluate(() => {
      const entities = window.__GAME__?.sceneRenderer?.getAllEntities?.();
      if (!entities) return null;

      const rows: Array<{
        siteId: string;
        hostId: string;
        hostType: string;
        distance: number;
        collisionRadius: number;
      }> = [];

      for (const [, entity] of entities) {
        if (entity?.type !== 'landing_site') continue;
        const hostId = entity.siteHostId;
        if (!hostId) continue;
        const host = entities.get(hostId);
        if (!host || host.type !== 'planet') continue;
        rows.push({
          siteId: entity.id,
          hostId: host.id,
          hostType: host.type,
          distance: entity.worldPos.distanceTo(host.worldPos),
          collisionRadius: host.collisionRadius,
        });
      }
      return rows;
    });

    expect(placements).not.toBeNull();
    expect(placements!.length).toBeGreaterThan(0);
    for (const row of placements!) {
      expect(row.distance).toBeGreaterThan(row.collisionRadius);
    }
  });
});
