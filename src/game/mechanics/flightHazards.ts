import * as THREE from 'three';
import type { FleetBattle } from './FleetBattleSystem';
import type { SceneEntity } from '../rendering/SceneRenderer';
import { useGameState } from '../GameState';
import { HAZARD_DAMAGE } from './damageProfiles';
import type { SustainedDamage } from './ShipDamage';

export interface HazardEffect {
  fuelRate: number;
  alert: string | null;
  zone: 'scooping' | 'harvesting' | 'lethal' | null;
  damage: SustainedDamage | null;
}

const EMPTY_EFFECT: HazardEffect = {
  fuelRate: 0,
  alert: null,
  zone: null,
  damage: null,
};

/** An alert with no sustained damage of its own — for scooping, and for damage reported as a burst or impact. */
export function alertEffect(alert: string, zone: HazardEffect['zone']): HazardEffect {
  return { ...EMPTY_EFFECT, alert, zone };
}

function proximityAlertLabel(entity: SceneEntity): string {
  switch (entity.type) {
    case 'landing_site':
      return 'LANDING SITE IN RANGE';
    case 'dyson_shell':
      return 'PROXIMITY ALERT: DYSON SHELL';
    case 'topopolis':
      return 'PROXIMITY ALERT: TOPOPOLIS';
    case 'station':
      return 'PROXIMITY ALERT: STATION';
    case 'npc_ship':
    case 'fleet_ship':
      return 'PROXIMITY ALERT: VESSEL';
    case 'planet':
      return 'PROXIMITY ALERT: PLANETARY BODY';
    case 'moon':
      return 'PROXIMITY ALERT: LUNAR BODY';
    case 'star':
      return 'PROXIMITY ALERT: STELLAR BODY';
    default:
      return 'PROXIMITY ALERT';
  }
}

export function checkProximityAlerts(params: {
  pos: THREE.Vector3;
  state: ReturnType<typeof useGameState.getState>;
  entities: Map<string, SceneEntity>;
  scoopingFuel: boolean;
  gasGiantScoopingFuel: boolean;
  harvestingFuel: boolean;
}): void {
  const {
    pos,
    state,
    entities,
    scoopingFuel,
    gasGiantScoopingFuel,
    harvestingFuel,
  } = params;

  if (scoopingFuel || gasGiantScoopingFuel || harvestingFuel) return;

  for (const [, entity] of entities) {
    if (entity.type === 'landing_site') {
      if (!entity.siteDiscovered || !state.ui.canLandNow) continue;
      state.setAlert(proximityAlertLabel(entity));
      return;
    }
    const alertDist = entity.collisionRadius > 0
      ? entity.collisionRadius * 1.5
      : 150;
    const dist = pos.distanceTo(entity.worldPos);
    if (dist < alertDist) {
      state.setAlert(proximityAlertLabel(entity));
      return;
    }
  }

  if (!scoopingFuel && !gasGiantScoopingFuel && state.ui.hyperspaceCountdown === 0) {
    state.setAlert(null);
  }
}

export function checkXRayStreamHazard(params: {
  pos: THREE.Vector3;
  curve: Float32Array | null;
  hazardRadius: number;
}): HazardEffect {
  const { pos, curve, hazardRadius } = params;
  if (!curve) return EMPTY_EFFECT;

  const pointCount = curve.length / 3;
  let minDistSq = Infinity;

  for (let i = 0; i < pointCount - 1; i++) {
    const ax = curve[i * 3];
    const ay = curve[i * 3 + 1];
    const az = curve[i * 3 + 2];
    const bx = curve[(i + 1) * 3];
    const by = curve[(i + 1) * 3 + 1];
    const bz = curve[(i + 1) * 3 + 2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const abLenSq = abx * abx + aby * aby + abz * abz;
    if (abLenSq < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((pos.x - ax) * abx + (pos.y - ay) * aby + (pos.z - az) * abz) / abLenSq));
    const dx = pos.x - (ax + t * abx);
    const dy = pos.y - (ay + t * aby);
    const dz = pos.z - (az + t * abz);
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq < minDistSq) minDistSq = dSq;
  }

  const warningRadius = hazardRadius * 3;
  const minDist = Math.sqrt(minDistSq);

  if (minDist < hazardRadius) {
    return {
      fuelRate: 0,
      alert: 'WARNING: X-RAY TRANSFER STREAM',
      zone: 'lethal',
      damage: HAZARD_DAMAGE.xRayStream,
    };
  } else if (minDist < warningRadius) {
    return { ...EMPTY_EFFECT, alert: 'CAUTION: X-RAY STREAM NEARBY' };
  }
  return EMPTY_EFFECT;
}

type ConeBeamZone = 'inside' | 'warning' | null;

function checkConeBeamZone(params: {
  pos: THREE.Vector3;
  beamParams: { axis: THREE.Vector3; halfAngle: number; length: number };
  origin: THREE.Vector3;
  warningMul: number;
}): { zone: ConeBeamZone; dist: number } {
  const { pos, beamParams, origin, warningMul } = params;
  const toShip = pos.clone().sub(origin);
  const alongAxis = toShip.dot(beamParams.axis);

  if (Math.abs(alongAxis) > beamParams.length) return { zone: null, dist: Infinity };

  const perpDistSq = toShip.lengthSq() - alongAxis * alongAxis;
  const perpDist = Math.sqrt(perpDistSq);
  const coneRadius = Math.abs(alongAxis) * Math.tan(beamParams.halfAngle);
  const warningRadius = coneRadius * warningMul;

  if (perpDist < coneRadius) return { zone: 'inside', dist: toShip.length() };
  if (perpDist < warningRadius) return { zone: 'warning', dist: toShip.length() };
  return { zone: null, dist: Infinity };
}

