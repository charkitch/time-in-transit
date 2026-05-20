import * as THREE from 'three';
import nebulaVert from './shaders/nebula.vert.glsl';
import nebulaFrag from './shaders/nebula.frag.glsl';
import {
  NEBULA_PALETTES,
  NEBULA_RENDER_ORDER,
  STARFIELD_SPHERE_RADIUS,
  type NebulaDescriptor,
} from './starfieldConstants';

export interface NebulaBillboardSystem {
  mesh: THREE.Mesh;
  updatePerFrame(camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

const _cameraWorldPos = new THREE.Vector3();

function buildPaletteUniforms(): {
  uPrimaryColors: { value: THREE.Vector3[] };
  uSecondaryColors: { value: THREE.Vector3[] };
} {
  const primaries = NEBULA_PALETTES.map(
    (p) => new THREE.Vector3(p[0], p[1], p[2]),
  );
  const secondaries = NEBULA_PALETTES.map(
    (p) => new THREE.Vector3(p[3], p[4], p[5]),
  );
  return {
    uPrimaryColors: { value: primaries },
    uSecondaryColors: { value: secondaries },
  };
}

function packInstanceAttributes(
  catalog: NebulaDescriptor[],
  geometry: THREE.InstancedBufferGeometry,
): void {
  const count = catalog.length;

  const directions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const shapeWeights = new Float32Array(count * 4);
  const paletteIndices = new Float32Array(count);
  const brightnesses = new Float32Array(count);
  const seeds = new Float32Array(count);
  const elongations = new Float32Array(count);
  const rotations = new Float32Array(count);

  catalog.forEach((n, i) => {
    directions[i * 3] = n.direction[0];
    directions[i * 3 + 1] = n.direction[1];
    directions[i * 3 + 2] = n.direction[2];

    radii[i] = n.angularRadius;

    shapeWeights[i * 4] = n.shapeWeights[0];
    shapeWeights[i * 4 + 1] = n.shapeWeights[1];
    shapeWeights[i * 4 + 2] = n.shapeWeights[2];
    shapeWeights[i * 4 + 3] = n.shapeWeights[3];

    paletteIndices[i] = n.paletteIndex;
    brightnesses[i] = n.brightness;
    seeds[i] = n.seed;
    elongations[i] = n.elongation;
    rotations[i] = n.rotation;
  });

  geometry.setAttribute('aDirection', new THREE.InstancedBufferAttribute(directions, 3));
  geometry.setAttribute('aRadius', new THREE.InstancedBufferAttribute(radii, 1));
  geometry.setAttribute('aShapeWeights', new THREE.InstancedBufferAttribute(shapeWeights, 4));
  geometry.setAttribute('aPaletteIndex', new THREE.InstancedBufferAttribute(paletteIndices, 1));
  geometry.setAttribute('aBrightness', new THREE.InstancedBufferAttribute(brightnesses, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aElongation', new THREE.InstancedBufferAttribute(elongations, 1));
  geometry.setAttribute('aRotation', new THREE.InstancedBufferAttribute(rotations, 1));
}

export function createNebulaBillboards(catalog: NebulaDescriptor[]): NebulaBillboardSystem {
  if (catalog.length === 0) {
    const emptyMesh = new THREE.Mesh();
    emptyMesh.visible = false;
    return {
      mesh: emptyMesh,
      updatePerFrame() {},
      dispose() {},
    };
  }

  const baseGeometry = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = baseGeometry.index;
  geometry.attributes.position = baseGeometry.attributes.position;
  geometry.attributes.uv = baseGeometry.attributes.uv;
  geometry.instanceCount = catalog.length;

  packInstanceAttributes(catalog, geometry);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSphereRadius: { value: STARFIELD_SPHERE_RADIUS },
      ...buildPaletteUniforms(),
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
    transparent: false,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  // Render before scene objects — opaque objects at renderOrder 0 paint over nebulae
  mesh.renderOrder = NEBULA_RENDER_ORDER;

  return {
    mesh,

    updatePerFrame(camera: THREE.PerspectiveCamera) {
      camera.getWorldPosition(_cameraWorldPos);
      mesh.position.copy(_cameraWorldPos);
    },

    dispose() {
      geometry.dispose();
      baseGeometry.dispose();
      material.dispose();
    },
  };
}
