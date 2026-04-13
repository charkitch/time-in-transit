import * as THREE from 'three';
import { DOCKING, getInteractionDistance } from '../constants';

export class DockingSystem {
  canDock(
    shipPos: THREE.Vector3,
    stationPos: THREE.Vector3,
    speed: number,
    stationCollisionRadius = 0,
  ): boolean {
    const dist = shipPos.distanceTo(stationPos);
    return dist <= this.getDockingDistance(stationCollisionRadius) && speed <= DOCKING.maxSpeed;
  }

  findNearestStation(
    shipPos: THREE.Vector3,
    entities: Map<string, { id: string; worldPos: THREE.Vector3; type: string; collisionRadius: number; interactionRadius?: number }>,
  ): { id: string; pos: THREE.Vector3; dist: number; interactionRadius: number } | null {
    let nearest: { id: string; pos: THREE.Vector3; dist: number; interactionRadius: number } | null = null;
    let nearestBodyDist = Infinity; // closest moon or planet

    for (const [, entity] of entities) {
      const dist = shipPos.distanceTo(entity.worldPos);
      if (entity.type === 'moon' || entity.type === 'planet' || entity.type === 'dyson_shell') {
        if (dist < nearestBodyDist) nearestBodyDist = dist;
      }
      if (entity.type !== 'station') continue;
      if (!nearest || dist < nearest.dist) {
        nearest = {
          id: entity.id,
          pos: entity.worldPos.clone(),
          dist,
          interactionRadius: entity.interactionRadius ?? entity.collisionRadius,
        };
      }
    }

    // Refuse if a moon/planet is closer than the station — you'd be docking with scenery
    if (nearest && nearestBodyDist < nearest.dist) return null;

    return nearest;
  }

  getDockingDistance(stationCollisionRadius = 0): number {
    return getInteractionDistance('station', stationCollisionRadius);
  }
}
