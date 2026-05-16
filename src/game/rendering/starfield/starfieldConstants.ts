import * as THREE from 'three';

export const BACKGROUND_STAR_COUNT = 15_000;
export const VISIBLE_STAR_LIMIT = 8_000;

export const GALACTIC_DISK_RADIUS = 500;
export const GALACTIC_DISK_HALF_HEIGHT = 120;
export const GALACTIC_RADIAL_SCALE = 300;
export const STARFIELD_SPHERE_RADIUS = 50_000;

export const GALAXY_TO_VOLUME_SCALE = 3.0;

export const NEBULA_NOISE_SCALE = 0.003;
export const DUST_NOISE_SCALE = 0.005;
export const GALACTIC_BAND_FALLOFF = 4.0;
export const GALAXY_POSITION_NOISE_OFFSET = 0.07;

export const NEBULA_COLOR_WARM = new THREE.Vector3(0.4, 0.15, 0.1);
export const NEBULA_COLOR_COOL = new THREE.Vector3(0.1, 0.12, 0.3);

export const BASE_STAR_SIZE = 4.0;
export const MIN_STAR_SIZE = 1.0;
export const MAX_STAR_SIZE = 12.0;

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
