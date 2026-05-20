import {
  BASE_STAR_SIZE,
  GALAXY_TO_VOLUME_SCALE,
  MAX_STAR_SIZE,
  MIN_STAR_SIZE,
  STARFIELD_SPHERE_RADIUS,
  VISIBLE_STAR_LIMIT,
  type ProjectedStarView,
  type StarVolume,
} from './starfieldConstants';

interface RankedStar {
  index: number;
  appMag: number;
}

function apparentMagnitude(absMag: number, distance: number): number {
  return absMag + 5 * Math.log10(Math.max(distance, 0.1) / 10);
}

function pointSizeFromMagnitude(appMag: number): number {
  const size = BASE_STAR_SIZE * Math.pow(10, -appMag * 0.12);
  return Math.max(MIN_STAR_SIZE, Math.min(MAX_STAR_SIZE, size));
}

export function projectStarView(
  volume: StarVolume,
  galaxyX: number,
  galaxyY: number,
): ProjectedStarView {
  const obsX = galaxyX * GALAXY_TO_VOLUME_SCALE;
  const obsY = 0;
  const obsZ = galaxyY * GALAXY_TO_VOLUME_SCALE;

  const ranked: RankedStar[] = Array.from({ length: volume.count }, (_, i) => {
    const dx = volume.positions[i * 3] - obsX;
    const dy = volume.positions[i * 3 + 1] - obsY;
    const dz = volume.positions[i * 3 + 2] - obsZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return {
      index: i,
      appMag: apparentMagnitude(volume.magnitudes[i], dist),
    };
  });

  ranked.sort((a, b) => a.appMag - b.appMag);
  const visible = ranked.slice(0, VISIBLE_STAR_LIMIT);

  const count = visible.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  visible.forEach((star, out) => {
    const i = star.index;
    const dx = volume.positions[i * 3] - obsX;
    const dy = volume.positions[i * 3 + 1] - obsY;
    const dz = volume.positions[i * 3 + 2] - obsZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const invDist = STARFIELD_SPHERE_RADIUS / Math.max(dist, 0.001);

    positions[out * 3] = dx * invDist;
    positions[out * 3 + 1] = dy * invDist;
    positions[out * 3 + 2] = dz * invDist;

    colors[out * 3] = volume.colors[i * 3];
    colors[out * 3 + 1] = volume.colors[i * 3 + 1];
    colors[out * 3 + 2] = volume.colors[i * 3 + 2];

    sizes[out] = pointSizeFromMagnitude(star.appMag);
  });

  return { positions, colors, sizes, count };
}
