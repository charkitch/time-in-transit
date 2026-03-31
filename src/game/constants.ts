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
  starSGR:          0xFFAA22,
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
  SGR: PALETTE.starSGR,
};

export const STAR_TYPE_DISPLAY: Record<string, string> = {
  G: 'G-TYPE',
  K: 'K-TYPE',
  M: 'M-TYPE',
  F: 'F-TYPE',
  A: 'A-TYPE',
  WD: 'WHITE DWARF',
  HE: 'HELIUM PLANET',
  NS: 'NEUTRON STAR',
  PU: 'PULSAR',
  XB: 'X-RAY BINARY',
  MG: 'MAGNETAR',
  BH: 'BLACK HOLE',
  XBB: 'X-RAY BURSTER',
  SGR: 'SGR',
};

const BUYABLE_GOODS = [
  'Food',
  'Textiles',
  'Radioactives',
  'Liquor',
  'Luxuries',
  'Narcotics',
  'Computers',
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
