import type { SceneEntity } from '../../game/rendering/scene/types';
import type { FleetBattle } from '../../game/mechanics/FleetBattleSystem';
import { BATTLE_DANGER_RANGE } from '../../game/mechanics/FleetBattleSystem';
import { W, H, type ViewportState, type WorldBounds, type SystemData, type PickTarget } from './types';

export function canvasCoordsFromClient(clientX: number, clientY: number, canvas: HTMLCanvasElement): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) * (W / rect.width),
    (clientY - rect.top) * (H / rect.height),
  ];
}

export function findNearest(mx: number, my: number, targets: PickTarget[], baseRadius: number): PickTarget | null {
  let best: PickTarget | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const dx = mx - t.x;
    const dy = my - t.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(baseRadius, t.r);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

export function clampRange(nextRange: number, defaultRange: number, currentSystem: SystemData): number {
  const maxOrbit = Math.max(
    ...currentSystem.planets.map(planet => planet.orbitRadius),
    ...currentSystem.dysonShells.map(shell => shell.orbitRadius),
    ...currentSystem.secretBases.map(base => base.orbitRadius),
    currentSystem.asteroidBelt?.outerRadius ?? 0,
    currentSystem.starRadius * 8,
    defaultRange,
  );
  const minRange = Math.max(42, defaultRange * 0.18);
  const maxRange = Math.max(minRange * 1.5, maxOrbit * 1.3, defaultRange * 2.3);
  return Math.min(maxRange, Math.max(minRange, nextRange));
}

export function getViewportBounds(viewport: ViewportState): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfWidth = viewport.range * (W / H);
  return {
    minX: viewport.centerX - halfWidth,
    maxX: viewport.centerX + halfWidth,
    minZ: viewport.centerZ - viewport.range,
    maxZ: viewport.centerZ + viewport.range,
  };
}

export function toMap(wx: number, wz: number, viewport: ViewportState): [number, number] {
  const bounds = getViewportBounds(viewport);
  return [
    ((wx - bounds.minX) / (bounds.maxX - bounds.minX)) * W,
    ((wz - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * H,
  ];
}

export function toWorld(mx: number, my: number, viewport: ViewportState): [number, number] {
  const bounds = getViewportBounds(viewport);
  return [
    bounds.minX + (mx / W) * (bounds.maxX - bounds.minX),
    bounds.minZ + (my / H) * (bounds.maxZ - bounds.minZ),
  ];
}

export function clampCenter(centerX: number, centerZ: number, range: number, bounds: WorldBounds): { x: number; z: number } {
  const halfWidth = range * (W / H);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxZ - bounds.minZ;

  const clampedX = width <= halfWidth * 2
    ? (bounds.minX + bounds.maxX) * 0.5
    : Math.min(bounds.maxX - halfWidth, Math.max(bounds.minX + halfWidth, centerX));
  const clampedZ = height <= range * 2
    ? (bounds.minZ + bounds.maxZ) * 0.5
    : Math.min(bounds.maxZ - range, Math.max(bounds.minZ + range, centerZ));

  return { x: clampedX, z: clampedZ };
}

export function computeDefaultRange(currentSystem: SystemData, playerPos: { x: number; z: number }): number {
  const mainPlanet = currentSystem.planets.find(p => p.id === currentSystem.mainStationPlanetId) ?? null;
  const spawnDistanceFromMainPlanet = mainPlanet ? (mainPlanet.radius * 2.2 + 45) : 0;
  const spawnLateralOffset = 20;
  const initialSpawnToStarDistance = mainPlanet
    ? Math.hypot(mainPlanet.orbitRadius + spawnDistanceFromMainPlanet, spawnLateralOffset)
    : Math.hypot(playerPos.x, playerPos.z);
  return Math.max(initialSpawnToStarDistance * 2, currentSystem.starRadius * 8, 200) * 3;
}

export function computeWorldBounds(
  currentSystem: SystemData,
  entities: Map<string, SceneEntity>,
  battle: FleetBattle | null,
  playerPos: { x: number; z: number },
): WorldBounds {
  const maxOrbit = Math.max(
    ...currentSystem.planets.map(planet => planet.orbitRadius),
    ...currentSystem.dysonShells.map(shell => shell.orbitRadius),
    ...currentSystem.secretBases.map(base => base.orbitRadius),
    currentSystem.asteroidBelt?.outerRadius ?? 0,
    currentSystem.starRadius * 8,
    160,
  );
  const bounds: WorldBounds = { minX: -maxOrbit, maxX: maxOrbit, minZ: -maxOrbit, maxZ: maxOrbit };

  const expand = (x: number, z: number, margin = 0) => {
    bounds.minX = Math.min(bounds.minX, x - margin);
    bounds.maxX = Math.max(bounds.maxX, x + margin);
    bounds.minZ = Math.min(bounds.minZ, z - margin);
    bounds.maxZ = Math.max(bounds.maxZ, z + margin);
  };

  expand(playerPos.x, playerPos.z, 30);
  if (battle) expand(battle.position.x, battle.position.z, BATTLE_DANGER_RANGE);

  for (const [, entity] of entities) {
    if (['npc_ship', 'fleet_ship', 'planet', 'moon', 'station'].includes(entity.type)) {
      expand(entity.worldPos.x, entity.worldPos.z, entity.collisionRadius ?? 12);
    }
  }

  return bounds;
}
