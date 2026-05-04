import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { SceneEntity } from '../rendering/scene/types';
import { useGameState } from '../GameState';
import {
  FUEL_HARVEST,
  GAS_GIANT_SCOOP,
  COMBAT_INTELLIGENCE_GOOD,
  RELATIVISTIC_ASH_GOOD,
  PULSAR_SILK_GOOD,
  TRANSFER_PLASMA_GOOD,
  STAR_ATTRIBUTES,
} from '../constants';
import type { GoodName } from '../constants';
import { BATTLE_DANGER_RANGE } from './FleetBattleSystem';
import {
  checkBattleZoneHazard,
  checkBlackHoleHazard,
  checkMicroquasarJetHazard,
  checkPulsarSweepZone,
  checkProximityAlerts,
  checkXRayStreamHazard,
  type HazardEffect,
} from '../systems/flightHazards';
import { engineTickFlight, type FlightTickContext, type FlightTickResult, type HazardType, type CargoHarvest } from '../engine';
import type { SecretBaseType } from '../engine';

const XB_STREAM_HAZARD_RADIUS = 40;
const COMBAT_INTEL_INTERVAL = 8;
const RELATIVISTIC_ASH_HARVEST_INTERVAL = 1;
const TRANSFER_PLASMA_HARVEST_INTERVAL = 1;
const HARVEST_CAP_PER_GOOD = 5;
const COMBAT_INTELLIGENCE_INFO = 'COLLECTING COMBAT INTELLIGENCE FROM CROSSFIRE';
const RELATIVISTIC_ASH_INFO = 'COLLECTING RELATIVISTIC ASH FROM JET CORE';
const PULSAR_SILK_INFO = 'COLLECTING PULSAR SILK FROM BEAM CORE';
const TRANSFER_PLASMA_INFO = 'COLLECTING TRANSFER PLASMA FROM DONOR STREAM';
// Pulsar burst damage per sweep (flat amounts, not per-second rates)
const PULSAR_LETHAL_SHIELD_BURST = [30, 80] as const; // [min, max] — proximity-scaled
const PULSAR_LETHAL_HEAT_BURST = [25, 50] as const;
const PULSAR_HARVEST_SHIELD_BURST = 3;
const PULSAR_HARVEST_HEAT_BURST = 5;

// Only collidable body types — npc_ship, fleet_ship, landing_site can't collide
export const COLLISION_HAZARD_MAP: Partial<Record<SceneEntity['type'], HazardType>> = {
  star: 'StarCollision',
  planet: 'PlanetCollision',
  moon: 'MoonCollision',
  dyson_shell: 'DysonShellCollision',
  topopolis: 'TopopolisCollision',
};

export const DEFAULT_DEATH = ['SHIP DESTROYED', 'Impact with stellar body.'];

export const DEATH_MESSAGES: Partial<Record<HazardType, string[]>> = {
  Overheat: ['THERMAL FAILURE', 'Reactor overheat destroyed primary systems.', 'Emergency coolant exhausted.'],
  MicroquasarJet: ['RELATIVISTIC JET', 'Ship vaporized by relativistic plasma outflow.', 'No wreckage recovered.'],
  PulsarBeam: ['RADIATION EXPOSURE', 'Sustained pulsar radiation overwhelmed shields.', 'Hull breach across all decks.'],
  BlackHole: ['EVENT HORIZON', 'Crossed the point of no return.', 'Ship crushed by tidal forces.'],
  TidalDisruption: ['TIDAL DISRUPTION', 'Gravitational shear exceeded structural limits.', 'Hull torn apart.'],
  BattleZone: ['COMBAT CASUALTY', 'Destroyed by crossfire in active battle zone.', 'Escape pods deployed.'],
  XRayStream: ['X-RAY EXPOSURE', 'X-ray transfer stream overwhelmed shielding.', 'Hull compromised.'],
  StarCollision: ['STELLAR IMPACT', 'Ship incinerated on approach to stellar surface.', 'No wreckage found.'],
  PlanetCollision: ['PLANETARY IMPACT', 'Uncontrolled descent into planetary body.', 'Crash site detected on surface.'],
  MoonCollision: ['LUNAR IMPACT', 'Collision with lunar surface at terminal velocity.', 'Debris field detected in low orbit.'],
  StationCollision: ['STATION COLLISION', 'Hull breached on impact with orbital structure.', 'Station authorities notified.'],
  DysonShellCollision: ['SHELL IMPACT', 'Ship destroyed on collision with Dyson shell.', 'Wreckage embedded in superstructure.'],
  TopopolisCollision: ['TOPOPOLIS IMPACT', 'Ship destroyed on collision with topopolis hull.', 'Wreckage scattered across habitat surface.'],
};

