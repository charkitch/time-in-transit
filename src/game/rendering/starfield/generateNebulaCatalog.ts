import { PRNG } from '../../generation/prng';
import { GALAXY_SEED } from '../scene/buildSystemSceneUtils';
import {
  NEBULA_MAX_ANGULAR_RADIUS,
  NEBULA_MAX_COUNT,
  NEBULA_MIN_ANGULAR_RADIUS,
  NEBULA_MIN_COUNT,
  NEBULA_MIN_SEPARATION,
  NEBULA_PALETTES,
  type NebulaDescriptor,
  type ShapeWeights,
  type Vec3Tuple,
} from './starfieldConstants';

const TAU = Math.PI * 2;

// Shape weight presets — blended during generation for variety
//                         radial  shell  filament  absorption
const EMISSION_BASE:   ShapeWeights = [0.6, 0.0, 0.4, 0.0];
const REFLECTION_BASE: ShapeWeights = [0.9, 0.0, 0.1, 0.0];
const DARK_BASE:       ShapeWeights = [0.0, 0.0, 0.3, 0.7];
const PLANETARY_BASE:  ShapeWeights = [0.2, 0.8, 0.0, 0.0];

const SHAPE_PRESETS: readonly ShapeWeights[] = [
  EMISSION_BASE,
  EMISSION_BASE,
  EMISSION_BASE,   // weighted toward emission (most common)
  REFLECTION_BASE,
  REFLECTION_BASE,
  DARK_BASE,
  DARK_BASE,
  PLANETARY_BASE,
];

// Palette indices suited to each shape type
const EMISSION_PALETTES = [0, 2, 4, 7];   // red, magenta, gold, sulfur
const REFLECTION_PALETTES = [1, 6];        // blue, violet
const DARK_PALETTES = [5];                 // dark
const PLANETARY_PALETTES = [3, 6];         // teal, violet

function paletteForPreset(preset: ShapeWeights, rng: PRNG): number {
  if (preset === DARK_BASE) return rng.pick(DARK_PALETTES);
  if (preset === REFLECTION_BASE) return rng.pick(REFLECTION_PALETTES);
  if (preset === PLANETARY_BASE) return rng.pick(PLANETARY_PALETTES);
  return rng.pick(EMISSION_PALETTES);
}

function uniformSphereDirection(rng: PRNG): Vec3Tuple {
  const theta = rng.next() * TAU;
  const cosLat = 2 * rng.next() - 1;
  const sinLat = Math.sqrt(1 - cosLat * cosLat);
  return [
    sinLat * Math.cos(theta),
    cosLat,
    sinLat * Math.sin(theta),
  ];
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function perturbWeights(base: ShapeWeights, rng: PRNG): ShapeWeights {
  const [a, b, c, d] = base.map((w) => Math.max(0, w + rng.float(-0.15, 0.15)));
  const sum = a + b + c + d;
  return sum > 0 ? [a / sum, b / sum, c / sum, d / sum] : base;
}

export function generateNebulaCatalog(): NebulaDescriptor[] {
  const rng = new PRNG(GALAXY_SEED ^ 0x4EB01A3E);

  const count = rng.int(NEBULA_MIN_COUNT, NEBULA_MAX_COUNT);
  const nebulae: NebulaDescriptor[] = [];

  let attempts = 0;
  while (nebulae.length < count && attempts < count * 10) {
    attempts++;
    const direction = uniformSphereDirection(rng);

    // Reject if too close to any existing nebula
    const nearest = nebulae.reduce<{ dot: number; preset: ShapeWeights | null; palette: number }>(
      (best, existing) => {
        const d = dot3(direction, existing.direction);
        return d > best.dot ? { dot: d, preset: existing.shapeWeights, palette: existing.paletteIndex } : best;
      },
      { dot: -2, preset: null, palette: -1 },
    );
    if (nearest.dot > Math.cos(NEBULA_MIN_SEPARATION)) continue;

    // Pick a shape preset that differs from the nearest neighbor
    let basePreset = rng.pick(SHAPE_PRESETS);
    if (nearest.preset !== null) {
      for (let retry = 0; retry < 5 && basePreset === nearest.preset; retry++) {
        basePreset = rng.pick(SHAPE_PRESETS);
      }
    }

    // Pick a palette that differs from the nearest neighbor
    let paletteIndex = paletteForPreset(basePreset, rng);
    if (nearest.palette >= 0) {
      for (let retry = 0; retry < 5 && paletteIndex === nearest.palette; retry++) {
        paletteIndex = paletteForPreset(basePreset, rng);
      }
    }

    const shapeWeights = perturbWeights(basePreset, rng);

    nebulae.push({
      direction,
      angularRadius: rng.float(NEBULA_MIN_ANGULAR_RADIUS, NEBULA_MAX_ANGULAR_RADIUS),
      shapeWeights,
      paletteIndex: Math.min(paletteIndex, NEBULA_PALETTES.length - 1),
      brightness: rng.float(0.08, 0.4),
      seed: rng.float(0, 1000),
      elongation: rng.float(1.0, 2.5),
      rotation: rng.float(0, TAU),
    });
  }

  return nebulae;
}
