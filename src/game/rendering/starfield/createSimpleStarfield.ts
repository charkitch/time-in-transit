import * as THREE from 'three';
import { STAR_POINT_RENDER_ORDER, MAX_STAR_SIZE } from './starfieldConstants';
import { projectStarView } from './projectStarView';
import type { StarVolume } from './starfieldConstants';
import type { StarfieldSystem } from './createStarfieldSystem';

const _cameraWorldPos = new THREE.Vector3();

function scaledColorsBySize(colors: Float32Array, sizes: Float32Array): Float32Array {
  const scaled = new Float32Array(colors.length);
  const invMax = 1 / MAX_STAR_SIZE;
  sizes.forEach((size, i) => {
    const brightness = size * invMax;
    scaled[i * 3] = colors[i * 3] * brightness;
    scaled[i * 3 + 1] = colors[i * 3 + 1] * brightness;
    scaled[i * 3 + 2] = colors[i * 3 + 2] * brightness;
  });
  return scaled;
}

export function createSimpleStarfield(
  starVolume: StarVolume,
  galaxyX: number,
  galaxyY: number,
): StarfieldSystem {
  const view = projectStarView(starVolume, galaxyX, galaxyY);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(view.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(scaledColorsBySize(view.colors, view.sizes), 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    fog: false,
  });

  const starPoints = new THREE.Points(geometry, material);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = STAR_POINT_RENDER_ORDER;

  // Empty placeholder — no background quad in simple mode
  const backgroundQuad = new THREE.Mesh();
  backgroundQuad.visible = false;

  return {
    backgroundQuad,
    starPoints,

    updatePerFrame(camera: THREE.PerspectiveCamera) {
      camera.getWorldPosition(_cameraWorldPos);
      starPoints.position.copy(_cameraWorldPos);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
