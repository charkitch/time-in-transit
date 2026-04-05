import * as THREE from 'three';
import { SceneRenderer } from './rendering/SceneRenderer';
import { FlightModel } from './flight/FlightModel';
import { InputSystem } from './input/InputSystem';
import { DockingSystem } from './mechanics/DockingSystem';
import { HyperspaceSystem } from './mechanics/HyperspaceSystem';
import { BATTLE_DANGER_RANGE } from './mechanics/FleetBattleSystem';

const XB_STREAM_HAZARD_RADIUS = 40;
import { useGameState } from './GameState';
import type { SystemChoices } from './GameState';
import {
  HYPERSPACE,
  FUEL_HARVEST,
  GAS_GIANT_SCOOP,
  COMBAT_INTELLIGENCE_GOOD,
  STAR_ATTRIBUTES,
} from './constants';
import type { GoodName } from './constants';
import { MAX_CARGO } from './constants';
import {
  initEngine, engineInitGame, engineJumpToSystem, engineGetGameEvent, engineGetMarket,
  type ChoiceEffect, type GameEvent, type SecretBaseType, type SystemPayload,
} from './engine';
import {
  buildWasmPlayerState,
  discoverFactionsFromSystem,
  placeShipNearMainStation,
} from './systems/systemLoad';
import {
  applyBattleZoneEffects,
  checkProximityAlerts,
  checkXRayStreamHazard,
} from './systems/flightHazards';
import {
  applyJumpExecution,
  applySystemArrival,
} from './systems/jumpFlow';
import type { RuntimeProfile } from '../runtime/runtimeProfile';

const COMBAT_INTEL_INTERVAL = 8;
const INFINITE_FUEL_DEV = import.meta.env.DEV;
const FIRST_SYSTEM_ID = 0;
const SYSTEM_ENTRY_EVENT_CHANCE = 0.3;
const PROXIMITY_EVENT_CHANCE = 0.08;
const PROXIMITY_EVENT_COOLDOWN_HIT = 20;
const PROXIMITY_EVENT_COOLDOWN_MISS = 8;

export class Game {
  private sceneRenderer: SceneRenderer;
  private flightModel: FlightModel;
  private input: InputSystem;
  private docking: DockingSystem;
  private hyperspace: HyperspaceSystem;
  private rafId = 0;
  private lastTime = 0;
  private hyperspaceTimer = 0;
  private hyperspaceActive = false;
  private scoopingFuel = false;
  private gasGiantScoopingFuel = false;
  private harvestingFuel = false;
  private combatIntelTimer = 0;
  private isDead = false;
  private hasUndocked = false;
  private pendingSystemPayload: SystemPayload | null = null;
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
    this.hyperspace = new HyperspaceSystem();

    // Wire up one-shot input events
    this.input.onDockRequest(() => this.tryDock());
    this.input.onClusterMapToggle(() => this.toggleClusterMap());
    this.input.onSystemMapToggle(() => this.toggleSystemMap());
    this.input.onCycleTargetEvent(() => this.cycleTarget());
    this.input.onJumpRequestEvent(() => this.tryJump());
    this.input.onHailRequest(() => this.tryHail());
    this.input.onEscapeEvent(() => this.handleEscape());

