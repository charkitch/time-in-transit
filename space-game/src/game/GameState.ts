import { create } from 'zustand';
import type { StarSystemData } from './generation/GalaxyGenerator';
import type { SolarSystemData } from './generation/SystemGenerator';
import { generateGalaxy } from './generation/GalaxyGenerator';
import { STARTING_CREDITS, STARTING_FUEL, HYPERSPACE, GALAXY_YEAR_START, type GoodName } from './constants';
import type { CivilizationState } from './mechanics/CivilizationSystem';
import type { LandingEvent } from './data/events';
import type { NPCCargoEntry } from './mechanics/NPCSystem';

export type UIMode = 'flight' | 'galaxy_map' | 'system_map' | 'docked' | 'hyperspace' | 'landing' | 'comms' | 'dead';

export interface PendingCommContext {
  npcId: string;
  npcName: string;
  originSystemName: string;
  commLines: [string, string];
  cargo: NPCCargoEntry[];
  factionTag: string | null;
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

export interface JumpLogEntry {
  fromSystemId: number;
  toSystemId: number;
  yearsElapsed: number;
  galaxyYearAfter: number;
}

export interface SystemChoices {
  tradingReputation: number;    // accumulated; affects sell price
  bannedGoods: GoodName[];
  priceModifier: number;        // accumulated multiplier
  factionTag: string | null;
  completedEventIds: string[];
}

export interface PendingLandingContext {
  systemId: number;
  civState: CivilizationState;
  event: LandingEvent | null;
  yearsSinceLastVisit: number | null;
}

export interface FactionMemoryEntry {
  factionId: string;
  contestingFactionId: string | null;
  galaxyYear: number;
}

export interface GameStateData {
  player: PlayerState;
  currentSystemId: number;
  currentSystem: SolarSystemData | null;
  galaxy: StarSystemData[];
  visitedSystems: Set<number>;
  ui: {
    mode: UIMode;
    alertMessage: string | null;
    hyperspaceTarget: number | null;
    hyperspaceCountdown: number;
  };
  time: number; // game time in seconds

  // ── New relativistic time fields ──────────────────────────────────────────
  galaxyYear: number;
  jumpLog: JumpLogEntry[];                            // last 20
  playerChoices: Record<number, SystemChoices>;       // keyed by systemId
  lastVisitYear: Record<number, number>;              // systemId → galaxyYear
  pendingLandingEvent: PendingLandingContext | null;
  pendingCommContext: PendingCommContext | null;

  // ── Faction tracking ──────────────────────────────────────────────────────
  knownFactions: Set<string>;
  factionMemory: Record<number, FactionMemoryEntry>;
  systemEntryLines: string[] | null;
}

export interface GameActions {
  setPlayerPosition: (pos: { x: number; y: number; z: number }) => void;
  setPlayerVelocity: (vel: { x: number; y: number; z: number }) => void;
  setPlayerSpeed: (speed: number) => void;
  setShields: (v: number) => void;
  setFuel: (v: number) => void;
  setHeat: (v: number) => void;
  setUIMode: (mode: UIMode) => void;
  setCurrentSystem: (id: number, data: SolarSystemData) => void;
  setTarget: (id: string | null) => void;
  setAlert: (msg: string | null) => void;
  setHyperspaceTarget: (id: number | null) => void;
  setHyperspaceCountdown: (n: number) => void;
  addCredits: (delta: number) => void;
  addCargo: (good: GoodName, qty: number, purchasePrice?: number) => void;
  removeCargo: (good: GoodName, qty: number) => void;
  markVisited: (id: number) => void;
  tickTime: (dt: number) => void;
  loadSave: () => void;
  saveGame: () => void;
  resetGame: () => void;

  // ── New relativistic time actions ────────────────────────────────────────
  advanceGalaxyYear: (years: number) => void;
  addJumpLogEntry: (entry: JumpLogEntry) => void;
  recordPlayerChoice: (systemId: number, eventId: string, effect: Partial<SystemChoices>) => void;
  setPendingLandingEvent: (ctx: PendingLandingContext | null) => void;
  setPendingCommContext: (ctx: PendingCommContext | null) => void;
  recordVisitYear: (systemId: number, year: number) => void;

  // ── Faction tracking actions ────────────────────────────────────────────
  addKnownFaction: (id: string) => void;
  setFactionMemory: (systemId: number, data: FactionMemoryEntry) => void;
  setSystemEntryLines: (lines: string[] | null) => void;
}

const GALAXY = generateGalaxy();

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
  credits: number;
  cargo: Partial<Record<GoodName, number>>;
  cargoCostBasis: Partial<Record<GoodName, number>>;
  fuel: number;
  shields: number;
  currentSystemId: number;
  visitedSystems: number[];
  galaxyYear: number;
  jumpLog: JumpLogEntry[];
  playerChoices: Record<number, SystemChoices>;
  lastVisitYear: Record<number, number>;
  knownFactions: string[];
  factionMemory: Record<number, FactionMemoryEntry>;
}

