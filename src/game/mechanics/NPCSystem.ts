import * as THREE from 'three';
import type { SolarSystemData } from '../engine';
import type { GoodName } from '../constants';
import { PRNG } from '../generation/prng';
import { CLUSTER_SEED, MARKET_GOODS } from '../constants';
import type { NPCShipArchetype, NPCShipSizeClass } from '../archetypes';

export interface NPCCargoEntry {
  good: GoodName;
  buyPrice: number;
  sellPrice: number;
  qty: number;
}

export interface NPCShipState {
  id: string;
  name: string;
  originSystemName: string;
  waypointA: THREE.Vector3;
  waypointB: THREE.Vector3;
  planetIdA: string;
  planetIdB: string;
  t: number;
  direction: 1 | -1;
  speed: number; // wu/s
  tradeRange: number;
  cargo: NPCCargoEntry[];
  commLines: [string, string];
  factionTag: string | null;
  archetype: NPCShipArchetype;
  sizeClass: NPCShipSizeClass;
  visualSeed: number;
}

export interface NPCShipSpawnData extends NPCShipState {}

const HUMAN_NAMES = [
  'Calypso Drift', 'Iron Meridian', 'Pale Coronal', 'Sonder Transit', 'Hecate Run',
  'Free Margin', 'Lodestar VII', 'Equinox Haul', 'Vagrant Signal', 'Second Compact',
] as const;

const ALIEN_NAMES = [
  'Ixh Bloomfold', 'Qel Fragment Choir', 'Ruum Glass Sermon', 'Nyth Foldwake',
  'Tza Spiral Husk', 'Vorr Lumen Reef', 'Khir Null Garden', 'Saa Lattice Echo',
] as const;

const COMM_BY_ARCHETYPE: Record<NPCShipArchetype, [string, string][]> = {
  human_freighter: [
    [
      "Manifest's dense this run. Refinery side is buying almost anything.",
      'Keep your nose clean around customs buoys and we all get paid.',
    ],
    [
      'Cargo decks are full and our drives are tired.',
      "If you're selling reactor salts, we can make room.",
    ],
  ],
  human_patrol: [
    [
      'Patrol pattern only. No interdiction today.',
      'Broadcast your ID and maintain vector; we are not here to start trouble.',
    ],
    [
      'Lane has been noisy this cycle.',
      'Stay clear of salvage fields and keep your transponder visible.',
    ],
  ],
  pilgrim_caravan: [
    [
      'We travel shrine to shrine and chart each silence between stars.',
      'Trade is welcome, but do not break procession spacing.',
    ],
    [
      "You've got an old hull. Pilgrims respect old machines.",
      'If you carry memory caskets, we pay in clean credits.',
    ],
  ],
  alien_biolattice: [
    [
      'This vessel grows itself between port calls.',
      'Do not tap our skin with active scanners unless invited.',
    ],
    [
      'Your signal tastes of old ion storms.',
      'Exchange is possible. Keep your thermal output low.',
    ],
  ],
  alien_crystal_spine: [
    [
      'Our cargo sings in strict harmonics.',
      'If your comm stack distorts, reduce gain by half.',
    ],
    [
      'You are shaped for pressure, not resonance.',
      'Approach slowly. Crystal wake can shear cheap hull plates.',
    ],
  ],
  alien_void_weaver: [
    [
      'We drift where maps become advice instead of law.',
      'Trade if you must. Speak briefly.',
    ],
    [
      'Your registry carries extinct punctuation.',
      'We honor old signatures. Keep distance and we can bargain.',
    ],
  ],
};

const GOODS_BY_ARCHETYPE: Record<NPCShipArchetype, GoodName[]> = {
  human_freighter: ['Reactor Salt', 'Starwind Rations', 'Hullskin Lace', 'Quasar Glass'],
  human_patrol: ['Jurisdiction Seals', 'Surrender Codes', 'Oath Filaments', 'Witness Ink'],
  pilgrim_caravan: ['Pilgrim Maps', 'Memory Caskets', 'Ancestral Backups', 'Witness Ink'],
  alien_biolattice: ['Impossible Seeds', 'Dream Resin', 'Debt Petals', 'Weather Keys'],
  alien_crystal_spine: ['Quasar Glass', 'Silence Vials', 'Embassy Masks', 'Gravitic Bone'],
  alien_void_weaver: ['Silence Vials', 'Impossible Seeds', 'Surrender Codes', 'Ancestral Backups'],
};

function pickArchetype(rng: PRNG, era: number, systemId: number): NPCShipArchetype {
  const alienChance = Math.min(0.58, 0.16 + Math.max(0, era) * 0.045 + (systemId >= 20 ? 0.08 : 0));
  if (rng.next() < alienChance) {
    const aliens: NPCShipArchetype[] = ['alien_biolattice', 'alien_crystal_spine', 'alien_void_weaver'];
    return rng.pick(aliens);
  }
  const human: NPCShipArchetype[] = ['human_freighter', 'human_patrol', 'pilgrim_caravan'];
  return rng.pick(human);
}

