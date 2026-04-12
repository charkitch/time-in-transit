import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import { useGameState } from '../GameState';
import {
  FUEL_HARVEST,
  GAS_GIANT_SCOOP,
  COMBAT_INTELLIGENCE_GOOD,
  RELATIVISTIC_ASH_GOOD,
  PULSAR_SILK_GOOD,
  STAR_ATTRIBUTES,
  MAX_CARGO,
} from '../constants';
import type { GoodName } from '../constants';
import { BATTLE_DANGER_RANGE } from './FleetBattleSystem';
import {
  checkBattleZoneHazard,
  checkBlackHoleHazard,
  checkMicroquasarJetHazard,
  checkPulsarBeamHazard,
  checkProximityAlerts,
  checkXRayStreamHazard,
  type HazardEffect,
} from '../systems/flightHazards';
import { engineTickFlight, type FlightTickContext, type FlightTickResult, type HazardType, type CargoHarvest } from '../engine';
import type { SecretBaseType } from '../engine';

const XB_STREAM_HAZARD_RADIUS = 40;
const COMBAT_INTEL_INTERVAL = 8;
const BEAM_HARVEST_INTERVAL = 5;

const DEATH_MESSAGES: Partial<Record<HazardType, string[]>> = {
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
};

/** Pick the highest-priority hazard (the one that has shield damage, or first lethal). */
function pickActiveHazard(effects: HazardEffect[]): HazardType {
  for (const e of effects) {
    if (e.shieldDamageRate > 0) return e.hazardType;
  }
  return 'None';
}

export class FlightHazardSystem {
  private scoopingFuel = false;
  private gasGiantScoopingFuel = false;
  private harvestingFuel = false;
  combatIntelTimer = 0;
  private jetHarvestTimer = 0;
  private pulsarHarvestTimer = 0;

  constructor(private sceneRenderer: SceneRenderer) {}

  tick(
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
    pos: THREE.Vector3,
    isDead: boolean,
    onDeath: (msg: string[]) => void,
    boostFuelConsumed: number,
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

    // ── Hazard checks ──
    const cargoUsed = Object.values(state.player.cargo).reduce((sum, qty) => sum + (qty ?? 0), 0);

    const battleEffect = checkBattleZoneHazard({
      pos,
      battle: this.sceneRenderer.getFleetBattle(),
      battleDangerRange: BATTLE_DANGER_RANGE,
      cargoUsed,
      maxCargo: MAX_CARGO,
    });
    if (battleEffect.alert) {
      effects.push(battleEffect);
      // Combat intel harvesting timer
      if (battleEffect.zone === 'harvesting' && cargoUsed < MAX_CARGO) {
        this.combatIntelTimer += dt;
        while (this.combatIntelTimer >= COMBAT_INTEL_INTERVAL && cargoUsed + cargoHarvests.reduce((s, h) => s + h.qty, 0) < MAX_CARGO) {
          cargoHarvests.push({ good: COMBAT_INTELLIGENCE_GOOD, qty: 1 });
          this.combatIntelTimer -= COMBAT_INTEL_INTERVAL;
        }
      } else if (battleEffect.zone !== 'harvesting') {
        this.combatIntelTimer = 0;
      }
    } else {
      this.combatIntelTimer = 0;
    }

    const xrayEffect = checkXRayStreamHazard({
      pos,
      curve: this.sceneRenderer.getXRayStreamCurveBuffer(),
      hazardRadius: XB_STREAM_HAZARD_RADIUS,
    });
    if (xrayEffect.alert) effects.push(xrayEffect);

    const mqJet = this.sceneRenderer.getMicroquasarJetParams();
    if (mqJet) {
      const mqStarEntity = this.sceneRenderer.getEntity(mqJet.starEntityId);
      const jetEffect = checkMicroquasarJetHazard({
        pos,
        jetParams: mqJet,
        starWorldPos: mqStarEntity?.worldPos ?? null,
      });
      if (jetEffect.alert) effects.push(jetEffect);
      if (jetEffect.zone === 'scooping') {
        if (cargoUsed + cargoHarvests.reduce((s, h) => s + h.qty, 0) < MAX_CARGO) {
          this.jetHarvestTimer += dt;
          if (this.jetHarvestTimer >= BEAM_HARVEST_INTERVAL) {
            cargoHarvests.push({ good: RELATIVISTIC_ASH_GOOD, qty: 1 });
            this.jetHarvestTimer -= BEAM_HARVEST_INTERVAL;
          }
        }
      } else {
        this.jetHarvestTimer = 0;
      }
    }

    const pulsarBeam = this.sceneRenderer.getPulsarBeamParams();
    if (pulsarBeam) {
      const pulsarStarEntity = this.sceneRenderer.getEntity(pulsarBeam.starEntityId);
      const pulsarEffect = checkPulsarBeamHazard({
        pos,
        beamParams: pulsarBeam,
        starWorldPos: pulsarStarEntity?.worldPos ?? null,
        starRadius: pulsarStarEntity?.collisionRadius ?? 0,
      });
      if (pulsarEffect.alert) effects.push(pulsarEffect);
      if (pulsarEffect.zone === 'harvesting') {
        if (cargoUsed + cargoHarvests.reduce((s, h) => s + h.qty, 0) < MAX_CARGO) {
          this.pulsarHarvestTimer += dt;
          if (this.pulsarHarvestTimer >= BEAM_HARVEST_INTERVAL) {
            cargoHarvests.push({ good: PULSAR_SILK_GOOD, qty: 1 });
            this.pulsarHarvestTimer -= BEAM_HARVEST_INTERVAL;
          }
        }
      } else {
        this.pulsarHarvestTimer = 0;
      }
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
    const heatRate = effects.reduce((sum, e) => sum + e.heatRate, 0);
    const shieldDamageRate = effects.reduce((sum, e) => sum + e.shieldDamageRate, 0);
    const fuelRate = effects.reduce((sum, e) => sum + e.fuelRate, 0)
      + starScoopRate + gasGiantScoopRate + baseHarvestRate
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
      const msg = DEATH_MESSAGES[result.deathCause] ?? ['SHIP DESTROYED', 'Impact with stellar body.'];
      onDeath(msg);
    }
  }

  resetTimers(): void {
    this.combatIntelTimer = 0;
    this.jetHarvestTimer = 0;
    this.pulsarHarvestTimer = 0;
  }
}
