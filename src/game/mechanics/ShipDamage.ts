import type {
  HazardType,
  ShipDamageReport,
} from '../engine';

export type DamageSource = Exclude<HazardType, 'None'>;

/** Continuous damage while inside a hazard zone — amounts are per second. */
export interface SustainedDamage {
  source: DamageSource;
  shieldRate: number;
  heatRate: number;
}

/** One-off flat damage. */
export interface BurstDamage {
  source: DamageSource;
  shields: number;
  heat: number;
}

/** A physical knock: shields absorb it, and it only heats the ship once they are gone. */
export interface ImpactDamage {
  source: DamageSource;
  shields: number;
  unshieldedHeat: number;
}

interface DamageEntry {
  source: DamageSource;
  shieldRate: number;
  shieldBurst: number;
  heatRate: number;
  heatBurst: number;
  unshieldedHeatBurst: number;
  lethalOnDepletion: boolean;
}

type DamageAmount = Exclude<keyof DamageEntry, 'source' | 'lethalOnDepletion'>;

const NO_DAMAGE: Record<DamageAmount, number> = {
  shieldRate: 0,
  shieldBurst: 0,
  heatRate: 0,
  heatBurst: 0,
  unshieldedHeatBurst: 0,
};

const hitsShields = (entry: DamageEntry) => entry.shieldRate > 0 || entry.shieldBurst > 0;

/**
 * Per-tick ledger every damage source reports to. It never touches shields or heat itself:
 * `drain()` hands the tick's total to the engine, which is the only place damage is applied.
 */
export class ShipDamage {
  private entries: DamageEntry[] = [];
  private destroyedBy: DamageSource | null = null;

  sustain({ source, shieldRate, heatRate }: SustainedDamage): void {
    this.entries.push({ ...NO_DAMAGE, source, shieldRate, heatRate, lethalOnDepletion: true });
  }

  burst({ source, shields, heat }: BurstDamage): void {
    this.entries.push({ ...NO_DAMAGE, source, shieldBurst: shields, heatBurst: heat, lethalOnDepletion: true });
  }

  /** Impacts can strip shields but never destroy the ship by doing so. */
  impact({ source, shields, unshieldedHeat }: ImpactDamage): void {
    this.entries.push({
      ...NO_DAMAGE,
      source,
      shieldBurst: shields,
      unshieldedHeatBurst: unshieldedHeat,
      lethalOnDepletion: false,
    });
  }

  /** Instant kill, regardless of shields. */
  destroy(source: DamageSource): void {
    this.destroyedBy ??= source;
  }

  /** Total this tick's damage for the engine and clear the ledger. */
  drain(): ShipDamageReport {
    const { entries, destroyedBy } = this;
    this.entries = [];
    this.destroyedBy = null;

    const total = (amount: DamageAmount) => entries.reduce((sum, entry) => sum + entry[amount], 0);
    const lethal = entries.find(entry => entry.lethalOnDepletion && hitsShields(entry));
    // An impact only takes the blame when nothing that can kill on its own is also at work
    const blamed = lethal ?? entries.find(entry => entry.lethalOnDepletion) ?? entries[0];

    return {
      shieldRate: total('shieldRate'),
      shieldBurst: total('shieldBurst'),
      heatRate: total('heatRate'),
      heatBurst: total('heatBurst'),
      unshieldedHeatBurst: total('unshieldedHeatBurst'),
      cause: blamed?.source ?? 'None',
      lethalOnDepletion: lethal !== undefined,
      destroyedBy,
    };
  }
}
