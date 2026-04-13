import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import { useGameState } from '../GameState';

const TARGET_IDLE_RESET_MS = 20_000;

export class TargetingSystem {
  private lastTargetActionAt = 0;
  private readonly _tmpCameraPos = new THREE.Vector3();
  private readonly _tmpCameraForward = new THREE.Vector3();
  private readonly _tmpToTarget = new THREE.Vector3();

  constructor(private sceneRenderer: SceneRenderer) {}

  cycleTarget(): void {
    const state = useGameState.getState();
    const entities = this.sceneRenderer.getAllEntities();
    const ids = Array.from(entities.entries())
      .filter(([id, entity]) => this.isTargetableEntity(id, entity))
      .map(([id]) => id);
    if (ids.length === 0) return;

    const now = performance.now();
    const inactive = (state.player.targetId === null) || (now - this.lastTargetActionAt >= TARGET_IDLE_RESET_MS);
    if (inactive) {
      const nearestToReticleId = this.findNearestToForwardReticle(ids);
      if (nearestToReticleId) {
        this.setTargetAndRemember(nearestToReticleId);
        return;
      }
    }

    const currentIdx = ids.indexOf(state.player.targetId ?? '');
    const nextIdx = (currentIdx + 1) % ids.length;
    this.setTargetAndRemember(ids[nextIdx]);
  }

  setTargetAndRemember(id: string): void {
    const state = useGameState.getState();
    state.setTarget(id);
    this.lastTargetActionAt = performance.now();
  }

  private isTargetableEntity(_id: string, entity: { type: string; siteDiscovered?: boolean }): boolean {
    if (entity.type === 'landing_site' && !entity.siteDiscovered) return false;
    return true;
  }

  private findNearestToForwardReticle(ids: string[]): string | null {
    const camera = this.sceneRenderer.camera;
    if (!camera) return null;

    const entities = this.sceneRenderer.getAllEntities();
    camera.getWorldPosition(this._tmpCameraPos);
    camera.getWorldDirection(this._tmpCameraForward).normalize();

    let bestId: string | null = null;
    let bestScore = Infinity;

    for (const id of ids) {
      const entity = entities.get(id);
      if (!entity) continue;

      this._tmpToTarget.copy(entity.worldPos).sub(this._tmpCameraPos);
      if (this._tmpToTarget.lengthSq() <= 1e-6) continue;
      const forwardness = this._tmpToTarget.normalize().dot(this._tmpCameraForward);
      if (forwardness <= 0) continue;

      const ndc = entity.worldPos.clone().project(camera);
      const score = (ndc.x * ndc.x) + (ndc.y * ndc.y);
      if (score < bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    return bestId;
  }
}
