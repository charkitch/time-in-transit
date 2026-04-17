import type { SystemId, GalaxyYear } from './types';

export const CLUSTER_SEED = 0xDEADBEEF;

export const PALETTE = {
  bg:               0x020408,
  hud:              0x33FF88,
  hudDim:           0x1a8844,
  station:          0x44CCFF,
  danger:           0xFF2200,
  warning:          0xFFAA00,
  hyperspace:       0x4422CC,
  hyperspaceBright: 0x8866FF,
  starG:            0xFFEE88,
  starK:            0xFFAA44,
  starM:            0xFF6633,
  starF:            0xFFFFFF,
  starA:            0xAABBFF,
  starWD:           0xF0F0FF,
  starHE:           0x88CCAA,
  starNS:           0xCCDDFF,
  starPU:           0x44AAFF,
  starXB:           0xFF6688,
  starMG:           0xDD44FF,
  starBH:           0x220022,
  starXBB:          0xFF4466,
  starMQ:           0x67D8FF,
  starSGR:          0xFFAA22,
  starIron:         0x2A2A2A,
  ambient:          0x112244,
  wireframe:        0x33FF88,
  stationWire:      0x44CCFF,
  planetRocky:      0x8B6914,
  planetGas:        0x6688AA,
} as const;

export const FLIGHT = {
  maxSpeed:       500,
  boostMultiplier: 3,
  boostFuelRate:  0.5,   // units/s
  drag:           0.97,
  pitchRate:      1.2,
  yawRate:        0.8,
  rollRate:       2.0,
} as const;

export const DOCKING = {
  maxSpeed:    20,
} as const;

export const INTERACTION_DISTANCE = {
  base: 130,
  stationCollisionScale: 1.0,
  stationCollisionMaxBonus: 120,
  largeBodyRadiusThreshold: 220,
  largeBodyRadiusScale: 0.18,
  largeBodyMaxBonus: 280,
  dysonShellBonus: 120,
  starBonus: 180,
} as const;

export function getInteractionDistance(entityType?: string, collisionRadius = 0): number {
  let distance = INTERACTION_DISTANCE.base;
  if (entityType === 'station') {
    const stationBonus = collisionRadius * INTERACTION_DISTANCE.stationCollisionScale;
    distance += Math.min(INTERACTION_DISTANCE.stationCollisionMaxBonus, stationBonus);
  }
  if (entityType === 'dyson_shell' || entityType === 'topopolis') {
    if (collisionRadius > INTERACTION_DISTANCE.largeBodyRadiusThreshold) {
      const radiusBonus = (collisionRadius - INTERACTION_DISTANCE.largeBodyRadiusThreshold) * INTERACTION_DISTANCE.largeBodyRadiusScale;
      distance += Math.min(INTERACTION_DISTANCE.largeBodyMaxBonus, radiusBonus);
    }
    distance += INTERACTION_DISTANCE.dysonShellBonus;
  } else if (entityType === 'star') {
    if (collisionRadius > INTERACTION_DISTANCE.largeBodyRadiusThreshold) {
      const radiusBonus = (collisionRadius - INTERACTION_DISTANCE.largeBodyRadiusThreshold) * INTERACTION_DISTANCE.largeBodyRadiusScale;
      distance += Math.min(INTERACTION_DISTANCE.largeBodyMaxBonus, radiusBonus);
    }
    distance += INTERACTION_DISTANCE.starBonus;
  }
  return distance;
}

export const HYPERSPACE = {
  maxRange:   25,  // galaxy units — MIN_DIST is 8, so this gives ~5-8 reachable neighbours
  fuelPerUnit: 0.35,
  tankSize:    7,
  countdown:   3,  // seconds
  duration:    2,  // tunnel animation seconds
} as const;

export const TRAVEL_TERMS = {
  modeName: 'Nearlight Passage',
  modeNameUpper: 'NEARLIGHT PASSAGE',
} as const;

export const FUEL_HARVEST = {
  range: 400,            // units from base to begin harvesting
  rates: {               // fuel units per second
    asteroid:      0.15,
    oort_cloud:    0.25,
    maximum_space: 0.10,
  },
  alerts: {
    asteroid:      'ICE MINING',
    oort_cloud:    'ICE HARVESTING',
    maximum_space: 'HYDROGEN COLLECTION',
  },
} as const;

export const GAS_GIANT_SCOOP = {
  rangePadding: 180,     // extra distance beyond the visible radius
  rate: 0.08,            // fuel units per second
  heatRate: 2.5,         // much safer than stellar scooping
  alert: 'GAS GIANT SCOOPING',
} as const;

export const PLANET_SCAN_RANGE_PADDING = 220;
export const DYSON_SCAN_RANGE_PADDING = 280;
export const SCAN_DURATION_SECONDS = 1.2;
export const SCAN_INTEL_MAX_AGE_YEARS = 0;

