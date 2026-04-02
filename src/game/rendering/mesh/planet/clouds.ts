import * as THREE from 'three';
import type { SurfaceType } from '../../../engine';
import planetVertex from '../shaders/includes/planet_vertex.glsl';
import cloudsFrag from '../shaders/clouds.frag.glsl';

export function addCloudLayer(
  group: THREE.Group, radius: number, seed: number, density: number,
  surfaceType: SurfaceType = 'continental',
): void {
  const geo = new THREE.SphereGeometry(radius * 1.04, 32, 24);
  const isIce = surfaceType === 'ice';

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      seed: { value: seed },
      density: { value: density },
      isIce: { value: isIce ? 1 : 0 },
    },
    vertexShader: planetVertex,
    fragmentShader: cloudsFrag,
  });

  group.add(new THREE.Mesh(geo, mat));
}