    // Load save, then initialize engine and first system
    const state = useGameState.getState();
    state.loadSave();
    this.initFromEngine(state);
  }

  private async initFromEngine(state: ReturnType<typeof useGameState.getState>): Promise<void> {
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

    discoverFactionsFromSystem(state, result.systemPayload.factionState);

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

    placeShipNearMainStation(this.sceneRenderer, systemData);

    this.flightModel.reset(this.sceneRenderer.shipGroup.position);
  }

  // loadCurrentSystem removed — initialization now handled by initFromEngine

  start(): void {
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  /** Allows UI actions (e.g. map button) to trigger the same jump path as the J key. */
  requestJump(): void {
    this.tryJump();
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

  requestEscape(): void {
    this.input.triggerEscapeEvent();
  }

  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const state = useGameState.getState();
    if (INFINITE_FUEL_DEV && state.player.fuel < HYPERSPACE.tankSize) {
      state.setFuel(HYPERSPACE.tankSize);
    }
    const uiMode = state.ui.mode;

    if (uiMode === 'flight') {
      this.updateFlight(dt, state);
    } else if (uiMode === 'hyperspace') {
      this.updateHyperspace(dt, state);
    }
    if (uiMode !== 'flight') {
      state.setCanDockNow(false);
    }

    // Always update orbits
    const time = state.time;
    this.sceneRenderer.updateOrbits(time, dt);
    state.tickTime(dt);

    this.sceneRenderer.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateFlight(dt: number, state: ReturnType<typeof useGameState.getState>): void {
    if (this.proximityEventCooldown > 0) {
      this.proximityEventCooldown = Math.max(0, this.proximityEventCooldown - dt);
    }

    const inp = this.input.read(state.invertControls);
    const { speed } = this.flightModel.update(
      dt,
      inp,
      this.sceneRenderer.shipGroup,
      state.player.fuel,
      (amount) => {
        if (!INFINITE_FUEL_DEV) {
          state.setFuel(state.player.fuel - amount);
        }
      },
    );

    // Collision avoidance — push ship out of celestial bodies
    const collidables = this.sceneRenderer.getCollidables();
    const hit = this.flightModel.resolveCollisions(this.sceneRenderer.shipGroup, collidables);
    if (hit) {
      if (!this.isDead) {
        this.triggerDeath(['SHIP DESTROYED', 'Impact with stellar body']);
        return;
      }
    }

    const pos = this.sceneRenderer.shipGroup.position;
    state.setPlayerPosition({ x: pos.x, y: pos.y, z: pos.z });
    state.setPlayerSpeed(speed);
    state.setCanDockNow(this.canDockNow(speed));

    // Fuel scooping near star
    const starEntity = this.sceneRenderer.getAllEntities().get('star');
    const starPos = starEntity?.worldPos ?? null;
    const starType = state.currentSystem?.starType;
    const starAttrs = starType ? STAR_ATTRIBUTES[starType] : null;
    let coolingAllowed = true;
    if (starPos && starEntity) {
      if (starAttrs?.stellarEffects) {
        const distToStar = pos.distanceTo(starPos);
        const scoopRange = starEntity.collisionRadius + 200;
        if (distToStar < scoopRange) {
          const scoopRate = 0.3 * dt;
          state.setFuel(state.player.fuel + scoopRate);
          state.setHeat(state.player.heat + 15 * dt);
          this.scoopingFuel = true;
          this.gasGiantScoopingFuel = false;
          state.setAlert('FUEL SCOOPING');
          coolingAllowed = false;
        } else {
          if (this.scoopingFuel) {
            this.scoopingFuel = false;
            state.setAlert(null);
          }
        }
      } else if (this.scoopingFuel) {
        this.scoopingFuel = false;
      }

      // Overheat damage
      if (state.player.heat >= 100) {
        const newShields = state.player.shields - 20 * dt;
        state.setShields(newShields);
        if (newShields <= 0 && !this.isDead) {
          this.triggerDeath();
          return;
        }
        state.setAlert('OVERHEAT!');
      }
    }

    // Fuel scooping from gas giants
    if (!this.scoopingFuel) {
      const planets = state.currentSystem?.planets ?? [];
      let scoopingGasGiant = false;
      for (const planet of planets) {
        if (planet.type !== 'gas_giant') continue;
        const entity = this.sceneRenderer.getAllEntities().get(planet.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        const scoopRange = entity.collisionRadius + GAS_GIANT_SCOOP.rangePadding;
        if (dist < scoopRange) {
          state.setFuel(state.player.fuel + GAS_GIANT_SCOOP.rate * dt);
          state.setHeat(state.player.heat + GAS_GIANT_SCOOP.heatRate * dt);
          state.setAlert(GAS_GIANT_SCOOP.alert);
          scoopingGasGiant = true;
          coolingAllowed = false;
          break;
        }
      }
      if (this.gasGiantScoopingFuel && !scoopingGasGiant) {
        state.setAlert(null);
      }
      this.gasGiantScoopingFuel = scoopingGasGiant;
    } else {
      this.gasGiantScoopingFuel = false;
    }

    if (coolingAllowed && state.player.heat > 0) {
      state.setHeat(state.player.heat - 10 * dt);
    }

    // Fuel harvesting near outer solar bases
    if (!this.scoopingFuel && !this.gasGiantScoopingFuel) {
      const bases = state.currentSystem?.secretBases ?? [];
      let harvesting = false;
      for (const base of bases) {
        const entity = this.sceneRenderer.getAllEntities().get(base.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        if (dist < FUEL_HARVEST.range) {
          const baseType = base.type as SecretBaseType;
          const rate = FUEL_HARVEST.rates[baseType] * dt;
          state.setFuel(state.player.fuel + rate);
          state.setAlert(FUEL_HARVEST.alerts[baseType]);
          harvesting = true;
          break;
        }
      }
      if (this.harvestingFuel && !harvesting) {
        this.harvestingFuel = false;
        state.setAlert(null);
      }
      this.harvestingFuel = harvesting;
    }

    // Passive shield regen when cool
    if (state.player.heat < 50 && state.player.shields < 100 && !this.isDead) {
      state.setShields(state.player.shields + 5 * dt);
    }

    checkProximityAlerts({
      pos,
      state,
      entities: this.sceneRenderer.getAllEntities(),
      scoopingFuel: this.scoopingFuel,
      gasGiantScoopingFuel: this.gasGiantScoopingFuel,
      harvestingFuel: this.harvestingFuel,
    });

    this.combatIntelTimer = applyBattleZoneEffects({
      pos,
      dt,
      state,
      battle: this.sceneRenderer.getFleetBattle(),
      battleDangerRange: BATTLE_DANGER_RANGE,
      combatIntelTimer: this.combatIntelTimer,
      combatIntelInterval: COMBAT_INTEL_INTERVAL,
      maxCargo: MAX_CARGO,
      combatIntelGood: COMBAT_INTELLIGENCE_GOOD,
      isDead: this.isDead,
      onDeath: () => this.triggerDeath(),
    });

    checkXRayStreamHazard({
      pos,
      dt,
      state,
      curve: this.sceneRenderer.getXRayStreamCurveBuffer(),
      hazardRadius: XB_STREAM_HAZARD_RADIUS,
    });

    this.tryProximityGameEvent(state, pos);

    // Hyperspace countdown
    if (state.ui.hyperspaceCountdown > 0) {
      const remaining = state.ui.hyperspaceCountdown - dt;
      if (remaining <= 0) {
        state.setHyperspaceCountdown(0);
        this.executeJump();
      } else {
        state.setHyperspaceCountdown(remaining);
        state.setAlert(`JUMP IN ${Math.ceil(remaining)}s`);
      }
    }
  }

  private canDockNow(speed: number): boolean {
    const pos = this.sceneRenderer.shipGroup.position;
    const entities = this.sceneRenderer.getAllEntities();
    const nearest = this.docking.findNearestStation(pos, entities);
    if (!nearest) return false;
    return this.docking.canDock(pos, nearest.pos, speed);
  }

  private tryDock(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;
    

    const pos = this.sceneRenderer.shipGroup.position;
    const entities = this.sceneRenderer.getAllEntities();
    const nearest = this.docking.findNearestStation(pos, entities);

    if (!nearest) {
      state.setAlert('No station nearby');
      setTimeout(() => useGameState.getState().setAlert(null), 2000);
      return;
    }

    const canDock = this.docking.canDock(pos, nearest.pos, state.player.speed);
    if (canDock) {
      // Move ship to station
      this.sceneRenderer.shipGroup.position.copy(nearest.pos);
      this.flightModel.reset(nearest.pos);

      // Set up landing event then switch to landing mode
      this.prepareLanding(state.currentSystemId, nearest.id);
    } else {
      const reason = nearest.dist > 80 ? 'TOO FAR FROM STATION' : 'SPEED TOO HIGH';
      state.setAlert(reason);
      setTimeout(() => useGameState.getState().setAlert(null), 2000);
    }
  }

  private prepareLanding(systemId: number, stationId?: string): void {
    const state = useGameState.getState();
    const lastYear = state.lastVisitYear[systemId] ?? null;
    const yearsSinceLastVisit = lastYear !== null ? state.galaxyYear - lastYear : null;

    // Get landing event from Rust engine
    const wasmState = buildWasmPlayerState(state);
    const secretBase = state.currentSystem?.secretBases.find(b => b.id === stationId);
    const event = systemId === FIRST_SYSTEM_ID
      ? null
      : engineGetGameEvent(
        systemId,
        wasmState,
        {
          context: 'landing',
          secretBaseId: secretBase ? stationId : undefined,
        },
      );

    // Get civ state from the pending payload or request from engine
    // For simplicity, build a minimal civState from what we have
    const civState = state.currentSystemPayload?.civState;
    if (!civState) return;

    state.setPendingGameEvent({
      systemId,
      civState,
      event,
      rootEventId: event?.id ?? null,
      yearsSinceLastVisit,
      returnMode: 'docked',
    });
    state.setUIMode('landing');
  }

  /** Called from UI when the player picks a landing event choice. */
  completeLanding(choiceId: string): void {
    const state = useGameState.getState();
    const ctx = state.pendingGameEvent;
    if (!ctx) return;

    const { systemId, event, rootEventId, returnMode } = ctx;

    // Apply choice effect
    if (event) {
      const choice = event.choices.find(c => c.id === choiceId);
      if (choice) {
        const fx: ChoiceEffect = choice.effect;
        const partial: SystemChoices = {
          tradingReputation: fx.tradingReputation ?? 0,
          bannedGoods: (fx.bannedGoods ?? []) as GoodName[],
          priceModifier: fx.priceModifier ?? 1.0,
          factionTag: fx.factionTag ?? null,
          completedEventIds: [],
          flags: fx.setsFlags ?? [],
          firedTriggers: fx.fires ?? [],
        };
        state.recordPlayerChoice(systemId, rootEventId ?? event.id, partial);

        if (fx.creditsReward) state.addCredits(fx.creditsReward);
        if (fx.fuelReward) state.setFuel(state.player.fuel + fx.fuelReward);

        if (choice.nextMoment) {
          const followUp: GameEvent = {
            id: event.id,
            title: event.title,
            narrativeLines: choice.nextMoment.narrativeLines,
            choices: choice.nextMoment.choices,
            triggeredBy: null,
            triggeredOnly: false,
          };
          state.setPendingGameEvent({
            ...ctx,
            event: followUp,
            rootEventId: rootEventId ?? event.id,
          });
          state.saveGame();
          return;
        }
      }
    }

    // Record this visit year
    state.recordVisitYear(systemId, state.galaxyYear);
    const refreshedState = useGameState.getState();
    refreshedState.setCurrentSystemMarket(
      engineGetMarket(systemId, buildWasmPlayerState(refreshedState)),
    );
    state.setPendingGameEvent(null);
    state.saveGame();
    state.setUIMode(returnMode);
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

  private cycleTarget(): void {
    const state = useGameState.getState();
    const entities = this.sceneRenderer.getAllEntities();
    const ids = Array.from(entities.keys()).filter(id => id !== 'star');
    if (ids.length === 0) return;

    const currentIdx = ids.indexOf(state.player.targetId ?? '');
    const nextIdx = (currentIdx + 1) % ids.length;
    state.setTarget(ids[nextIdx]);
  }

  private tryJump(): void {
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
    const check = this.hyperspace.canJump(currentSys, targetSys, availableFuel);
    if (!check.ok) {
      state.setAlert(check.reason ?? 'Cannot jump');
      setTimeout(() => useGameState.getState().setAlert(null), 2000);
      return;
    }

    state.setHyperspaceCountdown(HYPERSPACE.countdown);
  }

  private executeJump(): void {
    const state = useGameState.getState();
    const targetId = state.ui.hyperspaceTarget;
    if (targetId === null) return;

    const currentSys = state.cluster[state.currentSystemId];
    const targetSys = state.cluster[targetId];
    const cost = this.hyperspace.jumpCost(currentSys, targetSys);

    const jumpResult = engineJumpToSystem(targetId, buildWasmPlayerState(state));
    this.pendingSystemPayload = applyJumpExecution({
      state,
      targetId,
      jumpCost: cost,
      infiniteFuelDev: INFINITE_FUEL_DEV,
      hyperspaceTankSize: HYPERSPACE.tankSize,
      jumpResult,
    });

    this.hyperspaceActive = true;
    this.hyperspaceTimer = HYPERSPACE.duration;
    this.sceneRenderer.startHyperspace();

    // Schedule arrival
    setTimeout(() => {
      this.arriveInSystem(targetId);
    }, HYPERSPACE.duration * 1000);
  }

  private arriveInSystem(targetId: number): void {
    const state = useGameState.getState();
    this.combatIntelTimer = 0;
    state.setHyperspaceTarget(null);
    state.setHyperspaceCountdown(0);
    this.hyperspaceActive = false;
    this.sceneRenderer.stopHyperspace();

    // Use system data from Rust jump result
    const payload = this.pendingSystemPayload;
    this.pendingSystemPayload = null;

    if (!payload) return;
    applySystemArrival({
      state,
      targetId,
      payload,
      sceneRenderer: this.sceneRenderer,
      flightModel: this.flightModel,
      discoverFactions: discoverFactionsFromSystem,
    });
    this.tryProximityGameEvent(state, this.sceneRenderer.shipGroup.position);
    const refreshed = useGameState.getState();
    if (
      targetId !== FIRST_SYSTEM_ID
      && !refreshed.pendingGameEvent
      && payload.gameEvent
      && this.shouldTriggerEvent(SYSTEM_ENTRY_EVENT_CHANCE)
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
    state.saveGame();
  }

  private tryProximityGameEvent(
    state: ReturnType<typeof useGameState.getState>,
    pos: THREE.Vector3,
  ): void {
    if (state.ui.mode !== 'flight' || this.proximityEventCooldown > 0) return;
    if (state.currentSystemId === FIRST_SYSTEM_ID) return;
    if (!state.currentSystemPayload) return;
    if (!this.shouldTriggerEvent(PROXIMITY_EVENT_CHANCE)) {
      this.proximityEventCooldown = PROXIMITY_EVENT_COOLDOWN_MISS;
      return;
    }

    const wasmState = buildWasmPlayerState(state);
    let event: GameEvent | null = null;

    const star = this.sceneRenderer.getAllEntities().get('star');
    if (star) {
      const distanceToStar = pos.distanceTo(star.worldPos);
      if (distanceToStar <= star.collisionRadius + 140) {
        event = engineGetGameEvent(state.currentSystemId, wasmState, {
          context: 'proximity_star',
        });
      }
    }

    if (!event) {
      for (const base of state.currentSystemPayload.system.secretBases) {
        const entity = this.sceneRenderer.getAllEntities().get(base.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        if (dist <= entity.collisionRadius + 180) {
          event = engineGetGameEvent(state.currentSystemId, wasmState, {
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

  newGame(): void {
    const state = useGameState.getState();
    state.resetGame();
    state.setDeathMessage(null);
    this.isDead = false;
    this.combatIntelTimer = 0;
    this.hyperspaceActive = false;
    this.hyperspaceTimer = 0;
    this.sceneRenderer.stopHyperspace();
    // Re-initialize from Rust engine
    this.initFromEngine(useGameState.getState());
  }

  respawn(): void {
    const state = useGameState.getState();
    // Insurance: lose 10% of credits (min 100 CR)
    const penalty = Math.max(100, Math.floor(state.player.credits * 0.1));
    state.addCredits(-penalty);
    state.setShields(100);
    state.setHeat(0);
    state.setDeathMessage(null);
    this.isDead = false;
    this.combatIntelTimer = 0;
    this.hasUndocked = false;

    // Teleport to safety near the main station before going docked
    const mainPlanetId = state.currentSystem?.mainStationPlanetId;
    if (mainPlanetId) {
      const stationEntity = this.sceneRenderer.getAllEntities().get(`station-${mainPlanetId}`);
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

  private tryHail(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;

    // If current target is already an NPC ship, hail it directly
    let targetId = state.player.targetId;
    const currentEntity = targetId ? this.sceneRenderer.getAllEntities().get(targetId) : null;
    if (!targetId || !currentEntity || currentEntity.type !== 'npc_ship') {
      // Auto-find nearest NPC ship
      targetId = this.findNearestNPCShip();
      if (!targetId) return;
      state.setTarget(targetId);
    }

    const npcState = this.sceneRenderer.getNPCShip(targetId);
    if (!npcState) return;

    const entity = this.sceneRenderer.getAllEntities().get(targetId)!;
    const dist = this.sceneRenderer.shipGroup.position.distanceTo(entity.worldPos);
    const TRADE_RANGE = 500;

    state.setPendingCommContext({
      npcId: npcState.id,
      npcName: npcState.name,
      originSystemName: npcState.originSystemName,
      commLines: npcState.commLines,
      cargo: npcState.cargo,
      factionTag: npcState.factionTag,
      inTradeRange: dist <= TRADE_RANGE,
    });
    state.setUIMode('comms');
  }

  private findNearestNPCShip(): string | null {
    const shipPos = this.sceneRenderer.shipGroup.position;
    const entities = this.sceneRenderer.getAllEntities();
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, entity] of entities) {
      if (entity.type !== 'npc_ship') continue;
      const dist = shipPos.distanceTo(entity.worldPos);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId;
  }

  tradeWithNPC(action: 'buy' | 'sell', good: GoodName): void {
    const state = useGameState.getState();
    const ctx = state.pendingCommContext;
    if (!ctx || !ctx.inTradeRange) return;
    const entry = ctx.cargo.find(c => c.good === good);
    if (!entry) return;

    if (action === 'buy') {
      const totalCargo = Object.values(state.player.cargo).reduce((a, b) => a + (b ?? 0), 0);
      if (state.player.credits >= entry.buyPrice && totalCargo < MAX_CARGO) {
        state.addCredits(-entry.buyPrice);
        state.addCargo(good, 1, entry.buyPrice);
        state.saveGame();
      }
    } else {
      if ((state.player.cargo[good] ?? 0) > 0) {
        state.addCredits(entry.sellPrice);
        state.removeCargo(good, 1);
        state.saveGame();
      }
    }
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
    const state = useGameState.getState();
    state.setPendingCommContext(null);
    state.setUIMode('flight');
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
      this.undock();
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
    const state = useGameState.getState();
    state.setUIMode('flight');
    this.hasUndocked = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.sceneRenderer.dispose();
  }
}