function loadFromStorage(): Partial<SaveData> {
  try {
    const raw = localStorage.getItem('space-game-save');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export const useGameState = create<GameStateData & GameActions>((set, get) => ({
  player: { ...DEFAULT_PLAYER },
  currentSystemId: 0,
  currentSystem: null,
  galaxy: GALAXY,
  visitedSystems: new Set(),
  ui: {
    mode: 'flight',
    alertMessage: null,
    hyperspaceTarget: null,
    hyperspaceCountdown: 0,
  },
  time: 0,

  // New relativistic time state
  galaxyYear: GALAXY_YEAR_START,
  jumpLog: [],
  playerChoices: {},
  lastVisitYear: {},
  pendingLandingEvent: null,
  pendingCommContext: null,

  // Faction tracking state
  knownFactions: new Set(),
  factionMemory: {},
  systemEntryLines: null,

  setPlayerPosition: (pos) => set(s => ({ player: { ...s.player, position: pos } })),
  setPlayerVelocity: (vel) => set(s => ({ player: { ...s.player, velocity: vel } })),
  setPlayerSpeed: (speed) => set(s => ({ player: { ...s.player, speed } })),
  setShields: (v) => set(s => ({ player: { ...s.player, shields: Math.max(0, Math.min(100, v)) } })),
  setFuel: (v) => set(s => ({ player: { ...s.player, fuel: Math.max(0, Math.min(HYPERSPACE.tankSize, v)) } })),
  setHeat: (v) => set(s => ({ player: { ...s.player, heat: Math.max(0, Math.min(100, v)) } })),
  setUIMode: (mode) => set(s => ({ ui: { ...s.ui, mode } })),
  setCurrentSystem: (id, data) => set({ currentSystemId: id, currentSystem: data }),
  setTarget: (id) => set(s => ({ player: { ...s.player, targetId: id } })),
  setAlert: (msg) => set(s => ({ ui: { ...s.ui, alertMessage: msg } })),
  setHyperspaceTarget: (id) => set(s => ({ ui: { ...s.ui, hyperspaceTarget: id } })),
  setHyperspaceCountdown: (n) => set(s => ({ ui: { ...s.ui, hyperspaceCountdown: n } })),
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
  markVisited: (id) => set(s => {
    const v = new Set(s.visitedSystems);
    v.add(id);
    return { visitedSystems: v };
  }),
  tickTime: (dt) => set(s => ({ time: s.time + dt })),

  advanceGalaxyYear: (years) => set(s => ({ galaxyYear: s.galaxyYear + years })),
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
    };
    const updated: SystemChoices = {
      tradingReputation: existing.tradingReputation + (effect.tradingReputation ?? 0),
      bannedGoods: [...new Set([...existing.bannedGoods, ...(effect.bannedGoods ?? [])])],
      priceModifier: existing.priceModifier * (effect.priceModifier ?? 1.0),
      factionTag: effect.factionTag ?? existing.factionTag,
      completedEventIds: [...existing.completedEventIds, eventId],
    };
    return { playerChoices: { ...s.playerChoices, [systemId]: updated } };
  }),
  setPendingLandingEvent: (ctx) => set({ pendingLandingEvent: ctx }),
  setPendingCommContext: (ctx) => set({ pendingCommContext: ctx }),
  recordVisitYear: (systemId, year) => set(s => ({
    lastVisitYear: { ...s.lastVisitYear, [systemId]: year },
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

  resetGame: () => {
    localStorage.removeItem('space-game-save');
    set({
      player: { ...DEFAULT_PLAYER },
      currentSystemId: 0,
      currentSystem: null,
      visitedSystems: new Set(),
      time: 0,
      galaxyYear: GALAXY_YEAR_START,
      jumpLog: [],
      playerChoices: {},
      lastVisitYear: {},
      pendingLandingEvent: null,
      pendingCommContext: null,
      knownFactions: new Set(),
      factionMemory: {},
      systemEntryLines: null,
      ui: { mode: 'flight', alertMessage: null, hyperspaceTarget: null, hyperspaceCountdown: 0 },
    });
  },

  loadSave: () => {
    const saved = loadFromStorage();
    if (Object.keys(saved).length === 0) return;
    set(s => ({
      player: {
        ...s.player,
        credits: saved.credits ?? s.player.credits,
        cargo: saved.cargo ?? s.player.cargo,
        cargoCostBasis: saved.cargoCostBasis ?? s.player.cargoCostBasis,
        fuel: saved.fuel ?? s.player.fuel,
        shields: saved.shields ?? s.player.shields,
      },
      currentSystemId: saved.currentSystemId ?? 0,
      visitedSystems: new Set(saved.visitedSystems ?? []),
      galaxyYear: saved.galaxyYear ?? GALAXY_YEAR_START,
      jumpLog: saved.jumpLog ?? [],
      playerChoices: saved.playerChoices ?? {},
      lastVisitYear: saved.lastVisitYear ?? {},
      knownFactions: new Set(saved.knownFactions ?? []),
      factionMemory: saved.factionMemory ?? {},
    }));
  },

  saveGame: () => {
    const s = get();
    const data: SaveData = {
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
    };
    localStorage.setItem('space-game-save', JSON.stringify(data));
  },
}));
