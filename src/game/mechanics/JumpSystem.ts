import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { FlightModel } from '../flight/FlightModel';
import type { ScanningSystem } from './ScanningSystem';
import type { FlightHazardSystem } from './FlightHazardSystem';
import { useGameState } from '../GameState';
import { HYPERSPACE } from '../constants';
import { engineJumpToSystem, type SystemPayload, type WasmPlayerState } from '../engine';
import { canJump, jumpCost } from './hyperspaceCalc';

const INFINITE_FUEL_DEV = import.meta.env.DEV;
import { STARTING_SYSTEM_ID } from '../constants';
import type { SystemId } from '../types';

const FIRST_SYSTEM_ID = STARTING_SYSTEM_ID;
const SYSTEM_ENTRY_EVENT_CHANCE = 0.3;

export class JumpSystem {
  private hyperspaceTimer = 0;
  private hyperspaceActive = false;
  private hyperspaceStartTime = 0;
  private pendingSystemPayload: SystemPayload | null = null;
  private pendingPlayerSnapshot: WasmPlayerState | null = null;

  constructor(
    private sceneRenderer: SceneRenderer,
    private flightModel: FlightModel,
    private scanning: ScanningSystem,
    private hazards: FlightHazardSystem,
    private callbacks: {
      onProximityEvent: (state: ReturnType<typeof useGameState.getState>, pos: THREE.Vector3) => void;
      shouldTriggerEvent: (chance: number) => boolean;
    },
  ) {}

  tryJump(): void {
    const state = useGameState.getState();
    const mode = state.ui.mode;
    if (mode !== 'flight' && mode !== 'cluster_map') return;

    // Close cluster map if open so we return to flight
    if (mode === 'cluster_map') state.setUIMode('flight');

    if (state.ui.hyperspaceTarget === null) {
      state.setAlert('Open cluster map (G) to select jump target');
      setTimeout(() => useGameState.getState().setAlert(null), 2000);
      return;
    }
    if (state.ui.hyperspaceCountdown > 0) return;

    const currentSys = state.cluster[state.currentSystemId];
    const targetSys = state.cluster[state.ui.hyperspaceTarget];
    const availableFuel = INFINITE_FUEL_DEV ? HYPERSPACE.tankSize : state.player.fuel;
    const check = canJump(currentSys, targetSys, availableFuel);
    if (!check.ok) {
      state.setAlert(check.reason ?? 'Cannot jump');
      setTimeout(() => useGameState.getState().setAlert(null), 2000);
      return;
    }

    state.setHyperspaceCountdown(HYPERSPACE.countdown);
  }

  executeJump(): void {
    const state = useGameState.getState();
    if (this.hyperspaceActive) return;
    const targetId = state.ui.hyperspaceTarget;
    if (targetId === null) return;

    const currentSys = state.cluster[state.currentSystemId];
    const targetSys = state.cluster[targetId];
    const cost = INFINITE_FUEL_DEV ? 0 : jumpCost(currentSys, targetSys);

    const jumpResult = engineJumpToSystem(targetId, cost);

    // Sync all player state from Rust snapshot
    state.syncPlayerStateFromEngine(jumpResult.playerState);
    if (INFINITE_FUEL_DEV) {
      state.setFuel(HYPERSPACE.tankSize);
    }
    state.setClusterSummary(jumpResult.clusterSummary);
    state.setGalaxySimState(jumpResult.galaxySimState);
    state.addJumpLogEntry(jumpResult.jumpLogEntry);

    this.pendingSystemPayload = jumpResult.systemPayload;
    this.pendingPlayerSnapshot = jumpResult.playerState;
    state.setPendingTransitYears(jumpResult.yearsElapsed, jumpResult.shipYearsElapsed);

    this.hyperspaceActive = true;
    this.hyperspaceTimer = HYPERSPACE.duration;
    this.hyperspaceStartTime = performance.now();
    this.sceneRenderer.startHyperspace();
    state.setUIMode('hyperspace');

    // Schedule arrival
    setTimeout(() => {
      this.arriveInSystem(targetId);
    }, HYPERSPACE.duration * 1000);
  }

  isActive(): boolean {
    return this.hyperspaceActive;
  }

