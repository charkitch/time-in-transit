import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { FlightModel } from '../flight/FlightModel';
import type { DockingSystem } from './DockingSystem';
import type { TargetingSystem } from './TargetingSystem';
import { useGameState } from '../GameState';
import { MARKET_GOODS } from '../constants';
import type { GoodName } from '../constants';
import {
  engineGetGameEvent, engineGetMarket, engineApplyChoiceEffect,
  engineTradeBuy, engineTradeSell,
  type GameEvent,
} from '../engine';
import { stationHostTypeToken } from '../archetypes';
import { STARTING_SYSTEM_ID } from '../constants';
import type { SystemId } from '../types';

const FIRST_SYSTEM_ID = STARTING_SYSTEM_ID;
const LAND_RANGE_PADDING_PLANET = 130;
const LAND_RANGE_PADDING_DYSON = 180;
const LAND_MAX_SPEED = 55;

export class InteractionSystem {
  private lastLandedSiteId: string | null = null;
  private dockedStationId: string | null = null;
  private dockedShipQuaternion = new THREE.Quaternion();
  private dockedApproachDir = new THREE.Vector3();
  hasUndocked = false;

  constructor(
    private sceneRenderer: SceneRenderer,
    private flightModel: FlightModel,
    private docking: DockingSystem,
    private targeting: TargetingSystem,
  ) {}

  canDockNow(speed: number): boolean {
    const pos = this.sceneRenderer.shipGroup.position;
    const entities = this.sceneRenderer.getAllEntities();
    const nearest = this.docking.findNearestStation(pos, entities);
    if (!nearest) return false;
    return this.docking.canDock(pos, nearest.pos, speed);
  }

  canLandNow(speed: number): boolean {
    if (speed > LAND_MAX_SPEED) return false;
    const state = useGameState.getState();
    const targetId = state.player.targetId;
    if (!targetId) return false;
    const entities = this.sceneRenderer.getAllEntities();
    const site = entities.get(targetId);
    if (!site || site.type !== 'landing_site' || !site.siteDiscovered) return false;
    const hostId = site.siteHostId;
    const host = hostId ? entities.get(hostId) : null;
    if (!host || (host.type !== 'planet' && host.type !== 'dyson_shell')) return false;
    const shipPos = this.sceneRenderer.shipGroup.position;
    const dist = shipPos.distanceTo(site.worldPos);
    const required = host.collisionRadius + (host.type === 'dyson_shell' ? LAND_RANGE_PADDING_DYSON : LAND_RANGE_PADDING_PLANET);
    return dist <= required;
  }

  canHailNow(): boolean {
    const state = useGameState.getState();
    const targetId = state.player.targetId;
    if (!targetId) return false;
    const entity = this.sceneRenderer.getAllEntities().get(targetId);
    return entity?.type === 'npc_ship';
  }

  tryInteract(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;
    const targetId = state.player.targetId;
    if (targetId) {
      const target = this.sceneRenderer.getAllEntities().get(targetId);
      if (target?.type === 'landing_site' && target.siteDiscovered) {
        this.tryLandAtTarget();
        return;
      }
    }
    this.tryDock();
  }

