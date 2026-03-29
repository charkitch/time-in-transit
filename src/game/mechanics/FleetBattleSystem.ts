import * as THREE from 'three';
import { PRNG } from '../generation/prng';
import { GALAXY_SEED, ERA_LENGTH } from '../constants';
import { getSystemFactionState } from './FactionSystem';
import { getCivState } from './CivilizationSystem';
import type { SolarSystemData, PlanetData } from '../generation/SystemGenerator';
import type { StarSystemData } from '../generation/GalaxyGenerator';

export interface FleetShip {
  id: string;
  localOffset: THREE.Vector3;
  scale: number;
  factionId: string;
}

export type ShipBehavior = 'approach' | 'strafe' | 'retreat';

export interface FleetShipRuntime {
  health: number;
  maxHealth: number;
  alive: boolean;
  behavior: ShipBehavior;
  behaviorTimer: number;
  moveTarget: THREE.Vector3;
  moveOrigin: THREE.Vector3;
  moveT: number;
  moveSpeed: number;
}

export interface FleetBattleState {
  shipsA: FleetShipRuntime[];
  shipsB: FleetShipRuntime[];
  aliveA: number;
  aliveB: number;
  battleOver: boolean;
  winner: 'A' | 'B' | null;
  elapsed: number;
}

export function createFleetBattleState(battle: FleetBattle): FleetBattleState {
  const makeRuntime = (ships: FleetShip[]): FleetShipRuntime[] =>
    ships.map(ship => {
      const isCapital = ship.scale > 1.5;
      const hp = isCapital ? ship.scale * 1.5 : 1.0;
      return {
        health: hp,
        maxHealth: hp,
        alive: true,
        behavior: 'approach' as ShipBehavior,
        behaviorTimer: Math.random() * 2,
        moveTarget: ship.localOffset.clone(),
        moveOrigin: ship.localOffset.clone(),
        moveT: 1,
        moveSpeed: isCapital ? 15 + Math.random() * 10 : 40 + Math.random() * 20,
      };
    });

  return {
    shipsA: makeRuntime(battle.shipsA),
    shipsB: makeRuntime(battle.shipsB),
    aliveA: battle.shipsA.length,
    aliveB: battle.shipsB.length,
    battleOver: false,
    winner: null,
    elapsed: 0,
  };
}

function pickBehavior(): { behavior: ShipBehavior; duration: number } {
  const r = Math.random();
  if (r < 0.5) return { behavior: 'approach', duration: 2 + Math.random() * 2 };
  if (r < 0.85) return { behavior: 'strafe', duration: 1.5 + Math.random() * 1.5 };
  return { behavior: 'retreat', duration: 1 + Math.random() };
}

const _enemyCenter = new THREE.Vector3();
const _scatter = new THREE.Vector3();

