import { create } from 'zustand';
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
} from './engine';
import { STARTING_CREDITS, STARTING_FUEL, STARTING_SYSTEM_ID, HYPERSPACE, GALAXY_YEAR_START, type GoodName } from './constants';
import type { NPCCargoEntry } from './mechanics/NPCSystem';
import type { NPCShipArchetype } from './archetypes';
import type { SystemId, GalaxyYear, ScannableBodyId, FactionId } from './types';

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
  shields: number;       // 0–100
  fuel: number;          // 0–7
  heat: number;          // 0–100
  credits: number;
  cargo: Partial<Record<GoodName, number>>;
  cargoCostBasis: Partial<Record<GoodName, number>>; // weighted avg purchase price
  speed: number;
  targetId: string | null;
}

export type { JumpLogEntry } from './engine';

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
  time: number; // game time in seconds

  // ── New relativistic time fields ──────────────────────────────────────────
  galaxyYear: GalaxyYear;
  jumpLog: JumpLogEntry[];                            // last 20
  playerChoices: Record<SystemId, SystemChoices>;
  lastVisitYear: Record<SystemId, GalaxyYear>;
  pendingGameEvent: PendingGameEventContext | null;
  pendingCommContext: PendingCommContext | null;

  // ── Faction tracking ──────────────────────────────────────────────────────
  knownFactions: Set<string>;
  factionMemory: Record<SystemId, FactionMemoryEntry>;
  systemEntryLines: string[] | null;
  pendingSystemEntryDialog: SystemEntryDialog | null;
  seenSystemDialogIds: string[];

  // ── Galaxy simulation state (from Rust) ─────────────────────────────────
  galaxySimState: SystemSimState[] | null;

  // ── Story chain targets ────────────────────────────────────────────────
  chainTargets: ChainTarget[];
  scannedBodies: Record<SystemId, Record<ScannableBodyId, GalaxyYear>>;

  // ── Global player history (cross-system) ──────────────────────────────
  playerHistory: {
    completedEvents: Record<string, { systemId: SystemId; galaxyYear: GalaxyYear }>;
    galacticFlags: string[];
  };
}

export interface GameActions {
  setInvertControls: (invert: boolean) => void;
  setPlayerPosition: (pos: { x: number; y: number; z: number }) => void;
  setPlayerVelocity: (vel: { x: number; y: number; z: number }) => void;
  setPlayerSpeed: (speed: number) => void;
  setShields: (v: number) => void;
  setFuel: (v: number) => void;
  setHeat: (v: number) => void;
  setUIMode: (mode: UIMode) => void;
  setCurrentSystemPayload: (id: SystemId, payload: SystemPayload) => void;
  setCurrentSystemMarket: (market: MarketEntry[]) => void;
  setTarget: (id: string | null) => void;
  setAlert: (msg: string | null) => void;
  setScanProgress: (progress: number, label?: string | null) => void;
  setHyperspaceTarget: (id: SystemId | null) => void;
  setHyperspaceCountdown: (n: number) => void;
  setDeathMessage: (lines: string[] | null) => void;
  setCanDockNow: (canDockNow: boolean) => void;
  setCanLandNow: (canLandNow: boolean) => void;
  setCanScanNow: (canScanNow: boolean) => void;
  setCanHailNow: (canHailNow: boolean) => void;
  addCredits: (delta: number) => void;
  addCargo: (good: GoodName, qty: number, purchasePrice?: number) => void;
  removeCargo: (good: GoodName, qty: number) => void;
  setCargoFromEngine: (cargo: Partial<Record<GoodName, number>>) => void;
  markVisited: (id: SystemId) => void;
  tickTime: (dt: number) => void;
  loadSave: () => void;
  saveGame: () => void;
  resetGame: () => void;

  // ── New relativistic time actions ────────────────────────────────────────
  advanceGalaxyYear: (years: number) => void;
  addJumpLogEntry: (entry: JumpLogEntry) => void;
  recordPlayerChoice: (systemId: SystemId, eventId: string, effect: Partial<SystemChoices>) => void;
  setPendingGameEvent: (ctx: PendingGameEventContext | null) => void;
  setPendingCommContext: (ctx: PendingCommContext | null) => void;
  recordVisitYear: (systemId: SystemId, year: GalaxyYear) => void;

