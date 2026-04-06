import * as THREE from 'three';
import { PALETTE } from '../../constants';
import type { NPCShipArchetype, NPCShipSizeClass, StationArchetype } from '../../archetypes';
import { makeWireframeObject } from './planets';

interface StationMeshOptions {
  size?: number;
  archetype?: StationArchetype;
  seed?: number;
}

interface NPCShipMeshOptions {
  archetype: NPCShipArchetype;
  sizeClass: NPCShipSizeClass;
  seed: number;
}

interface ProceduralMaps {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const stationTextureCache = new Map<string, ProceduralMaps>();
const shipTextureCache = new Map<string, ProceduralMaps>();

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function createCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function paintProceduralMaps(params: {
  key: string;
  cache: Map<string, ProceduralMaps>;
  seed: number;
  baseColor: string;
  panelColor: string;
  accentColor: string;
  lineColor: string;
}): ProceduralMaps {
  const { key, cache, seed, baseColor, panelColor, accentColor, lineColor } = params;
  const cached = cache.get(key);
  if (cached) return cached;

  const size = 256;
  const albedo = createCanvas(size);
  const emissive = createCanvas(size);
  const roughness = createCanvas(size);
  const albedoCtx = albedo.getContext('2d');
  const emissiveCtx = emissive.getContext('2d');
  const roughnessCtx = roughness.getContext('2d');
  if (!albedoCtx || !emissiveCtx || !roughnessCtx) {
    throw new Error('Failed to initialize procedural texture canvases.');
  }

  albedoCtx.fillStyle = baseColor;
  albedoCtx.fillRect(0, 0, size, size);
  emissiveCtx.fillStyle = '#000000';
  emissiveCtx.fillRect(0, 0, size, size);
  roughnessCtx.fillStyle = '#8c8c8c';
  roughnessCtx.fillRect(0, 0, size, size);

  const rng = seededRng(seed);
  const panelCount = 42;
  for (let i = 0; i < panelCount; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const w = Math.floor(16 + rng() * 80);
    const h = Math.floor(10 + rng() * 52);
    albedoCtx.globalAlpha = 0.18 + rng() * 0.3;
    albedoCtx.fillStyle = i % 6 === 0 ? accentColor : panelColor;
    albedoCtx.fillRect(x, y, w, h);
    roughnessCtx.globalAlpha = 0.22;
    roughnessCtx.fillStyle = i % 5 === 0 ? '#5d5d5d' : '#a2a2a2';
    roughnessCtx.fillRect(x, y, w, h);
  }
  albedoCtx.globalAlpha = 1;
  roughnessCtx.globalAlpha = 1;

  const lineCount = 20;
  emissiveCtx.strokeStyle = lineColor;
  emissiveCtx.lineWidth = 2;
  for (let i = 0; i < lineCount; i++) {
    emissiveCtx.globalAlpha = 0.25 + rng() * 0.6;
    emissiveCtx.beginPath();
    const x0 = Math.floor(rng() * size);
    const y0 = Math.floor(rng() * size);
    const x1 = Math.floor(rng() * size);
    const y1 = Math.floor(rng() * size);
    emissiveCtx.moveTo(x0, y0);
    emissiveCtx.lineTo(x1, y1);
    emissiveCtx.stroke();
  }
  emissiveCtx.globalAlpha = 1;

  for (let i = 0; i < 1400; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const shade = Math.floor(100 + rng() * 120);
    albedoCtx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.05)`;
    albedoCtx.fillRect(x, y, 1, 1);
    roughnessCtx.fillStyle = `rgba(${Math.floor(150 + rng() * 80)}, ${Math.floor(150 + rng() * 80)}, ${Math.floor(150 + rng() * 80)}, 0.07)`;
    roughnessCtx.fillRect(x, y, 1, 1);
  }

  const map = new THREE.CanvasTexture(albedo);
  const emissiveMap = new THREE.CanvasTexture(emissive);
  const roughnessMap = new THREE.CanvasTexture(roughness);
  for (const tex of [map, emissiveMap, roughnessMap]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;

  const generated = { map, emissiveMap, roughnessMap };
  cache.set(key, generated);
  return generated;
}

function makePbrMaterial(
  maps: ProceduralMaps,
  emissiveColor: number,
  metalness = 0.45,
  roughness = 0.62,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    emissiveMap: maps.emissiveMap,
    roughnessMap: maps.roughnessMap,
    emissive: emissiveColor,
    emissiveIntensity: 0.5,
    metalness,
    roughness,
  });
}

function stationPalette(archetype: StationArchetype): {
  base: string;
  panel: string;
  accent: string;
  line: string;
  emissive: number;
} {
  switch (archetype) {
    case 'trade_hub':
      return { base: '#55657a', panel: '#6d7f98', accent: '#8da7c7', line: '#58d6ff', emissive: 0x58d6ff };
    case 'refinery_spindle':
      return { base: '#5b4f43', panel: '#7a6652', accent: '#97795a', line: '#ff9a4f', emissive: 0xff9a4f };
    case 'citadel_bastion':
      return { base: '#3f4856', panel: '#566272', accent: '#8392a8', line: '#88bbff', emissive: 0x88bbff };
    case 'alien_lattice_hive':
      return { base: '#384f48', panel: '#4c6f63', accent: '#70a08a', line: '#68ffd9', emissive: 0x68ffd9 };
    case 'alien_orrery_reliquary':
      return { base: '#34384f', panel: '#4f5370', accent: '#7a6ea6', line: '#d59bff', emissive: 0xd59bff };
    case 'alien_graveloom':
      return { base: '#2b3440', panel: '#3b4959', accent: '#51677b', line: '#8df4ff', emissive: 0x8df4ff };
  }
}

function shipPalette(archetype: NPCShipArchetype): {
  base: string;
  panel: string;
  accent: string;
  line: string;
  emissive: number;
} {
  switch (archetype) {
    case 'human_freighter':
      return { base: '#546579', panel: '#6c8097', accent: '#859ab1', line: '#69d6ff', emissive: 0x69d6ff };
    case 'human_patrol':
      return { base: '#4f596d', panel: '#66748a', accent: '#8998b2', line: '#8db7ff', emissive: 0x8db7ff };
    case 'pilgrim_caravan':
      return { base: '#665a4f', panel: '#83705e', accent: '#a58b72', line: '#ffd38d', emissive: 0xffd38d };
    case 'alien_biolattice':
      return { base: '#35524b', panel: '#467166', accent: '#5f9988', line: '#5effd5', emissive: 0x5effd5 };
    case 'alien_crystal_spine':
      return { base: '#3f4059', panel: '#575a7d', accent: '#7f78af', line: '#e0a6ff', emissive: 0xe0a6ff };
    case 'alien_void_weaver':
      return { base: '#23354a', panel: '#2f4a67', accent: '#436c8f', line: '#8be6ff', emissive: 0x8be6ff };
  }
}

function makeStationGeometry(archetype: StationArchetype, size: number): THREE.BufferGeometry[] {
  switch (archetype) {
    case 'trade_hub':
      return [
        new THREE.TorusGeometry(size, size * 0.18, 18, 28),
        new THREE.CylinderGeometry(size * 0.22, size * 0.22, size * 0.7, 10),
      ];
    case 'refinery_spindle':
      return [
        new THREE.CylinderGeometry(size * 0.28, size * 0.22, size * 2.0, 10),
        new THREE.TorusGeometry(size * 0.75, size * 0.08, 12, 24),
      ];
    case 'citadel_bastion':
      return [
        new THREE.BoxGeometry(size * 1.5, size * 0.45, size * 1.2),
        new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 1.2, 8),
      ];
    case 'alien_lattice_hive':
      return [
        new THREE.IcosahedronGeometry(size * 0.9, 0),
        new THREE.TorusKnotGeometry(size * 0.5, size * 0.08, 84, 9, 2, 3),
      ];
    case 'alien_orrery_reliquary':
      return [
        new THREE.OctahedronGeometry(size * 0.9, 0),
        new THREE.TorusGeometry(size * 1.15, size * 0.06, 12, 36),
      ];
    case 'alien_graveloom':
      return [
        new THREE.DodecahedronGeometry(size * 0.8, 0),
        new THREE.TorusKnotGeometry(size * 0.7, size * 0.07, 120, 11, 3, 5),
      ];
  }
}

/** Station mesh with archetype-driven silhouette and procedural PBR texture maps. */
export function makeStation(options: StationMeshOptions = {}): THREE.Group {
  const size = options.size ?? 60;
  const archetype = options.archetype ?? 'trade_hub';
  const seed = options.seed ?? 1;
  const palette = stationPalette(archetype);
  const maps = paintProceduralMaps({
    key: `station-${archetype}-${seed & 1023}`,
    cache: stationTextureCache,
    seed: seed ^ 0x2ec6d1,
    baseColor: palette.base,
    panelColor: palette.panel,
    accentColor: palette.accent,
    lineColor: palette.line,
  });

  const group = new THREE.Group();
  const material = makePbrMaterial(maps, palette.emissive, 0.5, 0.58);
  const addMeshWithWire = (mesh: THREE.Mesh): void => {
    group.add(mesh);
    const edgesGeo = new THREE.EdgesGeometry(mesh.geometry);
    const wire = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: PALETTE.stationWire, transparent: true, opacity: 0.28 }),
    );
    wire.rotation.copy(mesh.rotation);
    wire.position.copy(mesh.position);
    wire.scale.copy(mesh.scale);
    group.add(wire);
  };

  const geos = makeStationGeometry(archetype, size);
  for (const [index, geo] of geos.entries()) {
    const mesh = new THREE.Mesh(geo, material.clone());
    if (index === 1) {
      mesh.rotation.x = Math.PI * 0.5;
    }
    addMeshWithWire(mesh);
  }

  if (archetype === 'trade_hub') {
    // Add spoke arms connecting the outer ring to the center hub.
    const armCount = 6;
    const armLength = size * 0.74;
    const armThickness = size * 0.08;
    const spokeRadius = size * 0.58;
    for (let i = 0; i < armCount; i++) {
      const angle = (i / armCount) * Math.PI * 2;
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(armLength, armThickness, armThickness),
        material.clone(),
      );
      arm.position.set(Math.cos(angle) * spokeRadius, Math.sin(angle) * spokeRadius, 0);
      arm.rotation.z = angle;
      addMeshWithWire(arm);
    }
  }

  const light = new THREE.PointLight(palette.emissive, 0.32, size * 8);
  group.add(light);
  return group;
}

/** Glow sprite (additive blend) */
export function makeGlowSprite(color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/** Instanced asteroid field */
export function makeAsteroidBelt(
  innerRadius: number,
  outerRadius: number,
  count: number,
  rng: () => number,
): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888877 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = innerRadius + rng() * (outerRadius - innerRadius);
    const y = (rng() - 0.5) * 200;
    const scale = 8 + rng() * 25;
    dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function shipScale(sizeClass: NPCShipSizeClass): number {
  if (sizeClass === 'small') return 0.8;
  if (sizeClass === 'large') return 1.45;
  return 1.0;
}

function makeShipBaseGeometry(archetype: NPCShipArchetype): THREE.BufferGeometry {
  switch (archetype) {
    case 'human_freighter':
      return new THREE.BoxGeometry(12, 6, 30);
    case 'human_patrol': {
      const geo = new THREE.ConeGeometry(7, 22, 5);
      geo.rotateX(Math.PI / 2);
      return geo;
    }
    case 'pilgrim_caravan':
      return new THREE.CylinderGeometry(6, 6, 24, 8);
    case 'alien_biolattice':
      return new THREE.IcosahedronGeometry(10, 0);
    case 'alien_crystal_spine':
      return new THREE.OctahedronGeometry(11, 0);
    case 'alien_void_weaver':
      return new THREE.TorusKnotGeometry(8, 2.4, 72, 8, 2, 3);
  }
}

/** NPC ship mesh with archetype silhouette and procedural PBR texture maps. */
export function makeNPCShipMesh(options: NPCShipMeshOptions): THREE.Group {
  const { archetype, sizeClass, seed } = options;
  const palette = shipPalette(archetype);
  const maps = paintProceduralMaps({
    key: `ship-${archetype}-${seed & 1023}`,
    cache: shipTextureCache,
    seed: seed ^ 0x88f31d,
    baseColor: palette.base,
    panelColor: palette.panel,
    accentColor: palette.accent,
    lineColor: palette.line,
  });
  const material = makePbrMaterial(maps, palette.emissive, 0.42, 0.56);
  const group = new THREE.Group();
  const geo = makeShipBaseGeometry(archetype);
  const hull = new THREE.Mesh(geo, material);
  if (archetype === 'pilgrim_caravan') {
    hull.rotation.x = Math.PI / 2;
  }
  hull.scale.setScalar(shipScale(sizeClass));
  group.add(hull);

  const wireGeo = new THREE.EdgesGeometry(geo);
  const wire = new THREE.LineSegments(
    wireGeo,
    new THREE.LineBasicMaterial({ color: palette.emissive, transparent: true, opacity: 0.22 }),
  );
  wire.rotation.copy(hull.rotation);
  wire.scale.copy(hull.scale);
  group.add(wire);
  return group;
}

/** Fleet battle ship - variable-scale wireframe. Capital ships use elongated box. */
export function makeFleetShipMesh(color: number, scale: number): THREE.Group {
  let geo: THREE.BufferGeometry;
  if (scale > 1.5) {
    geo = new THREE.BoxGeometry(6 * scale, 4 * scale, 20 * scale);
  } else {
    geo = new THREE.ConeGeometry(8 * scale, 24 * scale, 4);
    geo.rotateX(Math.PI / 2);
  }
  return makeWireframeObject(geo, color, color, 0.8);
}

/** Secret asteroid base - small, angular, hidden among rocks */
export function makeAsteroidBase(size = 35): THREE.Group {
  const group = new THREE.Group();
  const hullGeo = new THREE.DodecahedronGeometry(size, 0);
  const hull = makeWireframeObject(hullGeo, 0x554433, 0xAA7744, 0.5);
  group.add(hull);

  const armGeo = new THREE.CylinderGeometry(size * 0.06, size * 0.06, size * 1.2, 6);
  const arm = makeWireframeObject(armGeo, 0x665544, 0xBB8855, 0.6);
  arm.rotation.z = Math.PI / 4;
  arm.position.set(size * 0.4, size * 0.4, 0);
  group.add(arm);

  const light = new THREE.PointLight(0xAA7744, 0.4, size * 8);
  group.add(light);

  return group;
}

/** Secret Oort cloud base - cold, distant, icy blue */
export function makeOortCloudBase(size = 45): THREE.Group {
  const group = new THREE.Group();
  const coreGeo = new THREE.OctahedronGeometry(size, 0);
  const core = makeWireframeObject(coreGeo, 0x112244, 0x4488CC, 0.7);
  group.add(core);

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const shardGeo = new THREE.TetrahedronGeometry(size * 0.2, 0);
    const shard = makeWireframeObject(shardGeo, 0x224466, 0x66AADD, 0.4);
    shard.position.set(
      Math.cos(angle) * size * 1.5,
      (i % 2 === 0 ? 1 : -1) * size * 0.3,
      Math.sin(angle) * size * 1.5,
    );
    shard.rotation.set(angle, angle * 0.7, 0);
    group.add(shard);
  }

  const glow = makeGlowSprite(0x4488CC, size * 4);
  group.add(glow);
  const light = new THREE.PointLight(0x4488CC, 0.6, size * 12);
  group.add(light);

  return group;
}

/** Maximum space base - at the edge of the void, eerie purple-black */
export function makeMaximumSpaceBase(size = 55): THREE.Group {
  const group = new THREE.Group();
  const monolithGeo = new THREE.BoxGeometry(size * 0.3, size * 2, size * 0.3);
  const monolith = makeWireframeObject(monolithGeo, 0x0A0A1A, 0x8844FF, 0.9);
  group.add(monolith);

  const segCount = 8;
  const ringRadius = size * 1.8;
  for (let i = 0; i < segCount; i++) {
    if (i === 2 || i === 5) continue;
    const angle = (i / segCount) * Math.PI * 2;
    const segGeo = new THREE.BoxGeometry(size * 0.25, size * 0.08, size * 0.12);
    const seg = makeWireframeObject(segGeo, 0x110022, 0xAA66FF, 0.6);
    seg.position.set(
      Math.cos(angle) * ringRadius,
      Math.sin(angle * 3) * size * 0.3,
      Math.sin(angle) * ringRadius,
    );
    seg.rotation.y = -angle;
    group.add(seg);
  }

  const glow = makeGlowSprite(0x6622CC, size * 6);
  group.add(glow);
  const light = new THREE.PointLight(0x8844FF, 0.8, size * 15);
  group.add(light);

  return group;
}

export function makeLandingSiteMarker(classification: string): THREE.Group {
  const group = new THREE.Group();
  const colorByClass: Record<string, number> = {
    rocky_landable: 0x6ef2a2,
    rocky_water: 0x4aa8ff,
    gas_stable: 0x74d6ff,
    gas_volatile: 0xffc66a,
    gas_storm: 0xff6a6a,
    shell_accessible: 0x8fd8ff,
    shell_weathered: 0xd6a6ff,
    shell_hazard: 0xff7fb2,
  };
  const color = colorByClass[classification] ?? 0xffffff;
  const material = new THREE.MeshBasicMaterial({ color });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 1.2, 10, 22), material);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 12, 8), material);
  spindle.rotation.z = Math.PI / 2;
  group.add(ring);
  group.add(spindle);
  const glow = makeGlowSprite(color, 18);
  group.add(glow);
  group.scale.setScalar(0.8);
  return group;
}
