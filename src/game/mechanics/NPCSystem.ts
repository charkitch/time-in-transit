import * as THREE from 'three';
import type { SolarSystemData } from '../generation/SystemGenerator';
import type { GoodName } from '../constants';
import { PRNG } from '../generation/prng';
import { CLUSTER_SEED, GOODS } from '../constants';

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
  t: number;
  direction: 1 | -1;
  speed: number; // wu/s
  cargo: NPCCargoEntry[];
  commLines: [string, string];
  factionTag: string | null;
}

export interface NPCShipSpawnData extends NPCShipState {
  color: number;
}

const NPC_NAMES = [
  'Calypso Drift', 'Iron Meridian', 'Pale Coronal', 'Sonder Transit', 'Hecate Run',
  'Free Margin', 'Lodestar VII', 'Equinox Haul', 'Vagrant Signal', 'Second Compact',
] as const;

const COMM_PAIRS: [string, string][] = [
  [
    "We've been running this lane since before your grandfather's grandfather.",
    "Don't mind the hull scoring — that's history, not damage.",
  ],
  [
    "Good crossing. Sector's been quiet since the toll dispute.",
    "You heading rimward? Watch the debris near the fourth planet.",
  ],
  [
    "We carry what others won't touch. Legally.",
    "If you're buying, we're selling. Simple as that.",
  ],
  [
    "Long route from where we started. Always is.",
    "Another ship. Another day still not being pirates.",
  ],
  [
    "That's a fine vintage vessel you're running.",
    "We remember the old routes. Things were different then.",
  ],
  [
    "You're ancient. We can tell from the registry.",
    "No disrespect. Ancient is valuable out here.",
  ],
  [
    "Manifest's light this run. Economy.",
    "If you need Food or Textiles, we're your best offer this side of the ring.",
  ],
  [
    "Sector patrol's been heavy. Keep your transponder clean.",
    "We don't ask questions. That policy keeps us flying.",
  ],
];

export function generateNPCShips(
  _systemData: SolarSystemData,
  systemId: number,
  galaxyYear: number,
  systemName: string,
  planetPositions: THREE.Vector3[],
): NPCShipSpawnData[] {
  if (planetPositions.length < 2) return [];

  const era = Math.floor((galaxyYear - 3200) / 250);
  const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 79 + 3 + era * 500);

  const count = rng.int(2, 4);
  const ships: NPCShipSpawnData[] = [];

  for (let i = 0; i < count; i++) {
    const idxA = rng.int(0, planetPositions.length - 1);
    let idxB = rng.int(0, planetPositions.length - 2);
    if (idxB >= idxA) idxB++;

    const wpA = planetPositions[idxA].clone();
    const wpB = planetPositions[idxB].clone();

    // Seed cargo deterministically per (system, npc index, era)
    const cargoRng = PRNG.fromIndex(CLUSTER_SEED, systemId * 1009 + i * 31 + era * 137);
    const cargoCount = cargoRng.int(1, 3);
    const cargo: NPCCargoEntry[] = [];
    const usedGoods = new Set<string>();

    for (let c = 0; c < cargoCount; c++) {
      let good: GoodName;
      let attempts = 0;
      do {
        good = cargoRng.pick(GOODS) as GoodName;
        attempts++;
      } while (usedGoods.has(good) && attempts < 20);
      usedGoods.add(good);
      cargo.push({
        good,
        buyPrice: Math.round(cargoRng.float(50, 200)),
        sellPrice: Math.round(cargoRng.float(30, 180)),
        qty: cargoRng.int(1, 10),
      });
    }

    ships.push({
      id: `npc-${systemId}-${i}`,
      name: rng.pick(NPC_NAMES) as string,
      originSystemName: systemName,
      waypointA: wpA,
      waypointB: wpB,
      t: rng.next(),
      direction: rng.next() > 0.5 ? 1 : -1,
      speed: rng.float(20, 60),
      cargo,
      commLines: rng.pick(COMM_PAIRS),
      factionTag: null,
      color: 0x44CCFF,
    });
  }

  return ships;
}