export const STAR_COLORS: Record<string, number> = {
  G: PALETTE.starG,
  K: PALETTE.starK,
  M: PALETTE.starM,
  F: PALETTE.starF,
  A: PALETTE.starA,
  WD: PALETTE.starWD,
  HE: PALETTE.starHE,
  NS: PALETTE.starNS,
  PU: PALETTE.starPU,
  XB: PALETTE.starXB,
  MG: PALETTE.starMG,
  BH: PALETTE.starBH,
  XBB: PALETTE.starXBB,
  MQ: PALETTE.starMQ,
  SGR: PALETTE.starSGR,
  IRON: PALETTE.starIron,
};

export interface StarAttributes {
  /** Whether this star type renders a glow/halo sprite */
  glow: boolean;
  /** Glow sprite size multiplier relative to star radius */
  glowMul: number;
  /** Whether proximity allows fuel scooping and causes heat damage */
  stellarEffects: boolean;
}

export const STAR_ATTRIBUTES: Record<string, StarAttributes> = {
  G:    { glow: true,  glowMul: 6,  stellarEffects: true  },
  K:    { glow: true,  glowMul: 6,  stellarEffects: true  },
  M:    { glow: true,  glowMul: 6,  stellarEffects: true  },
  F:    { glow: true,  glowMul: 6,  stellarEffects: true  },
  A:    { glow: true,  glowMul: 6,  stellarEffects: true  },
  WD:   { glow: true,  glowMul: 8,  stellarEffects: true  },
  HE:   { glow: true,  glowMul: 6,  stellarEffects: true  },
  NS:   { glow: true,  glowMul: 12, stellarEffects: true  },
  PU:   { glow: true,  glowMul: 12, stellarEffects: true  },
  XB:   { glow: true,  glowMul: 6,  stellarEffects: true  },
  MG:   { glow: true,  glowMul: 12, stellarEffects: true  },
  BH:   { glow: true,  glowMul: 6,  stellarEffects: true  },
  XBB:  { glow: true,  glowMul: 6,  stellarEffects: true  },
  MQ:   { glow: true,  glowMul: 14, stellarEffects: true  },
  SGR:  { glow: true,  glowMul: 6,  stellarEffects: true  },
  IRON: { glow: false, glowMul: 0,  stellarEffects: false },
};

export const STAR_TYPE_DISPLAY: Record<string, string> = {
  G: 'G-TYPE',
  K: 'K-TYPE',
  M: 'M-TYPE',
  F: 'F-TYPE',
  A: 'A-TYPE',
  WD: 'WHITE DWARF',
  NS: 'NEUTRON STAR',
  PU: 'PULSAR',
  XB: 'X-RAY BINARY',
  MG: 'MAGNETAR',
  BH: 'BLACK HOLE',
  XBB: 'X-RAY BURSTER',
  MQ: 'MICROQUASAR',
  SGR: 'SGR',
  IRON: 'IRON STAR',
};

export const STAR_DESCRIPTIONS: Record<string, { desc: string; wiki: string }> = {
  G: {
    desc: "A G-type main-sequence star (Yellow Dwarf), similar to Earth's Sun. Stable and long-lived.",
    wiki: "https://en.wikipedia.org/wiki/G-type_main-sequence_star"
  },
  K: {
    desc: "A K-type main-sequence star (Orange Dwarf). Cooler than G-type stars but more stable and long-lived.",
    wiki: "https://en.wikipedia.org/wiki/K-type_main-sequence_star"
  },
  M: {
    desc: "An M-type main-sequence star (Red Dwarf). The most common type of star, small and relatively cool.",
    wiki: "https://en.wikipedia.org/wiki/M-type_main-sequence_star"
  },
  F: {
    desc: "An F-type main-sequence star (Yellow-White Dwarf). Larger and hotter than the Sun.",
    wiki: "https://en.wikipedia.org/wiki/F-type_main-sequence_star"
  },
  A: {
    desc: "An A-type main-sequence star. Hot, bright, and often white or bluish-white.",
    wiki: "https://en.wikipedia.org/wiki/A-type_main-sequence_star"
  },
  WD: {
    desc: "A White Dwarf. The dense, hot remnant of a low-to-medium mass star after it has exhausted its nuclear fuel.",
    wiki: "https://en.wikipedia.org/wiki/White_dwarf"
  },
  NS: {
    desc: "A Neutron Star. An incredibly dense stellar remnant composed almost entirely of neutrons.",
    wiki: "https://en.wikipedia.org/wiki/Neutron_star"
  },
  PU: {
    desc: "A Pulsar. A highly magnetized rotating neutron star that emits beams of electromagnetic radiation.",
    wiki: "https://en.wikipedia.org/wiki/Pulsar"
  },
  XB: {
    desc: "An X-ray Binary. A system of two stars where one is a compact object accreting matter from its companion, emitting X-rays.",
    wiki: "https://en.wikipedia.org/wiki/X-ray_binary"
  },
  MG: {
    desc: "A Magnetar. A type of neutron star with an extremely powerful magnetic field.",
    wiki: "https://en.wikipedia.org/wiki/Magnetar"
  },
  BH: {
    desc: "A Black Hole. A region of spacetime where gravity is so strong that nothing, not even light, can escape.",
    wiki: "https://en.wikipedia.org/wiki/Black_hole"
  },
  XBB: {
    desc: "An X-ray Burster. A neutron star accreting from a main-sequence donor, producing sudden, intense X-ray bursts.",
    wiki: "https://en.wikipedia.org/wiki/X-ray_burster"
  },
  MQ: {
    desc: "A Microquasar. A stellar-mass black hole feeding from a companion star and launching enormous relativistic jets.",
    wiki: "https://en.wikipedia.org/wiki/Microquasar"
  },
  SGR: {
    desc: "A Soft Gamma Repeater. A magnetar that emits large bursts of gamma rays and X-rays at irregular intervals.",
    wiki: "https://en.wikipedia.org/wiki/Soft_gamma_repeater"
  },
  IRON: {
    desc: "An Iron Star. A hypothetical type of compact star that could form in the extremely distant future via quantum tunneling.",
    wiki: "https://en.wikipedia.org/wiki/Iron_star"
  },
};

