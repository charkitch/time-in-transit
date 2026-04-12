import * as THREE from 'three';
import { SceneRenderer, type SceneEntity } from './rendering/SceneRenderer';
import { FlightModel } from './flight/FlightModel';
import { InputSystem } from './input/InputSystem';
import { DockingSystem } from './mechanics/DockingSystem';
import { TargetingSystem } from './mechanics/TargetingSystem';
import { ScanningSystem } from './mechanics/ScanningSystem';
import { FlightHazardSystem } from './mechanics/FlightHazardSystem';
import { InteractionSystem } from './mechanics/InteractionSystem';
import { JumpSystem } from './mechanics/JumpSystem';

import { useGameState } from './GameState';
import type { SaveData } from './GameState';
import type { GoodName } from './constants';
import {
  initEngine, engineInitGame, engineGetGameEvent, engineRespawn,
  type GameEvent,
} from './engine';
import { buildWasmPlayerState, placeShipNearMainStation } from './systems/systemLoad';
import type { RuntimeProfile } from '../runtime/runtimeProfile';

const INFINITE_FUEL_DEV = import.meta.env.DEV;
const FIRST_SYSTEM_ID = 0;
const PROXIMITY_EVENT_CHANCE = 0.08;
const PROXIMITY_EVENT_COOLDOWN_HIT = 20;
const PROXIMITY_EVENT_COOLDOWN_MISS = 8;

function collisionDeathMessage(type: SceneEntity['type']): string[] {
  switch (type) {
    case 'star':
      return ['STELLAR IMPACT', 'Ship incinerated on approach to stellar surface.', 'No wreckage found.'];
    case 'planet':
      return ['PLANETARY IMPACT', 'Uncontrolled descent into planetary body.', 'Crash site detected on surface.'];
    case 'moon':
      return ['LUNAR IMPACT', 'Collision with lunar surface at terminal velocity.', 'Debris field detected in low orbit.'];
    case 'station':
      return ['STATION COLLISION', 'Hull breached on impact with orbital structure.', 'Station authorities notified.'];
    case 'dyson_shell':
      return ['SHELL IMPACT', 'Ship destroyed on collision with Dyson shell.', 'Wreckage embedded in superstructure.'];
    default:
      return ['SHIP DESTROYED', 'Impact with stellar body.'];
  }
}

export class Game {
  private sceneRenderer: SceneRenderer;
  private flightModel: FlightModel;
  private input: InputSystem;
  private docking: DockingSystem;
  private targeting: TargetingSystem;
  private scanning: ScanningSystem;
  private hazards: FlightHazardSystem;
  private interaction: InteractionSystem;
  private jump: JumpSystem;
  private rafId = 0;
  private lastTime = 0;
  private isDead = false;
  private engineReady = false;
  private proximityEventCooldown = 0;

  private shouldTriggerEvent(chance: number): boolean {
    return Math.random() < chance;
  }

  constructor(
    canvas: HTMLCanvasElement,
    options?: {
      runtimeProfile?: RuntimeProfile | null;
      onContextLost?: () => void;
      onContextRestored?: () => void;
    },
  ) {
    this.sceneRenderer = new SceneRenderer(canvas, {
      runtimeProfile: options?.runtimeProfile,
      onContextLost: options?.onContextLost,
      onContextRestored: options?.onContextRestored,
    });
    this.flightModel = new FlightModel();
    this.input = new InputSystem();
    this.docking = new DockingSystem();
    this.targeting = new TargetingSystem(this.sceneRenderer);
    this.scanning = new ScanningSystem(this.sceneRenderer);
    this.hazards = new FlightHazardSystem(this.sceneRenderer);
    this.interaction = new InteractionSystem(this.sceneRenderer, this.flightModel, this.docking, this.targeting);
    this.jump = new JumpSystem(this.sceneRenderer, this.flightModel, this.scanning, this.hazards, {
      onProximityEvent: (s, p) => this.tryProximityGameEvent(s, p),
      shouldTriggerEvent: (c) => this.shouldTriggerEvent(c),
    });

    // Wire up one-shot input events
    this.input.onDockRequest(() => this.interaction.tryInteract());
    this.input.onClusterMapToggle(() => this.toggleClusterMap());
    this.input.onSystemMapToggle(() => this.toggleSystemMap());
    this.input.onCycleTargetEvent(() => this.targeting.cycleTarget());
    this.input.onJumpRequestEvent(() => this.jump.tryJump());
    this.input.onHailRequest(() => this.interaction.tryHail());
    this.input.onScanRequest(() => this.scanning.tryScan());
    this.input.onEscapeEvent(() => this.handleEscape());

    // Load save, then initialize engine and first system
    const state = useGameState.getState();
    state.loadSave();
    this.initFromEngine(state);
  }

