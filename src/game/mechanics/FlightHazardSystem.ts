import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { CollisionResult } from '../flight/FlightModel';
import { useGameState } from '../GameState';
import {
  FUEL_HARVEST,
  GAS_GIANT_SCOOP,
  STAR_SCOOP,
  COMBAT_INTELLIGENCE_GOOD,
  RELATIVISTIC_ASH_GOOD,
  PULSAR_SILK_GOOD,
  TRANSFER_PLASMA_GOOD,
  STAR_ATTRIBUTES,
} from '../constants';
import type { GoodName } from '../constants';
import { BATTLE_DANGER_RANGE } from './FleetBattleSystem';
import { ShipDamage } from './ShipDamage';
import { deathMessageFor } from './deathMessages';
import {
  runEntryHarvest,
  runTimedHarvest,
} from './hazardHarvest';
import {
  BOUNCE_DAMAGE,
  PULSAR_FRINGE_BURST,
  lethalCollisionSource,
  pulsarBeamBurst,
} from './damageProfiles';
import {
  alertEffect,
  checkBattleZoneHazard,
  checkBlackHoleHazard,
  checkMicroquasarJetHazard,
  checkPulsarSweepZone,
  checkProximityAlerts,
  checkXRayStreamHazard,
  type HazardEffect,
} from './flightHazards';
import { engineTickFlight, type FlightTickContext, type FlightTickResult, type CargoHarvest } from '../engine';
import type { SecretBaseType } from '../engine';

const XB_STREAM_HAZARD_RADIUS = 40;
const COMBAT_INTEL_INTERVAL = 8;
const RELATIVISTIC_ASH_HARVEST_INTERVAL = 1;
const TRANSFER_PLASMA_HARVEST_INTERVAL = 1;
const HARVEST_CAP_PER_GOOD = 5;
const COMBAT_INTELLIGENCE_INFO = 'COLLECTING COMBAT INTELLIGENCE FROM CROSSFIRE';
const RELATIVISTIC_ASH_INFO = 'COLLECTING RELATIVISTIC ASH FROM JET CORE';
const PULSAR_SILK_INFO = 'COLLECTING PULSAR SILK FROM BEAM SWEEP';
const TRANSFER_PLASMA_INFO = 'COLLECTING TRANSFER PLASMA FROM DONOR STREAM';

const _vec = new THREE.Vector3();

export class FlightHazardSystem {
  private scoopingFuel = false;
  private gasGiantScoopingFuel = false;
  private harvestingFuel = false;
  private insideTopopolis = false;
  combatIntelTimer = 0;
  private combatIntelActive = false;
  private combatIntelCollected = false;
  private jetHarvestTimer = 0;
  private jetHarvestActive = false;
  private jetHarvestCollected = false;
  private streamHarvestTimer = 0;
  private streamHarvestActive = false;
  private streamHarvestCollected = false;
  private pulsarInZone = false;
  private pulsarHarvestCollected = false;
  private pulsarLethalHit = false;
  private readonly damage = new ShipDamage();

  constructor(private sceneRenderer: SceneRenderer) {}

