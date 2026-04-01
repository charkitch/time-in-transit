import * as THREE from 'three';
import { PALETTE } from '../../../constants';
import type { SurfaceType } from '../../../engine';

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
};
