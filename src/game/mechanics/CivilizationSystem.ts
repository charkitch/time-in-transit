import { PRNG } from '../generation/prng';
import {
  GALAXY_SEED, ERA_LENGTH,
  POLITICAL_TYPES,
  ECONOMY_TYPES,
  type PoliticalType, type EconomyType, type GoodName,
} from '../constants';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface CivilizationState {
  systemId: number;
  galaxyYear: number;
  era: number;
  politics: PoliticalType;
  economy: EconomyType;        // evolved economy for this era
  bannedGoods: GoodName[];
  priceModifier: number;       // base multiplier (before per-good table)
  luxuryMod: number;           // extra multiplier for Luxuries (Stagnant Militancy etc.)
  anarchyVariance: boolean;    // if true, ±50% random variance per good
  techBonus: GoodName[];       // goods with discounted price
}

// ─── Politics price tables ────────────────────────────────────────────────────

const BANNED_GOODS: Partial<Record<PoliticalType, GoodName[]>> = {
  'Theocracy':            ['Narcotics', 'Liquor'],
  'Military Dictatorship':['Narcotics', 'Luxuries'],
  'Feudal':               ['Computers', 'Narcotics'],
};

const PRICE_MODIFIERS: Partial<Record<PoliticalType, number>> = {
  'Theocracy':            1.15,
  'Military Dictatorship':1.20,
  'Corporate State':      0.95,
  'Libertine Democracy':  0.95,
};

// ─── Economy whitelists per politics ─────────────────────────────────────────

const ALLOWED_ECONOMIES: Record<PoliticalType, EconomyType[]> = {
  'Democracy':            ['Agricultural', 'Industrial', 'Rich Industrial', 'High Tech'],
  'Libertine Democracy':  ['Agricultural', 'Industrial', 'Rich Industrial', 'High Tech'],
  'Corporate State':      ['Industrial', 'Rich Industrial', 'High Tech'],
  'Military Dictatorship':['Industrial', 'Poor Agricultural', 'Refinery'],
  'Stagnant Militancy':   ['Poor Agricultural', 'Industrial', 'Refinery'],
  'Theocracy':            ['Agricultural', 'Poor Agricultural', 'Industrial'],
  'Anarchist':            ['Poor Agricultural', 'Agricultural', 'Refinery', 'Industrial'],
  'Technocracy':          ['High Tech', 'Industrial', 'Rich Industrial', 'Refinery'],
  'Feudal':               ['Poor Agricultural', 'Agricultural'],
};

// ─── Political cluster continuity ────────────────────────────────────────────

// Group politics into clusters; 70% chance stay in same cluster
const POLITICAL_CLUSTERS: PoliticalType[][] = [
  ['Democracy', 'Libertine Democracy'],
  ['Corporate State', 'Technocracy'],
  ['Military Dictatorship', 'Stagnant Militancy'],
  ['Theocracy', 'Feudal'],
  ['Anarchist'],
];

function clusterOf(p: PoliticalType): PoliticalType[] {
  return POLITICAL_CLUSTERS.find(c => c.includes(p)) ?? POLITICAL_TYPES as unknown as PoliticalType[];
}

// ─── Core derivation ─────────────────────────────────────────────────────────

function derivePolitics(systemId: number, era: number, prevEra: number | null): PoliticalType {
  const rng = PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7)) >>> 0,
    era,
  );

  if (prevEra !== null) {
    const prevPolitics = derivePoliticsRaw(systemId, prevEra);
    const cluster = clusterOf(prevPolitics);
    const stay = rng.next() < 0.70;
    if (stay) {
      const clusterRng = PRNG.fromIndex(
        (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 1)) >>> 0,
        era,
      );
      return clusterRng.pick(cluster);
    }
  }

  return PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 2)) >>> 0,
    era,
  ).pick(POLITICAL_TYPES);
}

function derivePoliticsRaw(systemId: number, era: number): PoliticalType {
  return PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7)) >>> 0,
    era,
  ).pick(POLITICAL_TYPES);
}

export function deriveEconomy(baseEconomy: EconomyType, politics: PoliticalType, rng: PRNG): EconomyType {
  const allowed = ALLOWED_ECONOMIES[politics];
  if (allowed.includes(baseEconomy)) return baseEconomy;
  return rng.pick(allowed);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getCivState(
  systemId: number,
  galaxyYear: number,
  baseEconomy: EconomyType,
): CivilizationState {
  const era = Math.floor(galaxyYear / ERA_LENGTH);
  const prevEra = era > 0 ? era - 1 : null;

  const politics = derivePolitics(systemId, era, prevEra);

  const econRng = PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 3)) >>> 0,
    era,
  );
  const economy = deriveEconomy(baseEconomy, politics, econRng);

  const bannedGoods: GoodName[] = BANNED_GOODS[politics] ?? [];
  const priceModifier = PRICE_MODIFIERS[politics] ?? 1.0;
  const luxuryMod = politics === 'Stagnant Militancy' ? 1.30 : 1.0;
  const anarchyVariance = politics === 'Anarchist';
  const techBonus: GoodName[] = politics === 'Technocracy' ? ['Computers' as GoodName, 'Radioactives' as GoodName] : [];

  return {
    systemId,
    galaxyYear,
    era,
    politics,
    economy,
    bannedGoods,
    priceModifier,
    luxuryMod,
    anarchyVariance,
    techBonus,
  };
}