/** Pick the highest-priority hazard (the one that has shield damage, or first lethal). */
function pickActiveHazard(effects: HazardEffect[]): HazardType {
  for (const e of effects) {
    if (e.shieldDamageRate > 0) return e.hazardType;
  }
  for (const e of effects) {
    if (e.heatRate > 0 && e.hazardType !== 'None') return e.hazardType;
  }
  return 'None';
}

const _vec = new THREE.Vector3();

interface TimedHarvestParams {
  active: boolean;
  wasActive: boolean;
  timer: number;
  interval: number;
  immediateOnEntry?: boolean;
  good: GoodName;
  message: string;
  collectedThisPass: boolean;
  cargoHarvests: CargoHarvest[];
  canHarvest: (good: GoodName) => boolean;
}

interface TimedHarvestResult {
  active: boolean;
  timer: number;
  collectedThisPass: boolean;
  infoMessage: string | null;
}

function runTimedHarvest(params: TimedHarvestParams): TimedHarvestResult {
  const {
    active, wasActive, interval, immediateOnEntry = false,
    good, message, cargoHarvests, canHarvest,
  } = params;
  let { timer, collectedThisPass } = params;

  if (!active) {
    return {
      active: false,
      timer: 0,
      collectedThisPass: false,
      infoMessage: null,
    };
  }

  const entering = !wasActive;
  if (entering && immediateOnEntry && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    collectedThisPass = true;
  }

  timer += 0;
  while (timer >= interval && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    timer -= interval;
    collectedThisPass = true;
  }

  return {
    active: true,
    timer,
    collectedThisPass,
    infoMessage: collectedThisPass ? message : null,
  };
}