function pickSizeClass(archetype: NPCShipArchetype, rng: PRNG): NPCShipSizeClass {
  const roll = rng.next();
  if (archetype === 'human_patrol') {
    if (roll < 0.65) return 'small';
    if (roll < 0.92) return 'medium';
    return 'large';
  }
  if (archetype === 'human_freighter') {
    if (roll < 0.18) return 'small';
    if (roll < 0.72) return 'medium';
    return 'large';
  }
  if (roll < 0.22) return 'small';
  if (roll < 0.74) return 'medium';
  return 'large';
}

function speedRange(archetype: NPCShipArchetype, size: NPCShipSizeClass): [number, number] {
  const byType: Record<NPCShipArchetype, [number, number]> = {
    human_freighter: [18, 42],
    human_patrol: [36, 74],
    pilgrim_caravan: [22, 48],
    alien_biolattice: [24, 56],
    alien_crystal_spine: [20, 50],
    alien_void_weaver: [28, 70],
  };
  const [baseMin, baseMax] = byType[archetype];
  const sizePenalty = size === 'large' ? 0.78 : size === 'small' ? 1.16 : 1.0;
  return [baseMin * sizePenalty, baseMax * sizePenalty];
}

function tradeRangeFor(archetype: NPCShipArchetype, size: NPCShipSizeClass): number {
  const base = archetype === 'alien_void_weaver' ? 430 : 500;
  if (size === 'large') return base + 110;
  if (size === 'small') return base - 60;
  return base;
}

function pickCargoGood(cargoRng: PRNG, preferred: GoodName[]): GoodName {
  if (preferred.length > 0 && cargoRng.next() < 0.62) {
    return cargoRng.pick(preferred);
  }
  return cargoRng.pick(MARKET_GOODS) as GoodName;
}

export function generateNPCShips(
  _systemData: SolarSystemData,
  systemId: number,
  galaxyYear: number,
  systemName: string,
  planetPositions: THREE.Vector3[],
  planetIds: string[],
  mainPlanetId: string,
): NPCShipSpawnData[] {
  if (planetPositions.length < 2) return [];

  // Filter out the main station planet so NPCs do not spawn near the player.
  const filtered = planetPositions
    .map((pos, i) => ({ pos, id: planetIds[i] ?? `planet-${i}` }))
    .filter((p) => p.id !== mainPlanetId);

  if (filtered.length < 2) return [];

  const era = Math.floor((galaxyYear - 3200) / 250);
  const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 79 + 3 + era * 500);

  const count = rng.int(2, 5);
  const ships: NPCShipSpawnData[] = [];

  for (let i = 0; i < count; i++) {
    const idxA = rng.int(0, filtered.length - 1);
    let idxB = rng.int(0, filtered.length - 2);
    if (idxB >= idxA) idxB++;

    const wpA = filtered[idxA].pos.clone();
    const wpB = filtered[idxB].pos.clone();

    const archetype = pickArchetype(rng, era, systemId);
    const sizeClass = pickSizeClass(archetype, rng);
    const [minSpeed, maxSpeed] = speedRange(archetype, sizeClass);

    // Seed cargo deterministically per (system, npc index, era).
    const cargoRng = PRNG.fromIndex(CLUSTER_SEED, systemId * 1009 + i * 31 + era * 137);
    const cargoCount = sizeClass === 'large' ? cargoRng.int(2, 4) : cargoRng.int(1, 3);
    const cargo: NPCCargoEntry[] = [];
    const usedGoods = new Set<string>();
    const preferred = GOODS_BY_ARCHETYPE[archetype];

    for (let c = 0; c < cargoCount; c++) {
      let good: GoodName;
      let attempts = 0;
      do {
        good = pickCargoGood(cargoRng, preferred);
        attempts++;
      } while (usedGoods.has(good) && attempts < 20);
      usedGoods.add(good);
      const buyPrice = Math.round(cargoRng.float(80, 210));
      const sellPrice = Math.round(cargoRng.float(50, buyPrice - 10));
      cargo.push({
        good,
        buyPrice,
        sellPrice,
        qty: cargoRng.int(1, sizeClass === 'large' ? 14 : 9),
      });
    }

    const namePool = archetype.startsWith('alien_') ? ALIEN_NAMES : HUMAN_NAMES;
    ships.push({
      id: `npc-${systemId}-${i}`,
      name: rng.pick(namePool) as string,
      originSystemName: systemName,
      waypointA: wpA,
      waypointB: wpB,
      planetIdA: filtered[idxA].id,
      planetIdB: filtered[idxB].id,
      t: rng.next(),
      direction: rng.next() > 0.5 ? 1 : -1,
      speed: rng.float(minSpeed, maxSpeed),
      tradeRange: tradeRangeFor(archetype, sizeClass),
      cargo,
      commLines: rng.pick(COMM_BY_ARCHETYPE[archetype]),
      factionTag: null,
      archetype,
      sizeClass,
      visualSeed: cargoRng.int(1, 0x7ffffffe),
    });
  }

  return ships;
}
