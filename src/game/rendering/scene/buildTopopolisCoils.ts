import * as THREE from 'three';
import { makeTopopolisCoil } from '../meshFactory';
import type { SolarSystemData } from '../../engine';
import { PRNG } from '../../generation/prng';
import type { SceneEntity } from './types';
import { LandingSiteManager } from './LandingSiteManager';
import type { RuntimeProfile } from '../../../runtime/runtimeProfile';
import type { TopopolisMaterialEntry } from './tickSceneAnimations';

export function buildTopopolisCoils(params: {
  scene: THREE.Scene;
  entities: Map<string, SceneEntity>;
  systemObjects: THREE.Object3D[];
  topopolisMaterials: TopopolisMaterialEntry[];
  landingSites: LandingSiteManager;
  data: SolarSystemData;
  rng: PRNG;
  runtimeProfile: RuntimeProfile | null;
}): void {
  const { scene, entities, systemObjects, topopolisMaterials, landingSites, data, rng, runtimeProfile } = params;

  const qualityTier = runtimeProfile?.qualityTier ?? 'high';
  for (const coil of data.topopolisCoils) {
    const coilSeed = rng.next() * 100;
    const result = makeTopopolisCoil(
      coil.orbitRadius,
      coil.coilCount,
      coil.tubeRadius,
      coil.helixPitch,
      coil.color,
      coil.biomeSequence,
      coil.biomeSeed,
      qualityTier,
      coilSeed,
      coil.interactionField,
    );

    // Add per-wrap groups to scene
    const coilParent = new THREE.Group();
    for (const group of result.groups) {
      coilParent.add(group);
    }
    scene.add(coilParent);
    systemObjects.push(coilParent);

    topopolisMaterials.push({
      interiorMats: result.interiorMaterials,
      cityMats: result.cityLightMaterials,
      cloudMats: result.cloudMaterials,
      lightningMats: result.lightningMaterials,
      distanceCullMeshes: result.distanceCullMeshes,
      helixSamples: result.helixSamples,
      coilParent,
      coilCount: result.coilCount,
    });

    // Create collision samples from helix centerline.
    // collisionSampleRadius = actual tube radius (FlightModel uses this
    // to detect the tube surface for the hollow-tube collision).
    const collisionSamples = result.helixSamples;

    // Landing sites on the inner tube surface
    landingSites.addTopopolisSites({
      hostId: coil.id,
      hostLabel: coil.name,
      hostGroup: coilParent,
      curve: result.curve,
      tubeRadius: result.tubeRadius,
      field: coil.interactionField,
      biomeSequence: coil.biomeSequence,
    });

    entities.set(coil.id, {
      id: coil.id,
      name: coil.name,
      group: coilParent,
      orbitRadius: 0,
      orbitSpeed: coil.orbitSpeed,
      orbitPhase: coil.orbitPhase,
      type: 'topopolis',
      worldPos: new THREE.Vector3(),
      collisionRadius: result.tubeRadius,
      collisionSampleRadius: result.tubeRadius,
      collisionSamplesLocal: collisionSamples,
      collisionSamplesWorld: collisionSamples.map(() => new THREE.Vector3()),
      gateSurfaceLocal: result.gateSurfacePositions,
      gateSurfaceWorld: result.gateSurfacePositions.map(() => new THREE.Vector3()),
      siteHostId: coil.id,
      siteCurveT: 0.5,
    });
  }
}
