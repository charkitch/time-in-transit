import * as THREE from 'three';
import { createBattleProjectiles, createBattleExplosions, type BattleExplosions } from '../effects';
import { makeFleetShipMesh } from '../meshFactory';
import type { SolarSystemData, SystemFactionState } from '../../engine';
import { generateFleetBattle } from '../../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../../mechanics/FleetBattleSystem';
import { getFaction } from '../../data/factions';
import type { SceneEntity } from './types';

export interface FleetBattleResult {
  fleetBattleData: FleetBattle | null;
  battleProjectiles: THREE.Points | null;
  battleExplosions: BattleExplosions | null;
}

export function buildFleetBattle(params: {
  scene: THREE.Scene;
  entities: Map<string, SceneEntity>;
  systemObjects: THREE.Object3D[];
  data: SolarSystemData;
  systemId: number;
  galaxyYear: number;
  factionState?: SystemFactionState;
}): FleetBattleResult {
  const { scene, entities, systemObjects, data, systemId, galaxyYear, factionState } = params;

  let fleetBattleData: FleetBattle | null = null;
  let battleProjectiles: THREE.Points | null = null;
  let battleExplosions: BattleExplosions | null = null;

  if (!factionState) return { fleetBattleData, battleProjectiles, battleExplosions };

  const battle = generateFleetBattle(data, systemId, galaxyYear, factionState);
  fleetBattleData = battle;

  if (battle) {
    const battleGroup = new THREE.Group();
    battleGroup.position.copy(battle.position);
    scene.add(battleGroup);
    systemObjects.push(battleGroup);

    const factionA = getFaction(battle.factionA);
    const factionB = getFaction(battle.factionB);
    const colorA = factionA?.color ?? 0xFF4444;
    const colorB = factionB?.color ?? 0x4488FF;
    const nameA = `${factionA?.name ?? 'Unknown'} Fleet`;
    const nameB = `${factionB?.name ?? 'Unknown'} Fleet`;

    const addFleetShips = (ships: typeof battle.shipsA, color: number, name: string) =>
      ships.map((ship) => {
        const mesh = makeFleetShipMesh(color, ship.scale);
        mesh.position.copy(ship.localOffset);
        battleGroup.add(mesh);
        const worldPos = ship.localOffset.clone().add(battle.position);
        entities.set(ship.id, {
          id: ship.id,
          name,
          group: mesh,
          orbitRadius: 0,
          orbitSpeed: 0,
          orbitPhase: 0,
          type: 'fleet_ship',
          worldPos,
          collisionRadius: 0,
        });
        return worldPos;
      });

    const shipWorldPosA = addFleetShips(battle.shipsA, colorA, nameA);
    const shipWorldPosB = addFleetShips(battle.shipsB, colorB, nameB);

    // Create projectile + explosion effects
    battleProjectiles = createBattleProjectiles(
      scene, battle.position,
      shipWorldPosA, shipWorldPosB,
      colorA, colorB,
    );
    systemObjects.push(battleProjectiles);

    battleExplosions = createBattleExplosions(scene);
    systemObjects.push(...battleExplosions.sprites);
  }

  return { fleetBattleData, battleProjectiles, battleExplosions };
}
