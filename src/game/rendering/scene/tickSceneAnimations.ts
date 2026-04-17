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

export interface TopopolisMaterialEntry {
  interiorMats: THREE.ShaderMaterial[];
  cityMats: THREE.ShaderMaterial[];
  cloudMats: THREE.ShaderMaterial[];
  lightningMats: THREE.ShaderMaterial[];
  /** Per-wrap refs to expensive meshes for t-space distance culling */
  distanceCullMeshes: THREE.Object3D[][];
  /** Helix centerline samples (local space) for camera projection */
  helixSamples: THREE.Vector3[];
  /** Parent group — needed to transform camera into local space */
  coilParent: THREE.Object3D;
  coilCount: number;
}

export interface BeamParams {
  axis: THREE.Vector3;
  halfAngle: number;
  length: number;
  starEntityId: string;
}

const _worldPos = new THREE.Vector3();
const _starPos = new THREE.Vector3();
const _localCam = new THREE.Vector3();

export function tickSceneAnimations(params: {
  entities: Map<string, SceneEntity>;
  npcShips: Map<string, NPCShipState>;
  collidables: SceneEntity[];
  camera: THREE.PerspectiveCamera;
  xRayTransferStreams: XRayTransferStream[];
  xbDiskGroup: THREE.Group | null;
  lightningMaterials: THREE.ShaderMaterial[];
  dysonShellMaterials: DysonShellMaterialEntry[];
  topopolisMaterials: TopopolisMaterialEntry[];
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
    lightningMaterials, dysonShellMaterials, topopolisMaterials,
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

  // Topopolis materials — lit by the star at origin, with t-space distance culling
  _starPos.set(0, 0, 0);
  for (const entry of topopolisMaterials) {
    // Project camera onto helix curve in local space to find current t-value.
    // Full scan over ~300 samples — cheaper than a single snoise evaluation.
    let cameraTValue = 0.5;
    const samples = entry.helixSamples;
    if (samples.length > 0) {
      entry.coilParent.worldToLocal(_localCam.copy(camera.getWorldPosition(_worldPos)));
      let closestDistSq = Infinity;
      let closestIdx = 0;
      for (let i = 0; i < samples.length; i++) {
        const dSq = _localCam.distanceToSquared(samples[i]);
        if (dSq < closestDistSq) { closestDistSq = dSq; closestIdx = i; }
      }
      cameraTValue = closestIdx / (samples.length - 1);
    }

    // Per-wrap visibility culling + uniform updates
    const { coilCount } = entry;
    entry.interiorMats.forEach((mat) => {
      mat.uniforms.uLightPos.value.copy(_starPos);
    });

    for (let wrap = 0; wrap < coilCount; wrap++) {
      const wrapMidT = (wrap + 0.5) / coilCount;
      const tDist = Math.abs(cameraTValue - wrapMidT);

      // Show expensive layers for wraps near the camera along the tube
      const showAll = tDist < 2.5 / coilCount;
      const showCity = tDist < 4.0 / coilCount;

      const cullMeshes = entry.distanceCullMeshes[wrap];
      if (cullMeshes) {
        // cullMeshes order: [city, clouds, lightning] (when present)
        cullMeshes.forEach((mesh, i) => {
          mesh.visible = i === 0 ? showCity : showAll;
        });
      }

      // Only update uniforms for visible materials
      if (showCity && entry.cityMats[wrap]) {
        entry.cityMats[wrap].uniforms.uLightPos.value.copy(_starPos);
      }
      if (showAll && entry.cloudMats[wrap]) {
        entry.cloudMats[wrap].uniforms.uTime.value = time;
      }
      if (showAll && entry.lightningMats[wrap]) {
        entry.lightningMats[wrap].uniforms.uTime.value = time;
      }
    }
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
