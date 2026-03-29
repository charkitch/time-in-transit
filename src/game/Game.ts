import * as THREE from 'three';
import { SceneRenderer } from './rendering/SceneRenderer';
import { FlightModel } from './flight/FlightModel';
import { InputSystem } from './input/InputSystem';
import { DockingSystem } from './mechanics/DockingSystem';
import { HyperspaceSystem } from './mechanics/HyperspaceSystem';
import { jumpYearsElapsed } from './mechanics/RelativisticTime';
import { getCivState } from './mechanics/CivilizationSystem';
import { getSystemFactionState, getFaction } from './mechanics/FactionSystem';
import { selectEvent, selectSecretBaseEvent } from './data/events';
import { generateSolarSystem } from './generation/SystemGenerator';
import { useGameState } from './GameState';
import type { SystemChoices } from './GameState';
import { HYPERSPACE } from './constants';
import type { GoodName } from './constants';
import type { ChoiceEffect } from './data/events';
import { MAX_CARGO } from './constants';

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
  private isDead = false;

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

    // Load save & initialize first system
    const state = useGameState.getState();
    state.loadSave();
    this.loadCurrentSystem();
  }

  private loadCurrentSystem(): void {
    const state = useGameState.getState();
    const starData = state.cluster[state.currentSystemId];
    const systemData = generateSolarSystem(starData);
    state.setCurrentSystem(state.currentSystemId, systemData);
    state.markVisited(state.currentSystemId);

    this.sceneRenderer.loadSystem(systemData, state.currentSystemId, state.galaxyYear, starData.name, starData);

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
      this.sceneRenderer.shipGroup.position.set(
        planetX + radialX * spawnDist,
        50,
        planetZ + radialZ * spawnDist,
      );
      this.sceneRenderer.shipGroup.rotation.set(0.1, Math.atan2(radialX, radialZ), 0);
    }

    this.flightModel.reset(this.sceneRenderer.shipGroup.position);
  }

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
      state.setShields(state.player.shields - 5 * dt);
      state.setAlert('COLLISION!');
      if (state.player.shields <= 0 && !this.isDead) {
        this.triggerDeath();
        return;
      }
    }

    const pos = this.sceneRenderer.shipGroup.position;
    state.setPlayerPosition({ x: pos.x, y: pos.y, z: pos.z });
    state.setPlayerSpeed(speed);

    // Fuel scooping near star
    const starEntity = this.sceneRenderer.getAllEntities().get('star');
    const starPos = starEntity?.worldPos ?? null;
    if (starPos && starEntity) {
      const distToStar = pos.distanceTo(starPos);
      const scoopRange = starEntity.collisionRadius + 200;
      if (distToStar < scoopRange) {
        const scoopRate = 0.3 * dt;
        state.setFuel(state.player.fuel + scoopRate);
        state.setHeat(state.player.heat + 15 * dt);
        this.scoopingFuel = true;
        state.setAlert('FUEL SCOOPING');
      } else {
        if (this.scoopingFuel) {
          this.scoopingFuel = false;
          state.setAlert(null);
        }
        if (state.player.heat > 0) {
          state.setHeat(state.player.heat - 10 * dt);
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

    if (!this.scoopingFuel && state.ui.hyperspaceCountdown === 0) {
      state.setAlert(null);
    }
  }

  private checkBattleZone(
    pos: THREE.Vector3,
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
  ): void {
    const battle = this.sceneRenderer.getFleetBattle();
    if (!battle) return;

    const dist = pos.distanceTo(battle.position);
    if (dist < battle.noGoRadius) {
      if (dist < 350) {
        // Danger zone — take damage
        state.setShields(state.player.shields - 20 * dt);
        state.setHeat(state.player.heat + 25 * dt);
        state.setAlert('TAKING FIRE — COMBAT ZONE');
        if (state.player.shields <= 0 && !this.isDead) {
          this.triggerDeath();
        }
      } else {
        // Warning zone
        state.setAlert('WARNING: ACTIVE COMBAT ZONE');
      }
    }
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
    const starData = state.cluster[systemId];
    const civState = getCivState(systemId, state.galaxyYear, starData.economy);
    const systemChoices = state.playerChoices[systemId];
    const lastYear = state.lastVisitYear[systemId] ?? null;
    const yearsSinceLastVisit = lastYear !== null ? state.galaxyYear - lastYear : null;

    const eventSeed = (state.galaxyYear * 31337 + systemId * 1009) >>> 0;

    // Check if docking at a secret base
    const secretBase = state.currentSystem?.secretBases.find(b => b.id === stationId);
    const event = secretBase
      ? selectSecretBaseEvent(secretBase.type, systemChoices, eventSeed)
      : selectEvent(civState, systemChoices, eventSeed);

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

    // Calculate years elapsed
    const dx = targetSys.x - currentSys.x;
    const dy = targetSys.y - currentSys.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const yearsElapsed = jumpYearsElapsed(dist);

    state.setFuel(state.player.fuel - cost);
    state.advanceGalaxyYear(yearsElapsed);
    state.addJumpLogEntry({
      fromSystemId: state.currentSystemId,
      toSystemId: targetId,
      yearsElapsed,
      galaxyYearAfter: state.galaxyYear + yearsElapsed, // state not yet updated, so add
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
    state.setHyperspaceTarget(null);
    state.setHyperspaceCountdown(0);
    this.hyperspaceActive = false;
    this.sceneRenderer.stopHyperspace();

    const starData = state.cluster[targetId];
    const systemData = generateSolarSystem(starData);
    state.setCurrentSystem(targetId, systemData);
    state.markVisited(targetId);

    this.sceneRenderer.loadSystem(systemData, targetId, state.galaxyYear, starData.name, starData);

    // Appear at system edge, facing inward toward star
    this.sceneRenderer.shipGroup.position.set(0, 0, 8000);
    this.sceneRenderer.shipGroup.rotation.set(0, 0, 0);
    this.flightModel.reset(this.sceneRenderer.shipGroup.position);
    this.flightModel.velocity.set(0, 0, -150);

    // ── Faction discovery & system entry text ──────────────────────────────
    this.buildSystemEntryText(targetId, starData, systemData, state);

    // Arrive in free flight
    state.setUIMode('flight');
  }

  private buildSystemEntryText(
    systemId: number,
    starData: { name: string; economy: import('./constants').EconomyType },
    systemData: import('./generation/SystemGenerator').SolarSystemData,
    state: ReturnType<typeof useGameState.getState>,
  ): void {
    const civState = getCivState(systemId, state.galaxyYear, starData.economy);
    const factionState = getSystemFactionState(systemId, state.galaxyYear, civState.politics);

    const controlFaction = getFaction(factionState.controllingFactionId);
    const contestFaction = factionState.contestingFactionId
      ? getFaction(factionState.contestingFactionId)
      : null;

    // Discover factions
    if (controlFaction) state.addKnownFaction(controlFaction.id);
    if (contestFaction) state.addKnownFaction(contestFaction.id);

    const lines: string[] = [];
    lines.push(`ENTERING ${starData.name.toUpperCase()}`);

    if (factionState.isContested && contestFaction && controlFaction) {
      lines.push(`CONTESTED — ${controlFaction.name.toUpperCase()} vs ${contestFaction.name.toUpperCase()}`);
    } else if (controlFaction) {
      lines.push(`CONTROLLED BY ${controlFaction.name.toUpperCase()}`);
    }

    // Battle detection
    const battle = this.sceneRenderer.getFleetBattle();
    if (battle) {
      const battlePlanet = systemData.planets.find(p => p.id === battle.planetId);
      const planetName = battlePlanet ? battlePlanet.id.replace(`${systemId}-`, '') : 'UNKNOWN';
      lines.push(`FLEET ENGAGEMENT DETECTED NEAR ${planetName.toUpperCase()}`);
    }

    // Secret base hints
    for (const base of systemData.secretBases) {
      switch (base.type) {
        case 'asteroid':
          lines.push('FAINT SIGNAL DETECTED IN ASTEROID BELT');
          break;
        case 'oort_cloud':
          lines.push('ANOMALOUS BEACON — EXTREME OUTER SYSTEM');
          break;
        case 'maximum_space':
          lines.push('UNKNOWN TRANSMISSION FROM BEYOND SYSTEM EDGE');
          break;
      }
    }

    // Check faction memory for changes
    const memory = state.factionMemory[systemId];
    if (memory) {
      const oldFaction = getFaction(memory.factionId);
      if (oldFaction && memory.factionId !== factionState.controllingFactionId) {
        lines.push(`LAST VISIT: YEAR ${memory.galaxyYear.toLocaleString()}. ${oldFaction.name.toUpperCase()} NO LONGER HOLDS THIS SYSTEM.`);
      }
    }

    state.setSystemEntryLines(lines);

    // Update faction memory
    state.setFactionMemory(systemId, {
      factionId: factionState.controllingFactionId,
      contestingFactionId: factionState.contestingFactionId,
      galaxyYear: state.galaxyYear,
    });
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
    this.hyperspaceActive = false;
    this.hyperspaceTimer = 0;
    this.sceneRenderer.stopHyperspace();
    this.loadCurrentSystem();
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
    // Move ship away from station
    this.sceneRenderer.shipGroup.position.z += 200;
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
    this.sceneRenderer.dispose();
  }
}