  tick(
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
    pos: THREE.Vector3,
    isDead: boolean,
    onDeath: (msg: string[]) => void,
    boostFuelConsumed: number,
    collision: CollisionResult | null,
  ): void {
    const effects: HazardEffect[] = [];
    const cargoHarvests: CargoHarvest[] = [];
    const addHazard = (effect: HazardEffect) => {
      effects.push(effect);
      if (effect.damage) this.damage.sustain(effect.damage);
    };

    // ── Fuel scooping near star ──
    const starEntity = this.sceneRenderer.getEntity('star');
    const starPos = starEntity?.worldPos ?? null;
    const starType = state.currentSystem?.starType;
    const starAttrs = starType ? STAR_ATTRIBUTES[starType] : null;
    let starScoopRate = 0;
    let scoopHeatRate = 0;

    if (starPos && starEntity && starAttrs?.stellarEffects) {
      const distToStar = pos.distanceTo(starPos);
      const scoopRange = starEntity.collisionRadius + STAR_SCOOP.rangePadding;
      if (distToStar < scoopRange) {
        starScoopRate = STAR_SCOOP.rate;
        scoopHeatRate = STAR_SCOOP.heatRate;
        effects.push(alertEffect(STAR_SCOOP.alert, 'scooping'));
        this.scoopingFuel = true;
        this.gasGiantScoopingFuel = false;
      } else {
        if (this.scoopingFuel) {
          this.scoopingFuel = false;
          state.setAlert(null);
        }
      }
    } else if (this.scoopingFuel) {
      this.scoopingFuel = false;
    }

    // ── Gas giant scooping ──
    let gasGiantScoopRate = 0;
    if (!this.scoopingFuel) {
      const planets = state.currentSystem?.planets ?? [];
      let scoopingGasGiant = false;
      for (const planet of planets) {
        if (planet.type !== 'gas_giant') continue;
        const entity = this.sceneRenderer.getEntity(planet.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        const scoopRange = entity.collisionRadius + GAS_GIANT_SCOOP.rangePadding;
        if (dist < scoopRange) {
          gasGiantScoopRate = GAS_GIANT_SCOOP.rate;
          scoopHeatRate = GAS_GIANT_SCOOP.heatRate;
          effects.push(alertEffect(GAS_GIANT_SCOOP.alert, 'scooping'));
          scoopingGasGiant = true;
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

    // ── Fuel harvesting near outer solar bases ──
    let baseHarvestRate = 0;
    if (!this.scoopingFuel && !this.gasGiantScoopingFuel) {
      const bases = state.currentSystem?.secretBases ?? [];
      let harvesting = false;
      for (const base of bases) {
        const entity = this.sceneRenderer.getEntity(base.id);
        if (!entity) continue;
        const dist = pos.distanceTo(entity.worldPos);
        if (dist < FUEL_HARVEST.range) {
          const baseType = base.type as SecretBaseType;
          baseHarvestRate = FUEL_HARVEST.rates[baseType];
          effects.push(alertEffect(FUEL_HARVEST.alerts[baseType], 'scooping'));
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

    // ── Topopolis interior — passive fuel regeneration ──
    let topopolisRegenRate = 0;
    {
      let inside = false;
      for (const [, entity] of this.sceneRenderer.getAllEntities()) {
        if (entity.type !== 'topopolis' || !entity.collisionSamplesWorld?.length) continue;
        const tubeR = entity.collisionSampleRadius ?? 0;
        if (tubeR <= 0) continue;
        let nearestDistSq = Infinity;
        for (const sample of entity.collisionSamplesWorld) {
          const d = _vec.copy(pos).sub(sample).lengthSq();
          if (d < nearestDistSq) nearestDistSq = d;
        }
        if (Math.sqrt(nearestDistSq) < tubeR * 0.9) {
          inside = true;
          break;
        }
      }
      if (inside) {
        topopolisRegenRate = 0.15;
      }
      this.insideTopopolis = inside;
    }

    // ── Hazard checks ──
    const cargo = state.player.cargo;
    const cargoUsed = Object.values(cargo).reduce((sum, qty) => sum + (qty ?? 0), 0);
    const canHarvest = (good: GoodName) =>
      cargoUsed + cargoHarvests.reduce((s, h) => s + h.qty, 0) < state.shipStats.maxCargo &&
      (cargo[good] ?? 0) + cargoHarvests.filter(h => h.good === good).reduce((s, h) => s + h.qty, 0) < HARVEST_CAP_PER_GOOD;
    let infoMessage: string | null = null;

    const battleEffect = checkBattleZoneHazard({
      pos,
      battle: this.sceneRenderer.getFleetBattle(),
      battleDangerRange: BATTLE_DANGER_RANGE,
    });
    addHazard(battleEffect);
    {
      const combatHarvest = runTimedHarvest({
        active: battleEffect.zone === 'lethal',
        wasActive: this.combatIntelActive,
        timer: this.combatIntelTimer + (battleEffect.zone === 'lethal' ? dt : 0),
        interval: COMBAT_INTEL_INTERVAL,
        good: COMBAT_INTELLIGENCE_GOOD,
        message: COMBAT_INTELLIGENCE_INFO,
        collectedThisPass: this.combatIntelCollected,
        cargoHarvests,
        canHarvest,
      });
      this.combatIntelActive = combatHarvest.active;
      this.combatIntelTimer = combatHarvest.timer;
      this.combatIntelCollected = combatHarvest.collectedThisPass;
      if (combatHarvest.infoMessage) infoMessage = combatHarvest.infoMessage;
    }

    const xrayEffect = checkXRayStreamHazard({
      pos,
      curve: this.sceneRenderer.getXRayStreamCurveBuffer(),
      hazardRadius: XB_STREAM_HAZARD_RADIUS,
    });
    addHazard(xrayEffect);
    {
      const streamHarvest = runTimedHarvest({
        active: xrayEffect.zone === 'lethal',
        wasActive: this.streamHarvestActive,
        timer: this.streamHarvestTimer + (xrayEffect.zone === 'lethal' ? dt : 0),
        interval: TRANSFER_PLASMA_HARVEST_INTERVAL,
        good: TRANSFER_PLASMA_GOOD,
        message: TRANSFER_PLASMA_INFO,
        collectedThisPass: this.streamHarvestCollected,
        cargoHarvests,
        canHarvest,
      });
      this.streamHarvestActive = streamHarvest.active;
      this.streamHarvestTimer = streamHarvest.timer;
      this.streamHarvestCollected = streamHarvest.collectedThisPass;
      if (streamHarvest.infoMessage) infoMessage = streamHarvest.infoMessage;
    }

    const mqJet = this.sceneRenderer.getMicroquasarJetParams();
    if (mqJet) {
      const mqStarEntity = this.sceneRenderer.getEntity(mqJet.starEntityId);
      const jetEffect = checkMicroquasarJetHazard({
        pos,
        jetParams: mqJet,
        starWorldPos: mqStarEntity?.worldPos ?? null,
      });
      addHazard(jetEffect);
      {
        const jetHarvest = runTimedHarvest({
          active: jetEffect.zone === 'lethal',
          wasActive: this.jetHarvestActive,
          timer: this.jetHarvestTimer + (jetEffect.zone === 'lethal' ? dt : 0),
          interval: RELATIVISTIC_ASH_HARVEST_INTERVAL,
          immediateOnEntry: true,
          good: RELATIVISTIC_ASH_GOOD,
          message: RELATIVISTIC_ASH_INFO,
          collectedThisPass: this.jetHarvestCollected,
          cargoHarvests,
          canHarvest,
        });
        this.jetHarvestActive = jetHarvest.active;
        this.jetHarvestTimer = jetHarvest.timer;
        this.jetHarvestCollected = jetHarvest.collectedThisPass;
        if (jetHarvest.infoMessage) infoMessage = jetHarvest.infoMessage;
      }
    } else {
      this.jetHarvestActive = false;
      this.jetHarvestTimer = 0;
      this.jetHarvestCollected = false;
    }

    const pulsarBeam = this.sceneRenderer.getPulsarBeamParams();
    if (pulsarBeam) {
      const pulsarStarEntity = this.sceneRenderer.getEntity(pulsarBeam.starEntityId);
      const starWorldPos = pulsarStarEntity?.worldPos;
      const starRadius = pulsarStarEntity?.collisionRadius ?? 0;

      if (starWorldPos) {
        const sweep = checkPulsarSweepZone({ pos, beamParams: pulsarBeam, starWorldPos, starRadius });
        const enteringSweep = sweep.zone !== null && !this.pulsarInZone;

        if (sweep.zone === 'lethal') {
          // Burst damage on entry — not continuous
          if (!this.pulsarLethalHit) {
            this.damage.burst(pulsarBeamBurst(sweep.proximityFactor));
            effects.push(alertEffect(
              sweep.proximityFactor > 0.5 ? 'PULSAR BEAM — LETHAL RADIATION' : 'PULSAR BEAM — HULL CRITICAL',
              'lethal',
            ));
            this.pulsarLethalHit = true;
          }
        } else {
          this.pulsarLethalHit = false;
        }

        if (sweep.zone === 'harvesting' && enteringSweep) {
          // Small burst when the sweep first catches the ship
          this.damage.burst(PULSAR_FRINGE_BURST);
          effects.push(alertEffect('WARNING: PULSAR BEAM PROXIMITY', 'harvesting'));
        }

        const pulsarHarvest = runEntryHarvest({
          active: sweep.zone !== null,
          wasActive: this.pulsarInZone,
          good: PULSAR_SILK_GOOD,
          message: PULSAR_SILK_INFO,
          collectedThisPass: this.pulsarHarvestCollected,
          cargoHarvests,
          canHarvest,
        });
        this.pulsarInZone = pulsarHarvest.active;
        this.pulsarHarvestCollected = pulsarHarvest.collectedThisPass;
        if (pulsarHarvest.infoMessage) infoMessage = pulsarHarvest.infoMessage;
      }
    } else {
      this.pulsarInZone = false;
      this.pulsarHarvestCollected = false;
    }

    if (starType === 'BH' || starType === 'MQ') {
      const bhStarEntity = this.sceneRenderer.getEntity('star');
      const bhEffect = checkBlackHoleHazard({
        pos,
        starWorldPos: bhStarEntity?.worldPos ?? null,
        starRadius: bhStarEntity?.collisionRadius ?? 0,
      });
      addHazard(bhEffect);
    }

    // ── Aggregate into FlightTickContext ──
    const isScooping = this.scoopingFuel || this.gasGiantScoopingFuel || this.harvestingFuel;
    if (collision) this.reportCollision(collision, effects);
    const fuelRate = effects.reduce((sum, e) => sum + e.fuelRate, 0)
      + starScoopRate + gasGiantScoopRate + baseHarvestRate + topopolisRegenRate
      - boostFuelConsumed / Math.max(dt, 0.001);

    const context: FlightTickContext = {
      dt,
      fuelRate,
      heatRate: scoopHeatRate,
      coolingActive: !isScooping,
      damage: this.damage.drain(),
      isDead: isDead,
      cargoHarvests,
    };

    // ── Call Rust ──
    const result: FlightTickResult = engineTickFlight(context);

    // ── Sync to Zustand ──
    state.setFuel(result.fuel);
    state.setHeat(result.heat);
    state.setShields(result.shields);
    state.setCargoFromEngine(result.cargo as Partial<Record<GoodName, number>>);

    // ── Apply best alert ──
    const bestAlert = effects.reduce<string | null>((best, e) => {
      if (!e.alert) return best;
      // Prefer hazard alerts over scooping alerts
      if (best && e.zone === 'scooping') return best;
      return e.alert;
    }, null);
    if (bestAlert) {
      state.setAlert(bestAlert);
    }
    state.setInfoMessage(infoMessage);

    // ── Proximity alerts (only when no hazard/scooping alerts active) ──
    if (!bestAlert) {
      checkProximityAlerts({
        pos,
        state,
        entities: this.sceneRenderer.getAllEntities(),
        scoopingFuel: this.scoopingFuel,
        gasGiantScoopingFuel: this.gasGiantScoopingFuel,
        harvestingFuel: this.harvestingFuel,
      });
    }

    // ── Death ──
    if (result.dead && result.deathCause) {
      onDeath(deathMessageFor(result.deathCause));
    }
  }

  private reportCollision(collision: CollisionResult, effects: HazardEffect[]): void {
    const { entity, lethal } = collision;
    if (lethal) {
      this.damage.destroy(lethalCollisionSource(entity.type));
      return;
    }
    const bounce = BOUNCE_DAMAGE[entity.type];
    if (!bounce) return;
    this.damage.impact(bounce);
    effects.push(alertEffect(bounce.alert, 'lethal'));
  }

  resetTimers(): void {
    this.combatIntelTimer = 0;
    this.combatIntelActive = false;
    this.combatIntelCollected = false;
    this.jetHarvestTimer = 0;
    this.jetHarvestActive = false;
    this.jetHarvestCollected = false;
    this.streamHarvestTimer = 0;
    this.streamHarvestActive = false;
    this.streamHarvestCollected = false;
    this.pulsarInZone = false;
    this.pulsarHarvestCollected = false;
    this.pulsarLethalHit = false;
  }
}
