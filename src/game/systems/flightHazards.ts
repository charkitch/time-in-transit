import * as THREE from 'three';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import type { SceneEntity } from '../rendering/SceneRenderer';
import { useGameState } from '../GameState';
import type { GoodName } from '../constants';

function proximityAlertLabel(entity: SceneEntity): string {
  switch (entity.type) {
    case 'landing_site':
      return 'LANDING SITE IN RANGE';
    case 'dyson_shell':
      return 'PROXIMITY ALERT: DYSON SHELL';
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
    if (entity.type === 'landing_site' && !entity.siteDiscovered) continue;
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
  dt: number;
  state: ReturnType<typeof useGameState.getState>;
  curve: Float32Array | null;
  hazardRadius: number;
}): void {
  const { pos, dt, state, curve, hazardRadius } = params;
  if (!curve) return;

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
    state.setHeat(state.player.heat + 30 * dt);
    state.setAlert('WARNING: X-RAY TRANSFER STREAM');
  } else if (minDist < warningRadius) {
    state.setAlert('CAUTION: X-RAY STREAM NEARBY');
  }
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
  dt: number;
  state: ReturnType<typeof useGameState.getState>;
  jetParams: { axis: THREE.Vector3; halfAngle: number; length: number } | null;
  starWorldPos: THREE.Vector3 | null;
  isDead: boolean;
  onDeath: (message: string[]) => void;
}): 'lethal' | 'scooping' | null {
  const { pos, dt, state, jetParams, starWorldPos, isDead, onDeath } = params;
  if (!jetParams || !starWorldPos) return null;

  const { zone } = checkConeBeamZone({ pos, beamParams: jetParams, origin: starWorldPos, warningMul: 2.5 });

  if (zone === 'inside') {
    state.setShields(state.player.shields - 60 * dt);
    state.setHeat(state.player.heat + 80 * dt);
    state.setAlert('RELATIVISTIC JET — HULL CRITICAL');
    if (state.player.shields <= 0 && !isDead) {
      onDeath(['RELATIVISTIC JET', 'Ship vaporized by relativistic plasma outflow.', 'No wreckage recovered.']);
    }
    return 'lethal';
  } else if (zone === 'warning') {
    state.setHeat(state.player.heat + 10 * dt);
    state.setAlert('WARNING: RELATIVISTIC JET PROXIMITY');
    return 'scooping';
  }
  return null;
}

export function checkPulsarBeamHazard(params: {
  pos: THREE.Vector3;
  dt: number;
  state: ReturnType<typeof useGameState.getState>;
  beamParams: { axis: THREE.Vector3; halfAngle: number; length: number };
  starWorldPos: THREE.Vector3 | null;
  starRadius: number;
  isDead: boolean;
  onDeath: (message: string[]) => void;
}): 'lethal' | 'harvesting' | null {
  const { pos, dt, state, beamParams, starWorldPos, starRadius, isDead, onDeath } = params;
  if (!starWorldPos) return null;

  const { zone, dist } = checkConeBeamZone({ pos, beamParams, origin: starWorldPos, warningMul: 3.0 });

  if (zone === 'inside') {
    const proximityFactor = 1 - Math.max(0, Math.min(1, dist / (starRadius * 40)));
    const shieldDmg = 40 + 110 * proximityFactor; // 40–150 /s
    const heatDmg = 50 + 70 * proximityFactor;    // 50–120 /s
    state.setShields(state.player.shields - shieldDmg * dt);
    state.setHeat(state.player.heat + heatDmg * dt);
    state.setAlert(proximityFactor > 0.5
      ? 'PULSAR BEAM — LETHAL RADIATION'
      : 'PULSAR BEAM — HULL CRITICAL');
    if (state.player.shields <= 0 && !isDead) {
      onDeath(proximityFactor > 0.5
        ? ['LETHAL RADIATION', 'Pulsar beam stripped hull at close range.', 'Reactor containment failed instantly.']
        : ['RADIATION EXPOSURE', 'Sustained pulsar radiation overwhelmed shields.', 'Hull breach across all decks.']);
    }
    return 'lethal';
  } else if (zone === 'warning') {
    state.setHeat(state.player.heat + 15 * dt);
    state.setAlert('WARNING: PULSAR BEAM PROXIMITY');
    return 'harvesting';
  }
  return null;
}

