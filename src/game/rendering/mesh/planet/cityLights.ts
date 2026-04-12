import * as THREE from 'three';
import type { SurfaceType } from '../../../engine';
import { SURFACE_TYPE_INDEX, withSurfaceTypeShaderDefines } from './shared';
import planetVertex from '../shaders/includes/planet_vertex.glsl';
import cityLightsFrag from '../shaders/city_lights.frag.glsl';

export function addCityLights(
  group: THREE.Group, radius: number, seed: number,
  surfaceType: SurfaceType = 'continental',
  polarCapSize: number = 0,
): void {
  // Atmospherically hostile or obviously barren worlds should stay dark.
  if (surfaceType === 'venus' || surfaceType === 'barren' || surfaceType === 'ice' || surfaceType === 'volcanic') return;

  const geo = new THREE.SphereGeometry(radius * 1.005, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      seed: { value: seed },
      surfType: { value: SURFACE_TYPE_INDEX[surfaceType] },
      polarCapSize: { value: polarCapSize },
    },
    vertexShader: planetVertex,
    fragmentShader: withSurfaceTypeShaderDefines(cityLightsFrag),
  });

  group.add(new THREE.Mesh(geo, mat));
}
