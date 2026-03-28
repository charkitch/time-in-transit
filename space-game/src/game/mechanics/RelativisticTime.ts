import { GALAXY_YEAR_START } from '../constants';
export { GALAXY_YEAR_START };

/**
 * How many galaxy years elapse during a hyperspace jump.
 * dist is in galaxy units (same scale as StarSystemData.x/y, max ~10).
 */
export function jumpYearsElapsed(dist: number): number {
  return Math.floor(10 * Math.pow(dist, 1.4));
}
