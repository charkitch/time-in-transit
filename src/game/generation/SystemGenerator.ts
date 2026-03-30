import { PRNG } from './prng';
import { CLUSTER_SEED } from '../constants';
import type { StarSystemData } from './ClusterGenerator';

export type SurfaceType =
  | 'continental'
  | 'ocean'
  | 'marsh'
  | 'venus'
  | 'barren'
  | 'desert'
  | 'ice'
  | 'volcanic'
  | 'forest_moon';
export type GasGiantType = 'jovian' | 'saturnian' | 'neptunian' | 'inferno' | 'chromatic';

export interface PlanetData {
  id: string;
  name: string;
  type: 'rocky' | 'gas_giant';
  surfaceType: SurfaceType;
  gasType: GasGiantType;
  radius: number;       // world units
  orbitRadius: number;  // wu from star
  orbitSpeed: number;   // rad/s
  orbitPhase: number;   // initial angle
  color: number;
  hasRings: boolean;
  ringCount: number;        // 1, 2, or 3
  ringInclination: number;  // tilt from equatorial plane (radians)
  moons: MoonData[];
  hasStation: boolean;
}

export interface MoonData {
  id: string;
  surfaceType: SurfaceType;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  color: number;
}

export interface AsteroidBeltData {
  innerRadius: number;
  outerRadius: number;
  count: number;
}

export type SecretBaseType = 'asteroid' | 'oort_cloud' | 'maximum_space';

export interface SecretBaseData {
  id: string;
  name: string;
  type: SecretBaseType;
  orbitRadius: number;
  orbitPhase: number;
  orbitSpeed: number;
}

export interface SolarSystemData {
  starType: string;
  starRadius: number;
  planets: PlanetData[];
  asteroidBelt: AsteroidBeltData | null;
  mainStationPlanetId: string;
  secretBases: SecretBaseData[];
}

const GAS_GIANT_TYPES: GasGiantType[] = ['jovian', 'saturnian', 'neptunian', 'inferno', 'chromatic'];
const ROCKY_COLORS  = [0x8B6914, 0xA0522D, 0x7a6248, 0xB87333, 0x996633, 0xCC9966];
const GAS_COLORS    = [0x6688AA, 0x7A9B8C, 0x9B7A6A, 0x5577AA, 0x886699, 0x4466AA];
const MOON_COLORS   = [0x777788, 0x888877, 0xAA9988, 0x667788];

const ROCKY_SURFACE_WEIGHTS: Array<[SurfaceType, number]> = [
  ['barren', 0.24],
  ['desert', 0.22],
  ['ice', 0.14],
  ['volcanic', 0.10],
  ['venus', 0.10],
  ['continental', 0.10],
  ['ocean', 0.05],
  ['marsh', 0.04],
  ['forest_moon', 0.01],
];

const MOON_SURFACE_WEIGHTS: Array<[SurfaceType, number]> = [
  ['barren', 0.42],
  ['ice', 0.28],
  ['volcanic', 0.12],
  ['desert', 0.08],
  ['venus', 0.04],
  ['continental', 0.03],
  ['ocean', 0.015],
  ['marsh', 0.004],
  ['forest_moon', 0.001],
];

const ASTEROID_BASE_NAMES = [
  'Hollowed Rock', 'Cinder Station', 'Belt Refuge', 'The Burrow',
  'Slag Haven', 'Tumbling Dock', 'Ore Shadow', 'Gravel Nest',
];
const OORT_CLOUD_BASE_NAMES = [
  'Frost Haven', 'Deep Ice', 'Outer Dark Relay', 'Frozen Whisper',
  'The Cold Cradle', 'Ice Tomb Station', 'Frostbite Dock', 'Pale Signal',
];
const MAXIMUM_SPACE_NAMES = [
  'The Terminus', "Void's Edge", 'The Last Light', 'Absolute Zero',
  'The Final Signal', 'Edge of Nothing', 'The Farthest Shore', 'Silence Station',
];

