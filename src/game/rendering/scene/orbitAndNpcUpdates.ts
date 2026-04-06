import * as THREE from 'three';
import type { NPCShipState } from '../../mechanics/NPCSystem';
import type { SceneEntity } from './types';

const _npcCollisionVec = new THREE.Vector3();
const _npcSeparationVec = new THREE.Vector3();
const _shellZAxis = new THREE.Vector3();
const _shellXAxis = new THREE.Vector3();
const _shellYAxis = new THREE.Vector3();
const _shellUp = new THREE.Vector3();
const _shellBasis = new THREE.Matrix4();
const _dysonSampleWorld = new THREE.Vector3();
const _dysonNpcLocalPos = new THREE.Vector3();
const _dysonNpcTargetWorld = new THREE.Vector3();
const _tidalForward = new THREE.Vector3(1, 0, 0);
const _tidalToTarget = new THREE.Vector3();
const _tidalQuat = new THREE.Quaternion();

function angleDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function resolveDysonShellNpcCollision(npcPos: THREE.Vector3, body: SceneEntity): boolean {
  const curveRadius = body.shellCurveRadius;
  const arcWidth = body.shellArcWidth;
  const arcHeight = body.shellArcHeight;
  if (body.type !== 'dyson_shell' || curveRadius == null || arcWidth == null || arcHeight == null) return false;

  body.group.updateWorldMatrix(true, false);
  _dysonNpcLocalPos.copy(npcPos);
  body.group.worldToLocal(_dysonNpcLocalPos);

  const localLen = _dysonNpcLocalPos.length();
  if (localLen < 1e-3) return false;

  const phi = Math.atan2(_dysonNpcLocalPos.z, _dysonNpcLocalPos.x);
  const theta = Math.acos(THREE.MathUtils.clamp(_dysonNpcLocalPos.y / localLen, -1, 1));
  const phiHalf = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6) * 0.5;
  const thetaHalf = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72) * 0.5;
  const radialPadding = 22; // NPC avoidance margin around shell skin
  const angularPad = radialPadding / Math.max(curveRadius, 1);

  if (angleDelta(phi, 0) > phiHalf + angularPad) return false;
  if (Math.abs(theta - Math.PI * 0.5) > thetaHalf + angularPad) return false;

  const radialDist = localLen - curveRadius;
  if (Math.abs(radialDist) >= radialPadding) return false;

  const sign = radialDist >= 0 ? 1 : -1;
  _dysonNpcLocalPos.setLength(curveRadius + sign * radialPadding);
  _dysonNpcTargetWorld.copy(_dysonNpcLocalPos);
  body.group.localToWorld(_dysonNpcTargetWorld);
  npcPos.copy(_dysonNpcTargetWorld);
  return true;
}

export function updateOrbitalEntities(entities: Map<string, SceneEntity>, time: number): void {
  for (const [, entity] of entities) {
    if (entity.type === 'star' && entity.orbitRadius === 0) continue;
    if (entity.type === 'npc_ship' || entity.type === 'fleet_ship') continue;
    if (entity.type === 'landing_site') {
      entity.group.getWorldPosition(entity.worldPos);
      continue;
    }

    const angle = entity.orbitPhase + time * entity.orbitSpeed;

    if (entity.parentId) {
      const parent = entities.get(entity.parentId);
      if (parent) {
        entity.group.position.set(
          parent.worldPos.x + Math.cos(angle) * entity.orbitRadius,
          parent.worldPos.y,
          parent.worldPos.z + Math.sin(angle) * entity.orbitRadius,
        );
      }
    } else if (entity.type === 'dyson_shell' && entity.orbitInclination != null && entity.orbitNode != null) {
      const [x, y, z] = computeDysonShellPosition(
        angle, entity.orbitRadius, entity.orbitInclination, entity.orbitNode,
      );
      entity.group.position.set(x, y, z);
    } else {
      entity.group.position.set(
        Math.cos(angle) * entity.orbitRadius,
        0,
        Math.sin(angle) * entity.orbitRadius,
      );
    }

    entity.worldPos.copy(entity.group.position);
    if (entity.type === 'dyson_shell') {
      orientDysonShell(entity);
    }
  }

  // Second pass so all world positions are current before tidal orientation.
  for (const [, entity] of entities) {
    if (!entity.tidalTargetId) continue;
    const target = entities.get(entity.tidalTargetId);
    if (!target) continue;
    _tidalToTarget.copy(target.worldPos).sub(entity.worldPos);
    if (_tidalToTarget.lengthSq() < 1e-8) continue;
    _tidalToTarget.normalize();
    _tidalQuat.setFromUnitVectors(_tidalForward, _tidalToTarget);
    entity.group.quaternion.copy(_tidalQuat);
  }
}

/**
 * Orient a Dyson shell so its concave interior faces the star at origin.
 *
 * The shell geometry patch is centered at phi=PI, which in THREE.js
 * SphereGeometry sits along the local +X axis. We set +X to point away from
 * the star so the concave interior (facing -X from the sphere center) cups
 * toward the star.
 */
