import * as THREE from 'three';
import galacticBgVert from './shaders/galactic_bg.vert.glsl';
import galacticBgFrag from './shaders/galactic_bg.frag.glsl';
import {
  DUST_NOISE_SCALE,
  GALACTIC_BAND_FALLOFF,
  GALACTIC_BG_RENDER_ORDER,
  GALAXY_POSITION_NOISE_OFFSET,
  NEBULA_COLOR_COOL,
  NEBULA_COLOR_WARM,
  NEBULA_NOISE_SCALE,
} from './starfieldConstants';

function galaxyOffset(galaxyX: number, galaxyY: number): THREE.Vector2 {
  return new THREE.Vector2(
    galaxyX * GALAXY_POSITION_NOISE_OFFSET,
    galaxyY * GALAXY_POSITION_NOISE_OFFSET,
  );
}

export function createGalacticBackground(
  galaxyX: number,
  galaxyY: number,
  camera: THREE.PerspectiveCamera,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(2, 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uInvProjectionMatrix: { value: camera.projectionMatrixInverse.clone() },
      uInvViewMatrix: { value: camera.matrixWorld.clone() },
      uGalaxyOffset: { value: galaxyOffset(galaxyX, galaxyY) },
      uBandFalloff: { value: GALACTIC_BAND_FALLOFF },
      uNebulaScale: { value: NEBULA_NOISE_SCALE },
      uDustScale: { value: DUST_NOISE_SCALE },
      uNebulaWarmColor: { value: NEBULA_COLOR_WARM.clone() },
      uNebulaCoolColor: { value: NEBULA_COLOR_COOL.clone() },
    },
    vertexShader: galacticBgVert,
    fragmentShader: galacticBgFrag,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = GALACTIC_BG_RENDER_ORDER;

  return mesh;
}

export function updateGalacticBackgroundUniforms(
  mesh: THREE.Mesh,
  camera: THREE.PerspectiveCamera,
): void {
  const material = mesh.material as THREE.ShaderMaterial;
  material.uniforms.uInvProjectionMatrix.value.copy(camera.projectionMatrixInverse);
  material.uniforms.uInvViewMatrix.value.copy(camera.matrixWorld);
}
