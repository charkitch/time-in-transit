import { GALAXY_YEAR_START } from '../constants';
export { GALAXY_YEAR_START };

/**
 * How many galaxy years elapse during a hyperspace jump.
 * dist is in galaxy units (same scale as StarSystemData.x/y, max 25).
 * Linear model: 10-year accel/decel overhead + 14 years per galaxy unit (~0.93c across 10 ly/unit).
 */
export function jumpYearsElapsed(dist: number): number {
  return 10 + Math.floor(dist * 14);
}

// Mirrored in engine/src/types/constants.rs (LORENTZ_FACTOR)
const LORENTZ_FACTOR = 0.367559518989782;

/**
 * Proper time experienced aboard during a jump (Lorentz-contracted).
 * Mirrors ship_years_elapsed in engine/src/system_payload.rs.
 */
export function shipYearsElapsed(dist: number): number {
  return (10 + dist * 14) * LORENTZ_FACTOR;
}
