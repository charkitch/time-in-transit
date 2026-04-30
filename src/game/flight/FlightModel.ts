import * as THREE from 'three';
import type { InputState } from '../input/InputSystem';
import type { SceneEntity } from '../rendering/SceneRenderer';
import { FLIGHT, HYPERSPACE } from '../constants';

const _collisionVec = new THREE.Vector3();
const _dysonLocalPos = new THREE.Vector3();
const _dysonNormalWorld = new THREE.Vector3();
const _dysonTargetWorld = new THREE.Vector3();
const _topoVec = new THREE.Vector3();
const _topoTangentVelocity = new THREE.Vector3();

const TOPOPOLIS_INTERIOR_BOUNCE_RESTITUTION = 0.75;
const TOPOPOLIS_INTERIOR_BOUNCE_TANGENTIAL_DAMPING = 0.92;
export const TOPOPOLIS_INTERIOR_BOUNCE_SHIELD_DAMAGE = 18;
export const TOPOPOLIS_INTERIOR_BOUNCE_HEAT_DAMAGE = 4;

export interface CollisionResult {
  entity: SceneEntity;
  lethal: boolean;
  shieldDamage?: number;
  heatDamage?: number;
}

function angleDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function resolveDysonShellCollision(
  shipPos: THREE.Vector3,
  body: SceneEntity,
  shipRadius: number,
  outNormal: THREE.Vector3,
): boolean {
  const curveRadius = body.shellCurveRadius;
  const arcWidth = body.shellArcWidth;
  const arcHeight = body.shellArcHeight;
  if (body.type !== 'dyson_shell' || curveRadius == null || arcWidth == null || arcHeight == null) return false;

  body.group.updateWorldMatrix(true, false);
  _dysonLocalPos.copy(shipPos);
  body.group.worldToLocal(_dysonLocalPos);

  const localLen = _dysonLocalPos.length();
  if (localLen < 1e-3) return false;

  const phi = Math.atan2(_dysonLocalPos.z, _dysonLocalPos.x);
  const theta = Math.acos(THREE.MathUtils.clamp(_dysonLocalPos.y / localLen, -1, 1));
  const phiHalf = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6) * 0.5;
  const thetaHalf = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72) * 0.5;
  const thickness = 12;
  const radialPadding = shipRadius + thickness;
  const angularPad = radialPadding / Math.max(curveRadius, 1);

  if (angleDelta(phi, 0) > phiHalf + angularPad) return false;
  if (Math.abs(theta - Math.PI * 0.5) > thetaHalf + angularPad) return false;

  const radialDist = localLen - curveRadius;
  if (Math.abs(radialDist) >= radialPadding) return false;

  outNormal.copy(_dysonLocalPos).normalize();
  const sign = radialDist >= 0 ? 1 : -1;
  _dysonLocalPos.setLength(curveRadius + sign * radialPadding);
  _dysonTargetWorld.copy(_dysonLocalPos);
  body.group.localToWorld(_dysonTargetWorld);
  shipPos.copy(_dysonTargetWorld);
  outNormal.transformDirection(body.group.matrixWorld).normalize();
  return true;
}

export class FlightModel {
  velocity = new THREE.Vector3();

  update(
    dt: number,
    input: InputState,
    shipGroup: THREE.Group,
    fuel: number,
  ): { speed: number; fuelConsumed: number } {
    const isBoosting = input.boost && fuel > 0;

    // Angular motion applied to shipGroup
    if (input.pitch !== 0) {
      shipGroup.rotateX(input.pitch * FLIGHT.pitchRate * dt);
    }
    if (input.yaw !== 0) {
      shipGroup.rotateY(-input.yaw * FLIGHT.yawRate * dt);
    }
    if (input.roll !== 0) {
      shipGroup.rotateZ(-input.roll * FLIGHT.rollRate * dt);
    }

    // Thrust along local -Z (forward)
    if (input.thrust > 0) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(shipGroup.quaternion);
      const thrustMag = (isBoosting ? FLIGHT.boostMultiplier : 1) * 400 * input.thrust * dt;
      this.velocity.addScaledVector(fwd, thrustMag);
    }

    // Drag
    this.velocity.multiplyScalar(FLIGHT.drag);

    // Clamp max speed
    const maxSpd = isBoosting ? FLIGHT.maxSpeed * FLIGHT.boostMultiplier : FLIGHT.maxSpeed;
    if (this.velocity.length() > maxSpd) {
      this.velocity.setLength(maxSpd);
    }

    // Move
    shipGroup.position.addScaledVector(this.velocity, dt);

