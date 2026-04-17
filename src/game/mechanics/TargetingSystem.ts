import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import type { SceneEntity } from '../rendering/scene/types';
import { useGameState } from '../GameState';

const TARGET_IDLE_RESET_MS = 20_000;
const MIN_VELOCITY_SQ = 0.01;

interface NearestSampleResult {
  index: number;
  distSq: number;
}

/** Find the collision sample closest to `pos`. */
function findNearestSample(samples: THREE.Vector3[], pos: THREE.Vector3): NearestSampleResult {
  return samples.reduce<NearestSampleResult>(
    (best, sample, i) => {
      const d = pos.distanceToSquared(sample);
      return d < best.distSq ? { index: i, distSq: d } : best;
    },
    { index: 0, distSq: Infinity },
  );
}

export class TargetingSystem {
  private lastTargetActionAt = 0;
  private topoCycleDirection: 1 | -1 = 1;
  private topoCycleHostId: string | null = null;
  private readonly _tmpCameraPos = new THREE.Vector3();
  private readonly _tmpCameraForward = new THREE.Vector3();
  private readonly _tmpToTarget = new THREE.Vector3();
  private readonly _tmpVec = new THREE.Vector3();

  constructor(private sceneRenderer: SceneRenderer) {}

  // Three modes: (1) idle → detect topopolis + set direction, (2) active topo cycling, (3) normal round-robin
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
      const topo = this.findContainingTopopolis();
      if (topo) {
        this.topoCycleDirection = this.getDirectionAlongTopopolis(topo);
        this.topoCycleHostId = topo.id;
        const next = this.findNextAlongTopopolis(topo.id, this.topoCycleDirection, null);
        if (next) {
          this.setTargetAndRemember(next);
          return;
        }
      }
      this.topoCycleHostId = null;
      const nearestToReticleId = this.findNearestToForwardReticle(ids);
      if (nearestToReticleId) {
        this.setTargetAndRemember(nearestToReticleId);
        return;
      }
    }

    if (this.topoCycleHostId) {
      const next = this.findNextAlongTopopolis(this.topoCycleHostId, this.topoCycleDirection, state.player.targetId);
      if (next) {
        this.setTargetAndRemember(next);
        return;
      }
      // Exhausted topopolis entities — fall through to normal cycling
      this.topoCycleHostId = null;
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

  private playerWorldPos(): THREE.Vector3 {
    const { player } = useGameState.getState();
    return this._tmpVec.set(player.position.x, player.position.y, player.position.z);
  }

  private findContainingTopopolis(): SceneEntity | null {
    const pos = this.playerWorldPos();

    const entries = Array.from(this.sceneRenderer.getAllEntities().values());
    return entries.find((entity) => {
      if (entity.type !== 'topopolis' || !entity.collisionSamplesWorld?.length) return false;
      const tubeR = entity.collisionSampleRadius ?? 0;
      if (tubeR <= 0) return false;
      const { distSq } = findNearestSample(entity.collisionSamplesWorld, pos);
      return Math.sqrt(distSq) < tubeR * 0.9;
    }) ?? null;
  }

  private getDirectionAlongTopopolis(topo: SceneEntity): 1 | -1 {
    const { player } = useGameState.getState();
    const samples = topo.collisionSamplesWorld!;
    // Use _tmpCameraPos for player position to avoid aliasing with _tmpVec (used for velocity below)
    const pos = this._tmpCameraPos.set(player.position.x, player.position.y, player.position.z);
    const { index } = findNearestSample(samples, pos);

    // Compute local tangent from adjacent samples
    const prev = Math.max(0, index - 1);
    const next = Math.min(samples.length - 1, index + 1);
    const tangent = this._tmpToTarget.copy(samples[next]).sub(samples[prev]);

    // Use velocity if moving fast enough, otherwise camera forward
    const vel = this._tmpVec.set(player.velocity.x, player.velocity.y, player.velocity.z);
    let direction: THREE.Vector3;
    if (vel.lengthSq() > MIN_VELOCITY_SQ) {
      direction = vel;
    } else {
      const camera = this.sceneRenderer.camera;
      if (camera) {
        camera.getWorldDirection(this._tmpCameraForward).normalize();
        direction = this._tmpCameraForward;
      } else {
        return 1;
      }
    }

    return tangent.dot(direction) >= 0 ? 1 : -1;
  }

  private findNextAlongTopopolis(topoId: string, direction: 1 | -1, currentTargetId: string | null): string | null {
    const entities = this.sceneRenderer.getAllEntities();

    // Gather topopolis entities sorted by curve position
    const topoEntities = Array.from(entities.entries())
      .filter(([id, e]) =>
        e.siteHostId === topoId &&
        e.siteCurveT != null &&
        this.isTargetableEntity(id, e),
      )
      .sort(([, a], [, b]) => a.siteCurveT! - b.siteCurveT!);

    if (topoEntities.length === 0) return null;

    // If we have a current target on this topopolis, step from it
    if (currentTargetId) {
      const currentIdx = topoEntities.findIndex(([id]) => id === currentTargetId);
      if (currentIdx !== -1) {
        const nextIdx = currentIdx + direction;
        // Out of bounds = exhausted, return null to break out to normal cycling
        if (nextIdx < 0 || nextIdx >= topoEntities.length) return null;
        return topoEntities[nextIdx][0];
      }
    }

    // No current target on topopolis — find nearest ahead of player's curve position
    const playerT = this.estimatePlayerCurveT(topoId);
    if (playerT == null) return topoEntities[direction > 0 ? 0 : topoEntities.length - 1][0];

    if (direction > 0) {
      const ahead = topoEntities.find(([, e]) => e.siteCurveT! > playerT);
      return ahead ? ahead[0] : null;
    } else {
      const behind = [...topoEntities].reverse().find(([, e]) => e.siteCurveT! < playerT);
      return behind ? behind[0] : null;
    }
  }

  /** Estimate the player's arc-length position (0–1) along the topopolis curve
   *  by interpolating between the two nearest collision samples. */
  private estimatePlayerCurveT(topoId: string): number | null {
    const topo = this.sceneRenderer.getAllEntities().get(topoId);
    const samples = topo?.collisionSamplesWorld;
    if (!samples || samples.length < 2) return null;

    const pos = this.playerWorldPos();
    const { index: nearestIdx } = findNearestSample(samples, pos);
    const lastIdx = samples.length - 1;

    // Pick the neighbor sample on whichever side the player is closer to
    const neighborIdx = nearestIdx === 0
      ? 1
      : nearestIdx === lastIdx
        ? lastIdx - 1
        : pos.distanceToSquared(samples[nearestIdx - 1]) < pos.distanceToSquared(samples[nearestIdx + 1])
          ? nearestIdx - 1
          : nearestIdx + 1;

    const dNearest = Math.sqrt(pos.distanceToSquared(samples[nearestIdx]));
    const dNeighbor = Math.sqrt(pos.distanceToSquared(samples[neighborIdx]));
    const totalDist = dNearest + dNeighbor;

    // Blend between the two sample indices proportionally
    const blend = totalDist > 1e-6 ? dNearest / totalDist : 0;
    const interpolatedIdx = nearestIdx + (neighborIdx - nearestIdx) * blend;

    return interpolatedIdx / lastIdx;
  }

  private findNearestToForwardReticle(ids: string[]): string | null {
    const camera = this.sceneRenderer.camera;
    if (!camera) return null;

    const entities = this.sceneRenderer.getAllEntities();
    camera.getWorldPosition(this._tmpCameraPos);
    camera.getWorldDirection(this._tmpCameraForward).normalize();

    return ids.reduce<{ id: string | null; score: number }>(
      (best, id) => {
        const entity = entities.get(id);
        if (!entity) return best;

        this._tmpToTarget.copy(entity.worldPos).sub(this._tmpCameraPos);
        if (this._tmpToTarget.lengthSq() <= 1e-6) return best;
        if (this._tmpToTarget.normalize().dot(this._tmpCameraForward) <= 0) return best;

        const ndc = entity.worldPos.clone().project(camera);
        const score = (ndc.x * ndc.x) + (ndc.y * ndc.y);
        return score < best.score ? { id, score } : best;
      },
      { id: null, score: Infinity },
    ).id;
  }
}
