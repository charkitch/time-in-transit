import * as THREE from 'three';
import { PALETTE } from '../../../constants';
import { loadTexture } from '../../textureCache';
import type { PlanetSkin } from '../../planetSkins';
import type { ClimateState, InteractionFieldData, SurfaceType } from '../../../engine';
import { CLIMATE_STATE_INDEX, makeInteractionFieldTexture, SURFACE_TYPE_INDEX, withSurfaceTypeShaderDefines } from './shared';
import planetVertex from '../shaders/includes/planet_vertex.glsl';
import rockyFrag from '../shaders/rocky.frag.glsl';

export function makePlanet(
  radius: number, color: number, detail: number = 1,
  seed: number = 0, surfaceType: SurfaceType = 'continental',
  interactionField?: InteractionFieldData,
  polarCapSize: number = 0,
  climateState: ClimateState = 'stable',
): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 32, 24);

  const baseColor = new THREE.Color(color);
  const interactionTex = makeInteractionFieldTexture(interactionField);
  const interactionFieldBlend = interactionField ? 0.22 : 0.0;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      seed: { value: seed },
      baseColor: { value: baseColor },
      surfType: { value: SURFACE_TYPE_INDEX[surfaceType] },
      interactionFieldTex: { value: interactionTex },
      interactionFieldBlend: { value: interactionFieldBlend },
      polarCapSize: { value: polarCapSize },
      climateState: { value: CLIMATE_STATE_INDEX[climateState] },
    },
    vertexShader: planetVertex,
    fragmentShader: withSurfaceTypeShaderDefines(rockyFrag),
  });

  group.add(new THREE.Mesh(geo, mat));

  // Subtle wireframe overlay
  if (detail >= 0) {
    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const wireMat = new THREE.LineBasicMaterial({
      color: PALETTE.wireframe,
      transparent: true,
      opacity: 0.12,
    });
    group.add(new THREE.LineSegments(edgesGeo, wireMat));
  }

  return group;
}


export function makeTexturedPlanet(
  radius: number,
  fallbackColor: number,
  skin: PlanetSkin | null,
  wireOverlay: boolean,
  seed: number = 0,
  surfaceType: SurfaceType = 'continental',
  polarCapSize: number = 0,
  climateState: ClimateState = 'stable',
): THREE.Group {
  // No skin available — use the procedural surface variant for this body.
  if (!skin) {
    return makePlanet(radius, fallbackColor, 1, seed, surfaceType,
      undefined, polarCapSize, climateState);
  }

  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.8,
    metalness: 0.1,
  });

  mat.map = loadTexture(skin.albedo);
  if (skin.normal) mat.normalMap = loadTexture(skin.normal);
  if (skin.roughness) mat.roughnessMap = loadTexture(skin.roughness);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));

  if (wireOverlay) {
    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const wireMat = new THREE.LineBasicMaterial({
      color: PALETTE.wireframe,
      transparent: true,
      opacity: 0.15,
    });
    group.add(new THREE.LineSegments(edgesGeo, wireMat));
  }

  return group;
}
