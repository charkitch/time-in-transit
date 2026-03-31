import * as THREE from 'three';
import { SceneRenderer } from './rendering/SceneRenderer';
import { FlightModel } from './flight/FlightModel';
import { InputSystem } from './input/InputSystem';
import { DockingSystem } from './mechanics/DockingSystem';
import { HyperspaceSystem } from './mechanics/HyperspaceSystem';
import { BATTLE_DANGER_RANGE } from './mechanics/FleetBattleSystem';
import { useGameState } from './GameState';
import type { SystemChoices } from './GameState';
import {
  HYPERSPACE,
  FUEL_HARVEST,
  GAS_GIANT_SCOOP,
  COMBAT_INTELLIGENCE_GOOD,
} from './constants';
import type { GoodName } from './constants';
import { MAX_CARGO } from './constants';
import {
  initEngine, engineInitGame, engineJumpToSystem, engineGetLandingEvent, engineGetMarket,
  type WasmPlayerState, type ChoiceEffect, type SecretBaseType, type SystemPayload,
} from './engine';

const COMBAT_INTEL_INTERVAL = 8;

function buildWasmPlayerState(state: ReturnType<typeof useGameState.getState>): WasmPlayerState {
  // Convert Zustand state → WasmPlayerState for Rust JSON boundary
  const cargo: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.player.cargo)) {
    if (v) cargo[k] = v;
  }
  const cargoCostBasis: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.player.cargoCostBasis)) {
    if (v !== undefined) cargoCostBasis[k] = v;
  }
  const playerChoices: WasmPlayerState['playerChoices'] = {};
  for (const [k, v] of Object.entries(state.playerChoices)) {
    playerChoices[Number(k)] = {
      tradingReputation: v.tradingReputation,
      bannedGoods: v.bannedGoods,
      priceModifier: v.priceModifier,
      factionTag: v.factionTag,
      completedEventIds: v.completedEventIds,
    };
  }
  const factionMemory: WasmPlayerState['factionMemory'] = {};
  for (const [k, v] of Object.entries(state.factionMemory)) {
    factionMemory[Number(k)] = {
      factionId: v.factionId,
      contestingFactionId: v.contestingFactionId,
      galaxyYear: v.galaxyYear,
    };
  }
  return {
    credits: state.player.credits,
    cargo,
    cargoCostBasis,
    fuel: state.player.fuel,
    shields: state.player.shields,
    currentSystemId: state.currentSystemId,
    visitedSystems: Array.from(state.visitedSystems),
    galaxyYear: state.galaxyYear,
    playerChoices,
    lastVisitYear: { ...state.lastVisitYear },
    knownFactions: Array.from(state.knownFactions),
    factionMemory,
  };
}

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

  constructor(canvas: HTMLCanvasElement) {
    this.sceneRenderer = new SceneRenderer(canvas);
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
    this.engineReady = true;

    // Use system payload from Rust for first system
    const systemData = result.systemPayload.system;
    state.setCurrentSystemPayload(state.currentSystemId, result.systemPayload);
    state.markVisited(state.currentSystemId);
    state.setSystemEntryLines(result.systemPayload.systemEntryLines);

    // Discover factions from init payload
    const factionState = result.systemPayload.factionState;
    if (factionState.controllingFactionId) state.addKnownFaction(factionState.controllingFactionId);
    if (factionState.contestingFactionId) state.addKnownFaction(factionState.contestingFactionId);

    const starData = result.cluster[state.currentSystemId];
    this.sceneRenderer.loadSystem(
      systemData,
      state.currentSystemId,
      state.galaxyYear,
      starData.name,
      result.systemPayload.factionState,
    );

    // Place ship near the main station
    const mainPlanetId = systemData.mainStationPlanetId;
    const mainPlanet = systemData.planets.find(p => p.id === mainPlanetId);
    if (mainPlanet) {
      const angle = mainPlanet.orbitPhase;
      const planetX = Math.cos(angle) * mainPlanet.orbitRadius;
      const planetZ = Math.sin(angle) * mainPlanet.orbitRadius;
      const radialX = Math.cos(angle);
      const radialZ = Math.sin(angle);
      const spawnDist = mainPlanet.radius * 3 + 80;
      const lateralOffset = -10;
      this.sceneRenderer.shipGroup.position.set(
        planetX + radialX * spawnDist + radialZ * lateralOffset,
        0,
        planetZ + radialZ * spawnDist - radialX * lateralOffset,
      );
      this.sceneRenderer.shipGroup.rotation.set(0.1, Math.atan2(radialX, radialZ), 0);

      const stationEntity = this.sceneRenderer.getAllEntities().get(`station-${mainPlanetId}`);
      if (stationEntity) {
        stationEntity.orbitPhase = angle + Math.PI;
      }
    }

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

  private loop = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const state = useGameState.getState();
    const uiMode = state.ui.mode;

    if (uiMode === 'flight') {
      this.updateFlight(dt, state);
    } else if (uiMode === 'hyperspace') {
      this.updateHyperspace(dt, state);
    }

    // Always update orbits
    const time = state.time;
    this.sceneRenderer.updateOrbits(time, dt);
    state.tickTime(dt);

    this.sceneRenderer.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private updateFlight(dt: number, state: ReturnType<typeof useGameState.getState>): void {
    const inp = this.input.read();
    const { speed } = this.flightModel.update(
      dt,
      inp,
      this.sceneRenderer.shipGroup,
      state.player.fuel,
      (amount) => state.setFuel(state.player.fuel - amount),
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

    // Fuel scooping near star
    const starEntity = this.sceneRenderer.getAllEntities().get('star');
    const starPos = starEntity?.worldPos ?? null;
    let coolingAllowed = true;
    if (starPos && starEntity) {
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

    // Proximity alerts
    this.checkProximityAlerts(pos, state);

    // Battle zone danger
    this.checkBattleZone(pos, dt, state);

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

  private checkProximityAlerts(
    pos: THREE.Vector3,
    state: ReturnType<typeof useGameState.getState>
  ): void {
    if (this.scoopingFuel || this.gasGiantScoopingFuel || this.harvestingFuel) return;

    const entities = this.sceneRenderer.getAllEntities();
    for (const [, entity] of entities) {
      const alertDist = entity.collisionRadius > 0
        ? entity.collisionRadius * 1.5
        : 150;
      const dist = pos.distanceTo(entity.worldPos);
      if (dist < alertDist) {
        state.setAlert(`WARNING: ${entity.type.toUpperCase()} PROXIMITY`);
        return;
      }
    }

    if (!this.scoopingFuel && !this.gasGiantScoopingFuel && state.ui.hyperspaceCountdown === 0) {
      state.setAlert(null);
    }
  }

  private checkBattleZone(
    pos: THREE.Vector3,
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
  ): void {
    const battle = this.sceneRenderer.getFleetBattle();
    if (!battle) {
      this.combatIntelTimer = 0;
      return;
    }

    const dist = pos.distanceTo(battle.position);
    if (dist < battle.noGoRadius) {
      const gatheringIntel = this.collectCombatIntelligence(dt, state);
      if (dist < BATTLE_DANGER_RANGE) {
        // Danger zone — take damage
        state.setShields(state.player.shields - 20 * dt);
        state.setHeat(state.player.heat + 25 * dt);
        state.setAlert('TAKING FIRE — COMBAT ZONE');
        if (state.player.shields <= 0 && !this.isDead) {
          this.triggerDeath();
        }
      } else {
        state.setAlert(gatheringIntel ? 'COLLECTING COMBAT INTELLIGENCE' : 'WARNING: ACTIVE COMBAT ZONE');
      }
      return;
    }

    this.combatIntelTimer = 0;
  }

  private collectCombatIntelligence(
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
  ): boolean {
    let cargoUsed = Object.values(state.player.cargo).reduce((sum, qty) => sum + (qty ?? 0), 0);
    if (cargoUsed >= MAX_CARGO) {
      this.combatIntelTimer = 0;
      return false;
    }

    this.combatIntelTimer += dt;
    let collected = false;
    while (this.combatIntelTimer >= COMBAT_INTEL_INTERVAL && cargoUsed < MAX_CARGO) {
      state.addCargo(COMBAT_INTELLIGENCE_GOOD, 1, 0);
      this.combatIntelTimer -= COMBAT_INTEL_INTERVAL;
      cargoUsed++;
      collected = true;
    }

    if (cargoUsed >= MAX_CARGO) {
      this.combatIntelTimer = 0;
    }

    return collected || cargoUsed < MAX_CARGO;
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
    const event = engineGetLandingEvent(
      systemId,
      wasmState,
      secretBase ? stationId : undefined,
    );

    // Get civ state from the pending payload or request from engine
    // For simplicity, build a minimal civState from what we have
    const civState = state.currentSystemPayload?.civState;
    if (!civState) return;

    state.setPendingLandingEvent({ systemId, civState, event, yearsSinceLastVisit });
    state.setUIMode('landing');
  }

  /** Called from UI when the player picks a landing event choice. */
  completeLanding(choiceId: string): void {
    const state = useGameState.getState();
    const ctx = state.pendingLandingEvent;
    if (!ctx) return;

    const { systemId, event } = ctx;

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
        };
        state.recordPlayerChoice(systemId, event.id, partial);

        if (fx.creditsReward) state.addCredits(fx.creditsReward);
        if (fx.fuelReward) state.setFuel(state.player.fuel + fx.fuelReward);
      }
    }

    // Record this visit year
    state.recordVisitYear(systemId, state.galaxyYear);
    const refreshedState = useGameState.getState();
    refreshedState.setCurrentSystemMarket(
      engineGetMarket(systemId, buildWasmPlayerState(refreshedState)),
    );
    state.setPendingLandingEvent(null);
    state.saveGame();
    state.setUIMode('docked');
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
    const check = this.hyperspace.canJump(currentSys, targetSys, state.player.fuel);
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

    state.setFuel(state.player.fuel - cost);

    // Call Rust engine for the jump — computes years, simulates galaxy, generates system
    const wasmState = buildWasmPlayerState(state);
    const jumpResult = engineJumpToSystem(targetId, wasmState);

    // Store the system payload for use in arriveInSystem
    this.pendingSystemPayload = jumpResult.systemPayload;

    // Advance state from Rust results
    state.setClusterSummary(jumpResult.clusterSummary);
    state.setGalaxySimState(jumpResult.galaxySimState);
    state.advanceGalaxyYear(jumpResult.yearsElapsed);
    state.addJumpLogEntry({
      fromSystemId: state.currentSystemId,
      toSystemId: targetId,
      yearsElapsed: jumpResult.yearsElapsed,
      galaxyYearAfter: jumpResult.newGalaxyYear,
    });

    state.setUIMode('hyperspace');
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

    const systemData = payload.system;
    const starData = state.cluster[targetId];

    state.setCurrentSystemPayload(targetId, payload);
    state.markVisited(targetId);

    this.sceneRenderer.loadSystem(
      systemData,
      targetId,
      state.galaxyYear,
      starData.name,
      payload.factionState,
    );

    // Appear at system edge, facing inward toward star
    this.sceneRenderer.shipGroup.position.set(0, 0, 8000);
    this.sceneRenderer.shipGroup.rotation.set(0, 0, 0);
    this.flightModel.reset(this.sceneRenderer.shipGroup.position);
    this.flightModel.velocity.set(0, 0, -150);

    // Use entry lines from Rust (includes era transitions, faction info, secret base hints)
    const lines = [...payload.systemEntryLines];

    // Battle detection — added TS-side since fleet battles are a TS real-time system
    const battle = this.sceneRenderer.getFleetBattle();
    if (battle) {
      const battlePlanet = systemData.planets.find(p => p.id === battle.planetId);
      const planetName = battlePlanet ? battlePlanet.id.replace(`${targetId}-`, '') : 'UNKNOWN';
      lines.push(`FLEET ENGAGEMENT DETECTED NEAR ${planetName.toUpperCase()}`);
    }

    state.setSystemEntryLines(lines);

    // Discover factions from payload
    const factionState = payload.factionState;
    if (factionState.controllingFactionId) state.addKnownFaction(factionState.controllingFactionId);
    if (factionState.contestingFactionId) state.addKnownFaction(factionState.contestingFactionId);

    // Update faction memory
    state.setFactionMemory(targetId, {
      factionId: factionState.controllingFactionId,
      contestingFactionId: factionState.contestingFactionId,
      galaxyYear: state.galaxyYear,
    });

    // Arrive in free flight
    state.setUIMode('flight');
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
      }
    } else {
      if ((state.player.cargo[good] ?? 0) > 0) {
        state.addCredits(entry.sellPrice);
        state.removeCargo(good, 1);
      }
    }
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
