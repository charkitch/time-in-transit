import { STARTING_CREDITS, STARTING_FUEL, STARTING_SYSTEM_ID, GALAXY_YEAR_START } from './constants';
import type { SystemId } from './types';
import type { ShipStats } from './engine';
import type { PlayerState, GameStateData, SaveData, SystemChoices, UIMode } from './GameStateTypes';
import { isFiniteVec3, isFiniteQuat, isOriginVec3 } from './spatialValidation';

// Matches EffectiveShipStats::default() in Rust — no upgrades applied
export const DEFAULT_SHIP_STATS: ShipStats = {
  maxFuel: STARTING_FUEL,
  maxShields: 100,
  maxCargo: 20,
  coolingRate: 10,
  shieldRegenRate: 5,
  heatMax: 100,
  regenHeatCeil: 50,
  overheatShieldDmg: 20,
  scanRange: 0,
  harvestEfficiency: 1,
  jumpFuelCostMod: 1,
};

const DEFAULT_PLAYER: PlayerState = {
  position: { x: 0, y: 0, z: 8000 },
  velocity: { x: 0, y: 0, z: 0 },
  quaternion: { x: 0, y: 0, z: 0, w: 1 },
  shields: 100,
  fuel: STARTING_FUEL,
  heat: 0,
  credits: STARTING_CREDITS,
  cargo: {},
  cargoCostBasis: {},
  speed: 0,
  targetId: null,
};

/**
 * Initial state for a fresh game. Used by both the Zustand store creation
 * and `resetGame`. The cluster field is intentionally omitted — fresh games
 * start with the empty CLUSTER, while resetGame preserves the loaded cluster.
 */
export function buildInitialState(mode: UIMode): Omit<GameStateData, 'cluster'> {
  return {
    invertControls: false,
    player: { ...DEFAULT_PLAYER },
    currentSystemId: STARTING_SYSTEM_ID,
    currentSystem: null,
    currentSystemPayload: null,
    clusterSummary: [],
    visitedSystems: new Set(),
    ui: {
      mode,
      alertMessage: null,
      infoMessage: null,
      scanLabel: null,
      scanProgress: 0,
      hyperspaceTarget: null,
      hyperspaceCountdown: 0,
      deathMessage: null,
      canDockNow: false,
      canLandNow: false,
      canScanNow: false,
      canHailNow: false,
    },
    time: 0,

    // Relativistic time
    galaxyYear: GALAXY_YEAR_START,
    jumpLog: [],
    playerChoices: {},
    lastVisitYear: {},
    pendingGameEvent: null,
    pendingCommContext: null,

    // Faction tracking
    knownFactions: new Set(),
    factionMemory: {},
    pendingTransitYears: null,
    pendingShipYears: null,
    systemEntryLines: null,
    pendingSystemEntryDialog: null,
    seenSystemDialogIds: [],

    // Galaxy simulation
    galaxySimState: null,

    // Story chain
    chainTargets: [],
    scannedBodies: {},

    // Global player history
    playerHistory: { completedEvents: {}, galacticFlags: [] },

    // Ship progression
    shipUpgrades: [],
    shipStats: DEFAULT_SHIP_STATS,
  };
}

export function normalizeSystemChoicesMap(
  map: Record<SystemId, SystemChoices> | undefined,
): Record<SystemId, SystemChoices> {
  if (!map) return {};
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [Number(k), {
      tradingReputation: v.tradingReputation ?? 0,
      bannedGoods: v.bannedGoods ?? [],
      priceModifier: v.priceModifier ?? 1.0,
      factionTag: v.factionTag ?? null,
      completedEventIds: v.completedEventIds ?? [],
      flags: v.flags ?? [],
      firedTriggers: v.firedTriggers ?? [],
    }]),
  ) as Record<SystemId, SystemChoices>;
}

export function buildSaveData(s: GameStateData): SaveData {
  const hasValidSpatial = isFiniteVec3(s.player.position)
    && !isOriginVec3(s.player.position)
    && isFiniteQuat(s.player.quaternion)
    && isFiniteVec3(s.player.velocity);

  return {
    invertControls: s.invertControls,
    credits: s.player.credits,
    cargo: s.player.cargo,
    cargoCostBasis: s.player.cargoCostBasis,
    fuel: s.player.fuel,
    shields: s.player.shields,
    targetId: s.player.targetId,
    currentSystemId: s.currentSystemId,
    visitedSystems: Array.from(s.visitedSystems),
    galaxyYear: s.galaxyYear,
    jumpLog: s.jumpLog,
    playerChoices: s.playerChoices,
    lastVisitYear: s.lastVisitYear,
    knownFactions: Array.from(s.knownFactions),
    factionMemory: s.factionMemory,
    seenSystemDialogIds: s.seenSystemDialogIds,
    chainTargets: s.chainTargets,
    scannedBodies: s.scannedBodies,
    playerHistory: s.playerHistory,
    shipPosition: hasValidSpatial ? s.player.position : undefined,
    shipQuaternion: hasValidSpatial ? s.player.quaternion : undefined,
    shipVelocity: hasValidSpatial ? s.player.velocity : undefined,
    shipUpgrades: s.shipUpgrades,
  };
}

export function applySaveFields(saved: Partial<SaveData>): Partial<GameStateData> {
  return {
    player: {
      ...DEFAULT_PLAYER,
      credits: saved.credits ?? DEFAULT_PLAYER.credits,
      cargo: saved.cargo ?? DEFAULT_PLAYER.cargo,
      cargoCostBasis: saved.cargoCostBasis ?? DEFAULT_PLAYER.cargoCostBasis,
      fuel: saved.fuel ?? DEFAULT_PLAYER.fuel,
      shields: saved.shields ?? DEFAULT_PLAYER.shields,
      targetId: saved.targetId ?? null,
      position: saved.shipPosition ?? DEFAULT_PLAYER.position,
      velocity: saved.shipVelocity ?? DEFAULT_PLAYER.velocity,
      quaternion: saved.shipQuaternion ?? DEFAULT_PLAYER.quaternion,
    },
    invertControls: saved.invertControls ?? false,
    currentSystemId: saved.currentSystemId ?? STARTING_SYSTEM_ID,
    currentSystem: null,
    currentSystemPayload: null,
    visitedSystems: new Set(saved.visitedSystems ?? []),
    galaxyYear: saved.galaxyYear ?? GALAXY_YEAR_START,
    jumpLog: saved.jumpLog ?? [],
    playerChoices: normalizeSystemChoicesMap(saved.playerChoices),
    lastVisitYear: saved.lastVisitYear ?? {},
    knownFactions: new Set(saved.knownFactions ?? []),
    factionMemory: saved.factionMemory ?? {},
    seenSystemDialogIds: saved.seenSystemDialogIds ?? [],
    chainTargets: saved.chainTargets ?? [],
    scannedBodies: saved.scannedBodies ?? {},
    playerHistory: {
      completedEvents: saved.playerHistory?.completedEvents ?? {},
      galacticFlags: saved.playerHistory?.galacticFlags ?? [],
    },
    shipUpgrades: saved.shipUpgrades ?? [],
    shipStats: DEFAULT_SHIP_STATS, // recomputed from WASM on engine sync
    // Clear transient state so nothing leaks from the previous session
    pendingGameEvent: null,
    pendingCommContext: null,
    systemEntryLines: null,
    pendingSystemEntryDialog: null,
    time: 0,
  };
}

export function loadFromStorage(): Partial<SaveData> {
  try {
    const raw = localStorage.getItem('space-game-save');
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load save data from localStorage:', e);
  }
  return {};
}
