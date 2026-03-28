export const GALAXY_SEED = 0xDEADBEEF;
export const GALAXY_SIZE = 30;

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

export const STAR_COLORS: Record<string, number> = {
  G: PALETTE.starG,
  K: PALETTE.starK,
  M: PALETTE.starM,
  F: PALETTE.starF,
  A: PALETTE.starA,
};

export const GOODS = [
  'Food',
  'Textiles',
  'Radioactives',
  'Slaves',
  'Liquor',
  'Luxuries',
  'Narcotics',
  'Computers',
] as const;

export type GoodName = typeof GOODS[number];

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

export const FACTION_COLORS: number[] = [
  0xFF4444, // red
  0xFF8833, // orange
  0x4488FF, // blue
  0xAA44FF, // purple
  0x44DDAA, // teal
  0xFFCC22, // gold
];