  // ── Faction tracking actions ────────────────────────────────────────────
  addKnownFaction: (id: string) => void;
  setFactionMemory: (systemId: SystemId, data: FactionMemoryEntry) => void;
  setSystemEntryLines: (lines: string[] | null) => void;
  setPendingSystemEntryDialog: (dialog: SystemEntryDialog | null) => void;
  markSystemDialogSeen: (id: string) => void;

  // ── Engine integration actions ────────────────────────────────────────
  syncPlayerStateFromEngine: (ps: WasmPlayerState) => void;
  setCluster: (cluster: StarSystemData[]) => void;
  setClusterSummary: (summary: ClusterSystemSummary[]) => void;
  setGalaxySimState: (simState: SystemSimState[] | null) => void;
  setChainTargets: (targets: ChainTarget[]) => void;
  markBodyScanned: (systemId: SystemId, bodyId: ScannableBodyId, galaxyYear: GalaxyYear) => void;
  recordGlobalEventCompletion: (eventId: string, systemId: SystemId, galaxyYear: GalaxyYear) => void;
  addGalacticFlag: (flag: string) => void;
}

// Cluster is set from Rust engine init — starts empty, populated by Game.constructor
let CLUSTER: StarSystemData[] = [];

const DEFAULT_PLAYER: PlayerState = {
  position: { x: 0, y: 0, z: 2000 },
  velocity: { x: 0, y: 0, z: 0 },
  shields: 100,
  fuel: STARTING_FUEL,
  heat: 0,
  credits: STARTING_CREDITS,
  cargo: {},
  cargoCostBasis: {},
  speed: 0,
  targetId: null,
};

interface SaveData {
  invertControls?: boolean;
  credits: number;
  cargo: Partial<Record<GoodName, number>>;
  cargoCostBasis: Partial<Record<GoodName, number>>;
  fuel: number;
  shields: number;
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
}

function migrateLegacyGoodKeys<T>(record: Partial<Record<GoodName, T>> | undefined): Partial<Record<GoodName, T>> | undefined {
  if (!record) return record;
  const migrated = { ...record } as Partial<Record<GoodName, T>> & {
    Slaves?: T;
    'Enslaved People'?: T;
    Food?: T;
    Textiles?: T;
    Radioactives?: T;
    Liquor?: T;
    Luxuries?: T;
    Narcotics?: T;
    Computers?: T;
  };
  const legacyMap: Array<[keyof typeof migrated, GoodName]> = [
    ['Food', 'Starwind Rations'],
    ['Textiles', 'Hullskin Lace'],
    ['Radioactives', 'Reactor Salt'],
    ['Liquor', 'Dream Resin'],
    ['Luxuries', 'Embassy Masks'],
    ['Narcotics', 'Silence Vials'],
    ['Computers', 'Ancestral Backups'],
  ];
  for (const [oldKey, newKey] of legacyMap) {
    if (migrated[oldKey] !== undefined && migrated[newKey] === undefined) {
      migrated[newKey] = migrated[oldKey];
    }
    delete migrated[oldKey];
  }
  delete migrated.Slaves;
  delete migrated['Enslaved People'];
  return migrated;
}

function normalizeSystemChoicesMap(
  map: Record<SystemId, SystemChoices> | undefined,
): Record<SystemId, SystemChoices> {
  if (!map) return {};
  const out: Record<SystemId, SystemChoices> = {};
  for (const [k, v] of Object.entries(map)) {
    out[Number(k) as SystemId] = {
      tradingReputation: v.tradingReputation ?? 0,
      bannedGoods: v.bannedGoods ?? [],
      priceModifier: v.priceModifier ?? 1.0,
      factionTag: v.factionTag ?? null,
      completedEventIds: v.completedEventIds ?? [],
      flags: v.flags ?? [],
      firedTriggers: v.firedTriggers ?? [],
    };
  }
  return out;
}

