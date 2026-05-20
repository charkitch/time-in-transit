import { test, expect } from '../fixtures/gamePage';

test.describe('Topopolis Collision', () => {
  test('interior wall bounces without lethal collision', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const centerA = ship.position.clone().set(-100, 0, 0);
      const centerB = ship.position.clone().set(100, 0, 0);
      const topopolis = {
        id: 'test-topopolis',
        type: 'topopolis',
        collisionSampleRadius: 100,
        collisionSamplesWorld: [centerA, centerB],
      };

      ship.position.set(0, 90, 0);
      game.flightModel.setVelocity(40, 100, 0);
      const collision = game.flightModel.resolveCollisions(ship, [topopolis]);
      const result = {
        lethal: collision?.lethal ?? null,
        shieldDamage: collision?.shieldDamage ?? 0,
        heatDamage: collision?.heatDamage ?? 0,
        entityType: collision?.entity?.type ?? null,
        y: ship.position.y,
        velocityX: game.flightModel.getVelocity().x,
        velocityY: game.flightModel.getVelocity().y,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return result;
    });

    expect(result.entityType).toBe('topopolis');
    expect(result.lethal).toBe(false);
    expect(result.shieldDamage).toBe(18);
    expect(result.heatDamage).toBe(4);
    expect(result.y).toBeLessThan(90);
    expect(result.velocityX).toBeGreaterThan(35);
    expect(result.velocityY).toBeLessThan(-70);
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('exterior wall remains lethal', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const centerA = ship.position.clone().set(-100, 0, 0);
      const centerB = ship.position.clone().set(100, 0, 0);
      const topopolis = {
        id: 'test-topopolis',
        type: 'topopolis',
        collisionSampleRadius: 100,
        collisionSamplesWorld: [centerA, centerB],
      };

      ship.position.set(0, 110, 0);
      game.flightModel.setVelocity(0, -100, 0);
      const collision = game.flightModel.resolveCollisions(ship, [topopolis]);
      const result = {
        lethal: collision?.lethal ?? null,
        shieldDamage: collision?.shieldDamage ?? 0,
        heatDamage: collision?.heatDamage ?? 0,
        entityType: collision?.entity?.type ?? null,
        y: ship.position.y,
        velocityY: game.flightModel.getVelocity().y,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return result;
    });

    expect(result.entityType).toBe('topopolis');
    expect(result.lethal).toBe(true);
    expect(result.shieldDamage).toBe(0);
    expect(result.heatDamage).toBe(0);
    expect(result.y).toBeGreaterThan(110);
    expect(result.velocityY).toBeGreaterThan(0);
  });

  test('interior bounce damage is applied through the flight tick', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const originalResolve = game.flightModel.resolveCollisions.bind(game.flightModel);
      let injected = false;

      game.flightModel.resolveCollisions = ((shipGroup, collidables) => {
        if (!injected) {
          injected = true;
          return {
            entity: { type: 'topopolis' },
            lethal: false,
            shieldDamage: 18,
            heatDamage: 4,
          };
        }
        return originalResolve(shipGroup, collidables);
      }) as TestFlightModel['resolveCollisions'];
    });

    await gamePage.page.waitForFunction(() =>
      (window.__STORE__?.getState().player.shields ?? 100) < 90,
    );

    const shields = (await gamePage.getPlayerState()).shields;
    const heat = await gamePage.getHeat();
    expect(shields).toBeLessThan(90);
    expect(shields).toBeGreaterThan(80);
    expect(heat).toBe(0);
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('interior bounce can kill when shields run out', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const originalResolve = game.flightModel.resolveCollisions.bind(game.flightModel);
      let injectedCount = 0;

      game.flightModel.resolveCollisions = ((shipGroup, collidables) => {
        if (injectedCount < 40) {
          injectedCount += 1;
          return {
            entity: { type: 'topopolis' },
            lethal: false,
            shieldDamage: 18,
            heatDamage: 4,
          };
        }
        return originalResolve(shipGroup, collidables);
      }) as TestFlightModel['resolveCollisions'];
    });

    await gamePage.page.waitForFunction(() =>
      window.__STORE__?.getState().ui.mode === 'dead',
    );

    expect(await gamePage.getUIMode()).toBe('dead');
    await expect(gamePage.page.getByText('TOPOPOLIS IMPACT')).toBeVisible();
  });
});
