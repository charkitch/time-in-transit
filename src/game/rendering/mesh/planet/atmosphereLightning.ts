import * as THREE from 'three';
import planetVertex from '../shaders/includes/planet_vertex.glsl';
import sunAtmosphereVert from '../shaders/sun_atmosphere.vert.glsl';
import sunAtmosphereFrag from '../shaders/sun_atmosphere.frag.glsl';
import lightningFrag from '../shaders/lightning.frag.glsl';

export function addSunAtmosphere(group: THREE.Group, radius: number): void {
  const geo = new THREE.SphereGeometry(radius * 1.06, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: sunAtmosphereVert,
    fragmentShader: sunAtmosphereFrag,
  });

  group.add(new THREE.Mesh(geo, mat));
}

/**
 * Rare lightning flashes on the dark side of planets and gas giants.
 * Returns the ShaderMaterial so the caller can update uTime each frame.
 */
export function addLightning(
  group: THREE.Group, radius: number, seed: number,
): THREE.ShaderMaterial {
  const geo = new THREE.SphereGeometry(radius * 1.002, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0.0 },
      seed:  { value: seed },
    },
    vertexShader: planetVertex,
    fragmentShader: lightningFrag,
  });

  group.add(new THREE.Mesh(geo, mat));
  return mat;
}
