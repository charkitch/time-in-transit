import { PRNG } from './prng';
import { CLUSTER_SEED } from '../constants';
import type { StarSystemData } from './ClusterGenerator';

export type SurfaceType = 'continental' | 'ocean' | 'marsh' | 'venus';

export interface PlanetData {
  id: string;
  name: string;
  type: 'rocky' | 'gas_giant';
  surfaceType: SurfaceType;
  radius: number;       // world units
  orbitRadius: number;  // wu from star
  orbitSpeed: number;   // rad/s
  orbitPhase: number;   // initial angle
  color: number;
  hasRings: boolean;
  moons: MoonData[];
  hasStation: boolean;
}

export interface MoonData {
  id: string;
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

const SURFACE_TYPES: SurfaceType[] = ['continental', 'ocean', 'marsh', 'venus'];
const ROCKY_COLORS  = [0x8B6914, 0xA0522D, 0x7a6248, 0xB87333, 0x996633, 0xCC9966];
const GAS_COLORS    = [0x6688AA, 0x7A9B8C, 0x9B7A6A, 0x5577AA, 0x886699, 0x4466AA];
const MOON_COLORS   = [0x777788, 0x888877, 0xAA9988, 0x667788];

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
    const moonCount = rng.int(0, 2);
    const moons: MoonData[] = [];
    for (let m = 0; m < moonCount; m++) {
      moons.push({
        id: `${star.id}-p${i}-m${m}`,
        radius: rng.float(20, 40),
        orbitRadius: rng.float(120, 280),
        orbitSpeed: rng.float(0.0003, 0.001),
        orbitPhase: rng.float(0, Math.PI * 2),
        color: rng.pick(MOON_COLORS),
      });
    }
    planets.push({
      id: `${star.id}-p${i}`,
      name: planetName(star.name, i),
      type: 'rocky',
      surfaceType: rng.pick(SURFACE_TYPES),
      radius: rng.float(60, 120),
      orbitRadius,
      orbitSpeed: rng.float(0.00005, 0.0002),
      orbitPhase: rng.float(0, Math.PI * 2),
      color: rng.pick(ROCKY_COLORS),
      hasRings: false,
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
    const moonCount = rng.int(2, 6);
    const moons: MoonData[] = [];
    for (let m = 0; m < moonCount; m++) {
      moons.push({
        id: `${star.id}-g${i}-m${m}`,
        radius: rng.float(25, 55),
        orbitRadius: rng.float(250, 700),
        orbitSpeed: rng.float(0.0001, 0.0006),
        orbitPhase: rng.float(0, Math.PI * 2),
        color: rng.pick(MOON_COLORS),
      });
    }
    planets.push({
      id: `${star.id}-g${i}`,
      name: planetName(star.name, innerCount + i),
      type: 'gas_giant',
      surfaceType: 'continental',
      radius: rng.float(180, 300),
      orbitRadius,
      orbitSpeed: rng.float(0.000008, 0.00003),
      orbitPhase: rng.float(0, Math.PI * 2),
      color: rng.pick(GAS_COLORS),
      hasRings: rng.next() < 0.6,
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
