import { test, expect } from '../fixtures/gamePage';

test.describe('Collision Shapes', () => {
  test('asteroid collision sphere bounces without lethal collision', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const center = ship.position.clone().set(100, 0, 0);
      const asteroid = {
        id: 'test-asteroid-belt',
        type: 'asteroid',
        group: { position: ship.position.clone().set(0, 0, 0) },
        worldPos: ship.position.clone().set(0, 0, 0),
        collisionRadius: 120,
        collisionSpheresWorld: [{ center, radius: 20 }],
        collisionSampleOnly: true,
      };

      ship.position.set(125, 0, 0);
      game.flightModel.setVelocity(-100, 0, 0);
      const collision = game.flightModel.resolveCollisions(ship, [asteroid]);
      const outcome = {
        lethal: collision?.lethal ?? null,
        entityType: collision?.entity.type ?? null,
        x: ship.position.x,
        velocityX: game.flightModel.getVelocity().x,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return outcome;
    });

    expect(result.entityType).toBe('asteroid');
    expect(result.lethal).toBe(false);
    expect(result.x).toBe(130);
    expect(result.velocityX).toBeGreaterThan(0);
  });

  test('asteroid belt gaps do not collide', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const asteroid = {
        id: 'test-asteroid-belt',
        type: 'asteroid',
        group: { position: ship.position.clone().set(0, 0, 0) },
        worldPos: ship.position.clone().set(0, 0, 0),
        collisionRadius: 220,
        collisionSpheresWorld: [{ center: ship.position.clone().set(100, 0, 0), radius: 20 }],
        collisionSampleOnly: true,
        collisionRadialBounds: { innerRadius: 80, outerRadius: 200, halfHeight: 100 },
      };

      ship.position.set(170, 0, 0);
      game.flightModel.setVelocity(-100, 0, 0);
      const collision = game.flightModel.resolveCollisions(ship, [asteroid]);
      const outcome = {
        collision: collision !== null,
        x: ship.position.x,
        velocityX: game.flightModel.getVelocity().x,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return outcome;
    });

    expect(result.collision).toBe(false);
    expect(result.x).toBe(170);
    expect(result.velocityX).toBe(-100);
  });

  test('station protruding collision sphere bounces without central fallback', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const station = {
        id: 'test-station',
        type: 'station',
        group: { position: ship.position.clone().set(0, 0, 0) },
        worldPos: ship.position.clone().set(0, 0, 0),
        collisionRadius: 100,
        collisionSpheresWorld: [{ center: ship.position.clone().set(80, 0, 0), radius: 8 }],
        collisionSampleOnly: true,
      };

      ship.position.set(85, 0, 0);
      game.flightModel.setVelocity(-100, 0, 0);
      const collision = game.flightModel.resolveCollisions(ship, [station]);
      const outcome = {
        lethal: collision?.lethal ?? null,
        entityType: collision?.entity.type ?? null,
        x: ship.position.x,
        velocityX: game.flightModel.getVelocity().x,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return outcome;
    });

    expect(result.entityType).toBe('station');
    expect(result.lethal).toBe(false);
    expect(result.x).toBe(98);
    expect(result.velocityX).toBeGreaterThan(0);
  });

  test('ordinary body collision remains lethal', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    const result = await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const ship = game.sceneRenderer.shipGroup;
      const originalPosition = ship.position.clone();
      const originalVelocity = game.flightModel.getVelocity().clone();
      const planet = {
        id: 'test-planet',
        type: 'planet',
        group: { position: ship.position.clone().set(0, 0, 0) },
        worldPos: ship.position.clone().set(0, 0, 0),
        collisionRadius: 100,
      };

      ship.position.set(90, 0, 0);
      game.flightModel.setVelocity(-100, 0, 0);
      const collision = game.flightModel.resolveCollisions(ship, [planet]);
      const outcome = {
        lethal: collision?.lethal ?? null,
        entityType: collision?.entity.type ?? null,
      };

      ship.position.set(originalPosition.x, originalPosition.y, originalPosition.z);
      game.flightModel.setVelocity(originalVelocity.x, originalVelocity.y, originalVelocity.z);
      return outcome;
    });

    expect(result.entityType).toBe('planet');
    expect(result.lethal).toBe(true);
  });

  test('lethal collision destroys the ship through the flight tick', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      game.flightModel.resolveCollisions = (() => ({
        entity: { type: 'star' },
        lethal: true,
      })) as TestFlightModel['resolveCollisions'];
    });

    await gamePage.page.waitForFunction(() =>
      window.__STORE__?.getState().ui.mode === 'dead',
    );

    await expect(gamePage.page.getByText('STELLAR IMPACT')).toBeVisible();
    expect((await gamePage.getPlayerState()).shields).toBeGreaterThan(0);
  });

  test('asteroid bounce damage is applied through the flight tick', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const game = window.__GAME__!
      const originalResolve = game.flightModel.resolveCollisions.bind(game.flightModel);
      let injected = false;

      game.flightModel.resolveCollisions = ((shipGroup, collidables) => {
        if (!injected) {
          injected = true;
          return {
            entity: { type: 'asteroid' },
            lethal: false,
          };
        }
        return originalResolve(shipGroup, collidables);
      }) as TestFlightModel['resolveCollisions'];
    });

    await gamePage.page.waitForFunction(() =>
      (window.__STORE__?.getState().player.shields ?? 100) < 100,
    );

    const shields = (await gamePage.getPlayerState()).shields;
    expect(shields).toBeGreaterThan(95);
    expect(await gamePage.getHeat()).toBe(0);
    expect(await gamePage.getUIMode()).toBe('flight');
  });
});
