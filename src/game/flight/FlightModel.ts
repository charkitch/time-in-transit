import * as THREE from 'three';
import type { InputState } from '../input/InputSystem';
import type { SceneEntity } from '../rendering/SceneRenderer';
import { FLIGHT, HYPERSPACE } from '../constants';

const _collisionVec = new THREE.Vector3();
const _dysonLocalPos = new THREE.Vector3();
const _dysonNormalWorld = new THREE.Vector3();
const _dysonTargetWorld = new THREE.Vector3();

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
    onFuelDrain: (amount: number) => void,
  ): { speed: number; fuel: number } {
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

      if (isBoosting) {
        const drained = FLIGHT.boostFuelRate * dt;
        onFuelDrain(drained);
        fuel = Math.max(0, fuel - drained);
      }
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

    return { speed: this.velocity.length(), fuel };
  }

  /** Fuel cost to jump between two galaxy positions */
  static jumpCost(dx: number, dy: number): number {
    const dist = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0.5, Math.min(3.0, dist * HYPERSPACE.fuelPerUnit));
  }

  resolveCollisions(shipGroup: THREE.Group, collidables: SceneEntity[]): SceneEntity | null {
    const shipPos = shipGroup.position;
    const SHIP_RADIUS = 10;
    let hitEntity: SceneEntity | null = null;
    for (const body of collidables) {
      if (resolveDysonShellCollision(shipPos, body, SHIP_RADIUS, _dysonNormalWorld)) {
        const dot = this.velocity.dot(_dysonNormalWorld);
        if (dot < 0) {
          this.velocity.addScaledVector(_dysonNormalWorld, -dot * 1.5);
          this.velocity.multiplyScalar(0.5);
        }
        hitEntity = body;
        continue;
      }
      if (body.type === 'dyson_shell') continue;

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
            hitEntity = body;
            break;
          }
        }
      } else {
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
          hitEntity = body;
        }
      }
    }
    return hitEntity;
  }

  reset(position: THREE.Vector3) {
    this.velocity.set(0, 0, 0);
  }
}
