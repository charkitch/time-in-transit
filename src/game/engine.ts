/**
 * engine.ts — TypeScript bridge to the Rust/WASM game engine.
 *
 * Provides typed wrappers around the raw WASM JSON boundary.
 * All game logic (generation, simulation, events, trading) lives in Rust.
 * JS is responsible for rendering, flight physics, and UI.
 */

import initWasm, {
  init_game,
  jump_to_system,
  get_system_market,
  get_game_event,
  get_landing_event,
  get_cluster_summary,
} from '../../engine/pkg/time_in_transit_engine';

import type { GoodName, EconomyType, PoliticalType } from './constants';

// ─── Types matching Rust camelCase serde output ─────────────────────────────

export type StarType = 'G' | 'K' | 'M' | 'F' | 'A' | 'WD' | 'NS' | 'PU' | 'XB' | 'MG' | 'BH' | 'XBB' | 'MQ' | 'SGR' | 'IRON';

export type SurfaceType =
  | 'continental'
  | 'ocean'
  | 'marsh'
  | 'venus'
  | 'barren'
  | 'desert'
  | 'ice'
  | 'volcanic'
  | 'forest_moon'
  | 'mountain';

export type DysonBiomeProfile = 'continental' | 'mixed' | 'desert' | 'arctic';

export type GasGiantType = 'jovian' | 'saturnian' | 'neptunian' | 'inferno' | 'chromatic' | 'helium';

export interface StarSystemData {
  id: number;
  name: string;
  x: number;
  y: number;
  starType: StarType;
  economy: EconomyType;
  techLevel: number;
  population: number;
}

export interface MoonData {
  id: string;
  surfaceType: SurfaceType;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  color: number;
  hasClouds: boolean;
  cloudDensity: number;
}