function runEntryHarvest(params: {
  active: boolean;
  wasActive: boolean;
  good: GoodName;
  message: string;
  collectedThisPass: boolean;
  cargoHarvests: CargoHarvest[];
  canHarvest: (good: GoodName) => boolean;
}): { active: boolean; collectedThisPass: boolean; infoMessage: string | null } {
  const { active, wasActive, good, message, cargoHarvests, canHarvest } = params;
  let { collectedThisPass } = params;

  if (!active) {
    return { active: false, collectedThisPass: false, infoMessage: null };
  }

  if (!wasActive && canHarvest(good)) {
    cargoHarvests.push({ good, qty: 1 });
    collectedThisPass = true;
  }

  return {
    active: true,
    collectedThisPass,
    infoMessage: collectedThisPass ? message : null,
  };
}

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

  constructor(private sceneRenderer: SceneRenderer) {}

  tick(
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
    pos: THREE.Vector3,
    isDead: boolean,
    onDeath: (msg: string[]) => void,
    boostFuelConsumed: number,
    collisionShieldDamage = 0,
    collisionHeatDamage = 0,
    collisionAlert = 'TOPOPOLIS WALL IMPACT',
    collisionHazardType: HazardType = 'TopopolisCollision',
  ): void {
    const effects: HazardEffect[] = [];
    const cargoHarvests: CargoHarvest[] = [];

    // ── Fuel scooping near star ──
    const starEntity = this.sceneRenderer.getEntity('star');
    const starPos = starEntity?.worldPos ?? null;
    const starType = state.currentSystem?.starType;
    const starAttrs = starType ? STAR_ATTRIBUTES[starType] : null;
    let starScoopRate = 0;

    if (starPos && starEntity && starAttrs?.stellarEffects) {
      const distToStar = pos.distanceTo(starPos);
      const scoopRange = starEntity.collisionRadius + 200;
      if (distToStar < scoopRange) {
        starScoopRate = 0.3;
        effects.push({
          heatRate: 15,
          shieldDamageRate: 0,
          fuelRate: 0,
          alert: 'FUEL SCOOPING',
          hazardType: 'None',
          zone: 'scooping',
        });
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
          effects.push({
            heatRate: GAS_GIANT_SCOOP.heatRate,
            shieldDamageRate: 0,
            fuelRate: 0,
            alert: GAS_GIANT_SCOOP.alert,
            hazardType: 'None',
            zone: 'scooping',
          });
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
          effects.push({
            heatRate: 0,
            shieldDamageRate: 0,
            fuelRate: 0,
            alert: FUEL_HARVEST.alerts[baseType],
            hazardType: 'None',
            zone: 'scooping',
          });
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
    if (battleEffect.alert) {
      effects.push(battleEffect);
    }
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
    if (xrayEffect.alert) effects.push(xrayEffect);
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
      if (jetEffect.alert) effects.push(jetEffect);
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

        if (sweep.zone === 'lethal') {
          // Burst damage on entry — not continuous
          if (!this.pulsarLethalHit) {
            const f = sweep.proximityFactor;
            const shieldBurst = (PULSAR_LETHAL_SHIELD_BURST[0] + (PULSAR_LETHAL_SHIELD_BURST[1] - PULSAR_LETHAL_SHIELD_BURST[0]) * f);
            const heatBurst = (PULSAR_LETHAL_HEAT_BURST[0] + (PULSAR_LETHAL_HEAT_BURST[1] - PULSAR_LETHAL_HEAT_BURST[0]) * f);
            effects.push({
              heatRate: heatBurst / dt,
              shieldDamageRate: shieldBurst / dt,
              fuelRate: 0,
              alert: f > 0.5 ? 'PULSAR BEAM — LETHAL RADIATION' : 'PULSAR BEAM — HULL CRITICAL',
              hazardType: 'PulsarBeam',
              zone: 'lethal',
            });
            this.pulsarLethalHit = true;
          }
        } else {
          this.pulsarLethalHit = false;
        }

        const pulsarHarvest = runEntryHarvest({
          active: sweep.zone === 'lethal',
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

        if (sweep.zone === 'harvesting') {
          // Near-beam warning band remains dangerous but non-harvestable.
          if (!this.pulsarInZone) {
            effects.push({
              heatRate: PULSAR_HARVEST_HEAT_BURST / dt,
              shieldDamageRate: PULSAR_HARVEST_SHIELD_BURST / dt,
              fuelRate: 0,
              alert: 'WARNING: PULSAR BEAM PROXIMITY',
              hazardType: 'PulsarBeam',
              zone: 'harvesting',
            });
          }
        } else if (sweep.zone !== 'lethal') {
          this.pulsarInZone = false;
          this.pulsarHarvestCollected = false;
        }
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
      if (bhEffect.alert) effects.push(bhEffect);
    }

    // ── Aggregate into FlightTickContext ──
    const isScooping = this.scoopingFuel || this.gasGiantScoopingFuel || this.harvestingFuel;
    if (collisionShieldDamage > 0 || collisionHeatDamage > 0) {
      effects.push({
        heatRate: collisionHeatDamage / Math.max(dt, 0.001),
        shieldDamageRate: collisionShieldDamage / Math.max(dt, 0.001),
        fuelRate: 0,
        alert: collisionAlert,
        hazardType: collisionHazardType,
        zone: 'lethal',
      });
    }
    const heatRate = effects.reduce((sum, e) => sum + e.heatRate, 0);
    const shieldDamageRate = effects.reduce((sum, e) => sum + e.shieldDamageRate, 0);
    const fuelRate = effects.reduce((sum, e) => sum + e.fuelRate, 0)
      + starScoopRate + gasGiantScoopRate + baseHarvestRate + topopolisRegenRate
      - boostFuelConsumed / Math.max(dt, 0.001);
    const coolingActive = heatRate === 0 && !isScooping;
    const activeHazard = pickActiveHazard(effects);

    const context: FlightTickContext = {
      dt,
      fuelRate,
      heatRate,
      coolingActive,
      shieldDamageRate,
      activeHazard,
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
      const msg = DEATH_MESSAGES[result.deathCause] ?? DEFAULT_DEATH;
      onDeath(msg);
    }
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
