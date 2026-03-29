import * as THREE from 'three';
import type { InputState } from '../input/InputSystem';
import type { SceneEntity } from '../rendering/SceneRenderer';
import { FLIGHT, HYPERSPACE } from '../constants';

const _collisionVec = new THREE.Vector3();

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
      const thrustMag = (isBoosting ? FLIGHT.boostMultiplier : 1) * 400 * dt;
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

  resolveCollisions(shipGroup: THREE.Group, collidables: SceneEntity[]): boolean {
    const shipPos = shipGroup.position;
    const SHIP_RADIUS = 10;
    let hit = false;
    for (const body of collidables) {
      const diff = _collisionVec.copy(shipPos).sub(body.worldPos);
      const dist = diff.length();
      const minDist = body.collisionRadius + SHIP_RADIUS;
      if (dist < minDist && dist > 0.001) {
        const normal = diff.normalize();
        shipPos.copy(body.worldPos).addScaledVector(normal, minDist);
        const dot = this.velocity.dot(normal);
        if (dot < 0) {
          this.velocity.addScaledVector(normal, -dot * 1.5);
          this.velocity.multiplyScalar(0.5);
        }
        hit = true;
      }
    }
    return hit;
  }

  reset(position: THREE.Vector3) {
    this.velocity.set(0, 0, 0);
  }
}
