export const BACKGROUND_STAR_COUNT = 15_000;
export const VISIBLE_STAR_LIMIT = 8_000;

export const GALACTIC_DISK_RADIUS = 500;
export const GALACTIC_DISK_HALF_HEIGHT = 120;
export const GALACTIC_RADIAL_SCALE = 300;
export const STARFIELD_SPHERE_RADIUS = 50_000;

export const GALAXY_TO_VOLUME_SCALE = 3.0;

// --- Nebula billboard system ---

export const NEBULA_RENDER_ORDER = -998;
export const NEBULA_MIN_COUNT = 3;
export const NEBULA_MAX_COUNT = 7;
export const NEBULA_MIN_ANGULAR_RADIUS = 0.02;
export const NEBULA_MAX_ANGULAR_RADIUS = 0.09;
export const NEBULA_MIN_SEPARATION = 0.7; // ~40° in radians

export type Vec3Tuple = [number, number, number];
export type ShapeWeights = [number, number, number, number]; // radial, shell, filament, absorption

export interface NebulaDescriptor {
  direction: Vec3Tuple;
  angularRadius: number;
  shapeWeights: ShapeWeights;
  presetIndex: number;
  paletteIndex: number;
  brightness: number;
  seed: number;
  elongation: number;
  rotation: number;
}

// [primaryR, primaryG, primaryB, secondaryR, secondaryG, secondaryB]
export const NEBULA_PALETTES: readonly [number, number, number, number, number, number][] = [
  [1.0, 0.3, 0.2,    0.8, 0.15, 0.1],   // emission red/orange
  [0.3, 0.5, 0.9,    0.15, 0.2, 0.6],   // reflection blue
  [0.7, 0.2, 0.5,    0.4, 0.1, 0.3],    // magenta/purple
  [0.2, 0.8, 0.5,    0.1, 0.5, 0.3],    // planetary teal/green
  [0.9, 0.6, 0.2,    0.6, 0.3, 0.1],    // warm gold
  [0.05, 0.03, 0.02,  0.1, 0.05, 0.02], // dark nebula
  [0.4, 0.3, 0.8,    0.2, 0.15, 0.5],   // violet
  [0.8, 0.8, 0.3,    0.5, 0.4, 0.15],   // sulfur yellow
];

export const BASE_STAR_SIZE = 10.0;
export const MIN_STAR_SIZE = 2.5;
export const MAX_STAR_SIZE = 30.0;

export const STAR_POINT_RENDER_ORDER = -999;
export const GALACTIC_BG_RENDER_ORDER = -1000;

interface SpectralClass {
  type: string;
  weight: number;
  color: [number, number, number];
  magRange: [number, number];
}

export const SPECTRAL_DISTRIBUTION: readonly SpectralClass[] = [
  { type: 'M', weight: 0.40, color: [1.0, 0.4, 0.2], magRange: [2, 6] },
  { type: 'K', weight: 0.25, color: [1.0, 0.7, 0.4], magRange: [1, 5] },
  { type: 'G', weight: 0.15, color: [1.0, 0.95, 0.6], magRange: [0, 4] },
  { type: 'F', weight: 0.08, color: [1.0, 1.0, 0.9], magRange: [-1, 3] },
  { type: 'A', weight: 0.06, color: [0.8, 0.85, 1.0], magRange: [-2, 1] },
  { type: 'B', weight: 0.04, color: [0.6, 0.7, 1.0], magRange: [-4, -1] },
  { type: 'O', weight: 0.02, color: [0.5, 0.6, 1.0], magRange: [-6, -3] },
];

export const CUMULATIVE_WEIGHTS: readonly number[] = SPECTRAL_DISTRIBUTION.reduce<number[]>(
  (acc, cls) => [...acc, (acc[acc.length - 1] ?? 0) + cls.weight],
  [],
);

export interface StarVolume {
  positions: Float32Array;
  colors: Float32Array;
  magnitudes: Float32Array;
  count: number;
}

export interface ProjectedStarView {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}
