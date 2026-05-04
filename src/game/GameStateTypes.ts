import type {
  StarSystemData,
  SolarSystemData,
  CivilizationState,
  GameEvent,
  SystemSimState,
  ClusterSystemSummary,
  SystemPayload,
  MarketEntry,
  SystemEntryDialog,
  ChainTarget,
  WasmPlayerState,
  JumpLogEntry,
  ShipStats,
} from './engine';
import type { GoodName } from './constants';
import type { NPCCargoEntry } from './mechanics/NPCSystem';
import type { NPCShipArchetype } from './archetypes';
import type { SystemId, GalaxyYear, ScannableBodyId, FactionId } from './types';
import type { AutosaveKind } from '../ui/MainMenu/saveSlots';
import type { Vec3, Quat } from './spatialValidation';

export type { JumpLogEntry } from './engine';

export type UIMode = 'loading' | 'flight' | 'cluster_map' | 'system_map' | 'docked' | 'hyperspace' | 'landing' | 'comms' | 'dead' | 'menu';

export interface PendingCommContext {
  npcId: string;
  npcName: string;
  originSystemName: string;
  npcArchetype: NPCShipArchetype;
  commLines: [string, string];
  cargo: NPCCargoEntry[];
  factionTag: string | null;
  inTradeRange: boolean;
  bonusDemand: {
    good: GoodName;
    sellPrice: number;
    label: string;
  } | null;
}

export interface PlayerState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  shields: number;       // 0–100
  fuel: number;          // 0–7
  heat: number;          // 0–100
  credits: number;
  cargo: Partial<Record<GoodName, number>>;
  cargoCostBasis: Partial<Record<GoodName, number>>; // weighted avg purchase price
  speed: number;
  targetId: string | null;
}

export interface SystemChoices {
  tradingReputation: number;    // accumulated; affects sell price
  bannedGoods: GoodName[];
  priceModifier: number;        // accumulated multiplier
  factionTag: string | null;
  completedEventIds: string[];
  flags: string[];
  firedTriggers: string[];
}

export interface PendingGameEventContext {
  systemId: SystemId;
  civState: CivilizationState;
  event: GameEvent | null;
  rootEventId: string | null;
  yearsSinceLastVisit: number | null;
  returnMode: UIMode;
  landingSiteLabel?: string | null;
  landingHostLabel?: string | null;
  visited?: boolean;
}

export interface FactionMemoryEntry {
  factionId: FactionId;
  contestingFactionId: FactionId | null;
  galaxyYear: GalaxyYear;
}

export interface GameStateData {
  invertControls: boolean;
  player: PlayerState;
  currentSystemId: SystemId;
  currentSystem: SolarSystemData | null;
  currentSystemPayload: SystemPayload | null;
  cluster: StarSystemData[];
  clusterSummary: ClusterSystemSummary[];
  visitedSystems: Set<SystemId>;
  ui: {
    mode: UIMode;
    alertMessage: string | null;
    infoMessage: string | null;
    scanLabel: string | null;
    scanProgress: number;
    hyperspaceTarget: SystemId | null;
    hyperspaceCountdown: number;
    deathMessage: string[] | null;
    canDockNow: boolean;
    canLandNow: boolean;
    canScanNow: boolean;
    canHailNow: boolean;
  };
  time: number;

  // ── Relativistic time ────────────────────────────────────────────────────
  galaxyYear: GalaxyYear;
  jumpLog: JumpLogEntry[];
  playerChoices: Record<SystemId, SystemChoices>;
  lastVisitYear: Record<SystemId, GalaxyYear>;
  pendingGameEvent: PendingGameEventContext | null;
  pendingCommContext: PendingCommContext | null;

  // ── Faction tracking ─────────────────────────────────────────────────────
  knownFactions: Set<string>;
  factionMemory: Record<SystemId, FactionMemoryEntry>;
  pendingTransitYears: number | null;
  pendingShipYears: number | null;
  systemEntryLines: string[] | null;
  pendingSystemEntryDialog: SystemEntryDialog | null;
  seenSystemDialogIds: string[];

  // ── Galaxy simulation state (from Rust) ──────────────────────────────────
  galaxySimState: SystemSimState[] | null;

  // ── Story chain targets ──────────────────────────────────────────────────
  chainTargets: ChainTarget[];
  scannedBodies: Record<SystemId, Record<ScannableBodyId, GalaxyYear>>;

  // ── Global player history (cross-system) ─────────────────────────────────
  playerHistory: {
    completedEvents: Record<string, { systemId: SystemId; galaxyYear: GalaxyYear }>;
    galacticFlags: string[];
  };

  // ── Ship progression ────────────────────────────────────────────────────
  shipUpgrades: string[];
  shipStats: ShipStats;
}