const BUYABLE_GOODS = [
  'Starwind Rations',
  'Hullskin Lace',
  'Burial Sunstone',
  'Rain Choir Spools',
  'Reactor Salt',
  'Pilgrim Maps',
  'Witness Ink',
  'Gravitic Bone',
  'Embassy Masks',
  'Dream Resin',
  'Silence Vials',
  'Jurisdiction Seals',
  'Debt Petals',
  'Memory Caskets',
  'Oath Filaments',
  'Quasar Glass',
  'Weather Keys',
  'Ancestral Backups',
  'Surrender Codes',
  'Impossible Seeds',
] as const;

export const COMBAT_INTELLIGENCE_GOOD = 'Combat Intelligence' as const;
export const RELATIVISTIC_ASH_GOOD = 'Relativistic Ash' as const;
export const PULSAR_SILK_GOOD = 'Pulsar Silk' as const;
export const TRANSFER_PLASMA_GOOD = 'Transfer Plasma' as const;

export const GOODS = [
  ...BUYABLE_GOODS,
  COMBAT_INTELLIGENCE_GOOD,
  RELATIVISTIC_ASH_GOOD,
  PULSAR_SILK_GOOD,
  TRANSFER_PLASMA_GOOD,
] as const;

export type GoodName = typeof GOODS[number];

export const MARKET_GOODS: readonly GoodName[] = BUYABLE_GOODS;

export const ECONOMY_TYPES = ['Remnant', 'Tithe', 'Extraction', 'Tributary', 'Resonance', 'Synthesis', 'Everything'] as const;
export type EconomyType = typeof ECONOMY_TYPES[number];

export const MAX_CARGO = 20;
export const STARTING_CREDITS = 1000;
export const STARTING_FUEL = 7;

export const STARTING_SYSTEM_ID = 0 as SystemId;
export const GALAXY_YEAR_START = 3200 as GalaxyYear;
export const ERA_LENGTH = 250;

export const POLITICAL_TYPES = [
  'Remembrance Compact',
  'Requiem Parliament',
  'Murmuration',
  'Kindness',
  'Silence Mandate',
  'Vigil',
  'Covenant of Echoes',
  'Wound Tithe',
  'Palimpsest Authority',
  'The Asking',
  'Arrival',
  'Drift Sovereignty',
  'Crown Patchwork',
] as const;
export type PoliticalType = typeof POLITICAL_TYPES[number];

export const POLITICAL_TYPE_DISPLAY: Record<string, string> = {
  RemembranceCompact: 'Remembrance Compact',
  RequiemParliament: 'Requiem Parliament',
  Murmuration: 'Murmuration',
  Kindness: 'Kindness',
  SilenceMandate: 'Silence Mandate',
  Vigil: 'Vigil',
  CovenantOfEchoes: 'Covenant of Echoes',
  WoundTithe: 'Wound Tithe',
  PalimpsestAuthority: 'Palimpsest Authority',
  TheAsking: 'The Asking',
  Arrival: 'Arrival',
  DriftSovereignty: 'Drift Sovereignty',
  CrownPatchwork: 'Crown Patchwork',
};

