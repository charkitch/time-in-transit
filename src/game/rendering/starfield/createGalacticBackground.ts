import * as THREE from 'three';
import galacticBgVert from './shaders/galactic_bg.vert.glsl';
import galacticBgFrag from './shaders/galactic_bg.frag.glsl';
import { GALACTIC_BG_RENDER_ORDER } from './starfieldConstants';

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
      uGalaxyDir: { value: new THREE.Vector2(-galaxyX, -galaxyY).normalize() },
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
