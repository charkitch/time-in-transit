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