export const POLITICAL_DESCRIPTIONS: Record<string, { desc: string }> = {
  RemembranceCompact: {
    desc: "Governance by shared memory archive. The oldest memories carry the most authority. The dockmaster already knows you — or rather, someone who met you four hundred years ago contributed the memory.",
  },
  RequiemParliament: {
    desc: "The dead outnumber the living millions to one. The living petition; the dead decide. Edicts arrive citing precedents from civilizations that no longer exist.",
  },
  Murmuration: {
    desc: "Decisions emerge from collective movement patterns that no individual directs. Outsiders see chaos, then sudden perfect coordination, then chaos again. No one has identified a leader. There may not be one.",
  },
  Kindness: {
    desc: "That's what the translation systems call it. No one knows what the actual word means. Ships are welcomed. Trade is permitted. Occasionally, entire populations relocate overnight without explanation. Prices are always fair.",
  },
  SilenceMandate: {
    desc: "The state controls what is known, remembered, and spoken. They believe certain knowledge is literally dangerous to the fabric of space. Docking requires memory audits. Smuggling profits are enormous.",
  },
  Vigil: {
    desc: "A civilization organized entirely around waiting — for a signal, a return, a completion. All governance is custodial. All activity serves maintenance of the wait. They don't explain what they're waiting for. They've been waiting for eleven thousand years.",
  },
  CovenantOfEchoes: {
    desc: "Theocratic governance organized around cosmic phenomena — quasar signatures, gravitational harmonics, patterns in background radiation. Priest-scientists who believe the universe is speaking and their role is to listen.",
  },
  WoundTithe: {
    desc: "Everything is oriented toward or away from a specific point in spacetime. Architecture, trade policy, navigation beacons — all reference a single event that happened, or will happen, or is happening. Cartographers who have visited the coordinates report empty space.",
  },
  PalimpsestAuthority: {
    desc: "Layers of contradictory laws from dozens of extinct regimes, all technically still in force. Governance is archaeological — lawyers excavate which layer applies. Nothing is illegal. Nothing is clearly legal either.",
  },
  TheAsking: {
    desc: "Every interaction begins with a question you don't understand. If you answer, trade proceeds normally. If you don't answer, trade proceeds normally. The questions are never the same twice. Scholars have spent centuries trying to determine if the answers matter. The current consensus is: probably.",
  },
  Arrival: {
    desc: "You dock. Time passes differently here — not relativistically, just differently. Your cargo manifest rearranges itself into an order that makes more sense. Prices appear before you ask. You leave with a full hold and no memory of negotiating. Your ship logs show eleven minutes. Your beard grew three days.",
  },
  DriftSovereignty: {
    desc: "Each entity — person, ship, habitat — is a sovereign state unto itself. Alliances form and dissolve by the hour. No laws, only negotiations. The docks are beautiful chaos.",
  },
  CrownPatchwork: {
    desc: "The Crown doesn't have a government. Trillions of entities from billions of species. Making do. It ranges from humdrum authoritarians to anarchists to the strange. The flicker of a candle rules a hundred million souls benevolently. In Telecas, only those who have died may vote. An AU away, a single Kleshari — weighing more than some planets — awaits its mate.",
  },
};

export const ECONOMY_DESCRIPTIONS: Record<string, { desc: string }> = {
  Remnant: {
    desc: "Scavenger economies built on the ruins of older civilizations. They harvest what was left behind. Archaeological wealth — great place to buy cheap basics, terrible place to sell them.",
  },
  Tithe: {
    desc: "Economies organized around obligation and tribute — to ancestors, to gods, to treaties signed millennia ago. Everything is owed somewhere. Stable, modest, reliable.",
  },
  Extraction: {
    desc: "Industrial civilizations that mine, refine, and process raw cosmic materials — reactor fuel, gravitic minerals, glass forged near stellar phenomena.",
  },
  Tributary: {
    desc: "Hub economies that profit from flow — trade routes, information streams, migration patterns. They produce little themselves but everything passes through them.",
  },
  Resonance: {
    desc: "Economies built around consciousness technology, memory trade, and identity services. The richest systems in the galaxy — they manufacture meaning.",
  },
  Synthesis: {
    desc: "Post-scarcity research economies. They engineer impossibilities — seeds that shouldn't grow, weather that shouldn't exist, backups of things that were never alive.",
  },
  Everything: {
    desc: "Not an economy — a million economies. Every model ever attempted runs somewhere along the Crown. Scavengers next to post-scarcity communes next to feudal tithe-states next to things that don't translate. Prices vary wildly by region. The only constant is volume.",
  },
};

/** Mutable — settings UI can toggle at runtime */
export const RENDER_CONFIG = {
  planetTexturesEnabled: false,
  planetWireOverlayEnabled: true,
  planetTextureQuality: 'balanced' as 'low' | 'balanced' | 'high',
};
