import { PRNG } from '../../generation/prng';
import { GALAXY_SEED } from '../scene/buildSystemSceneUtils';
import {
  BACKGROUND_STAR_COUNT,
  CUMULATIVE_WEIGHTS,
  GALACTIC_DISK_HALF_HEIGHT,
  GALACTIC_DISK_RADIUS,
  GALACTIC_RADIAL_SCALE,
  SPECTRAL_DISTRIBUTION,
  type StarVolume,
} from './starfieldConstants';

const TAU = Math.PI * 2;
const HALO_FRACTION = 0.15;
const HALO_RADIUS = 400;

function pickSpectralClass(rng: PRNG): number {
  const roll = rng.next();
  return CUMULATIVE_WEIGHTS.findIndex((cw) => roll < cw);
}

function sampleDiskPosition(rng: PRNG): [number, number, number] {
  const r = Math.min(
    -GALACTIC_RADIAL_SCALE * Math.log(1 - rng.next() * 0.999),
    GALACTIC_DISK_RADIUS,
  );
  const theta = rng.next() * TAU;

  const sign = rng.next() < 0.5 ? -1 : 1;
  const z = sign * GALACTIC_DISK_HALF_HEIGHT * Math.log(rng.next() * 0.999 + 0.001);

  return [
    r * Math.cos(theta),
    z,
    r * Math.sin(theta),
  ];
}

function sampleHaloPosition(rng: PRNG): [number, number, number] {
  const theta = rng.next() * TAU;
  const phi = Math.acos(2 * rng.next() - 1);
  const r = HALO_RADIUS * Math.cbrt(rng.next());
  return [
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ];
}

export function generateStarVolume(): StarVolume {
  const rng = new PRNG(GALAXY_SEED);
  const positions = new Float32Array(BACKGROUND_STAR_COUNT * 3);
  const colors = new Float32Array(BACKGROUND_STAR_COUNT * 3);
  const magnitudes = new Float32Array(BACKGROUND_STAR_COUNT);

  const haloThreshold = Math.floor(BACKGROUND_STAR_COUNT * (1 - HALO_FRACTION));

  Array.from({ length: BACKGROUND_STAR_COUNT }, (_, i) => {
    const [x, y, z] = i < haloThreshold ? sampleDiskPosition(rng) : sampleHaloPosition(rng);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const classIdx = pickSpectralClass(rng);
    const cls = SPECTRAL_DISTRIBUTION[classIdx];
    colors[i * 3] = cls.color[0];
    colors[i * 3 + 1] = cls.color[1];
    colors[i * 3 + 2] = cls.color[2];

    magnitudes[i] = rng.float(cls.magRange[0], cls.magRange[1]);
    return null;
  });

  return { positions, colors, magnitudes, count: BACKGROUND_STAR_COUNT };
}