function loadFromStorage(): Partial<SaveData> {
  try {
    const raw = localStorage.getItem('space-game-save');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export const useGameState = create<GameStateData & GameActions>((set, get) => ({
  invertControls: false,
  player: { ...DEFAULT_PLAYER },
  currentSystemId: STARTING_SYSTEM_ID,
  currentSystem: null,
  currentSystemPayload: null,
  cluster: CLUSTER,
  clusterSummary: [],
  visitedSystems: new Set(),
  ui: {
    mode: 'loading',
    alertMessage: null,
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

  // New relativistic time state
  galaxyYear: GALAXY_YEAR_START,
  jumpLog: [],
  playerChoices: {},
  lastVisitYear: {},
  pendingGameEvent: null,
  pendingCommContext: null,

  // Faction tracking state
  knownFactions: new Set(),
  factionMemory: {},
  systemEntryLines: null,
  pendingSystemEntryDialog: null,
  seenSystemDialogIds: [],

  // Galaxy simulation state
  galaxySimState: null,

  // Story chain targets
  chainTargets: [],
  scannedBodies: {},

  // Global player history
  playerHistory: { completedEvents: {}, galacticFlags: [] },

  setInvertControls: (invert) => {
    set({ invertControls: invert });
    get().saveGame();
  },
  setPlayerPosition: (pos) => set(s => ({ player: { ...s.player, position: pos } })),
  setPlayerVelocity: (vel) => set(s => ({ player: { ...s.player, velocity: vel } })),
  setPlayerSpeed: (speed) => set(s => ({ player: { ...s.player, speed } })),
  setShields: (v) => set(s => ({ player: { ...s.player, shields: Math.max(0, Math.min(100, v)) } })),
  setFuel: (v) => set(s => ({ player: { ...s.player, fuel: Math.max(0, Math.min(HYPERSPACE.tankSize, v)) } })),
  setHeat: (v) => set(s => ({ player: { ...s.player, heat: Math.max(0, Math.min(100, v)) } })),
  setUIMode: (mode) => set(s => ({ ui: { ...s.ui, mode } })),
  setCurrentSystemPayload: (id, payload) => set({
    currentSystemId: id,
    currentSystem: payload.system,
    currentSystemPayload: payload,
  }),
  setCurrentSystemMarket: (market) => set(s => (
    s.currentSystemPayload
      ? { currentSystemPayload: { ...s.currentSystemPayload, market } }
      : {}
  )),
  setTarget: (id) => set(s => ({ player: { ...s.player, targetId: id } })),
  setAlert: (msg) => set(s => ({ ui: { ...s.ui, alertMessage: msg } })),
  setScanProgress: (progress, label = null) => set(s => ({
    ui: {
      ...s.ui,
      scanProgress: Math.max(0, Math.min(1, progress)),
      scanLabel: label,
    },
  })),
  setHyperspaceTarget: (id) => set(s => ({ ui: { ...s.ui, hyperspaceTarget: id } })),
  setHyperspaceCountdown: (n) => set(s => ({ ui: { ...s.ui, hyperspaceCountdown: n } })),
  setDeathMessage: (lines) => set(s => ({ ui: { ...s.ui, deathMessage: lines } })),
  setCanDockNow: (canDockNow) => set((s) => (
    s.ui.canDockNow === canDockNow ? {} : { ui: { ...s.ui, canDockNow } }
  )),
  setCanLandNow: (canLandNow) => set((s) => (
    s.ui.canLandNow === canLandNow ? {} : { ui: { ...s.ui, canLandNow } }
  )),
  setCanScanNow: (canScanNow) => set((s) => (
    s.ui.canScanNow === canScanNow ? {} : { ui: { ...s.ui, canScanNow } }
  )),
  setCanHailNow: (canHailNow) => set((s) => (
    s.ui.canHailNow === canHailNow ? {} : { ui: { ...s.ui, canHailNow } }
  )),
  addCredits: (delta) => set(s => ({ player: { ...s.player, credits: s.player.credits + delta } })),
  addCargo: (good, qty, purchasePrice) => set(s => {
    const cargo = { ...s.player.cargo };
    const oldQty = cargo[good] ?? 0;
    cargo[good] = oldQty + qty;

    const basis = { ...s.player.cargoCostBasis };
    if (purchasePrice !== undefined) {
      const oldAvg = basis[good] ?? 0;
      basis[good] = (oldAvg * oldQty + purchasePrice * qty) / (oldQty + qty);
    }
    return { player: { ...s.player, cargo, cargoCostBasis: basis } };
  }),
  removeCargo: (good, qty) => set(s => {
    const cargo = { ...s.player.cargo };
    cargo[good] = Math.max(0, (cargo[good] ?? 0) - qty);
    const basis = { ...s.player.cargoCostBasis };
    if (cargo[good] === 0) {
      delete cargo[good];
      delete basis[good];
    }
    return { player: { ...s.player, cargo, cargoCostBasis: basis } };
  }),
  setCargoFromEngine: (cargo) => set(s => ({
    player: {
      ...s.player,
      cargo,
    },
  })),
  markVisited: (id) => set(s => {
    const v = new Set(s.visitedSystems);
    v.add(id);
    return { visitedSystems: v };
  }),
  tickTime: (dt) => set(s => ({ time: s.time + dt })),

  advanceGalaxyYear: (years) => set(s => ({ galaxyYear: (s.galaxyYear + years) as GalaxyYear })),
  addJumpLogEntry: (entry) => set(s => {
    const log = [entry, ...s.jumpLog].slice(0, 20);
    return { jumpLog: log };
  }),
  recordPlayerChoice: (systemId, eventId, effect) => set(s => {
    const existing = s.playerChoices[systemId] ?? {
      tradingReputation: 0,
      bannedGoods: [],
      priceModifier: 1.0,
      factionTag: null,
      completedEventIds: [],
      flags: [],
      firedTriggers: [],
    };
    const updated: SystemChoices = {
      tradingReputation: existing.tradingReputation + (effect.tradingReputation ?? 0),
      bannedGoods: [...new Set([...existing.bannedGoods, ...(effect.bannedGoods ?? [])])],
      priceModifier: existing.priceModifier * (effect.priceModifier ?? 1.0),
      factionTag: effect.factionTag ?? existing.factionTag,
      completedEventIds: existing.completedEventIds.includes(eventId)
        ? existing.completedEventIds
        : [...existing.completedEventIds, eventId],
      flags: [...new Set([...existing.flags, ...(effect.flags ?? [])])],
      firedTriggers: [...new Set([...existing.firedTriggers, ...(effect.firedTriggers ?? [])])],
    };
    return { playerChoices: { ...s.playerChoices, [systemId]: updated } };
  }),
  setPendingGameEvent: (ctx) => set({ pendingGameEvent: ctx }),
  setPendingCommContext: (ctx) => set({ pendingCommContext: ctx }),
  recordVisitYear: (systemId, year) => set(s => ({
    lastVisitYear: { ...s.lastVisitYear, [systemId]: year },
  })),
  recordGlobalEventCompletion: (eventId, systemId, galaxyYear) => set(s => ({
    playerHistory: {
      ...s.playerHistory,
      completedEvents: { ...s.playerHistory.completedEvents, [eventId]: { systemId, galaxyYear } },
    },
  })),
  addGalacticFlag: (flag) => set(s => ({
    playerHistory: {
      ...s.playerHistory,
      galacticFlags: s.playerHistory.galacticFlags.includes(flag)
        ? s.playerHistory.galacticFlags
        : [...s.playerHistory.galacticFlags, flag],
    },
  })),

  addKnownFaction: (id) => set(s => {
    const known = new Set(s.knownFactions);
    known.add(id);
    return { knownFactions: known };
  }),
  setFactionMemory: (systemId, data) => set(s => ({
    factionMemory: { ...s.factionMemory, [systemId]: data },
  })),
  setSystemEntryLines: (lines) => set({ systemEntryLines: lines }),
  setPendingSystemEntryDialog: (dialog) => set({ pendingSystemEntryDialog: dialog }),
  markSystemDialogSeen: (id) => set(s => ({
    seenSystemDialogIds: s.seenSystemDialogIds.includes(id)
      ? s.seenSystemDialogIds
      : [...s.seenSystemDialogIds, id],
  })),
  syncPlayerStateFromEngine: (ps) => set(s => ({
    player: {
      ...s.player,
      credits: ps.credits,
      cargo: ps.cargo as Partial<Record<GoodName, number>>,
      cargoCostBasis: ps.cargoCostBasis as Partial<Record<GoodName, number>>,
      fuel: ps.fuel,
      shields: ps.shields,
      heat: ps.heat,
    },
    currentSystemId: ps.currentSystemId,
    visitedSystems: new Set(ps.visitedSystems),
    galaxyYear: ps.galaxyYear,
    playerChoices: normalizeSystemChoicesMap(ps.playerChoices as Record<SystemId, SystemChoices>),
    lastVisitYear: ps.lastVisitYear,
    knownFactions: new Set(ps.knownFactions),
    factionMemory: ps.factionMemory as Record<SystemId, FactionMemoryEntry>,
    seenSystemDialogIds: [...new Set([...s.seenSystemDialogIds, ...ps.seenSystemDialogIds])],
    chainTargets: ps.chainTargets,
    playerHistory: {
      completedEvents: ps.playerHistory.completedEvents,
      galacticFlags: ps.playerHistory.galacticFlags,
    },
  })),
  setCluster: (cluster) => {
    CLUSTER = cluster;
    set({ cluster });
  },
  setClusterSummary: (clusterSummary) => set({ clusterSummary }),
  setGalaxySimState: (simState) => set({ galaxySimState: simState }),
  setChainTargets: (targets) => set({ chainTargets: targets }),
  markBodyScanned: (systemId, bodyId, galaxyYear) => set(s => {
    const existing = s.scannedBodies[systemId] ?? {};
    return {
      scannedBodies: {
        ...s.scannedBodies,
        [systemId]: {
          ...existing,
          [bodyId]: galaxyYear,
        },
      },
    };
  }),

  resetGame: () => {
    localStorage.removeItem('space-game-save');
    set({
      player: { ...DEFAULT_PLAYER },
      invertControls: false,
      currentSystemId: STARTING_SYSTEM_ID,
      currentSystem: null,
      currentSystemPayload: null,
      visitedSystems: new Set(),
      clusterSummary: [],
      time: 0,
      galaxyYear: GALAXY_YEAR_START,
      jumpLog: [],
      playerChoices: {},
      lastVisitYear: {},
      pendingGameEvent: null,
      pendingCommContext: null,
      knownFactions: new Set(),
      factionMemory: {},
      systemEntryLines: null,
      pendingSystemEntryDialog: null,
      seenSystemDialogIds: [],
      galaxySimState: null,
      chainTargets: [],
      scannedBodies: {},
      playerHistory: { completedEvents: {}, galacticFlags: [] },
      ui: {
        mode: 'flight',
        alertMessage: null,
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
    });
  },

  loadSave: () => {
    const saved = loadFromStorage();
    if (Object.keys(saved).length === 0) return;
    set(s => ({
      player: {
        ...s.player,
        credits: saved.credits ?? s.player.credits,
        cargo: migrateLegacyGoodKeys(saved.cargo) ?? s.player.cargo,
        cargoCostBasis: migrateLegacyGoodKeys(saved.cargoCostBasis) ?? s.player.cargoCostBasis,
        fuel: saved.fuel ?? s.player.fuel,
        shields: saved.shields ?? s.player.shields,
      },
      invertControls: saved.invertControls ?? false,
      currentSystemId: saved.currentSystemId ?? STARTING_SYSTEM_ID,
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
    }));
  },

  saveGame: () => {
    const s = get();
    const data: SaveData = {
      invertControls: s.invertControls,
      credits: s.player.credits,
      cargo: s.player.cargo,
      cargoCostBasis: s.player.cargoCostBasis,
      fuel: s.player.fuel,
      shields: s.player.shields,
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
    };
    localStorage.setItem('space-game-save', JSON.stringify(data));
  },
}));