function orientDysonShell(entity: SceneEntity): void {
  const pos = entity.group.position;

  // +X axis: away from star (patch outward normal direction)
  _shellXAxis.copy(pos).normalize();

  // Orbital normal (perpendicular to orbital plane)
  if (entity.orbitInclination != null && entity.orbitNode != null) {
    const sinN = Math.sin(entity.orbitNode);
    const cosN = Math.cos(entity.orbitNode);
    const sinI = Math.sin(entity.orbitInclination);
    const cosI = Math.cos(entity.orbitInclination);
    _shellUp.set(sinN * sinI, cosI, -cosN * sinI);
  } else {
    _shellUp.set(0, 1, 0);
  }

  // Z = X × up, then Y = Z × X to get orthonormal right-handed basis
  _shellZAxis.crossVectors(_shellXAxis, _shellUp).normalize();
  _shellYAxis.crossVectors(_shellZAxis, _shellXAxis);

  _shellBasis.makeBasis(_shellXAxis, _shellYAxis, _shellZAxis);
  entity.group.quaternion.setFromRotationMatrix(_shellBasis);

  // worldPos = patch surface center (SphereGeometry panel centered at local +X for phi=PI)
  entity.worldPos.set(entity.shellCurveRadius ?? 0, 0, 0);
  entity.group.localToWorld(entity.worldPos);
  updateDysonCollisionSamples(entity);
}

export function updateFleetShipWorldPositions(entities: Map<string, SceneEntity>): void {
  for (const [, entity] of entities) {
    if (entity.type !== 'fleet_ship') continue;
    entity.group.getWorldPosition(entity.worldPos);
  }
}

export function rotateStations(entities: Map<string, SceneEntity>): void {
  for (const [, entity] of entities) {
    if (entity.type === 'station') {
      entity.group.rotation.z += 0.001;
    }
  }
}

export function updateNPCShips(params: {
  npcShips: Map<string, NPCShipState>;
  entities: Map<string, SceneEntity>;
  collidables: SceneEntity[];
  dt: number;
}): void {
  const { npcShips, entities, collidables, dt } = params;
  if (dt <= 0) return;

  for (const [, npcState] of npcShips) {
    const entity = entities.get(npcState.id);
    if (!entity) continue;

    const pa = entities.get(npcState.planetIdA);
    const pb = entities.get(npcState.planetIdB);
    if (pa) npcState.waypointA.copy(pa.worldPos);
    if (pb) npcState.waypointB.copy(pb.worldPos);

    const dist = npcState.waypointA.distanceTo(npcState.waypointB);
    if (dist < 1) continue;

    npcState.t += (npcState.speed * dt / dist) * npcState.direction;
    if (npcState.t >= 1) {
      npcState.t = 1;
      npcState.direction = -1;
    }
    if (npcState.t <= 0) {
      npcState.t = 0;
      npcState.direction = 1;
    }

    entity.group.position.lerpVectors(npcState.waypointA, npcState.waypointB, npcState.t);

    for (const body of collidables) {
      if (resolveDysonShellNpcCollision(entity.group.position, body)) {
        continue;
      }
      if (body.type === 'dyson_shell') continue;

      if (body.collisionSamplesWorld && body.collisionSampleRadius) {
        let pushed = false;
        const minDist = body.collisionSampleRadius + 10;
        for (const sample of body.collisionSamplesWorld) {
          const diff = _npcCollisionVec.copy(entity.group.position).sub(sample);
          const bodyDist = diff.length();
          if (bodyDist < minDist && bodyDist > 0.001) {
            const normal = diff.normalize();
            entity.group.position.copy(sample).addScaledVector(normal, minDist);
            pushed = true;
            break;
          }
        }
        if (pushed) continue;
      } else {
        const diff = _npcCollisionVec.copy(entity.group.position).sub(body.worldPos);
        const bodyDist = diff.length();
        const minDist = body.collisionRadius + 10;
        if (bodyDist < minDist && bodyDist > 0.001) {
          const normal = diff.normalize();
          entity.group.position.copy(body.worldPos).addScaledVector(normal, minDist);
        }
      }
    }

    const NPC_SEPARATION = 30;
    for (const [otherId, otherState] of npcShips) {
      if (otherId === npcState.id) continue;
      const otherEntity = entities.get(otherState.id);
      if (!otherEntity) continue;
      const diff = _npcSeparationVec.copy(entity.group.position).sub(otherEntity.worldPos);
      const sepDist = diff.length();
      if (sepDist < NPC_SEPARATION && sepDist > 0.001) {
        entity.group.position.addScaledVector(diff.normalize(), (NPC_SEPARATION - sepDist) * 0.5);
      }
    }

    entity.worldPos.copy(entity.group.position);
  }
}

function updateDysonCollisionSamples(entity: SceneEntity): void {
  if (!entity.collisionSamplesLocal || !entity.collisionSamplesWorld) return;
  const count = Math.min(entity.collisionSamplesLocal.length, entity.collisionSamplesWorld.length);
  for (let i = 0; i < count; i++) {
    _dysonSampleWorld.copy(entity.collisionSamplesLocal[i]);
    entity.group.localToWorld(_dysonSampleWorld);
    entity.collisionSamplesWorld[i].copy(_dysonSampleWorld);
  }
}

function computeDysonShellPosition(
  angle: number,
  r: number,
  incl: number,
  node: number,
): [number, number, number] {
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosI = Math.cos(incl);
  const sinI = Math.sin(incl);
  return [
    r * (cosN * cosA - sinN * sinA * cosI),
    r * sinA * sinI,
    r * (sinN * cosA + cosN * sinA * cosI),
  ];
}
