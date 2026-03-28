import { PRNG } from '../generation/prng';
import { GALAXY_SEED, ERA_LENGTH, FACTION_COLORS, type PoliticalType } from '../constants';

// ─── Political clusters (mirrors CivilizationSystem) ─────────────────────────

const POLITICAL_CLUSTERS: PoliticalType[][] = [
  ['Democracy', 'Libertine Democracy'],
  ['Corporate State', 'Technocracy'],
  ['Military Dictatorship', 'Stagnant Militancy'],
  ['Theocracy', 'Feudal'],
  ['Anarchist'],
];

// ─── Faction definition ──────────────────────────────────────────────────────

export interface Faction {
  id: string;
  name: string;
  color: number;
  politicalAffinity: PoliticalType[];
}

export interface SystemFactionState {
  controllingFactionId: string;
  contestingFactionId: string | null;
  isContested: boolean;
}

// ─── Syllable tables for name generation ──────────────────────────────────────

const PREFIXES = ['Kor', 'Vel', 'Ash', 'Dra', 'Sol', 'Nyx'];
const SUFFIXES = ['athi', 'eron', 'undi', 'imar', 'ossa', 'enth'];

// ─── Generate 6 factions deterministically ────────────────────────────────────

function generateFactions(): Faction[] {
  const rng = PRNG.fromIndex(GALAXY_SEED, 0xFAC710);
  const factions: Faction[] = [];

  for (let i = 0; i < 6; i++) {
    const prefix = PREFIXES[i];
    const suffix = SUFFIXES[i];
    const name = `${prefix}${suffix}`;

    // Each faction gets affinity to one political cluster
    const clusterIdx = i < POLITICAL_CLUSTERS.length ? i : rng.int(0, POLITICAL_CLUSTERS.length - 1);
    const politicalAffinity = [...POLITICAL_CLUSTERS[clusterIdx]];

    factions.push({
      id: `faction-${i}`,
      name,
      color: FACTION_COLORS[i],
      politicalAffinity,
    });
  }

  return factions;
}

export const ALL_FACTIONS: Faction[] = generateFactions();

export function getFaction(id: string): Faction | undefined {
  return ALL_FACTIONS.find(f => f.id === id);
}

// ─── Core: determine which faction controls a system in a given year ─────────

export function getSystemFactionState(
  systemId: number,
  galaxyYear: number,
  politics: PoliticalType,
): SystemFactionState {
  const era = Math.floor(galaxyYear / ERA_LENGTH);
  const rng = PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 0xFAC)) >>> 0,
    era,
  );

  // Score each faction by political affinity match
  const scores: { faction: Faction; score: number }[] = ALL_FACTIONS.map(f => {
    const affinityMatch = f.politicalAffinity.includes(politics) ? 3.0 : 0.5;
    const noise = rng.next() * 1.5;
    return { faction: f, score: affinityMatch + noise };
  });

  scores.sort((a, b) => b.score - a.score);
  const controllingFaction = scores[0].faction;

  // Determine contestation probability
  let contestChance = 0.25;

  // Check if controlling faction would change between eras
  if (era > 0) {
    const prevRng = PRNG.fromIndex(
      (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ ((era - 1) * 0x517CC1B7 + 0xFAC)) >>> 0,
      era - 1,
    );
    const prevScores = ALL_FACTIONS.map(f => {
      const affinityMatch = f.politicalAffinity.includes(politics) ? 3.0 : 0.5;
      const noise = prevRng.next() * 1.5;
      return { faction: f, score: affinityMatch + noise };
    });
    prevScores.sort((a, b) => b.score - a.score);
    if (prevScores[0].faction.id !== controllingFaction.id) {
      contestChance = 0.60;
    }
  }

  // Roll for contestation
  const contestRng = PRNG.fromIndex(
    (GALAXY_SEED ^ (systemId * 0x9E3779B9) ^ (era * 0x517CC1B7 + 0xC0E)) >>> 0,
    era,
  );
  const isContested = contestRng.next() < contestChance;

  let contestingFactionId: string | null = null;
  if (isContested) {
    // Pick a contester from a different political cluster
    const controlCluster = POLITICAL_CLUSTERS.find(c =>
      c.some(p => controllingFaction.politicalAffinity.includes(p)),
    );
    const otherFactions = ALL_FACTIONS.filter(f => {
      if (f.id === controllingFaction.id) return false;
      const fCluster = POLITICAL_CLUSTERS.find(c =>
        c.some(p => f.politicalAffinity.includes(p)),
      );
      return fCluster !== controlCluster;
    });

    if (otherFactions.length > 0) {
      contestingFactionId = contestRng.pick(otherFactions).id;
    } else {
      // Fallback: pick any other faction
      const fallback = ALL_FACTIONS.filter(f => f.id !== controllingFaction.id);
      if (fallback.length > 0) {
        contestingFactionId = contestRng.pick(fallback).id;
      }
    }
  }

  return {
    controllingFactionId: controllingFaction.id,
    contestingFactionId,
    isContested: contestingFactionId !== null,
  };
}
