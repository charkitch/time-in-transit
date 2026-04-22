import { create } from 'zustand';
import type { StarSystemData } from './engine';
import { HYPERSPACE, type GoodName } from './constants';
import { saveAutosave, buildSlotMeta } from '../ui/MainMenu/saveSlots';
import type { SystemId, GalaxyYear } from './types';
import type {
  SystemChoices,
  FactionMemoryEntry,
  GameStateData,
  GameActions,
} from './GameStateTypes';
import {
  buildInitialState,
  normalizeSystemChoicesMap,
  buildSaveData,
  applySaveFields,
  loadFromStorage,
} from './gameStatePersistence';

// Re-export types and persistence for external consumers
export type {
  UIMode,
  PlayerState,
  SystemChoices,
  PendingGameEventContext,
  PendingCommContext,
  FactionMemoryEntry,
  GameStateData,
  GameActions,
  SaveData,
} from './GameStateTypes';
export type { JumpLogEntry } from './engine';
export { buildSaveData } from './gameStatePersistence';

// Cluster is set from Rust engine init — starts empty, populated by Game.constructor
let CLUSTER: StarSystemData[] = [];

export const useGameState = create<GameStateData & GameActions>((set, get) => ({
  ...buildInitialState('loading'),
  cluster: CLUSTER,

  setInvertControls: (invert) => {
    set({ invertControls: invert });
    get().saveGame();
  },
  setPlayerPosition: (pos) => set(s => ({ player: { ...s.player, position: pos } })),
  setPlayerVelocity: (vel) => set(s => ({ player: { ...s.player, velocity: vel } })),
  setPlayerQuaternion: (q) => set(s => ({ player: { ...s.player, quaternion: q } })),
  setPlayerSpatial: (pos, vel, q) => set(s => ({ player: { ...s.player, position: pos, velocity: vel, quaternion: q } })),
  setPlayerSpeed: (speed) => set(s => ({ player: { ...s.player, speed } })),
  setShields: (v) => set(s => ({ player: { ...s.player, shields: Math.max(0, Math.min(100, v)) } })),
  setFuel: (v) => set(s => ({ player: { ...s.player, fuel: Math.max(0, Math.min(HYPERSPACE.tankSize, v)) } })),
  setHeat: (v) => set(s => ({ player: { ...s.player, heat: Math.max(0, Math.min(100, v)) } })),
  setCredits: (v) => set(s => ({ player: { ...s.player, credits: Math.max(0, v) } })),
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
  setPendingTransitYears: (years, shipYears) => set({
    pendingTransitYears: years,
    pendingShipYears: shipYears ?? null,
  }),
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
    set(buildInitialState('flight'));
  },

  loadSave: () => {
    const saved = loadFromStorage();
    if (Object.keys(saved).length === 0) return saved;
    set(() => applySaveFields(saved));
    return saved;
  },

  applySaveData: (data) => {
    set(() => applySaveFields(data));
  },

  saveGame: () => {
    const s = get();
    const data = buildSaveData(s);
    localStorage.setItem('space-game-save', JSON.stringify(data));
  },

  saveAutosave: (kind) => {
    const s = get();
    const data = buildSaveData(s);
    const meta = buildSlotMeta(s);
    saveAutosave(data, meta, kind);
  },
}));