  tryLandAtTarget(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;
    if (state.pendingGameEvent) return;

    const targetId = state.player.targetId;
    if (!targetId) {
      state.setAlert('NO TARGET TO LAND');
      setTimeout(() => useGameState.getState().setAlert(null), 1400);
      return;
    }
    const site = this.sceneRenderer.getAllEntities().get(targetId);
    if (!site || site.type !== 'landing_site' || !site.siteDiscovered) {
      state.setAlert('TARGET A SCANNED LANDING SITE');
      setTimeout(() => useGameState.getState().setAlert(null), 1800);
      return;
    }
    const hostId = site.siteHostId;
    const host = hostId ? this.sceneRenderer.getAllEntities().get(hostId) : null;
    if (!host || (host.type !== 'planet' && host.type !== 'dyson_shell')) {
      state.setAlert('INVALID LANDING TARGET');
      setTimeout(() => useGameState.getState().setAlert(null), 1600);
      return;
    }

    const shipPos = this.sceneRenderer.shipGroup.position;
    const dist = shipPos.distanceTo(site.worldPos);
    const required = host.collisionRadius + (host.type === 'dyson_shell' ? LAND_RANGE_PADDING_DYSON : LAND_RANGE_PADDING_PLANET);
    if (dist > required) {
      state.setAlert('TOO FAR TO LAND');
      setTimeout(() => useGameState.getState().setAlert(null), 1600);
      return;
    }
    if (state.player.speed > LAND_MAX_SPEED) {
      state.setAlert('SPEED TOO HIGH TO LAND');
      setTimeout(() => useGameState.getState().setAlert(null), 1600);
      return;
    }

    const currentPayload = state.currentSystemPayload;
    if (!currentPayload) return;
    let event: GameEvent | null = null;
    if (host.type === 'planet') {
      const planet = currentPayload.system.planets.find((p) => p.id === host.id);
      event = engineGetGameEvent(state.currentSystemId, {
        context: 'planet_landing',
        surface: planet?.surfaceType,
        siteClass: site.siteClassification,
        hostType: 'planet',
      });
    } else {
      event = engineGetGameEvent(state.currentSystemId, {
        context: 'dyson_landing',
        siteClass: site.siteClassification,
        hostType: 'dyson_shell',
      });
    }

    this.lastLandedSiteId = targetId;
    state.setPendingGameEvent({
      systemId: state.currentSystemId,
      civState: currentPayload.civState,
      event,
      rootEventId: event?.id ?? null,
      yearsSinceLastVisit: null,
      returnMode: 'flight',
      landingSiteLabel: site.siteLabel ?? 'LANDING SITE',
      landingHostLabel: site.siteHostLabel ?? null,
    });
    state.setUIMode('landing');
  }

