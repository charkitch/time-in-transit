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
  maxDistance: 80,
  maxSpeed:    20,
} as const;

export const HYPERSPACE = {
  maxRange:   25,  // galaxy units — MIN_DIST is 8, so this gives ~5-8 reachable neighbours
  fuelPerUnit: 0.35,
  tankSize:    7,
  countdown:   3,  // seconds
  duration:    2,  // tunnel animation seconds
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

export const GOODS = [
  ...BUYABLE_GOODS,
  COMBAT_INTELLIGENCE_GOOD,
] as const;

export type GoodName = typeof GOODS[number];

export const MARKET_GOODS: readonly GoodName[] = BUYABLE_GOODS;

export const ECONOMY_TYPES = ['Agricultural', 'Industrial', 'High Tech', 'Rich Industrial', 'Poor Agricultural', 'Refinery'] as const;
export type EconomyType = typeof ECONOMY_TYPES[number];

export const MAX_CARGO = 20;
export const STARTING_CREDITS = 1000;
export const STARTING_FUEL = 7;

export const GALAXY_YEAR_START = 3200;
export const ERA_LENGTH = 250;

export const POLITICAL_TYPES = [
  'Democracy',
  'Libertine Democracy',
  'Corporate State',
  'Military Dictatorship',
  'Stagnant Militancy',
  'Theocracy',
  'Anarchist',
  'Technocracy',
  'Feudal',
] as const;
export type PoliticalType = typeof POLITICAL_TYPES[number];

/** Mutable — settings UI can toggle at runtime */
export const RENDER_CONFIG = {
  planetTexturesEnabled: false,
  planetWireOverlayEnabled: true,
  planetTextureQuality: 'balanced' as 'low' | 'balanced' | 'high',
};