export interface PlanetData {
  id: string;
  name: string;
  type: 'rocky' | 'gas_giant';
  surfaceType: SurfaceType;
  gasType: GasGiantType;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  color: number;
  hasRings: boolean;
  ringCount: number;
  ringInclination: number;
  hasClouds: boolean;
  cloudDensity: number;
  greatSpot: boolean;
  greatSpotLat: number;
  greatSpotSize: number;
  moons: MoonData[];
  hasStation: boolean;
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

export type DysonInteractionMode = 'targetable_only';

export interface DysonWeatherBandData {
  startAngle: number;
  endAngle: number;
  hasClouds: boolean;
  cloudDensity: number;
  hasLightning: boolean;
}

export interface DysonShellSegmentData {
  id: string;
  name: string;
  bandIndex: number;
  segmentIndex: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination: number;
  orbitNode: number;
  curveRadius: number;
  arcWidth: number;
  arcHeight: number;
  color: number;
  starPhase: number;
  interactionMode: DysonInteractionMode;
  weatherBands: DysonWeatherBandData[];
  biomeProfile: DysonBiomeProfile;
  biomeSeed: number;
}

export interface BinaryCompanionData {
  starType: StarType;
  radius: number;
  color: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
}

export interface SolarSystemData {
  starType: StarType;
  starRadius: number;
  companion: BinaryCompanionData | null;
  planets: PlanetData[];
  dysonShells: DysonShellSegmentData[];
  asteroidBelt: AsteroidBeltData | null;
  mainStationPlanetId: string;
  secretBases: SecretBaseData[];
}

export interface CivilizationState {
  systemId: number;
  galaxyYear: number;
  era: number;
  politics: PoliticalType;
  economy: EconomyType;
  bannedGoods: GoodName[];
  priceModifier: number;
  luxuryMod: number;
  anarchyVariance: boolean;
  techBonus: GoodName[];
}

export interface SystemFactionState {
  controllingFactionId: string;
  contestingFactionId: string | null;
  isContested: boolean;
}

export interface MarketEntry {
  good: GoodName;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  banned: boolean;
  listingMode: 'listed_buy_sell' | 'sell_only';
  legality: 'legal' | 'licensed' | 'prohibited';
}

export interface ChoiceEffect {
  tradingReputation: number;
  bannedGoods: GoodName[];
  priceModifier: number;
  factionTag: string | null;
  creditsReward: number;
  fuelReward: number;
  setsFlags: string[];
  fires: string[];
}

export interface EventMoment {
  narrativeLines: string[];
  choices: EventChoice[];
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  effect: ChoiceEffect;
  requiresMinTech: number | null;
  requiresCredits: number | null;
  nextMoment: EventMoment | null;
}

export interface GameEvent {
  id: string;
  title: string;
  narrativeLines: string[];
  choices: EventChoice[];
  triggeredBy: string | null;
  triggeredOnly: boolean;
}

export interface ChainTarget {
  chainId: string;
  targetSystemId: number;
  stage: string;
}

export interface ClusterSystemSummary {
  id: number;
  name: string;
  x: number;
  y: number;
  starType: StarType;
  politics: PoliticalType;
  economy: EconomyType;
  controllingFactionId: string;
  contestingFactionId: string | null;
  isContested: boolean;
  techLevel: number;
  population: number;
}

export interface SystemEntryDialog {
  id: string;
  title: string;
  bodyLines: string[];
  showOnce: boolean;
}

export interface SystemPayload {
  system: SolarSystemData;
  civState: CivilizationState;
  factionState: SystemFactionState;
  market: MarketEntry[];
  gameEvent: GameEvent | null;
  systemEntryLines: string[];
  systemEntryDialog: SystemEntryDialog | null;
}

export interface JumpResult {
  systemPayload: SystemPayload;
  clusterSummary: ClusterSystemSummary[];
  yearsElapsed: number;
  newGalaxyYear: number;
  galaxySimState: SystemSimState[];
  chainTargets: ChainTarget[];
}

export interface InitResult {
  systemPayload: SystemPayload;
  clusterSummary: ClusterSystemSummary[];
  cluster: StarSystemData[];
  galaxySimState: SystemSimState[];
  chainTargets: ChainTarget[];
}

// ─── Galaxy Simulation State ────────────────────────────────────────────────

export interface SystemSimState {
  systemId: number;
  stability: number;
  prosperity: number;
  factionStrength: Record<string, number>;
  recentEvents: string[];
}

// ─── Player state for WASM boundary ────────────────────────────────────────

export interface WasmPlayerState {
  credits: number;
  cargo: Record<string, number>;
  cargoCostBasis: Record<string, number>;
  fuel: number;
  shields: number;
  currentSystemId: number;
  visitedSystems: number[];
  galaxyYear: number;
  playerChoices: Record<number, {
    tradingReputation: number;
    bannedGoods: GoodName[];
    priceModifier: number;
    factionTag: string | null;
    completedEventIds: string[];
    flags: string[];
    firedTriggers: string[];
  }>;
  lastVisitYear: Record<number, number>;
  knownFactions: string[];
  factionMemory: Record<number, {
    factionId: string;
    contestingFactionId: string | null;
    galaxyYear: number;
  }>;
  seenSystemDialogIds: string[];
  chainTargets: ChainTarget[];
}

// ─── Engine API ─────────────────────────────────────────────────────────────

let initialized = false;

export async function initEngine(): Promise<void> {
  if (initialized) return;
  await initWasm();
  initialized = true;
}

export function engineInitGame(playerState?: WasmPlayerState): InitResult {
  const json = playerState ? JSON.stringify(playerState) : '';
  const result = init_game(json);
  return JSON.parse(result);
}

export function engineJumpToSystem(
  targetSystemId: number,
  playerState: WasmPlayerState,
): JumpResult {
  const result = jump_to_system(targetSystemId, JSON.stringify(playerState));
  return JSON.parse(result);
}

export function engineGetMarket(
  systemId: number,
  playerState: WasmPlayerState,
): MarketEntry[] {
  const result = get_system_market(systemId, JSON.stringify(playerState));
  return JSON.parse(result);
}

export function engineGetGameEvent(
  systemId: number,
  playerState: WasmPlayerState,
  options?: {
    context?: 'landing' | 'system_entry' | 'proximity_star' | 'proximity_base' | 'planet_landing' | 'triggered';
    secretBaseId?: string;
    surface?: string;
  },
): GameEvent | null {
  const result = get_game_event(
    systemId,
    JSON.stringify(playerState),
    options?.context ?? 'landing',
    options?.secretBaseId ?? '',
    options?.surface ?? '',
  );
  return JSON.parse(result);
}

export function engineGetLandingEvent(
  systemId: number,
  playerState: WasmPlayerState,
  secretBaseId?: string,
): GameEvent | null {
  const result = get_landing_event(
    systemId,
    JSON.stringify(playerState),
    secretBaseId ?? '',
  );
  return JSON.parse(result);
}

export function engineGetClusterSummary(galaxyYear: number): ClusterSystemSummary[] {
  const result = get_cluster_summary(galaxyYear);
  return JSON.parse(result);
}
