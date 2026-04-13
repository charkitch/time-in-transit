import * as THREE from 'three';
import type { SceneEntity, XRayTransferStream } from './types';
import type { NPCShipState } from '../../mechanics/NPCSystem';
import type { BattleExplosions } from '../effects';
import { updateBattleProjectiles, updateBattleExplosions } from '../effects';
import { updateBeamTime } from './blackHoleVisuals';
import { updateXRayTransferStreams } from './xrayStreams';
import {
  rotateStations,
  updateFleetShipWorldPositions,
  updateNPCShips,
  updateOrbitalEntities,
} from './orbitAndNpcUpdates';

export interface DysonShellMaterialEntry {
  shellMat: THREE.ShaderMaterial;
  weatherMat: THREE.ShaderMaterial;
  cityMat: THREE.ShaderMaterial;
  miniStar: THREE.Object3D;
}

export interface BeamParams {
  axis: THREE.Vector3;
  halfAngle: number;
  length: number;
  starEntityId: string;
}

const _worldPos = new THREE.Vector3();

export function tickSceneAnimations(params: {
  entities: Map<string, SceneEntity>;
  npcShips: Map<string, NPCShipState>;
  collidables: SceneEntity[];
  camera: THREE.PerspectiveCamera;
  xRayTransferStreams: XRayTransferStream[];
  xbDiskGroup: THREE.Group | null;
  lightningMaterials: THREE.ShaderMaterial[];
  dysonShellMaterials: DysonShellMaterialEntry[];
  pulsarBeamGroup: THREE.Group | null;
  pulsarBeamAngle: number;
  pulsarBeamParams: BeamParams | null;
  pulsarStarMat: THREE.ShaderMaterial | null;
  mqJetGroup: THREE.Group | null;
  battleProjectiles: THREE.Points | null;
  battleExplosions: BattleExplosions | null;
  time: number;
  dt: number;
}): number {
  const {
    entities, npcShips, collidables, camera,
    xRayTransferStreams, xbDiskGroup,
    lightningMaterials, dysonShellMaterials,
    pulsarBeamGroup, pulsarBeamParams,
    mqJetGroup,
    battleProjectiles, battleExplosions,
    time, dt,
  } = params;
  let pulsarBeamAngle = params.pulsarBeamAngle;

  updateOrbitalEntities(entities, time);
  updateXRayTransferStreams({
    streams: xRayTransferStreams,
    entities,
    camera,
    xbDiskGroup,
    time,
  });
  updateFleetShipWorldPositions(entities);
  rotateStations(entities);
  updateNPCShips({ npcShips, entities, collidables, dt });

  // Tick lightning shaders
  for (const mat of lightningMaterials) {
    mat.uniforms.uTime.value = time;
  }

  for (const entry of dysonShellMaterials) {
    entry.miniStar.getWorldPosition(_worldPos);
    entry.shellMat.uniforms.uLightPos.value.copy(_worldPos);
    entry.weatherMat.uniforms.uLightPos.value.copy(_worldPos);
    entry.weatherMat.uniforms.uTime.value = time;
    entry.cityMat.uniforms.uLightPos.value.copy(_worldPos);
  }

  // Rotate pulsar beam group
  if (pulsarBeamGroup && dt > 0) {
    pulsarBeamAngle += (Math.PI * 2 / 4) * dt; // 1 revolution per 4 seconds
    pulsarBeamGroup.rotation.y = pulsarBeamAngle;
    if (pulsarBeamParams) {
      const axis = new THREE.Vector3(0, 1, 0);
      pulsarBeamGroup.getWorldQuaternion(new THREE.Quaternion()).normalize();
      const q = new THREE.Quaternion();
      pulsarBeamGroup.getWorldQuaternion(q);
      axis.applyQuaternion(q).normalize();
      pulsarBeamParams.axis.copy(axis);
    }
  }

  // Update beam + pulsar surface shader time uniforms
  if (pulsarBeamGroup) updateBeamTime(pulsarBeamGroup, time);
  if (params.pulsarStarMat) params.pulsarStarMat.uniforms.uTime.value = time;
  if (mqJetGroup) updateBeamTime(mqJetGroup, time);

  // Battle projectile + explosion animation
  if (battleProjectiles && dt > 0) {
    updateBattleProjectiles(battleProjectiles, dt, battleExplosions);
  }
  if (battleExplosions && dt > 0) {
    updateBattleExplosions(battleExplosions, dt);
  }

  return pulsarBeamAngle;
}