  completeLanding(choiceId: string): void {
    const state = useGameState.getState();
    const ctx = state.pendingGameEvent;
    if (!ctx) return;

    const { systemId, event, rootEventId, returnMode } = ctx;

    // Apply choice effect via Rust engine
    if (event) {
      const choice = event.choices.find(c => c.id === choiceId);
      if (choice) {
        const snapshot = engineApplyChoiceEffect(
          systemId,
          event.id,
          rootEventId ?? event.id,
          choice.effect,
        );
        state.syncPlayerStateFromEngine(snapshot);

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

    // Refresh market from engine (player state already synced)
    state.setCurrentSystemMarket(engineGetMarket(systemId));
    // Remove landing site after planet/dyson landing (returnMode 'flight')
    if (returnMode === 'flight' && this.lastLandedSiteId) {
      this.sceneRenderer.removeLandingSite(this.lastLandedSiteId);
      state.setTarget(null);
      this.lastLandedSiteId = null;
    }

    state.setPendingGameEvent(null);
    state.saveGame();
    state.setUIMode(returnMode);
  }

  trackDockedStation(): void {
    if (!this.dockedStationId) return;
    const entity = this.sceneRenderer.getAllEntities().get(this.dockedStationId);
    if (entity) {
      this.sceneRenderer.shipGroup.position.copy(entity.worldPos);
      this.sceneRenderer.shipGroup.quaternion.copy(this.dockedShipQuaternion);
    }
  }

  undock(): void {
    const state = useGameState.getState();
    state.setUIMode('flight');
    this.hasUndocked = true;

    // Snap ship to the station we docked at and eject outward
    const entities = this.sceneRenderer.getAllEntities();
    const shipPos = this.sceneRenderer.shipGroup.position;
    const station = this.dockedStationId ? entities.get(this.dockedStationId) : null;

    if (station) {
      shipPos.copy(station.worldPos);
      shipPos.addScaledVector(this.dockedApproachDir, 30);
    }

    this.flightModel.reset(shipPos);
    this.dockedStationId = null;
  }

  tryHail(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;

    // If current target is already an NPC ship, hail it directly
    let targetId = state.player.targetId;
    const currentEntity = targetId ? this.sceneRenderer.getAllEntities().get(targetId) : null;
    if (!targetId || !currentEntity || currentEntity.type !== 'npc_ship') {
      // Auto-find nearest NPC ship
      targetId = this.findNearestNPCShip();
      if (!targetId) return;
      this.targeting.setTargetAndRemember(targetId);
    }

    const npcState = this.sceneRenderer.getNPCShip(targetId);
    if (!npcState) return;

    const entity = this.sceneRenderer.getAllEntities().get(targetId)!;
    const dist = this.sceneRenderer.shipGroup.position.distanceTo(entity.worldPos);
    const bonusDemand = this.buildBonusDemandOffer(npcState.id);
    state.setPendingCommContext({
      npcId: npcState.id,
      npcName: npcState.name,
      originSystemName: npcState.originSystemName,
      npcArchetype: npcState.archetype,
      commLines: npcState.commLines,
      cargo: npcState.cargo,
      factionTag: npcState.factionTag,
      inTradeRange: dist <= npcState.tradeRange,
      bonusDemand,
    });
    state.setUIMode('comms');
  }

  tradeWithNPC(action: 'buy' | 'sell', good: GoodName): void {
    const state = useGameState.getState();
    const ctx = state.pendingCommContext;
    if (!ctx || !ctx.inTradeRange) return;
    const entry = ctx.cargo.find(c => c.good === good);

    try {
      if (action === 'buy') {
        if (!entry) return;
        const snapshot = engineTradeBuy(good, 1, entry.buyPrice);
        state.syncPlayerStateFromEngine(snapshot);
        state.saveGame();
      } else {
        const sellPrice =
          ctx.bonusDemand?.good === good
            ? ctx.bonusDemand.sellPrice
            : entry?.sellPrice;
        if (!sellPrice) return;
        if ((state.player.cargo[good] ?? 0) <= 0) return;
        const snapshot = engineTradeSell(good, 1, sellPrice);
        state.syncPlayerStateFromEngine(snapshot);
        state.saveGame();
      }
    } catch {
      // Insufficient credits or cargo hold full — silently ignore
    }
  }

  completeComm(): void {
    const state = useGameState.getState();
    state.setPendingCommContext(null);
    state.setUIMode('flight');
  }

  resetOnRespawn(): void {
    this.hasUndocked = false;
    this.lastLandedSiteId = null;
    this.dockedStationId = null;
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
      // Move ship to station and remember which station we docked at
      this.dockedStationId = nearest.id;
      this.dockedShipQuaternion.copy(this.sceneRenderer.shipGroup.quaternion);
      this.dockedApproachDir.subVectors(pos, nearest.pos).normalize();
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

  private prepareLanding(systemId: SystemId, stationId?: string): void {
    const state = useGameState.getState();
    if (state.pendingGameEvent) return;
    const lastYear = state.lastVisitYear[systemId] ?? null;
    const yearsSinceLastVisit = lastYear !== null ? state.galaxyYear - lastYear : null;

    // Get landing event from Rust engine (reads player state from ENGINE_STATE)
    const secretBase = state.currentSystem?.secretBases.find(b => b.id === stationId);
    const stationPlanetId = stationId?.startsWith('station-') ? stationId.slice('station-'.length) : null;
    const stationPlanet = stationPlanetId
      ? state.currentSystem?.planets.find((planet) => planet.id === stationPlanetId)
      : null;
    const hostType = stationPlanet?.stationArchetype ? stationHostTypeToken(stationPlanet.stationArchetype) : '';
    const event = systemId === FIRST_SYSTEM_ID
      ? null
      : engineGetGameEvent(
        systemId,
        {
          context: 'landing',
          secretBaseId: secretBase ? stationId : undefined,
          siteClass: secretBase ? 'secret_base' : 'station',
          hostType: secretBase ? secretBase.type : hostType,
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

  private buildBonusDemandOffer(npcId: string): { good: GoodName; sellPrice: number; label: string } | null {
    const state = useGameState.getState();
    const market = state.currentSystemPayload?.market ?? [];
    if (MARKET_GOODS.length === 0) return null;

    const seed = this.hashInt(`${state.currentSystemId}:${state.galaxyYear}:${npcId}`);
    const good = MARKET_GOODS[seed % MARKET_GOODS.length] as GoodName;
    const marketEntry = market.find((entry) => entry.good === good);
    const base = Math.max(1, marketEntry?.sellPrice ?? marketEntry?.buyPrice ?? 120);

    const roll = (seed >>> 9) % 100;
    let multiplier = 1.12;
    let label = 'FLEX DEMAND';
    if (roll < 18) {
      multiplier = 1.72;
      label = 'HOT BUYER';
    } else if (roll < 42) {
      multiplier = 1.45;
      label = 'HIGH DEMAND';
    } else if (roll < 70) {
      multiplier = 1.26;
      label = 'PRIORITY BUY';
    }

    return {
      good,
      sellPrice: Math.round(base * multiplier),
      label,
    };
  }

  private hashInt(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
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
}