export function checkBlackHoleHazard(params: {
  pos: THREE.Vector3;
  dt: number;
  state: ReturnType<typeof useGameState.getState>;
  starWorldPos: THREE.Vector3 | null;
  starRadius: number;
  isDead: boolean;
  onDeath: (message: string[]) => void;
}): void {
  const { pos, dt, state, starWorldPos, starRadius, isDead, onDeath } = params;
  if (!starWorldPos) return;

  const dist = pos.distanceTo(starWorldPos);
  const killZone = starRadius * 1.5;
  const damageZone = starRadius * 3;
  const warningZone = starRadius * 5;

  if (dist < killZone) {
    state.setShields(state.player.shields - 200 * dt);
    state.setHeat(state.player.heat + 100 * dt);
    state.setAlert('EVENT HORIZON — NO ESCAPE');
    if (state.player.shields <= 0 && !isDead) {
      onDeath(['EVENT HORIZON', 'Crossed the point of no return.', 'Ship crushed by tidal forces.']);
    }
  } else if (dist < damageZone) {
    state.setShields(state.player.shields - 40 * dt);
    state.setHeat(state.player.heat + 50 * dt);
    state.setAlert('TIDAL FORCES — HULL STRESS CRITICAL');
    if (state.player.shields <= 0 && !isDead) {
      onDeath(['TIDAL DISRUPTION', 'Gravitational shear exceeded structural limits.', 'Hull torn apart.']);
    }
  } else if (dist < warningZone) {
    state.setAlert('WARNING: GRAVITATIONAL ANOMALY');
  }
}

export function applyBattleZoneEffects(params: {
  pos: THREE.Vector3;
  dt: number;
  state: ReturnType<typeof useGameState.getState>;
  battle: FleetBattle | null;
  battleDangerRange: number;
  combatIntelTimer: number;
  combatIntelInterval: number;
  maxCargo: number;
  combatIntelGood: GoodName;
  isDead: boolean;
  onDeath: (message: string[]) => void;
}): number {
  const {
    pos,
    dt,
    state,
    battle,
    battleDangerRange,
    combatIntelTimer,
    combatIntelInterval,
    maxCargo,
    combatIntelGood,
    isDead,
    onDeath,
  } = params;

  if (!battle) {
    return 0;
  }

  const dist = pos.distanceTo(battle.position);
  if (dist >= battle.noGoRadius) {
    return 0;
  }

  let nextTimer = combatIntelTimer;
  let cargoUsed = Object.values(state.player.cargo).reduce((sum, qty) => sum + (qty ?? 0), 0);

  let gatheringIntel = false;
  if (cargoUsed < maxCargo) {
    nextTimer += dt;
    while (nextTimer >= combatIntelInterval && cargoUsed < maxCargo) {
      state.addCargo(combatIntelGood, 1, 0);
      nextTimer -= combatIntelInterval;
      cargoUsed++;
    }
    gatheringIntel = cargoUsed < maxCargo;
  } else {
    nextTimer = 0;
  }

  if (dist < battleDangerRange) {
    state.setShields(state.player.shields - 20 * dt);
    state.setHeat(state.player.heat + 25 * dt);
    state.setAlert('TAKING FIRE — COMBAT ZONE');
    if (state.player.shields <= 0 && !isDead) {
      onDeath(['COMBAT CASUALTY', 'Destroyed by crossfire in active battle zone.', 'Escape pods deployed.']);
    }
  } else {
    state.setAlert(gatheringIntel ? 'COLLECTING COMBAT INTELLIGENCE' : 'WARNING: ACTIVE COMBAT ZONE');
  }

  if (cargoUsed >= maxCargo) {
    return 0;
  }
  return nextTimer;
}
