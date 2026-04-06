import * as THREE from 'three';
import { PALETTE } from '../../../constants';
import type { InteractionFieldData, SurfaceType } from '../../../engine';

export function makeWireframeObject(
  geo: THREE.BufferGeometry,
  fillColor: number,
  wireColor: number = PALETTE.wireframe,
  wireOpacity = 0.6,
): THREE.Group {
  const group = new THREE.Group();

  const fillMat = new THREE.MeshLambertMaterial({ color: fillColor });
  const fillMesh = new THREE.Mesh(geo, fillMat);
  group.add(fillMesh);

  const edgesGeo = new THREE.EdgesGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: wireColor,
    transparent: true,
    opacity: wireOpacity,
  });
  const wireframe = new THREE.LineSegments(edgesGeo, wireMat);
  group.add(wireframe);

  return group;
}

// Surface type index for GLSL
export const SURFACE_TYPE_INDEX: Record<SurfaceType, number> = {
  continental: 0,
  ocean: 1,
  marsh: 2,
  venus: 3,
  barren: 4,
  desert: 5,
  ice: 6,
  volcanic: 7,
  forest_moon: 8,
  mountain: 9,
};

export const SURFACE_TYPE_SHADER_DEFINES = `
#define SURF_TYPE_CONTINENTAL ${SURFACE_TYPE_INDEX.continental}
#define SURF_TYPE_OCEAN ${SURFACE_TYPE_INDEX.ocean}
#define SURF_TYPE_MARSH ${SURFACE_TYPE_INDEX.marsh}
#define SURF_TYPE_VENUS ${SURFACE_TYPE_INDEX.venus}
#define SURF_TYPE_BARREN ${SURFACE_TYPE_INDEX.barren}
#define SURF_TYPE_DESERT ${SURFACE_TYPE_INDEX.desert}
#define SURF_TYPE_ICE ${SURFACE_TYPE_INDEX.ice}
#define SURF_TYPE_VOLCANIC ${SURFACE_TYPE_INDEX.volcanic}
#define SURF_TYPE_FOREST_MOON ${SURFACE_TYPE_INDEX.forest_moon}
#define SURF_TYPE_MOUNTAIN ${SURFACE_TYPE_INDEX.mountain}
`.trim();

export function withSurfaceTypeShaderDefines(fragmentShader: string): string {
  return `${SURFACE_TYPE_SHADER_DEFINES}\n\n${fragmentShader}`;
}

export function makeInteractionFieldTexture(field?: InteractionFieldData): THREE.DataTexture {
  const width = field?.width ?? 1;
  const height = field?.height ?? 1;
  const values = field?.values ?? [128];
  const data = new Uint8Array(values.length);
  for (let i = 0; i < values.length; i++) {
    data[i] = Math.max(0, Math.min(255, values[i] ?? 128));
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
