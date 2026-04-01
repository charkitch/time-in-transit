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
  get_landing_event,
  get_cluster_summary,
} from '../../engine/pkg/time_in_transit_engine';

import type { GoodName, EconomyType, PoliticalType } from './constants';

// ─── Types matching Rust camelCase serde output ─────────────────────────────

export type StarType = 'G' | 'K' | 'M' | 'F' | 'A' | 'WD' | 'NS' | 'PU' | 'XB' | 'MG' | 'BH' | 'XBB' | 'SGR' | 'IRON';

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
  interactionMode: DysonInteractionMode;
  weatherBands: DysonWeatherBandData[];
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
}

export interface ChoiceEffect {
  tradingReputation: number;
  bannedGoods: GoodName[];
  priceModifier: number;
  factionTag: string | null;
  creditsReward: number;
  fuelReward: number;
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  effect: ChoiceEffect;
  requiresMinTech: number | null;
  requiresCredits: number | null;
}

export interface LandingEvent {
  id: string;
  title: string;
  narrativeLines: [string, string, string];
  choices: EventChoice[];
  applicablePolitics: PoliticalType[] | null;
  minGalaxyYear: number | null;
  requiredFactionTag: string | null;
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
  landingEvent: LandingEvent | null;
  systemEntryLines: string[];
  systemEntryDialog: SystemEntryDialog | null;
}

export interface JumpResult {
  systemPayload: SystemPayload;
  clusterSummary: ClusterSystemSummary[];
  yearsElapsed: number;
  newGalaxyYear: number;
  galaxySimState: SystemSimState[];
}

export interface InitResult {
  systemPayload: SystemPayload;
  clusterSummary: ClusterSystemSummary[];
  cluster: StarSystemData[];
  galaxySimState: SystemSimState[];
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
  }>;
  lastVisitYear: Record<number, number>;
  knownFactions: string[];
  factionMemory: Record<number, {
    factionId: string;
    contestingFactionId: string | null;
    galaxyYear: number;
  }>;
  seenSystemDialogIds: string[];
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

export function engineGetLandingEvent(
  systemId: number,
  playerState: WasmPlayerState,
  secretBaseId?: string,
): LandingEvent | null {
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
