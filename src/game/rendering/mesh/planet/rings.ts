import * as THREE from 'three';
import type { GasGiantType } from '../../../engine';
import { PRNG } from '../../../generation/prng';

// ── Procedural ring system ────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

const RING_PALETTES: Record<GasGiantType, readonly RGB[]> = {
  jovian:    [[185, 145,  88], [205, 165,  98], [165, 125,  68], [195, 152,  78]],
  saturnian: [[218, 198, 142], [235, 218, 168], [202, 182, 122], [225, 205, 152]],
  neptunian: [[118, 142, 178], [98,  122, 168], [138, 162, 188], [108, 135, 172]],
  inferno:   [[205, 98,  52],  [225, 118,  62], [182,  78,  42], [215, 108,  58]],
  chromatic: [[168, 118, 208], [118, 208, 168], [208, 168, 118], [168, 208, 118]],
  helium:    [[178, 185, 198], [162, 170, 185], [192, 198, 210], [172, 178, 195]],
};

/** Generate a procedural ring canvas texture with radial bands and Cassini-style gaps */
function makeRingCanvasTexture(
  seed: number,
  innerFrac: number,
  gasType: GasGiantType,
): THREE.CanvasTexture {
  const SIZE = 512;
  const rng = new PRNG(seed ^ 0xAB3D7F);
  const palette = RING_PALETTES[gasType];

  // Build 1D band profile (opacity + color) over BANDS samples
  const BANDS = 256;
  const opacities = new Float32Array(BANDS);
  const colors: RGB[] = [];

  // Variable-width bands with randomized opacity
  let pos = 0;
  let bandWidth = rng.int(6, 22);
  let bandOpacity = rng.float(0.35, 0.92);
  let colorIdx = Math.floor(rng.next() * palette.length);
  for (let i = 0; i < BANDS; i++) {
    if (pos >= bandWidth) {
      pos = 0;
      bandWidth = rng.int(6, 22);
      bandOpacity = rng.float(0.25, 0.92);
      colorIdx = (colorIdx + rng.int(0, palette.length - 1)) % palette.length;
    }
    opacities[i] = bandOpacity;
    colors.push(palette[colorIdx]);
    pos++;
  }

  // Cassini-style sharp gaps
  const numGaps = rng.int(1, 4);
  for (let g = 0; g < numGaps; g++) {
    const gapCenter = rng.float(0.08, 0.92);
    const gapHalf = rng.float(0.018, 0.07);
    for (let i = 0; i < BANDS; i++) {
      const dist = Math.abs(i / BANDS - gapCenter);
      if (dist < gapHalf) {
        opacities[i] *= dist / gapHalf;
      }
    }
  }

  // Fade at both edges so the ring has soft boundaries
  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    const fade = Math.min(t * 6, 1) * Math.min((1 - t) * 6, 1);
    opacities[i] *= fade;
  }

  // Paint canvas — UVs are a flat projection: center (0.5,0.5) = planet center,
  // UV dist 0.5 = outerR.  So uvDist = sqrt(dx²+dy²) where dx = (px/SIZE - 0.5)*2.
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(SIZE, SIZE);
  const data = imgData.data;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const dx = (px / SIZE - 0.5) * 2;   // -1 … +1  (1 = outerR in UV)
      const dy = (py / SIZE - 0.5) * 2;
      const uvDist = Math.sqrt(dx * dx + dy * dy);
      const t = (uvDist - innerFrac) / (1.0 - innerFrac);
      if (t < 0 || t > 1) continue;

      const bi = Math.min(BANDS - 1, Math.floor(t * BANDS));
      const alpha = Math.max(0, opacities[bi]);
      const col = colors[bi];
      const idx = (py * SIZE + px) * 4;
      data[idx]     = col[0];
      data[idx + 1] = col[1];
      data[idx + 2] = col[2];
      data[idx + 3] = Math.round(alpha * 220);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** Ring band definitions [innerMul, outerMul] for each ring count variant */
const RING_BAND_CONFIGS: Record<number, [number, number][]> = {
  1: [[1.40, 2.20]],
  2: [[1.40, 1.85], [2.00, 2.60]],
  3: [[1.40, 1.70], [1.90, 2.22], [2.42, 2.80]],
};

/**
 * Build a ring system group: 1–3 rings with procedural band textures and a
 * random inclination baked into the group's rotation.
 */
export function makeRingSystem(
  radius: number,
  ringCount: number,
  ringInclination: number,
  seed: number,
  gasType: GasGiantType,
): THREE.Group {
  const group = new THREE.Group();
  const rng = new PRNG(seed ^ 0x4E2B9C);
  const configs = RING_BAND_CONFIGS[Math.max(1, Math.min(3, ringCount))] ?? RING_BAND_CONFIGS[1];

  for (const [innerMul, outerMul] of configs) {
    const innerR = radius * innerMul;
    const outerR = radius * outerMul;
    const innerFrac = innerMul / outerMul;
    const ringSeed = Math.floor(rng.next() * 0xFFFFFF);

    const tex = makeRingCanvasTexture(ringSeed, innerFrac, gasType);
    const geo = new THREE.RingGeometry(innerR, outerR, 128);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      alphaMap: tex,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(geo, mat));
  }

  // Flat orbital plane + inclination tilt
  group.rotation.x = Math.PI / 2;
  group.rotation.z = ringInclination;
  return group;
}
