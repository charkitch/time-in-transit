import * as THREE from 'three';
import { PALETTE } from '../../../constants';
import { loadTexture } from '../../textureCache';
import type { PlanetSkin } from '../../planetSkins';
import type { GasGiantType, InteractionFieldData } from '../../../engine';
import planetVertex from '../shaders/includes/planet_vertex.glsl';
import gasGiantFrag from '../shaders/gas_giant.frag.glsl';
import { makeInteractionFieldTexture } from './shared';

const GAS_TYPE_INDEX: Record<GasGiantType, number> = {
  jovian: 0,
  saturnian: 1,
  neptunian: 2,
  inferno: 3,
  chromatic: 4,
  helium: 5,
};

export function makeGasGiant(
  radius: number, baseColor: number, rng: () => number,
  seed: number = 0, gasType: GasGiantType = 'jovian',
  greatSpot = false, greatSpotLat = 0, greatSpotSize = 0.5,
  interactionField?: InteractionFieldData,
): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const interactionTex = makeInteractionFieldTexture(interactionField);
  const interactionFieldBlend = interactionField ? 0.28 : 0.0;

  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      seed: { value: seed },
      baseColor: { value: new THREE.Color(baseColor) },
      gasType: { value: GAS_TYPE_INDEX[gasType] },
      uGreatSpot: { value: greatSpot ? 1 : 0 },
      uSpotLat: { value: greatSpotLat },
      uSpotSize: { value: greatSpotSize },
      interactionFieldTex: { value: interactionTex },
      interactionFieldBlend: { value: interactionFieldBlend },
    },
    vertexShader: planetVertex,
    fragmentShader: gasGiantFrag,
  });

  group.add(new THREE.Mesh(geo, mat));

  // Wireframe overlay
  const edgesGeo = new THREE.EdgesGeometry(geo, 15);
  const wireMat = new THREE.LineBasicMaterial({
    color: PALETTE.wireframe,
    transparent: true,
    opacity: 0.12,
  });
  group.add(new THREE.LineSegments(edgesGeo, wireMat));

  return group;
}


export function makeTexturedGasGiant(
  radius: number,
  fallbackColor: number,
  skin: PlanetSkin | null,
  wireOverlay: boolean,
  seed: number = 0,
  gasType: GasGiantType = 'jovian',
): THREE.Group {
  // No skin — use procedural shader
  if (!skin) {
    return makeGasGiant(radius, fallbackColor, () => 0, seed, gasType);
  }

  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.9,
    metalness: 0.0,
  });

  mat.map = loadTexture(skin.albedo);
  if (skin.normal) mat.normalMap = loadTexture(skin.normal);

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