    const fuelConsumed = isBoosting ? FLIGHT.boostFuelRate * dt : 0;
    return { speed: this.velocity.length(), fuelConsumed };
  }

  /** Fuel cost to jump between two galaxy positions */
  static jumpCost(dx: number, dy: number): number {
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0.5, Math.min(3.0, dist * HYPERSPACE.fuelPerUnit));
  }

  resolveCollisions(shipGroup: THREE.Group, collidables: SceneEntity[]): CollisionResult | null {
    const shipPos = shipGroup.position;
    const SHIP_RADIUS = 10;
    let hit: CollisionResult | null = null;
    for (const body of collidables) {
      if (resolveDysonShellCollision(shipPos, body, SHIP_RADIUS, _dysonNormalWorld)) {
        const dot = this.velocity.dot(_dysonNormalWorld);
        if (dot < 0) {
          this.velocity.addScaledVector(_dysonNormalWorld, -dot * 1.5);
          this.velocity.multiplyScalar(0.5);
        }
        hit = { entity: body, lethal: true };
        continue;
      }
      if (body.type === 'dyson_shell') continue;

      // Topopolis: hollow tube — collide at tube surface, allow fly-through.
      // Find closest point on helix centerline, then check if ship is at tube wall.
      // Skip collision near gate positions (openings in the tube).
      if (body.type === 'topopolis' && body.collisionSamplesWorld && body.collisionSampleRadius) {
        const tubeRadius = body.collisionSampleRadius;
        const thickness = SHIP_RADIUS + 12;
        const samples = body.collisionSamplesWorld;
        const sampleCount = samples.length;

        // Find nearest centerline sample
        let nearest = Infinity;
        let nearestIdx = -1;
        for (let i = 0; i < sampleCount; i++) {
          const d = _topoVec.copy(shipPos).sub(samples[i]).lengthSq();
          if (d < nearest) { nearest = d; nearestIdx = i; }
        }
        if (nearestIdx < 0) { continue; }
        nearest = Math.sqrt(nearest);

        // Refine: project onto segment between nearest and its best neighbor
        const prev = nearestIdx > 0 ? nearestIdx - 1 : nearestIdx;
        const next = nearestIdx < sampleCount - 1 ? nearestIdx + 1 : nearestIdx;
        const dPrev = _topoVec.copy(shipPos).sub(samples[prev]).lengthSq();
        const dNext = _topoVec.copy(shipPos).sub(samples[next]).lengthSq();
        const neighborIdx = dPrev < dNext ? prev : next;

        const a = samples[nearestIdx];
        const b = samples[neighborIdx];
        const ab = _topoVec.copy(b).sub(a);
        const abLenSq = ab.lengthSq();
        if (abLenSq < 0.001) { continue; }

        const segT = THREE.MathUtils.clamp(_collisionVec.copy(shipPos).sub(a).dot(ab) / abLenSq, 0, 1);
        const closest = _collisionVec.copy(a).addScaledVector(ab, segT);
        nearest = shipPos.distanceTo(closest);

        // Skip collision if ship is near a gate opening (3D distance check).
        // Gate surface positions are on the outward tube surface where gates are,
        // so only ships approaching the correct side will be close enough.
        const gateSurfaces = body.gateSurfaceWorld;
        if (gateSurfaces) {
          const gateThreshold = tubeRadius * 1.2;
          const gateThresholdSq = gateThreshold * gateThreshold;
          const nearGate = gateSurfaces.some(gp =>
            shipPos.distanceToSquared(gp) < gateThresholdSq,
          );
          if (nearGate) { continue; }
        }

        const normal = _topoVec.copy(shipPos).sub(closest);
        const normalLen = normal.length();
        if (normalLen > 0.001) {
          normal.divideScalar(normalLen);
          const distFromSurface = Math.abs(nearest - tubeRadius);
          if (distFromSurface < thickness) {
            const side = nearest >= tubeRadius ? 1 : -1;
            shipPos.copy(closest).addScaledVector(normal, tubeRadius + side * thickness);
            const dot = this.velocity.dot(normal);
            if (dot * side < 0) {
              if (side < 0) {
                _topoTangentVelocity.copy(this.velocity).addScaledVector(normal, -dot);
                this.velocity.copy(_topoTangentVelocity.multiplyScalar(TOPOPOLIS_INTERIOR_BOUNCE_TANGENTIAL_DAMPING));
                this.velocity.addScaledVector(normal, -dot * TOPOPOLIS_INTERIOR_BOUNCE_RESTITUTION);
              } else {
                this.velocity.addScaledVector(normal, -dot * 1.5);
                this.velocity.multiplyScalar(0.5);
              }
            }
            hit = {
              entity: body,
              lethal: side > 0,
              shieldDamage: side < 0 ? TOPOPOLIS_INTERIOR_BOUNCE_SHIELD_DAMAGE : undefined,
              heatDamage: side < 0 ? TOPOPOLIS_INTERIOR_BOUNCE_HEAT_DAMAGE : undefined,
            };
          }
        }
        continue;
      }

      if (body.collisionSamplesWorld && body.collisionSampleRadius) {
        const minDist = body.collisionSampleRadius + SHIP_RADIUS;
        for (const sample of body.collisionSamplesWorld) {
          const diff = _collisionVec.copy(shipPos).sub(sample);
          const dist = diff.length();
          if (dist < minDist && dist > 0.001) {
            const normal = diff.normalize();
            shipPos.copy(sample).addScaledVector(normal, minDist);
            const dot = this.velocity.dot(normal);
            if (dot < 0) {
              this.velocity.addScaledVector(normal, -dot * 1.5);
              this.velocity.multiplyScalar(0.5);
            }
            hit = { entity: body, lethal: body.type !== 'station' };
            break;
          }
        }
      }

      // Central sphere — used alone for simple bodies, or as a hub fallback
      // for stations that also have ring collision samples
      if (!hit || (body.type === 'station' && hit.entity.type === 'station')) {
        const diff = _collisionVec.copy(shipPos).sub(body.worldPos);
        const dist = diff.length();
        const minDist = body.collisionRadius;
        if (dist < minDist && dist > 0.001) {
          const normal = diff.normalize();
          shipPos.copy(body.worldPos).addScaledVector(normal, minDist);
          const dot = this.velocity.dot(normal);
          if (dot < 0) {
            this.velocity.addScaledVector(normal, -dot * 1.5);
            this.velocity.multiplyScalar(0.5);
          }
          hit = { entity: body, lethal: body.type !== 'station' };
        }
      }
    }
    return hit;
  }

  reset() {
    this.velocity.set(0, 0, 0);
  }

  getVelocity(): THREE.Vector3 {
    return this.velocity;
  }

  setVelocity(x: number, y: number, z: number) {
    this.velocity.set(x, y, z);
  }
}
