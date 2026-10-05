import type { SceneEntity } from '../rendering/scene/types';
import type {
  BurstDamage,
  DamageSource,
  ImpactDamage,
  SustainedDamage,
} from './ShipDamage';

/** Per-second damage for each hazard zone. */
export const HAZARD_DAMAGE = {
  xRayStream: { source: 'XRayStream', shieldRate: 0, heatRate: 30 },
  jetCore: { source: 'MicroquasarJet', shieldRate: 60, heatRate: 80 },
  jetFringe: { source: 'MicroquasarJet', shieldRate: 0, heatRate: 10 },
  eventHorizon: { source: 'BlackHole', shieldRate: 200, heatRate: 100 },
  tidalDisruption: { source: 'TidalDisruption', shieldRate: 40, heatRate: 50 },
  battleCrossfire: { source: 'BattleZone', shieldRate: 20, heatRate: 25 },
} as const satisfies Record<string, SustainedDamage>;

/** Flat damage per pulsar sweep. A direct beam hit scales from `far` to `near` with proximity. */
const PULSAR_BEAM_BURST = {
  far: { shields: 30, heat: 25 },
  near: { shields: 80, heat: 50 },
} as const;

export const PULSAR_FRINGE_BURST: BurstDamage = { source: 'PulsarBeam', shields: 3, heat: 5 };

export function pulsarBeamBurst(proximityFactor: number): BurstDamage {
  const { far, near } = PULSAR_BEAM_BURST;
  return {
    source: 'PulsarBeam',
    shields: far.shields + (near.shields - far.shields) * proximityFactor,
    heat: far.heat + (near.heat - far.heat) * proximityFactor,
  };
}

export interface BounceDamage extends ImpactDamage {
  alert: string;
}

/** Survivable collisions that still hurt. Bounceable bodies not listed here (stations) are harmless. */
export const BOUNCE_DAMAGE: Partial<Record<SceneEntity['type'], BounceDamage>> = {
  topopolis: { source: 'TopopolisCollision', shields: 18, unshieldedHeat: 4, alert: 'TOPOPOLIS WALL IMPACT' },
  asteroid: { source: 'AsteroidCollision', shields: 4, unshieldedHeat: 1, alert: 'ASTEROID IMPACT' },
};

/** Exhaustive so a new entity type has to decide here whether hitting it can destroy the ship. */
const LETHAL_COLLISION_SOURCE: Record<SceneEntity['type'], DamageSource | null> = {
  star: 'StarCollision',
  planet: 'PlanetCollision',
  moon: 'MoonCollision',
  dyson_shell: 'DysonShellCollision',
  topopolis: 'TopopolisCollision',
  // Bounced off
  station: null,
  asteroid: null,
  // Never collided with
  npc_ship: null,
  fleet_ship: null,
  landing_site: null,
};

export function lethalCollisionSource(type: SceneEntity['type']): DamageSource {
  const source = LETHAL_COLLISION_SOURCE[type];
  if (!source) throw new Error(`No damage source for lethal collision with '${type}'`);
  return source;
}
