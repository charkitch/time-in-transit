import * as THREE from 'three';
import { PALETTE } from '../constants';

/** Create hyperspace tunnel: 1000 streaks rushing toward camera */
export function createHyperspaceTunnel(scene: THREE.Scene): THREE.Points {
  const count = 1000;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count); // Z velocity per point

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 50 + Math.random() * 400;
    positions[i * 3]     = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius;
    positions[i * 3 + 2] = -Math.random() * 8000;
    velocities[i] = 2000 + Math.random() * 3000;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: PALETTE.hyperspaceBright,
    size: 4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  (points as any)._velocities = velocities;
  scene.add(points);
  return points;
}

export function updateHyperspaceTunnel(points: THREE.Points, dt: number): void {
  const positions = points.geometry.attributes.position as THREE.BufferAttribute;
  const velocities: Float32Array = (points as any)._velocities;
  const arr = positions.array as Float32Array;

  for (let i = 0; i < velocities.length; i++) {
    arr[i * 3 + 2] += velocities[i] * dt;
    if (arr[i * 3 + 2] > 200) {
      arr[i * 3 + 2] = -8000;
    }
  }
  positions.needsUpdate = true;
}

/** Convergent hyperspace grid: 8 radial lanes converging to a vanishing point */
export function createHyperspaceGrid(scene: THREE.Scene): THREE.LineSegments {
  const laneCount = 8;
  // Each lane: 2 vertices × 3 coords = 6 floats
  const positions = new Float32Array(laneCount * 6);
  const r = 300;

  for (let i = 0; i < laneCount; i++) {
    const theta = (i / laneCount) * Math.PI * 2;
    const base = i * 6;
    // Start: outer radius, staggered Z so lanes don't all flash at once
    positions[base]     = Math.cos(theta) * r;
    positions[base + 1] = Math.sin(theta) * r;
    positions[base + 2] = -8000 + (i / laneCount) * 8200;
    // End: converge to vanishing point
    positions[base + 3] = 0;
    positions[base + 4] = 0;
    positions[base + 5] = 200;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: 0x4422CC,
    transparent: true,
    opacity: 0.8,
  });

  const grid = new THREE.LineSegments(geo, mat);
  scene.add(grid);
  return grid;
}

export function updateHyperspaceGrid(grid: THREE.LineSegments, dt: number): void {
  const positions = grid.geometry.attributes.position as THREE.BufferAttribute;
  const arr = positions.array as Float32Array;
  const laneCount = arr.length / 6;

  for (let i = 0; i < laneCount; i++) {
    arr[i * 6 + 2] += 3000 * dt;
    if (arr[i * 6 + 2] > 200) {
      arr[i * 6 + 2] = -8000;
    }
  }
  positions.needsUpdate = true;
}

/** Battle projectile system: laser bolts flying between two ship groups */
export interface BattleProjectileData {
  tValues: Float32Array;
  sourceIndices: Uint8Array;
  targetIndices: Uint8Array;
  colors: Float32Array; // r,g,b per projectile
  colorA: THREE.Color;
  colorB: THREE.Color;
}

export function createBattleProjectiles(
  scene: THREE.Scene,
  battlePos: THREE.Vector3,
  shipsA: THREE.Vector3[],
  shipsB: THREE.Vector3[],
  colorA: number,
  colorB: number,
): THREE.Points {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tValues = new Float32Array(count);
  const sourceIndices = new Uint8Array(count);
  const targetIndices = new Uint8Array(count);

  const cA = new THREE.Color(colorA);
  const cB = new THREE.Color(colorB);

  for (let i = 0; i < count; i++) {
    const fromA = Math.random() < 0.5;
    const sources = fromA ? shipsA : shipsB;
    const targets = fromA ? shipsB : shipsA;
    const color = fromA ? cA : cB;

    sourceIndices[i] = Math.floor(Math.random() * sources.length);
    targetIndices[i] = Math.floor(Math.random() * targets.length);
    tValues[i] = Math.random();

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    const src = sources[sourceIndices[i]];
    const tgt = targets[targetIndices[i]];
    positions[i * 3] = src.x + (tgt.x - src.x) * tValues[i];
    positions[i * 3 + 1] = src.y + (tgt.y - src.y) * tValues[i];
    positions[i * 3 + 2] = src.z + (tgt.z - src.z) * tValues[i];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  // Screen-space pixels so bolts are visible at any distance
  const mat = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: false,
  });

  const points = new THREE.Points(geo, mat);

  const data: BattleProjectileData = {
    tValues,
    sourceIndices,
    targetIndices,
    colors,
    colorA: cA,
    colorB: cB,
  };
  (points as any)._battleData = data;
  (points as any)._shipsA = shipsA;
  (points as any)._shipsB = shipsB;

  scene.add(points);
  return points;
}

