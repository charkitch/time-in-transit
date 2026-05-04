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
  get_player_state,
  set_player_state,
  apply_choice_effect,
  query_ship_stats,
  trade_buy,
  trade_sell,
  tick_flight,
  station_refuel,
  station_repair,
} from '../../engine/pkg/time_in_transit_engine';
import type { StationArchetype } from './archetypes';
import { useGameState } from './GameState';

import type { GoodName, EconomyType, PoliticalType } from './constants';
import type { SystemId, GalaxyYear, FactionId } from './types';

// ─── Types matching Rust camelCase serde output ─────────────────────────────

export const STAR_TYPES = [
  'G',
  'K',
  'M',
  'F',
  'A',
  'WD',
  'NS',
  'PU',
  'XB',
  'MG',
  'BH',
  'XBB',
  'MQ',
  'IRON',
] as const;

export type StarType = (typeof STAR_TYPES)[number];

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
export type ClimateState = 'stable' | 'ice_age' | 'warming' | 'nuclear_winter' | 'toxic_bloom';
export type SpecialSystemKind = 'none' | 'iron_star' | 'the_crown';
export type InteractionTopology = 'sphere' | 'shell_patch' | 'helix_tube';
export type InteractionProfile = 'rocky' | 'gas_giant' | 'dyson_shell' | 'topopolis';
export type TopopolisBiome = 'continental' | 'ocean' | 'desert' | 'alien' | 'forest' | 'ice';

export interface InteractionFieldData {
  topology: InteractionTopology;
  profile: InteractionProfile;
  width: number;
  height: number;
  values: number[];
}

export interface StarSystemData {
  id: SystemId;
  name: string;
  x: number;
  y: number;
  starType: StarType;
  specialKind: SpecialSystemKind;
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
  polarCapSize: number;
  climateState: ClimateState;
  climateIntensity: number;
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
  stationArchetype: StationArchetype | null;
  interactionField: InteractionFieldData;
  polarCapSize: number;
  climateState: ClimateState;
  climateIntensity: number;
  axialTilt: number;
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
  interactionField: InteractionFieldData;
}

export interface BinaryCompanionData {
  starType: StarType;
  radius: number;
  color: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
}

export interface TopopolisCoilData {
  id: string;
  name: string;
  orbitRadius: number;
  coilCount: number;
  tubeRadius: number;
  helixPitch: number;
  orbitSpeed: number;
  orbitPhase: number;
  color: number;
  biomeSequence: TopopolisBiome[];
  biomeSeed: number;
  interactionField: InteractionFieldData;
}

export interface SolarSystemData {
  starType: StarType;
  starRadius: number;
  companion: BinaryCompanionData | null;
  planets: PlanetData[];
  dysonShells: DysonShellSegmentData[];
  topopolisCoils: TopopolisCoilData[];
  asteroidBelt: AsteroidBeltData | null;
  mainStationPlanetId: string;
  secretBases: SecretBaseData[];
}

export interface CivilizationState {
  systemId: SystemId;
  galaxyYear: GalaxyYear;
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
  controllingFactionId: FactionId;
  contestingFactionId: FactionId | null;
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
  setsGalacticFlags: string[];
  galaxyYearsAdvance: number;
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
  targetSystemId: SystemId;
  stage: string;
}