export function checkMicroquasarJetHazard(params: {
  pos: THREE.Vector3;
  jetParams: { axis: THREE.Vector3; halfAngle: number; length: number } | null;
  starWorldPos: THREE.Vector3 | null;
}): HazardEffect {
  const { pos, jetParams, starWorldPos } = params;
  if (!jetParams || !starWorldPos) return EMPTY_EFFECT;

  const { zone } = checkConeBeamZone({ pos, beamParams: jetParams, origin: starWorldPos, warningMul: 2.5 });

  if (zone === 'inside') {
    return {
      fuelRate: 0,
      alert: 'RELATIVISTIC JET — HULL CRITICAL',
      zone: 'lethal',
      damage: HAZARD_DAMAGE.jetCore,
    };
  } else if (zone === 'warning') {
    return {
      fuelRate: 1.5,
      alert: 'WARNING: RELATIVISTIC JET PROXIMITY',
      zone: 'scooping',
      damage: HAZARD_DAMAGE.jetFringe,
    };
  }
  return EMPTY_EFFECT;
}

/** Angular half-widths for pulsar sweep zones (radians) */
const PULSAR_LETHAL_HALF = 0.03;     // ~1.7° — direct beam hit
const PULSAR_HARVEST_HALF = 0.15;    // ~8.6° — broader radiation field

export interface PulsarSweepResult {
  zone: 'lethal' | 'harvesting' | null;
  dist: number;
  proximityFactor: number;
}

/**
 * 3D angular sweep detection for rotating pulsar beams. Compares the full 3D angle
 * between the star→ship direction and the beam axis, so ships off the beam's sweep
 * plane are not affected. Checks both poles of the bipolar beam.
 */
export function checkPulsarSweepZone(params: {
  pos: THREE.Vector3;
  beamParams: { axis: THREE.Vector3; length: number };
  starWorldPos: THREE.Vector3;
  starRadius: number;
}): PulsarSweepResult {
  const { pos, beamParams, starWorldPos, starRadius } = params;
  const toShip = pos.clone().sub(starWorldPos);
  const dist = toShip.length();

  if (dist < starRadius * 2 || dist > beamParams.length) {
    return { zone: null, dist, proximityFactor: 0 };
  }

  // Full 3D angle between ship direction and beam axis
  const shipDir = toShip.clone().normalize();
  const cosAngle = shipDir.dot(beamParams.axis);
  // Check both poles — min angle to either end of the bipolar beam
  const angle = Math.acos(Math.min(1, Math.abs(cosAngle)));

  const proximityFactor = 1 - Math.max(0, Math.min(1, dist / (starRadius * 40)));

  if (angle < PULSAR_LETHAL_HALF) return { zone: 'lethal', dist, proximityFactor };
  if (angle < PULSAR_HARVEST_HALF) return { zone: 'harvesting', dist, proximityFactor };
  return { zone: null, dist, proximityFactor: 0 };
}

export function checkBlackHoleHazard(params: {
  pos: THREE.Vector3;
  starWorldPos: THREE.Vector3 | null;
  starRadius: number;
}): HazardEffect {
  const { pos, starWorldPos, starRadius } = params;
  if (!starWorldPos) return EMPTY_EFFECT;

  const dist = pos.distanceTo(starWorldPos);
  const killZone = starRadius * 1.5;
  const damageZone = starRadius * 3;
  const warningZone = starRadius * 5;

  if (dist < killZone) {
    return {
      fuelRate: 0,
      alert: 'EVENT HORIZON — NO ESCAPE',
      zone: 'lethal',
      damage: HAZARD_DAMAGE.eventHorizon,
    };
  } else if (dist < damageZone) {
    return {
      fuelRate: 0,
      alert: 'TIDAL FORCES — HULL STRESS CRITICAL',
      zone: 'lethal',
      damage: HAZARD_DAMAGE.tidalDisruption,
    };
  } else if (dist < warningZone) {
    return { ...EMPTY_EFFECT, alert: 'WARNING: GRAVITATIONAL ANOMALY' };
  }
  return EMPTY_EFFECT;
}

export function checkBattleZoneHazard(params: {
  pos: THREE.Vector3;
  battle: FleetBattle | null;
  battleDangerRange: number;
}): HazardEffect {
  const { pos, battle, battleDangerRange } = params;
  if (!battle) return EMPTY_EFFECT;

  const dist = pos.distanceTo(battle.position);
  if (dist >= battle.noGoRadius) return EMPTY_EFFECT;

  if (dist < battleDangerRange) {
    return {
      fuelRate: 0,
      alert: 'TAKING FIRE — COMBAT ZONE',
      zone: 'lethal',
      damage: HAZARD_DAMAGE.battleCrossfire,
    };
  }
  return { ...EMPTY_EFFECT, alert: 'WARNING: ACTIVE COMBAT ZONE' };
}
