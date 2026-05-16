import * as THREE from 'three';
import {
  createGalacticBackground,
  updateGalacticBackgroundUniforms,
} from './createGalacticBackground';
import { createStarPoints } from './starPointMaterial';
import { projectStarView } from './projectStarView';
import { createSimpleStarfield } from './createSimpleStarfield';
import { isSoftwareRenderer } from './detectSoftwareRenderer';
import type { StarVolume } from './starfieldConstants';

export interface StarfieldSystem {
  backgroundQuad: THREE.Mesh;
  starPoints: THREE.Points;
  updatePerFrame(camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

const _cameraWorldPos = new THREE.Vector3();

export function createStarfieldSystem(
  starVolume: StarVolume,
  galaxyX: number,
  galaxyY: number,
  pixelRatio: number,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): StarfieldSystem {
  if (isSoftwareRenderer(renderer)) {
    return createSimpleStarfield(starVolume, galaxyX, galaxyY);
  }

  const view = projectStarView(starVolume, galaxyX, galaxyY);
  const starPoints = createStarPoints(view.positions, view.colors, view.sizes, pixelRatio);
  const backgroundQuad = createGalacticBackground(galaxyX, galaxyY, camera);

  return {
    backgroundQuad,
    starPoints,

    updatePerFrame(camera: THREE.PerspectiveCamera) {
      camera.getWorldPosition(_cameraWorldPos);
      starPoints.position.copy(_cameraWorldPos);
      updateGalacticBackgroundUniforms(backgroundQuad, camera);
    },

    dispose() {
      starPoints.geometry.dispose();
      (starPoints.material as THREE.Material).dispose();
      backgroundQuad.geometry.dispose();
      (backgroundQuad.material as THREE.Material).dispose();
    },
  };
}
