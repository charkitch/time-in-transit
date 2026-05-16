import * as THREE from 'three';
import { makeAsteroidBelt } from '../meshFactory';
import type { SolarSystemData, SystemFactionState } from '../../engine';
import type { NPCShipState } from '../../mechanics/NPCSystem';
import { PRNG } from '../../generation/prng';
import { CLUSTER_SEED, STAR_COLORS, PALETTE } from '../../constants';
import type { SceneEntity } from './types';
import type { RuntimeProfile } from '../../../runtime/runtimeProfile';
import { LandingSiteManager } from './LandingSiteManager';
import type { AsteroidBeltMaterialEntry, DysonShellMaterialEntry, TopopolisMaterialEntry, BeamParams } from './tickSceneAnimations';
import type { BattleExplosions } from '../effects';
import type { FleetBattle } from '../../mechanics/FleetBattleSystem';
import type { XRayTransferStream } from './types';

import { buildStar } from './buildStar';
import { buildPlanets } from './buildPlanets';
import { buildDysonShells } from './buildDysonShells';
import { buildTopopolisCoils } from './buildTopopolisCoils';
import { buildSecretBases } from './buildSecretBases';
import { buildNPCShips } from './buildNPCShips';
import { buildFleetBattle } from './buildFleetBattle';
import { createStarfieldSystem, type StarfieldSystem } from '../starfield/createStarfieldSystem';
import type { StarVolume } from '../starfield/starfieldConstants';

export { GALAXY_SEED } from './buildSystemSceneUtils';
export { hashString32 } from './buildSystemSceneUtils';

export interface SystemSceneState {
  systemObjects: THREE.Object3D[];
  lightningMaterials: THREE.ShaderMaterial[];
  asteroidBeltMaterials: AsteroidBeltMaterialEntry[];
  dysonShellMaterials: DysonShellMaterialEntry[];
  topopolisMaterials: TopopolisMaterialEntry[];
  xRayTransferStreams: XRayTransferStream[];
  xbDiskGroup: THREE.Group | null;
  mqJetParams: BeamParams | null;
  mqJetGroup: THREE.Group | null;
  pulsarBeamGroup: THREE.Group | null;
  pulsarBeamAngle: number;
  pulsarBeamParams: BeamParams | null;
  pulsarStarMat: THREE.ShaderMaterial | null;
  battleProjectiles: THREE.Points | null;
  battleExplosions: BattleExplosions | null;
  fleetBattleData: FleetBattle | null;
  collidables: SceneEntity[];
  starLight: THREE.PointLight | null;
}