  private async initFromEngine(
    state: ReturnType<typeof useGameState.getState>,
    shipSpatial?: {
      position: { x: number; y: number; z: number };
      quaternion: { x: number; y: number; z: number; w: number };
      velocity: { x: number; y: number; z: number };
    },
  ): Promise<void> {
    await initEngine();
    const wasmState = buildWasmPlayerState(state);
    const result = engineInitGame(wasmState.galaxyYear === 3200 && wasmState.visitedSystems.length <= 1 ? undefined : wasmState);
    state.setCluster(result.cluster);
    state.setClusterSummary(result.clusterSummary);
    state.setGalaxySimState(result.galaxySimState);
    state.setChainTargets(result.chainTargets);
    this.engineReady = true;

    // Use system payload from Rust for first system
    const systemData = result.systemPayload.system;
    state.setCurrentSystemPayload(state.currentSystemId, result.systemPayload);
    state.markVisited(state.currentSystemId);
    state.setSystemEntryLines(result.systemPayload.systemEntryLines);

    const starData = result.cluster[state.currentSystemId];
    this.sceneRenderer.loadSystem(
      systemData,
      state.currentSystemId,
      state.galaxyYear,
      starData.name,
      result.systemPayload.factionState,
      starData.x,
      starData.y,
    );
    this.scanning.syncFromState(state);
    this.scanning.restoreIntelForSystem(state);

    if (shipSpatial) {
      const { position, quaternion, velocity } = shipSpatial;
      this.sceneRenderer.shipGroup.position.set(position.x, position.y, position.z);
      this.sceneRenderer.shipGroup.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      this.flightModel.setVelocity(velocity.x, velocity.y, velocity.z);
    } else {
      placeShipNearMainStation(this.sceneRenderer, systemData);
      this.flightModel.reset(this.sceneRenderer.shipGroup.position);
    }

    state.setUIMode('flight');
  }

  // loadCurrentSystem removed — initialization now handled by initFromEngine

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Allows UI actions (e.g. map button) to trigger the same jump path as the J key. */
  requestJump(): void {
    this.jump.tryJump();
  }

  setTouchFlightInput(input: { pitch: number; yaw: number; roll: number; thrust: number; boost: boolean }): void {
    this.input.setTouchFlightInput(input);
  }

  clearTouchFlightInput(): void {
    this.input.resetTouchFlightInput();
  }

  requestDock(): void {
    this.input.triggerDockRequest();
  }

  requestClusterMapToggle(): void {
    this.input.triggerClusterMapToggle();
  }

  requestSystemMapToggle(): void {
    this.input.triggerSystemMapToggle();
  }

  requestCycleTarget(): void {
    this.input.triggerCycleTargetEvent();
  }

  requestHail(): void {
    this.input.triggerHailRequest();
  }

  requestLand(): void {
    this.interaction.tryLandAtTarget();
  }

  requestScan(): void {
    this.input.triggerScanRequest();
  }

  requestEscape(): void {
    this.input.triggerEscapeEvent();
  }

  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const state = useGameState.getState();
    const uiMode = state.ui.mode;