export interface GameActions {
  setInvertControls: (invert: boolean) => void;
  setPlayerPosition: (pos: Vec3) => void;
  setPlayerVelocity: (vel: Vec3) => void;
  setPlayerQuaternion: (q: Quat) => void;
  setPlayerSpatial: (pos: Vec3, vel: Vec3, q: Quat) => void;
  setPlayerSpeed: (speed: number) => void;
  setShields: (v: number) => void;
  setFuel: (v: number) => void;
  setHeat: (v: number) => void;
  setCredits: (v: number) => void;
  setUIMode: (mode: UIMode) => void;
  setCurrentSystemPayload: (id: SystemId, payload: SystemPayload) => void;
  setCurrentSystemMarket: (market: MarketEntry[]) => void;
  setTarget: (id: string | null) => void;
  setAlert: (msg: string | null) => void;
  setInfoMessage: (msg: string | null) => void;
  setScanProgress: (progress: number, label?: string | null) => void;
  setHyperspaceTarget: (id: SystemId | null) => void;
  setHyperspaceCountdown: (n: number) => void;
  setDeathMessage: (lines: string[] | null) => void;
  setCanDockNow: (canDockNow: boolean) => void;
  setCanLandNow: (canLandNow: boolean) => void;
  setCanScanNow: (canScanNow: boolean) => void;
  setCanHailNow: (canHailNow: boolean) => void;
  addCargo: (good: GoodName, qty: number, purchasePrice?: number) => void;
  removeCargo: (good: GoodName, qty: number) => void;
  setCargoFromEngine: (cargo: Partial<Record<GoodName, number>>) => void;
  markVisited: (id: SystemId) => void;
  tickTime: (dt: number) => void;
  loadSave: () => Partial<SaveData>;
  applySaveData: (data: Partial<SaveData>) => void;
  saveGame: () => void;
  saveAutosave: (kind: AutosaveKind) => void;
  resetGame: () => void;
  advanceGalaxyYear: (years: number) => void;
  addJumpLogEntry: (entry: JumpLogEntry) => void;
  recordPlayerChoice: (systemId: SystemId, eventId: string, effect: Partial<SystemChoices>) => void;
  setPendingGameEvent: (ctx: PendingGameEventContext | null) => void;
  setPendingCommContext: (ctx: PendingCommContext | null) => void;
  recordVisitYear: (systemId: SystemId, year: GalaxyYear) => void;
  addKnownFaction: (id: string) => void;
  setFactionMemory: (systemId: SystemId, data: FactionMemoryEntry) => void;
  setPendingTransitYears: (years: number | null, shipYears?: number | null) => void;
  setSystemEntryLines: (lines: string[] | null) => void;
  setPendingSystemEntryDialog: (dialog: SystemEntryDialog | null) => void;
  markSystemDialogSeen: (id: string) => void;
  syncPlayerStateFromEngine: (ps: WasmPlayerState) => void;
  setCluster: (cluster: StarSystemData[]) => void;
  setClusterSummary: (summary: ClusterSystemSummary[]) => void;
  setGalaxySimState: (simState: SystemSimState[] | null) => void;
  setChainTargets: (targets: ChainTarget[]) => void;
  markBodyScanned: (systemId: SystemId, bodyId: ScannableBodyId, galaxyYear: GalaxyYear) => void;
  recordGlobalEventCompletion: (eventId: string, systemId: SystemId, galaxyYear: GalaxyYear) => void;
  addGalacticFlag: (flag: string) => void;
}

export interface SaveData {
  invertControls?: boolean;
  credits: number;
  cargo: Partial<Record<GoodName, number>>;
  cargoCostBasis: Partial<Record<GoodName, number>>;
  fuel: number;
  shields: number;
  targetId?: string | null;
  currentSystemId: SystemId;
  visitedSystems: SystemId[];
  galaxyYear: GalaxyYear;
  jumpLog: JumpLogEntry[];
  playerChoices: Record<SystemId, SystemChoices>;
  lastVisitYear: Record<SystemId, GalaxyYear>;
  knownFactions: string[];
  factionMemory: Record<SystemId, FactionMemoryEntry>;
  seenSystemDialogIds: string[];
  chainTargets: ChainTarget[];
  scannedBodies?: Record<SystemId, Record<ScannableBodyId, GalaxyYear>>;
  playerHistory?: {
    completedEvents?: Record<string, { systemId: SystemId; galaxyYear: GalaxyYear }>;
    galacticFlags?: string[];
  };
  shipPosition?: { x: number; y: number; z: number };
  shipQuaternion?: { x: number; y: number; z: number; w: number };
  shipVelocity?: { x: number; y: number; z: number };
  shipUpgrades: string[];
}

export type { Vec3, Quat };