function planetName(systemName: string, index: number): string {
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return `${systemName} ${roman[index] ?? index + 1}`;
}

function pickWeightedSurfaceType(rng: PRNG, weights: Array<[SurfaceType, number]>): SurfaceType {
  let roll = rng.next();
  for (const [surfaceType, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return surfaceType;
  }
  return weights[weights.length - 1][0];
}

function generateRockyMoonCount(rng: PRNG): number {
  const roll = rng.next();
  if (roll < 0.60) return 0;
  if (roll < 0.82) return 1;
  if (roll < 0.93) return 2;
  return 0;
}

function generateRockyMoonRadius(rng: PRNG): number {
  // Large moons exist, but they should be exceptional around rocky planets.
  return rng.next() < 0.08
    ? rng.float(38, 56)
    : rng.float(16, 30);
}

export function generateSolarSystem(star: StarSystemData): SolarSystemData {
  const rng = PRNG.fromIndex(CLUSTER_SEED, star.id * 97 + 13);

  const innerCount = rng.int(1, 3);
  const outerCount = rng.int(1, 3);
  const hasAsteroids = rng.next() < 0.5;
  const starRadius = 400 + rng.float(0, 200);

  const planets: PlanetData[] = [];

  // Inner rocky planets
  let orbitBase = 1000;
  for (let i = 0; i < innerCount; i++) {
    const orbitRadius = orbitBase + rng.float(200, 600);
    orbitBase = orbitRadius + rng.float(300, 500);
    const planetRadius = rng.float(60, 120);
    const moonCount = generateRockyMoonCount(rng);
    const moons: MoonData[] = [];
    // Each moon orbit starts beyond planet surface + previous moon
    let moonOrbitMin = planetRadius * 1.5;
    for (let m = 0; m < moonCount; m++) {
      const moonRadius = generateRockyMoonRadius(rng);
      const moonOrbit = moonOrbitMin + moonRadius + rng.float(20, 80);
      moonOrbitMin = moonOrbit + moonRadius;
      moons.push({
        id: `${star.id}-p${i}-m${m}`,
        surfaceType: pickWeightedSurfaceType(rng, MOON_SURFACE_WEIGHTS),
        radius: moonRadius,
        orbitRadius: moonOrbit,
        orbitSpeed: rng.float(0.0003, 0.001),
        orbitPhase: rng.float(0, Math.PI * 2),
        color: rng.pick(MOON_COLORS),
      });
    }
    planets.push({
      id: `${star.id}-p${i}`,
      name: planetName(star.name, i),
      type: 'rocky',
      surfaceType: pickWeightedSurfaceType(rng, ROCKY_SURFACE_WEIGHTS),
      gasType: 'jovian',
      radius: planetRadius,
      orbitRadius,
      orbitSpeed: rng.float(0.00005, 0.0002),
      orbitPhase: rng.float(0, Math.PI * 2),
      color: rng.pick(ROCKY_COLORS),
      hasRings: false,
      ringCount: 1,
      ringInclination: 0,
      moons,
      hasStation: star.techLevel >= 3 || i === 0,
    });
  }

  // Asteroid belt
  const beltInner = orbitBase + rng.float(300, 600);
  const asteroidBelt: AsteroidBeltData | null = hasAsteroids
    ? { innerRadius: beltInner, outerRadius: beltInner + rng.float(400, 700), count: 400 }
    : null;

  orbitBase = (asteroidBelt?.outerRadius ?? beltInner) + rng.float(800, 1500);

  // Outer gas giants
  for (let i = 0; i < outerCount; i++) {
    const orbitRadius = orbitBase + rng.float(1000, 3000);
    orbitBase = orbitRadius + rng.float(1500, 3000);
    // Generate planet properties before moons so orbit placement can account for them
    const gasType = rng.pick(GAS_GIANT_TYPES);
    const planetRadius = rng.float(180, 300);
    const hasRings = rng.next() < 0.6;
    const ringRoll = rng.next();
    const ringCount = !hasRings ? 1 : ringRoll < 0.05 ? 3 : ringRoll < 0.20 ? 2 : 1;
    const ringInclination = hasRings ? rng.float(-0.38, 0.38) : 0;
    // Outermost ring edge per ring count — moons must clear this
    const RING_OUTER_MULS = [0, 2.2, 2.6, 2.8];
    const ringOuterEdge = hasRings ? planetRadius * RING_OUTER_MULS[ringCount] : 0;
    const moonCount = rng.int(2, 6);
    const moons: MoonData[] = [];
    // Each moon starts beyond the ring (or planet surface) and clears the previous moon
    let moonOrbitMin = Math.max(planetRadius * 1.5, ringOuterEdge + 40);
    for (let m = 0; m < moonCount; m++) {
      const moonRadius = rng.float(25, 55);
      const moonOrbit = moonOrbitMin + moonRadius + rng.float(40, 180);
      moonOrbitMin = moonOrbit + moonRadius;
      moons.push({
        id: `${star.id}-g${i}-m${m}`,
        surfaceType: pickWeightedSurfaceType(rng, MOON_SURFACE_WEIGHTS),
        radius: moonRadius,
        orbitRadius: moonOrbit,
        orbitSpeed: rng.float(0.0001, 0.0006),
        orbitPhase: rng.float(0, Math.PI * 2),
        color: rng.pick(MOON_COLORS),
      });
    }
    planets.push({
      id: `${star.id}-g${i}`,
      name: planetName(star.name, innerCount + i),
      type: 'gas_giant',
      surfaceType: 'barren',
      gasType,
      radius: planetRadius,
      orbitRadius,
      orbitSpeed: rng.float(0.000008, 0.00003),
      orbitPhase: rng.float(0, Math.PI * 2),
      color: rng.pick(GAS_COLORS),
      hasRings,
      ringCount,
      ringInclination,
      moons,
      hasStation: false,
    });
  }

  const mainStationPlanetId = planets.find(p => p.hasStation)?.id ?? planets[0].id;

  // ── Secret bases ─────────────────────────────────────────────────────────
  const secretBases: SecretBaseData[] = [];
  const outerEdge = orbitBase; // current orbit frontier after all planets

  // Asteroid belt base (~25% of systems with belts)
  if (asteroidBelt && rng.next() < 0.25) {
    const midBelt = (asteroidBelt.innerRadius + asteroidBelt.outerRadius) / 2;
    secretBases.push({
      id: `${star.id}-secret-asteroid`,
      name: rng.pick(ASTEROID_BASE_NAMES),
      type: 'asteroid',
      orbitRadius: midBelt + rng.float(-100, 100),
      orbitPhase: rng.float(0, Math.PI * 2),
      orbitSpeed: rng.float(0.000015, 0.00004),
    });
  }

  // Oort cloud base (~15% — far beyond the gas giants)
  if (rng.next() < 0.15) {
    secretBases.push({
      id: `${star.id}-secret-oort`,
      name: rng.pick(OORT_CLOUD_BASE_NAMES),
      type: 'oort_cloud',
      orbitRadius: outerEdge + rng.float(5000, 10000),
      orbitPhase: rng.float(0, Math.PI * 2),
      orbitSpeed: rng.float(0.000002, 0.000008),
    });
  }

  // Maximum space (~8% — the absolute edge of the system, the void between stars)
  if (rng.next() < 0.08) {
    secretBases.push({
      id: `${star.id}-secret-void`,
      name: rng.pick(MAXIMUM_SPACE_NAMES),
      type: 'maximum_space',
      orbitRadius: outerEdge + rng.float(20000, 35000),
      orbitPhase: rng.float(0, Math.PI * 2),
      orbitSpeed: rng.float(0.0000005, 0.000002),
    });
  }

  return { starType: star.starType, starRadius, planets, asteroidBelt, mainStationPlanetId, secretBases };
}
