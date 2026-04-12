import * as THREE from 'three';
import type { SceneRenderer } from '../rendering/SceneRenderer';
import { useGameState } from '../GameState';
import {
  SCAN_DURATION_SECONDS,
  PLANET_SCAN_RANGE_PADDING,
  DYSON_SCAN_RANGE_PADDING,
  SCAN_INTEL_MAX_AGE_YEARS,
} from '../constants';
import type { ScannableBodyId, GalaxyYear } from '../types';

export class ScanningSystem {
  private activeScanTargetId: ScannableBodyId | null = null;
  private activeScanTimer = 0;
  private currentVisitScannedHosts = new Set<ScannableBodyId>();

  constructor(private sceneRenderer: SceneRenderer) {}

  canScanNow(): boolean {
    if (this.activeScanTargetId) return false;
    const state = useGameState.getState();
    const targetId = state.player.targetId;
    if (!targetId) return false;
    const entity = this.sceneRenderer.getEntity(targetId);
    if (!entity || (entity.type !== 'planet' && entity.type !== 'dyson_shell')) return false;
    if (this.currentVisitScannedHosts.has(targetId as ScannableBodyId)) return false;
    const shipPos = this.sceneRenderer.shipGroup.position;
    const dist = shipPos.distanceTo(entity.worldPos);
    const required = entity.collisionRadius + (entity.type === 'dyson_shell' ? DYSON_SCAN_RANGE_PADDING : PLANET_SCAN_RANGE_PADDING);
    return dist <= required;
  }

  tryScan(): void {
    const state = useGameState.getState();
    if (state.ui.mode !== 'flight') return;
    if (this.activeScanTargetId) return;

    const targetId = state.player.targetId;
    if (!targetId) {
      state.setAlert('NO TARGET TO SCAN');
      setTimeout(() => useGameState.getState().setAlert(null), 1600);
      return;
    }
    const entity = this.sceneRenderer.getEntity(targetId);
    if (!entity || (entity.type !== 'planet' && entity.type !== 'dyson_shell')) {
      state.setAlert('TARGET PLANET OR DYSON SHELL TO SCAN');
      setTimeout(() => useGameState.getState().setAlert(null), 1800);
      return;
    }

    const shipPos = this.sceneRenderer.shipGroup.position;
    const dist = shipPos.distanceTo(entity.worldPos);
    const required = entity.collisionRadius + (entity.type === 'dyson_shell' ? DYSON_SCAN_RANGE_PADDING : PLANET_SCAN_RANGE_PADDING);
    if (dist > required) {
      state.setAlert('TOO FAR TO SCAN');
      setTimeout(() => useGameState.getState().setAlert(null), 1600);
      return;
    }
    const bodyId = targetId as ScannableBodyId;
    if (this.currentVisitScannedHosts.has(bodyId)) {
      state.setAlert('ALREADY SCANNED THIS VISIT');
      setTimeout(() => useGameState.getState().setAlert(null), 1700);
      return;
    }

    this.activeScanTargetId = bodyId;
    this.activeScanTimer = 0;
    const hostLabel = entity.type === 'dyson_shell' ? 'DYSON SHELL' : 'PLANET';
    state.setScanProgress(0, `SCANNING ${hostLabel}`);
  }

  tick(
    dt: number,
    state: ReturnType<typeof useGameState.getState>,
    shipPos: THREE.Vector3,
  ): void {
    const targetId = this.activeScanTargetId;
    if (!targetId) return;
    const entity = this.sceneRenderer.getEntity(targetId);
    if (!entity || (entity.type !== 'planet' && entity.type !== 'dyson_shell')) {
      this.clear(state);
      return;
    }

    const required = entity.collisionRadius + (entity.type === 'dyson_shell' ? DYSON_SCAN_RANGE_PADDING : PLANET_SCAN_RANGE_PADDING);
    const dist = shipPos.distanceTo(entity.worldPos);
    if (dist > required) {
      this.clear(state);
      state.setAlert('SCAN INTERRUPTED');
      setTimeout(() => useGameState.getState().setAlert(null), 1200);
      return;
    }

    this.activeScanTimer += dt;
    const p = Math.max(0, Math.min(1, this.activeScanTimer / SCAN_DURATION_SECONDS));
    state.setScanProgress(p, entity.type === 'dyson_shell' ? 'SCANNING DYSON SHELL' : 'SCANNING PLANET');

    if (p < 1) return;

    state.markBodyScanned(state.currentSystemId, targetId, state.galaxyYear);
    this.currentVisitScannedHosts.add(targetId);
    const revealed = this.sceneRenderer.revealLandingSitesForHost(targetId);
    const stats = this.sceneRenderer.getLandingSiteStatsForHost(targetId);
    this.clear(state);
    state.setAlert(`LANDING SITES MAPPED: ${revealed} NEW · ${stats.total} TOTAL`);
    setTimeout(() => useGameState.getState().setAlert(null), 1800);
  }

  clear(state: ReturnType<typeof useGameState.getState>): void {
    this.activeScanTargetId = null;
    this.activeScanTimer = 0;
    state.setScanProgress(0, null);
  }

  restoreIntelForSystem(state: ReturnType<typeof useGameState.getState>): void {
    const perSystem = state.scannedBodies[state.currentSystemId];
    if (!perSystem) return;
    const freshBodyIds = new Set<string>();
    for (const [bodyId, scannedYear] of Object.entries(perSystem) as [ScannableBodyId, GalaxyYear][]) {
      if (state.galaxyYear - scannedYear <= SCAN_INTEL_MAX_AGE_YEARS) {
        freshBodyIds.add(bodyId);
      }
    }
    if (freshBodyIds.size > 0) {
      this.sceneRenderer.revealLandingSitesForHosts(freshBodyIds);
    }
  }

  syncFromState(state: ReturnType<typeof useGameState.getState>): void {
    this.currentVisitScannedHosts.clear();
    const perSystem = state.scannedBodies[state.currentSystemId];
    if (!perSystem) return;
    for (const [bodyId, scannedYear] of Object.entries(perSystem) as [ScannableBodyId, GalaxyYear][]) {
      if (state.galaxyYear - scannedYear <= SCAN_INTEL_MAX_AGE_YEARS) {
        this.currentVisitScannedHosts.add(bodyId);
      }
    }
  }
}