  /** Check hyperspace safety timeout. Returns true if recovery was triggered. */
  checkSafetyTimeout(): boolean {
    if (!this.hyperspaceActive) return false;
    if (performance.now() - this.hyperspaceStartTime > 10_000) {
      console.warn('Hyperspace safety timeout: forcing recovery to flight mode');
      this.hyperspaceActive = false;
      this.sceneRenderer.stopHyperspace();
      useGameState.getState().setUIMode('flight');
      return true;
    }
    return false;
  }

  tickCountdown(dt: number, state: ReturnType<typeof useGameState.getState>): void {
    if (state.ui.hyperspaceCountdown <= 0) return;
    const remaining = state.ui.hyperspaceCountdown - dt;
    if (remaining <= 0) {
      state.setHyperspaceCountdown(0);
      this.executeJump();
    } else {
      state.setHyperspaceCountdown(remaining);
      state.setAlert(`JUMP IN ${Math.ceil(remaining)}s`);
    }
  }

  resetOnNewGame(): void {
    this.hyperspaceActive = false;
    this.hyperspaceTimer = 0;
    this.hyperspaceStartTime = 0;
    this.pendingSystemPayload = null;
    this.pendingPlayerSnapshot = null;
  }

  private arriveInSystem(targetId: SystemId): void {
    const state = useGameState.getState();
    this.hazards.resetTimers();
    state.setHyperspaceTarget(null);
    state.setHyperspaceCountdown(0);
    state.setPendingTransitYears(null);
    this.hyperspaceActive = false;
    this.sceneRenderer.stopHyperspace();

    // Use system data from Rust jump result
    const payload = this.pendingSystemPayload;
    this.pendingSystemPayload = null;

    if (!payload) {
      console.warn('arriveInSystem: no pending system payload, recovering to flight mode');
      state.setUIMode('flight');
      return;
    }
    try {
      // Apply system arrival inline (absorbed from jumpFlow.ts)
      const systemData = payload.system;
      const starData = state.cluster[targetId];

      state.setCurrentSystemPayload(targetId, payload);
      state.addKnownFaction(payload.factionState.controllingFactionId);

      this.sceneRenderer.loadSystem(
        systemData,
        targetId,
        state.galaxyYear,
        starData.name,
        payload.factionState,
        starData.x,
        starData.y,
      );

      this.sceneRenderer.shipGroup.position.set(0, 0, 8000);
      this.sceneRenderer.shipGroup.rotation.set(0, 0, 0);
      this.flightModel.reset(this.sceneRenderer.shipGroup.position);
      this.flightModel.velocity.set(0, 0, -150);

      // Sync spatial state to store before saveGame() runs
      state.setPlayerPosition({ x: 0, y: 0, z: 8000 });
      state.setPlayerVelocity({ x: 0, y: 0, z: -150 });
      state.setPlayerQuaternion({ x: 0, y: 0, z: 0, w: 1 });

      // Save before queuing transient dialogs/events — those aren't serialized
      // in SaveData, so an autosave taken after they're set would silently drop them.
      state.saveGame();
      state.saveAutosave('system_entry');

      if (payload.systemEntryDialog) {
        state.setPendingSystemEntryDialog(payload.systemEntryDialog);
      }

      const lines = [...payload.systemEntryLines];
      const battle = this.sceneRenderer.getFleetBattle();
      if (battle) {
        const battlePlanet = systemData.planets.find(p => p.id === battle.planetId);
        lines.push(`FLEET ENGAGEMENT DETECTED NEAR ${battlePlanet!.name.toUpperCase()}`);
      }
      state.setSystemEntryLines(lines);

      state.setUIMode('flight');

      this.scanning.syncFromState(state);
      this.scanning.restoreIntelForSystem(state);
      this.callbacks.onProximityEvent(state, this.sceneRenderer.shipGroup.position);
      const refreshed = useGameState.getState();
      if (
        targetId !== FIRST_SYSTEM_ID
        && !refreshed.pendingGameEvent
        && !refreshed.pendingSystemEntryDialog
        && payload.gameEvent
        && this.callbacks.shouldTriggerEvent(SYSTEM_ENTRY_EVENT_CHANCE)
      ) {
        state.setPendingGameEvent({
          systemId: targetId,
          civState: payload.civState,
          event: payload.gameEvent,
          rootEventId: payload.gameEvent.id,
          yearsSinceLastVisit: null,
          returnMode: 'flight',
        });
        state.setUIMode('landing');
      }
    } catch (err) {
      console.error('arriveInSystem failed, recovering to flight mode:', err);
      state.setUIMode('flight');
    }
  }
}