export function updateBattleProjectiles(
  points: THREE.Points,
  dt: number,
  explosions: BattleExplosions | null,
): void {
  const data: BattleProjectileData = (points as any)._battleData;
  const shipsA: THREE.Vector3[] = (points as any)._shipsA;
  const shipsB: THREE.Vector3[] = (points as any)._shipsB;
  if (!data) return;

  const positions = points.geometry.attributes.position as THREE.BufferAttribute;
  const arr = positions.array as Float32Array;
  const count = data.tValues.length;

  for (let i = 0; i < count; i++) {
    data.tValues[i] += dt * 1.5;

    if (data.tValues[i] >= 1) {
      // Spawn explosion at impact point
      if (explosions) {
        const impactX = arr[i * 3];
        const impactY = arr[i * 3 + 1];
        const impactZ = arr[i * 3 + 2];
        const r = data.colors[i * 3];
        const g = data.colors[i * 3 + 1];
        const b = data.colors[i * 3 + 2];
        spawnExplosion(explosions, impactX, impactY, impactZ, r, g, b);
      }

      // Reset with new random source/target
      data.tValues[i] = 0;
      const fromA = Math.random() < 0.5;
      const sources = fromA ? shipsA : shipsB;
      const targets = fromA ? shipsB : shipsA;
      const color = fromA ? data.colorA : data.colorB;

      data.sourceIndices[i] = Math.floor(Math.random() * sources.length);
      data.targetIndices[i] = Math.floor(Math.random() * targets.length);

      data.colors[i * 3] = color.r;
      data.colors[i * 3 + 1] = color.g;
      data.colors[i * 3 + 2] = color.b;
    }

    const fromA = data.colors[i * 3] === data.colorA.r &&
                  data.colors[i * 3 + 1] === data.colorA.g;
    const sources = fromA ? shipsA : shipsB;
    const targets = fromA ? shipsB : shipsA;

    const srcIdx = data.sourceIndices[i] % sources.length;
    const tgtIdx = data.targetIndices[i] % targets.length;
    const src = sources[srcIdx];
    const tgt = targets[tgtIdx];
    const t = data.tValues[i];

    arr[i * 3] = src.x + (tgt.x - src.x) * t;
    arr[i * 3 + 1] = src.y + (tgt.y - src.y) * t;
    arr[i * 3 + 2] = src.z + (tgt.z - src.z) * t;
  }

  positions.needsUpdate = true;
  const colorAttr = points.geometry.attributes.color as THREE.BufferAttribute;
  if (colorAttr) colorAttr.needsUpdate = true;
}

/** Explosion flash system: pooled sprites that flare and fade at impact points */
export interface BattleExplosions {
  sprites: THREE.Sprite[];
  lifetimes: Float32Array;  // remaining life (0 = inactive)
  maxLifetimes: Float32Array;
  nextSlot: number;
}

const EXPLOSION_POOL_SIZE = 24;
const EXPLOSION_DURATION = 0.4;  // seconds
const EXPLOSION_MAX_SCALE = 80;  // world units — large enough to see from far away

function makeExplosionSprite(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,200,100,0.9)');
  grad.addColorStop(0.5, 'rgba(255,100,50,0.4)');
  grad.addColorStop(1, 'rgba(255,50,20,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  sprite.scale.setScalar(0);
  return sprite;
}

export function createBattleExplosions(scene: THREE.Scene): BattleExplosions {
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
    const s = makeExplosionSprite();
    scene.add(s);
    sprites.push(s);
  }
  return {
    sprites,
    lifetimes: new Float32Array(EXPLOSION_POOL_SIZE),
    maxLifetimes: new Float32Array(EXPLOSION_POOL_SIZE),
    nextSlot: 0,
  };
}

function spawnExplosion(
  pool: BattleExplosions,
  x: number, y: number, z: number,
  r: number, g: number, b: number,
): void {
  // Only ~40% of impacts produce a visible explosion to avoid clutter
  if (Math.random() > 0.4) return;

  const idx = pool.nextSlot;
  pool.nextSlot = (pool.nextSlot + 1) % EXPLOSION_POOL_SIZE;

  const sprite = pool.sprites[idx];
  sprite.position.set(x, y, z);
  sprite.visible = true;

  // Tint toward the projectile color
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.color.setRGB(
    0.6 + r * 0.4,
    0.4 + g * 0.4,
    0.3 + b * 0.4,
  );
  mat.opacity = 1;

  const duration = EXPLOSION_DURATION * (0.7 + Math.random() * 0.6);
  pool.lifetimes[idx] = duration;
  pool.maxLifetimes[idx] = duration;
}

export function updateBattleExplosions(pool: BattleExplosions, dt: number): void {
  for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
    if (pool.lifetimes[i] <= 0) continue;

    pool.lifetimes[i] -= dt;
    const t = 1 - pool.lifetimes[i] / pool.maxLifetimes[i]; // 0→1

    if (pool.lifetimes[i] <= 0) {
      pool.sprites[i].visible = false;
      pool.sprites[i].scale.setScalar(0);
      continue;
    }

    // Fast expand, slow fade
    const scale = EXPLOSION_MAX_SCALE * (0.3 + 0.7 * Math.sqrt(t));
    pool.sprites[i].scale.setScalar(scale);

    const mat = pool.sprites[i].material as THREE.SpriteMaterial;
    // Bright flash at start, fade to nothing
    mat.opacity = Math.max(0, 1 - t * t);
  }
}

/** Starfield: 2000 stars on a large sphere */
export function createStarfield(): THREE.Points {
  const count = 2000;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 40000;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0xFFFFFF,
    size: 2,
    sizeAttenuation: false,
  });

  return new THREE.Points(geo, mat);
}