    // Skip rendering entirely while the first system is loading
    if (uiMode === 'loading') {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    if (uiMode === 'flight') {
      this.updateFlight(dt, state);
    } else if (uiMode === 'hyperspace') {
      this.updateHyperspace(dt, state);
      this.jump.checkSafetyTimeout();
    }
    if (uiMode !== 'flight') {
      state.setCanDockNow(false);
      state.setCanLandNow(false);
      state.setCanScanNow(false);
      this.scanning.clear(state);
    }

    // Always update orbits
    const time = state.time;
    this.sceneRenderer.updateOrbits(time, dt);

    if (uiMode === 'docked' || uiMode === 'landing') {
      this.interaction.trackDockedStation();
    }
    state.tickTime(dt);

    this.sceneRenderer.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateFlight(dt: number, state: ReturnType<typeof useGameState.getState>): void {
    if (this.proximityEventCooldown > 0) {
      this.proximityEventCooldown = Math.max(0, this.proximityEventCooldown - dt);
    }

    const inp = this.input.read(state.invertControls);
    const { speed, fuelConsumed } = this.flightModel.update(
      dt,
      inp,
      this.sceneRenderer.shipGroup,
      state.player.fuel,
    );

    // Collision avoidance — push ship out of celestial bodies
    const collidables = this.sceneRenderer.getCollidables();
    const hitEntity = this.flightModel.resolveCollisions(this.sceneRenderer.shipGroup, collidables);
    if (hitEntity && !this.isDead) {
      this.triggerDeath(collisionDeathMessage(hitEntity.type));
      return;
    }

    const pos = this.sceneRenderer.shipGroup.position;
    state.setPlayerPosition({ x: pos.x, y: pos.y, z: pos.z });
    state.setPlayerSpeed(speed);
    state.setCanDockNow(this.interaction.canDockNow(speed));
    state.setCanLandNow(this.interaction.canLandNow(speed));
    state.setCanScanNow(this.scanning.canScanNow());
    state.setCanHailNow(this.interaction.canHailNow());
    this.scanning.tick(dt, state, pos);

    const boostFuelConsumed = INFINITE_FUEL_DEV ? 0 : fuelConsumed;
    this.hazards.tick(dt, state, pos, this.isDead, (msg) => this.triggerDeath(msg), boostFuelConsumed);

    this.tryProximityGameEvent(state, pos);

    this.jump.tickCountdown(dt, state);
  }

  completeLanding(choiceId: string): void {
    this.interaction.completeLanding(choiceId);
  }

  private toggleClusterMap(): void {
    const state = useGameState.getState();
    if (state.ui.mode === 'cluster_map') {
      state.setUIMode('flight');
    } else if (state.ui.mode === 'flight') {
      state.setUIMode('cluster_map');
    }
  }

  private toggleSystemMap(): void {
    const state = useGameState.getState();
    if (state.ui.mode === 'system_map') {
      state.setUIMode('flight');
    } else if (state.ui.mode === 'flight') {
      state.setUIMode('system_map');
    }
  }


  private tryProximityGameEvent(
    state: ReturnType<typeof useGameState.getState>,
    pos: THREE.Vector3,
  ): void {
    if (state.ui.mode !== 'flight' || this.proximityEventCooldown > 0 || state.pendingGameEvent) return;
    if (state.currentSystemId === FIRST_SYSTEM_ID) return;
    if (!state.currentSystemPayload) return;
    if (!this.shouldTriggerEvent(PROXIMITY_EVENT_CHANCE)) {
      this.proximityEventCooldown = PROXIMITY_EVENT_COOLDOWN_MISS;
      return;
    }

    let event: GameEvent | null = null;

    const star = this.sceneRenderer.getEntity('star');
    if (star) {
      const distanceToStar = pos.distanceTo(star.worldPos);
      if (distanceToStar <= star.collisionRadius + 140) {
        event = engineGetGameEvent(state.currentSystemId, {
          context: 'proximity_star',
        });
      }
    }

    if (!event) {
      for (const base of state.currentSystemPayload.system.secretBases) {
        const entity = this.sceneRenderer.getEntity(base.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        if (dist <= entity.collisionRadius + 180) {
          event = engineGetGameEvent(state.currentSystemId, {
            context: 'proximity_base',
          });
          if (event) break;
        }
      }
    }

    if (!event) {
      this.proximityEventCooldown = PROXIMITY_EVENT_COOLDOWN_MISS;
      return;
    }

    state.setPendingGameEvent({
      systemId: state.currentSystemId,
      civState: state.currentSystemPayload.civState,
      event,
      rootEventId: event.id,
      yearsSinceLastVisit: null,
      returnMode: 'flight',
    });
    state.setUIMode('landing');
    this.proximityEventCooldown = PROXIMITY_EVENT_COOLDOWN_HIT;
  }

  private triggerDeath(deathMessage: string[] | null = null): void {
    this.isDead = true;
    const state = useGameState.getState();
    state.setHyperspaceCountdown(0);
    state.setAlert(null);
    state.setDeathMessage(deathMessage);
    this.flightModel.reset(this.sceneRenderer.shipGroup.position);
    state.setUIMode('dead');
  }

  getShipSpatialState(): {
    position: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
    velocity: { x: number; y: number; z: number };
  } {
    const pos = this.sceneRenderer.shipGroup.position;
    const quat = this.sceneRenderer.shipGroup.quaternion;
    const vel = this.flightModel.getVelocity();
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
    };
  }

  loadSlotSave(data: SaveData): void {
    const state = useGameState.getState();
    state.applySaveData(data);
    state.setDeathMessage(null);
    state.setUIMode('loading');
    this.isDead = false;
    this.hazards.resetTimers();
    this.jump.resetOnNewGame();
    this.sceneRenderer.stopHyperspace();

    // Restore exact ship placement if the save includes spatial data
    const shipSpatial = data.shipPosition && data.shipQuaternion && data.shipVelocity
      ? { position: data.shipPosition, quaternion: data.shipQuaternion, velocity: data.shipVelocity }
      : undefined;

    // initFromEngine is async — sets UIMode to 'flight' when the scene is ready
    this.initFromEngine(useGameState.getState(), shipSpatial);
  }

  newGame(): void {
    const state = useGameState.getState();
    state.resetGame();
    state.setDeathMessage(null);
    this.isDead = false;
    this.hazards.resetTimers();
    this.jump.resetOnNewGame();
    this.sceneRenderer.stopHyperspace();
    // Re-initialize from Rust engine
    this.initFromEngine(useGameState.getState());
  }

  respawn(): void {
    const state = useGameState.getState();
    const snapshot = engineRespawn();
    state.syncPlayerStateFromEngine(snapshot);
    state.setDeathMessage(null);
    this.isDead = false;
    this.hazards.resetTimers();
    this.interaction.resetOnRespawn();

    // Teleport to safety near the main station before going docked
    const mainPlanetId = state.currentSystem?.mainStationPlanetId;
    if (mainPlanetId) {
      const stationEntity = this.sceneRenderer.getEntity(`station-${mainPlanetId}`);
      if (stationEntity) {
        const safeOffset = 200;
        this.sceneRenderer.shipGroup.position.set(
          stationEntity.worldPos.x + safeOffset,
          0,
          stationEntity.worldPos.z,
        );
        this.flightModel.reset(this.sceneRenderer.shipGroup.position);
      }
    }

    state.setUIMode('docked');
  }

  tradeWithNPC(action: 'buy' | 'sell', good: GoodName): void {
    this.interaction.tradeWithNPC(action, good);
  }

  dismissSystemEntryDialog(): void {
    const state = useGameState.getState();
    const dialog = state.pendingSystemEntryDialog;
    if (!dialog) return;
    if (dialog.showOnce) {
      state.markSystemDialogSeen(dialog.id);
      state.saveGame();
    }
    state.setPendingSystemEntryDialog(null);
  }

  completeComm(): void {
    this.interaction.completeComm();
  }

  private handleEscape(): void {
    const state = useGameState.getState();
    if (state.ui.mode === 'menu') {
      state.setUIMode('flight');
      return;
    }
    if (state.ui.mode === 'flight') {
      state.setUIMode('menu');
      return;
    }
    if (state.ui.mode === 'docked') {
      this.interaction.undock();
      return;
    }
    if (state.ui.mode === 'cluster_map' || state.ui.mode === 'system_map') {
      state.setUIMode('flight');
    }
  }

  private updateHyperspace(dt: number, _state: ReturnType<typeof useGameState.getState>): void {
    this.sceneRenderer.updateHyperspace(dt);
  }

  undock(): void {
    this.interaction.undock();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.sceneRenderer.dispose();
  }
}