export function buildSystemScene(params: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  runtimeProfile: RuntimeProfile | null;
  entities: Map<string, SceneEntity>;
  npcShips: Map<string, NPCShipState>;
  landingSites: LandingSiteManager;
  data: SolarSystemData;
  systemId: number;
  galaxyYear?: number;
  systemName?: string;
  factionState?: SystemFactionState;
  galaxyX?: number;
  galaxyY?: number;
  starVolume: StarVolume;
  pixelRatio: number;
}): { state: SystemSceneState; starfieldSystem: StarfieldSystem } {
  const {
    scene, camera, renderer, runtimeProfile,
    entities, npcShips, landingSites,
    data, systemId,
    galaxyYear = 0,
    systemName = '',
    factionState,
    galaxyX = 0,
    galaxyY = 0,
    starVolume,
    pixelRatio,
  } = params;

  const systemObjects: THREE.Object3D[] = [];
  const lightningMaterials: THREE.ShaderMaterial[] = [];
  const asteroidBeltMaterials: AsteroidBeltMaterialEntry[] = [];
  const dysonShellMaterials: DysonShellMaterialEntry[] = [];
  const topopolisMaterials: TopopolisMaterialEntry[] = [];
  const collisionOnlyEntities: SceneEntity[] = [];

  // Starfield
  const starfieldSystem = createStarfieldSystem(starVolume, galaxyX, galaxyY, pixelRatio, camera, renderer);
  scene.add(starfieldSystem.backgroundQuad);
  scene.add(starfieldSystem.starPoints);

  // Star
  const starResult = buildStar({ scene, camera, entities, systemObjects, data, systemName });

  // Planets, moons, rings, stations
  const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 97 + 13);
  buildPlanets({ scene, entities, systemObjects, lightningMaterials, landingSites, data, systemId, rng });

  // Dyson shells
  buildDysonShells({ scene, entities, systemObjects, dysonShellMaterials, landingSites, data, rng });

  // Topopolis coils
  buildTopopolisCoils({ scene, entities, systemObjects, topopolisMaterials, landingSites, data, rng, runtimeProfile });

  // Asteroid belt
  if (data.asteroidBelt) {
    const ab = data.asteroidBelt;
    const starColor = STAR_COLORS[data.starType] ?? PALETTE.starG;
    const belt = makeAsteroidBelt(ab.innerRadius, ab.outerRadius, ab.count, () => rng.next(), starColor);
    scene.add(belt.mesh);
    systemObjects.push(belt.mesh);
    asteroidBeltMaterials.push({ material: belt.material });
    const beltId = 'asteroid-belt';
    collisionOnlyEntities.push({
      id: beltId,
      name: 'Asteroid Belt',
      group: belt.mesh,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      type: 'asteroid',
      worldPos: new THREE.Vector3(),
      collisionRadius: ab.outerRadius + belt.maxAsteroidRadius,
      collisionSpheresLocal: belt.collisionSpheres,
      collisionSpheresWorld: belt.collisionSpheres.map(sphere => ({
        center: sphere.center.clone(),
        radius: sphere.radius,
      })),
      collisionSampleOnly: true,
      collisionRadialBounds: {
        innerRadius: ab.innerRadius,
        outerRadius: ab.outerRadius,
        halfHeight: belt.halfHeight,
      },
    });
  }

  // Secret bases
  buildSecretBases({ scene, entities, systemObjects, data, rng });

  // NPC trade ships
  buildNPCShips({ scene, entities, npcShips, systemObjects, data, systemId, galaxyYear, systemName });

  // Fleet battle
  const battleResult = buildFleetBattle({ scene, entities, systemObjects, data, systemId, galaxyYear, factionState });

  // Rebuild collidables
  const collidables = [
    ...entities.values(),
    ...collisionOnlyEntities,
  ].filter(e => e.collisionRadius > 0);

  if (import.meta.env.DEV) {
    renderer.compile(scene, camera);
    const failed: string[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
        const prog = (renderer.properties.get(obj.material) as Record<string, unknown>)?.currentProgram;
        if (!prog) {
          failed.push(obj.name || obj.uuid);
        }
      }
    });
    if (failed.length > 0) {
      const msg = `SHADER COMPILATION FAILED:\n${failed.join('\n')}`;
      console.error(msg);
      const div = document.createElement('div');
      div.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:16px;background:#a00;color:#fff;font:bold 14px monospace;white-space:pre-wrap;z-index:99999';
      div.textContent = msg;
      document.body.appendChild(div);
    }
  }

  const state: SystemSceneState = {
    systemObjects,
    lightningMaterials,
    asteroidBeltMaterials,
    dysonShellMaterials,
    topopolisMaterials,
    xRayTransferStreams: starResult.xRayTransferStreams,
    xbDiskGroup: starResult.xbDiskGroup,
    mqJetParams: starResult.mqJetParams,
    mqJetGroup: starResult.mqJetGroup,
    pulsarBeamGroup: starResult.pulsarBeamGroup,
    pulsarBeamAngle: starResult.pulsarBeamAngle,
    pulsarBeamParams: starResult.pulsarBeamParams,
    pulsarStarMat: starResult.pulsarStarMat,
    battleProjectiles: battleResult.battleProjectiles,
    battleExplosions: battleResult.battleExplosions,
    fleetBattleData: battleResult.fleetBattleData,
    collidables,
    starLight: starResult.starLight,
  };

  return { state, starfieldSystem };
}