export interface ClusterSystemSummary {
  id: SystemId;
  name: string;
  x: number;
  y: number;
  starType: StarType;
  specialKind: SpecialSystemKind;
  politics: PoliticalType;
  economy: EconomyType;
  controllingFactionId: FactionId;
  contestingFactionId: FactionId | null;
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

export interface JumpLogEntry {
  fromSystemId: SystemId;
  toSystemId: SystemId;
  yearsElapsed: number;
  shipYearsElapsed: number;
  galaxyYearAfter: GalaxyYear;
}

export interface JumpResult {
  systemPayload: SystemPayload;
  clusterSummary: ClusterSystemSummary[];
  yearsElapsed: number;
  shipYearsElapsed: number;
  newGalaxyYear: GalaxyYear;
  galaxySimState: SystemSimState[];
  chainTargets: ChainTarget[];
  jumpLogEntry: JumpLogEntry;
  playerState: WasmPlayerState;
}

// ─── Flight tick types ──────────────────────────────────────────────────────

export type HazardType =
  | 'None'
  | 'Overheat'
  | 'StarCollision'
  | 'PlanetCollision'
  | 'MoonCollision'
  | 'StationCollision'
  | 'DysonShellCollision'
  | 'TopopolisCollision'
  | 'MicroquasarJet'
  | 'PulsarBeam'
  | 'BlackHole'
  | 'TidalDisruption'
  | 'BattleZone'
  | 'XRayStream';

export interface CargoHarvest {
  good: string;
  qty: number;
}

export interface FlightTickContext {
  dt: number;
  fuelRate: number;
  heatRate: number;
  coolingActive: boolean;
  shieldDamageRate: number;
  activeHazard: HazardType;
  isDead: boolean;
  cargoHarvests: CargoHarvest[];
}

export interface FlightTickResult {
  fuel: number;
  heat: number;
  shields: number;
  cargo: Record<string, number>;
  dead: boolean;
  deathCause: HazardType | null;
  cargoFull: boolean;
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
  systemId: SystemId;
  stability: number;
  prosperity: number;
  factionStrength: Record<FactionId, number>;
  recentEvents: string[];
}

// ─── Player state for WASM boundary ────────────────────────────────────────

export interface WasmPlayerState {
  credits: number;
  cargo: Record<string, number>;
  cargoCostBasis: Record<string, number>;
  fuel: number;
  shields: number;
  heat: number;
  currentSystemId: SystemId;
  visitedSystems: SystemId[];
  galaxyYear: GalaxyYear;
  playerChoices: Record<SystemId, {
    tradingReputation: number;
    bannedGoods: GoodName[];
    priceModifier: number;
    factionTag: string | null;
    completedEventIds: string[];
    flags: string[];
    firedTriggers: string[];
  }>;
  lastVisitYear: Record<SystemId, GalaxyYear>;
  knownFactions: string[];
  factionMemory: Record<SystemId, {
    factionId: FactionId;
    contestingFactionId: FactionId | null;
    galaxyYear: GalaxyYear;
  }>;
  seenSystemDialogIds: string[];
  chainTargets: ChainTarget[];
  playerHistory: {
    completedEvents: Record<string, { systemId: SystemId; galaxyYear: GalaxyYear }>;
    galacticFlags: string[];
  };
  shipUpgrades: string[];
}

export interface ShipStats {
  maxFuel: number;
  maxShields: number;
  maxCargo: number;
  coolingRate: number;
  shieldRegenRate: number;
  heatMax: number;
  regenHeatCeil: number;
  overheatShieldDmg: number;
  scanRange: number;
  harvestEfficiency: number;
  jumpFuelCostMod: number;
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
  targetSystemId: SystemId,
  fuelCost: number,
): JumpResult {
  const result = jump_to_system(targetSystemId as number, fuelCost);
  return JSON.parse(result);
}

export function engineGetMarket(systemId: SystemId): MarketEntry[] {
  const result = get_system_market(systemId as number);
  return JSON.parse(result);
}

export function engineGetGameEvent(
  systemId: SystemId,
  options?: {
    context?: 'landing' | 'system_entry' | 'proximity_star' | 'proximity_base' | 'planet_landing' | 'dyson_landing' | 'topopolis_landing' | 'triggered';
    secretBaseId?: string;
    surface?: string;
    siteClass?: string;
    hostType?: string;
  },
): GameEvent | null {
  const result = get_game_event(
    systemId as number,
    options?.context ?? 'landing',
    options?.secretBaseId ?? '',
    options?.surface ?? '',
    options?.siteClass ?? '',
    options?.hostType ?? '',
  );
  return JSON.parse(result);
}

export function engineGetLandingEvent(
  systemId: SystemId,
  secretBaseId?: string,
): GameEvent | null {
  const result = get_landing_event(systemId as number, secretBaseId ?? '');
  return JSON.parse(result);
}

export function engineGetClusterSummary(galaxyYear: GalaxyYear): ClusterSystemSummary[] {
  const result = get_cluster_summary(galaxyYear as number);
  return JSON.parse(result);
}

export function engineGetPlayerState(): WasmPlayerState {
  return JSON.parse(get_player_state());
}

export function engineQueryShipStats(): ShipStats {
  return JSON.parse(query_ship_stats());
}

export function engineSetPlayerState(playerState: WasmPlayerState): void {
  set_player_state(JSON.stringify(playerState));
}

export function engineApplyChoiceEffect(
  systemId: SystemId,
  eventId: string,
  rootEventId: string,
  effect: ChoiceEffect,
): WasmPlayerState {
  const result = apply_choice_effect(
    systemId as number,
    eventId,
    rootEventId,
    JSON.stringify(effect),
  );
  return JSON.parse(result);
}

/** Sync a WASM transaction result: parse snapshot, sync to store, save. */
function syncTransaction(result: string): void {
  const snapshot: WasmPlayerState = JSON.parse(result);
  const state = useGameState.getState();
  state.syncPlayerStateFromEngine(snapshot);
  state.saveGame();
}

export function engineTradeBuy(good: GoodName, qty: number, price: number): void {
  syncTransaction(trade_buy(JSON.stringify(good), qty, price));
}

export function engineTradeSell(good: GoodName, qty: number, price: number): void {
  syncTransaction(trade_sell(JSON.stringify(good), qty, price));
}

export function engineStationRefuel(): void {
  syncTransaction(station_refuel());
}

export function engineStationRepair(): void {
  syncTransaction(station_repair());
}

export function engineTickFlight(context: FlightTickContext): FlightTickResult {
  return JSON.parse(tick_flight(JSON.stringify(context)));
}