function computeMoveTarget(
  behavior: ShipBehavior,
  shipPos: THREE.Vector3,
  enemyShips: FleetShip[],
  enemyRuntime: FleetShipRuntime[],
): THREE.Vector3 {
  // Compute enemy center (alive ships only)
  _enemyCenter.set(0, 0, 0);
  let aliveCount = 0;
  for (let i = 0; i < enemyShips.length; i++) {
    if (enemyRuntime[i].alive) {
      _enemyCenter.add(enemyShips[i].localOffset);
      aliveCount++;
    }
  }
  if (aliveCount > 0) _enemyCenter.divideScalar(aliveCount);

  const target = new THREE.Vector3();

  if (behavior === 'approach') {
    // Pick a random alive enemy ship and scatter toward it
    const aliveIndices: number[] = [];
    for (let i = 0; i < enemyRuntime.length; i++) {
      if (enemyRuntime[i].alive) aliveIndices.push(i);
    }
    if (aliveIndices.length > 0) {
      const idx = aliveIndices[Math.floor(Math.random() * aliveIndices.length)];
      target.copy(enemyShips[idx].localOffset);
    } else {
      target.copy(_enemyCenter);
    }
    _scatter.set((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 80);
    target.add(_scatter);
  } else if (behavior === 'strafe') {
    // Perpendicular to enemy center
    const toEnemy = _enemyCenter.clone().sub(shipPos);
    const perp = new THREE.Vector3(-toEnemy.z, (Math.random() - 0.5) * 40, toEnemy.x).normalize();
    const side = Math.random() < 0.5 ? 1 : -1;
    target.copy(shipPos).addScaledVector(perp, side * (60 + Math.random() * 80));
  } else {
    // Retreat: away from enemy center
    const away = shipPos.clone().sub(_enemyCenter).normalize();
    target.copy(shipPos).addScaledVector(away, 80 + Math.random() * 60);
  }

  // Clamp within 300 units of origin
  if (target.length() > 300) target.normalize().multiplyScalar(300);

  return target;
}

export function updateFleetBattleState(
  state: FleetBattleState,
  battle: FleetBattle,
  dt: number,
): void {
  if (state.battleOver) return;
  state.elapsed += dt;

  const updateSide = (
    ships: FleetShip[],
    runtime: FleetShipRuntime[],
    enemyShips: FleetShip[],
    enemyRuntime: FleetShipRuntime[],
  ) => {
    for (let i = 0; i < ships.length; i++) {
      const rt = runtime[i];
      if (!rt.alive) continue;

      // Advance movement interpolation
      const dist = rt.moveOrigin.distanceTo(rt.moveTarget);
      if (dist > 0.1 && rt.moveT < 1) {
        rt.moveT += (rt.moveSpeed * dt) / dist;
        if (rt.moveT > 1) rt.moveT = 1;
      }

      // Interpolate position
      ships[i].localOffset.lerpVectors(rt.moveOrigin, rt.moveTarget, rt.moveT);

      // Behavior timer
      rt.behaviorTimer -= dt;
      if (rt.behaviorTimer <= 0 || rt.moveT >= 1) {
        const { behavior, duration } = pickBehavior();
        rt.behavior = behavior;
        rt.behaviorTimer = duration;
        rt.moveOrigin.copy(ships[i].localOffset);
        rt.moveTarget.copy(computeMoveTarget(behavior, ships[i].localOffset, enemyShips, enemyRuntime));
        rt.moveT = 0;

        // Refresh speed with slight variation
        const isCapital = ships[i].scale > 1.5;
        rt.moveSpeed = isCapital ? 15 + Math.random() * 10 : 40 + Math.random() * 20;
      }
    }
  };

  updateSide(battle.shipsA, state.shipsA, battle.shipsB, state.shipsB);
  updateSide(battle.shipsB, state.shipsB, battle.shipsA, state.shipsA);
}

export function damageFleetShip(
  state: FleetBattleState,
  side: 'A' | 'B',
  index: number,
  amount: number,
): boolean {
  const runtime = side === 'A' ? state.shipsA : state.shipsB;
  const rt = runtime[index];
  if (!rt || !rt.alive) return false;

  rt.health -= amount;
  if (rt.health <= 0) {
    rt.alive = false;
    if (side === 'A') {
      state.aliveA--;
      if (state.aliveA <= 0) {
        state.battleOver = true;
        state.winner = 'B';
      }
    } else {
      state.aliveB--;
      if (state.aliveB <= 0) {
        state.battleOver = true;
        state.winner = 'A';
      }
    }
    return true;
  }
  return false;
}

export interface FleetBattle {
  factionA: string;
  factionB: string;
  planetId: string;
  position: THREE.Vector3;
  shipsA: FleetShip[];
  shipsB: FleetShip[];
  noGoRadius: number;
}

export function generateFleetBattle(
  systemData: SolarSystemData,
  systemId: number,
  galaxyYear: number,
  starData: StarSystemData,
): FleetBattle | null {
  const civState = getCivState(systemId, galaxyYear, starData.economy);
  const factionState = getSystemFactionState(systemId, galaxyYear, civState.politics);

  if (!factionState.isContested || !factionState.contestingFactionId) {
    return null;
  }

  const era = Math.floor(galaxyYear / ERA_LENGTH);
  const rng = PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 0xBA77)) >>> 0,
    era,
  );

  // Pick a planet as the battle site
  if (systemData.planets.length === 0) return null;
  const planet: PlanetData = rng.pick(systemData.planets);

  // Calculate planet position at orbit phase (initial position)
  const planetX = Math.cos(planet.orbitPhase) * planet.orbitRadius;
  const planetZ = Math.sin(planet.orbitPhase) * planet.orbitRadius;

  // Offset from planet
  const battleOffset = planet.radius * 4 + 300;
  const battleAngle = rng.next() * Math.PI * 2;
  const battlePos = new THREE.Vector3(
    planetX + Math.cos(battleAngle) * battleOffset,
    0,
    planetZ + Math.sin(battleAngle) * battleOffset,
  );

  // Generate two fleets
  const countA = rng.int(5, 8);
  const countB = rng.int(5, 8);
  const fleetSpread = 400;

  const shipsA = generateFleetShips(
    rng, countA, factionState.controllingFactionId,
    new THREE.Vector3(-fleetSpread / 2, 0, 0), `a`, systemId,
  );

  const shipsB = generateFleetShips(
    rng, countB, factionState.contestingFactionId,
    new THREE.Vector3(fleetSpread / 2, 0, 0), `b`, systemId,
  );

  return {
    factionA: factionState.controllingFactionId,
    factionB: factionState.contestingFactionId,
    planetId: planet.id,
    position: battlePos,
    shipsA,
    shipsB,
    noGoRadius: 600,
  };
}

function generateFleetShips(
  rng: PRNG,
  count: number,
  factionId: string,
  clusterCenter: THREE.Vector3,
  prefix: string,
  systemId: number,
): FleetShip[] {
  const ships: FleetShip[] = [];

  for (let i = 0; i < count; i++) {
    // Most ships are fighters (scale 1.0), 1-2 are capital ships
    const isCapital = i < 2 && rng.next() < 0.4;
    const scale = isCapital ? rng.float(2.0, 3.0) : 1.0;

    const offset = new THREE.Vector3(
      clusterCenter.x + (rng.next() - 0.5) * 150,
      (rng.next() - 0.5) * 80,
      clusterCenter.z + (rng.next() - 0.5) * 150,
    );

    ships.push({
      id: `fleet-${systemId}-${prefix}-${i}`,
      localOffset: offset,
      scale,
      factionId,
    });
  }

  return ships;
}
