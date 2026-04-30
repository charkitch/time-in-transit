import * as THREE from 'three';
import {
  makeAsteroidBase, makeOortCloudBase, makeMaximumSpaceBase,
} from '../meshFactory';
import type { SolarSystemData } from '../../engine';
import { PRNG } from '../../generation/prng';
import type { SceneEntity } from './types';
import { computeSecretBaseCollisionSpheres } from './buildSystemSceneUtils';

// ─── Base size/collision constants ──────────────────────────────────────────

const ASTEROID_SIZE = 35;
const ASTEROID_COLLISION = 24;
const OORT_SIZE = 45;
const OORT_COLLISION = 30;
const MAXIMUM_SPACE_SIZE = 55;
const MAXIMUM_SPACE_COLLISION = 36;

const ICE_PARTICLE_COUNT = 120;
const ICE_SPREAD = 2000;
const ICE_HEIGHT = 600;
const ICE_COLOR = 0x88BBDD;
const ICE_POINT_SIZE = 15;
const ICE_OPACITY = 0.3;

const VOID_PARTICLE_COUNT = 60;
const VOID_SPREAD = 3000;
const VOID_HEIGHT = 1000;
const VOID_COLOR = 0x6622CC;
const VOID_POINT_SIZE = 20;
const VOID_OPACITY = 0.2;

export function buildSecretBases(params: {
  scene: THREE.Scene;
  entities: Map<string, SceneEntity>;
  systemObjects: THREE.Object3D[];
  data: SolarSystemData;
  rng: PRNG;
}): void {
  const { scene, entities, systemObjects, data, rng } = params;

  for (const base of data.secretBases) {
    let baseGroup: THREE.Group;
    let baseSize: number;
    let baseCollisionRadius: number;
    switch (base.type) {
      case 'asteroid':
        baseSize = ASTEROID_SIZE;
        baseCollisionRadius = ASTEROID_COLLISION;
        baseGroup = makeAsteroidBase(baseSize);
        break;
      case 'oort_cloud':
        baseSize = OORT_SIZE;
        baseCollisionRadius = OORT_COLLISION;
        baseGroup = makeOortCloudBase(baseSize);
        break;
      case 'maximum_space':
        baseSize = MAXIMUM_SPACE_SIZE;
        baseCollisionRadius = MAXIMUM_SPACE_COLLISION;
        baseGroup = makeMaximumSpaceBase(baseSize);
        break;
    }
    const collisionSpheres = computeSecretBaseCollisionSpheres(base.type, baseSize);
    baseGroup.position.set(
      Math.cos(base.orbitPhase) * base.orbitRadius,
      0,
      Math.sin(base.orbitPhase) * base.orbitRadius,
    );
    scene.add(baseGroup);
    systemObjects.push(baseGroup);

    entities.set(base.id, {
      id: base.id,
      name: base.name,
      group: baseGroup,
      orbitRadius: base.orbitRadius,
      orbitSpeed: base.orbitSpeed,
      orbitPhase: base.orbitPhase,
      type: 'station', // reuse station type so docking works
      worldPos: new THREE.Vector3(),
      collisionRadius: baseCollisionRadius,
      interactionRadius: baseSize,
      collisionSpheresLocal: collisionSpheres,
      collisionSpheresWorld: collisionSpheres.map(sphere => ({
        center: sphere.center.clone(),
        radius: sphere.radius,
      })),
      collisionSampleOnly: true,
      stationSpinAxis: new THREE.Vector3(0, 0, 1),
    });

    // Ambient particles around secret bases
    if (base.type === 'oort_cloud') {
      // Sparse icy debris cloud
      const iceGeo = new THREE.BufferGeometry();
      const icePositions = new Float32Array(ICE_PARTICLE_COUNT * 3);
      for (let i = 0; i < ICE_PARTICLE_COUNT; i++) {
        const angle2 = rng.next() * Math.PI * 2;
        const dist = base.orbitRadius + (rng.next() - 0.5) * ICE_SPREAD;
        const y2 = (rng.next() - 0.5) * ICE_HEIGHT;
        icePositions[i * 3] = Math.cos(angle2) * dist;
        icePositions[i * 3 + 1] = y2;
        icePositions[i * 3 + 2] = Math.sin(angle2) * dist;
      }
      iceGeo.setAttribute('position', new THREE.BufferAttribute(icePositions, 3));
      const iceMat = new THREE.PointsMaterial({ color: ICE_COLOR, size: ICE_POINT_SIZE, transparent: true, opacity: ICE_OPACITY });
      const icePoints = new THREE.Points(iceGeo, iceMat);
      scene.add(icePoints);
      systemObjects.push(icePoints);
    } else if (base.type === 'maximum_space') {
      // Faint void motes — strange purple specks at the edge of nothing
      const voidGeo = new THREE.BufferGeometry();
      const voidPositions = new Float32Array(VOID_PARTICLE_COUNT * 3);
      for (let i = 0; i < VOID_PARTICLE_COUNT; i++) {
        const angle2 = rng.next() * Math.PI * 2;
        const dist = base.orbitRadius + (rng.next() - 0.5) * VOID_SPREAD;
        const y2 = (rng.next() - 0.5) * VOID_HEIGHT;
        voidPositions[i * 3] = Math.cos(angle2) * dist;
        voidPositions[i * 3 + 1] = y2;
        voidPositions[i * 3 + 2] = Math.sin(angle2) * dist;
      }
      voidGeo.setAttribute('position', new THREE.BufferAttribute(voidPositions, 3));
      const voidMat = new THREE.PointsMaterial({ color: VOID_COLOR, size: VOID_POINT_SIZE, transparent: true, opacity: VOID_OPACITY });
      const voidPoints = new THREE.Points(voidGeo, voidMat);
      scene.add(voidPoints);
      systemObjects.push(voidPoints);
    }
  }
}
