import * as THREE from 'three';
import { PALETTE } from '../constants';
import {
  createStarfield, createHyperspaceTunnel, updateHyperspaceTunnel,
  createHyperspaceGrid, updateHyperspaceGrid,
  type BattleExplosions,
} from './effects';
import { disposeAll as disposeTextureCache } from './textureCache';
import type { SolarSystemData, SystemFactionState } from '../engine';
import type { SystemId, GalaxyYear } from '../types';
import type { NPCShipState } from '../mechanics/NPCSystem';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import type { SceneEntity, XRayTransferStream } from './scene/types';
import type { RuntimeProfile } from '../../runtime/runtimeProfile';
import { LandingSiteManager } from './scene/LandingSiteManager';
import { tickSceneAnimations } from './scene/tickSceneAnimations';
import type { BeamParams } from './scene/tickSceneAnimations';
import { buildSystemScene, type SystemSceneState, GALAXY_SEED } from './scene/buildSystemScene';
export type { SceneEntity } from './scene/types';

export class SceneRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shipGroup: THREE.Group;

  private starfield: THREE.Points;
  private entities: Map<string, SceneEntity> = new Map();
  private npcShips: Map<string, NPCShipState> = new Map();
  private hyperspacePoints: THREE.Points | null = null;
  private hyperspaceGrid: THREE.LineSegments | null = null;
  private systemState: SystemSceneState = {
    systemObjects: [],
    lightningMaterials: [],
    dysonShellMaterials: [],
    xRayTransferStreams: [],
    xbDiskGroup: null,
    mqJetParams: null,
    mqJetGroup: null,
    pulsarBeamGroup: null,
    pulsarBeamAngle: 0,
    pulsarBeamParams: null,
    pulsarStarMat: null,
    battleProjectiles: null,
    battleExplosions: null,
    fleetBattleData: null,
    collidables: [],
    starLight: null,
  };
  private readonly canvas: HTMLCanvasElement;
  private runtimeProfile: RuntimeProfile | null;
  private contextLost = false;
  private readonly onContextLost?: () => void;
  private readonly onContextRestored?: () => void;
  private landingSites: LandingSiteManager;

  constructor(
    canvas: HTMLCanvasElement,
    options?: {
      runtimeProfile?: RuntimeProfile | null;
      onContextLost?: () => void;
      onContextRestored?: () => void;
    },
  ) {
    if (!canvas.getContext('webgl2')) throw new Error('WebGL 2 required');
    this.canvas = canvas;
    this.runtimeProfile = options?.runtimeProfile ?? null;
    this.onContextLost = options?.onContextLost;
    this.onContextRestored = options?.onContextRestored;

    const antialias = this.runtimeProfile?.qualityTier !== 'medium';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias });
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.renderer.setClearColor(PALETTE.bg);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(PALETTE.bg, 0.000015);

    this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 1, 80000);

    // Ship group: camera attached here
    this.shipGroup = new THREE.Group();
    this.shipGroup.add(this.camera);
    this.scene.add(this.shipGroup);

    this.starfield = createStarfield(GALAXY_SEED);
    this.scene.add(this.starfield);

    this.landingSites = new LandingSiteManager(this.entities);

    // Ambient light
    this.scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.3));

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    window.visualViewport?.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, { passive: false });
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private getPixelRatio(): number {
    const cap = this.runtimeProfile?.pixelRatioCap ?? window.devicePixelRatio;
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap));
  }

  private getViewportSize(): { width: number; height: number } {
    const vv = window.visualViewport;
    if (vv) {
      return {
        width: Math.max(1, Math.floor(vv.width)),
        height: Math.max(1, Math.floor(vv.height)),
      };
    }
    return {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    };
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.onContextLost?.();
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.renderer.resetState();
    this.handleResize();
    this.onContextRestored?.();
  };

  private handleResize = () => {
    const { width: w, height: h } = this.getViewportSize();
    this.renderer.setPixelRatio(this.getPixelRatio());
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  loadSystem(
    data: SolarSystemData,
    systemId: SystemId,
    galaxyYear: GalaxyYear = 0 as GalaxyYear,
    systemName = '',
    factionState?: SystemFactionState,
    galaxyX = 0,
    galaxyY = 0,
  ): void {
    // Dispose GPU resources and remove old system objects
    for (const obj of this.systemState.systemObjects) {
      this.disposeObject3D(obj);
      this.scene.remove(obj);
    }
    this.entities.clear();
    this.npcShips.clear();
    this.landingSites.resetCounter();

    // Dispose old starfield
    this.scene.remove(this.starfield);
    this.starfield.geometry.dispose();
    (this.starfield.material as THREE.Material).dispose();

    // Remove old starLight from scene if present
    if (this.systemState.starLight) this.scene.remove(this.systemState.starLight);

    const { state, starfield } = buildSystemScene({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      runtimeProfile: this.runtimeProfile,
      entities: this.entities,
      npcShips: this.npcShips,
      landingSites: this.landingSites,
      data,
      systemId,
      galaxyYear,
      systemName,
      factionState,
      galaxyX,
      galaxyY,
    });

    this.systemState = state;
    this.starfield = starfield;
  }

  getLandingSiteStatsForHost(hostId: string): { total: number; discovered: number } {
    return this.landingSites.getStatsForHost(hostId);
  }

  revealLandingSitesForHost(hostId: string): number {
    return this.landingSites.revealForHost(hostId);
  }

  revealLandingSitesForHosts(hostIds: Set<string>): number {
    return this.landingSites.revealForHosts(hostIds);
  }

  getCollidables(): SceneEntity[] {
    return this.systemState.collidables;
  }

  updateOrbits(time: number, dt = 0): void {
    this.systemState.pulsarBeamAngle = tickSceneAnimations({
      entities: this.entities,
      npcShips: this.npcShips,
      collidables: this.systemState.collidables,
      camera: this.camera,
      xRayTransferStreams: this.systemState.xRayTransferStreams,
      xbDiskGroup: this.systemState.xbDiskGroup,
      lightningMaterials: this.systemState.lightningMaterials,
      dysonShellMaterials: this.systemState.dysonShellMaterials,
      pulsarBeamGroup: this.systemState.pulsarBeamGroup,
      pulsarBeamAngle: this.systemState.pulsarBeamAngle,
      pulsarBeamParams: this.systemState.pulsarBeamParams,
      pulsarStarMat: this.systemState.pulsarStarMat,
      mqJetGroup: this.systemState.mqJetGroup,
      battleProjectiles: this.systemState.battleProjectiles,
      battleExplosions: this.systemState.battleExplosions,
      time,
      dt,
    });
  }

  getEntityWorldPos(id: string): THREE.Vector3 | null {
    return this.entities.get(id)?.worldPos ?? null;
  }

  getEntity(id: string): SceneEntity | undefined {
    return this.entities.get(id);
  }

  getAllEntities(): Map<string, SceneEntity> {
    return this.entities;
  }

  removeLandingSite(id: string): void {
    this.landingSites.remove(id);
  }

  getNPCShip(id: string): NPCShipState | undefined {
    return this.npcShips.get(id);
  }

  getFleetBattle(): FleetBattle | null {
    return this.systemState.fleetBattleData;
  }

  getMicroquasarJetParams(): { axis: THREE.Vector3; halfAngle: number; length: number; starEntityId: string } | null {
    return this.systemState.mqJetParams;
  }

  getPulsarBeamParams(): { axis: THREE.Vector3; halfAngle: number; length: number; starEntityId: string } | null {
    return this.systemState.pulsarBeamParams;
  }

  getXRayStreamCurveBuffer(): Float32Array | null {
    return this.systemState.xRayTransferStreams.length > 0 ? this.systemState.xRayTransferStreams[0].curveBuffer : null;
  }

  startHyperspace(): void {
    this.hyperspacePoints = createHyperspaceTunnel(this.scene);
    this.hyperspaceGrid = createHyperspaceGrid(this.scene);
  }

  updateHyperspace(dt: number): void {
    if (this.hyperspacePoints) updateHyperspaceTunnel(this.hyperspacePoints, dt);
    if (this.hyperspaceGrid) updateHyperspaceGrid(this.hyperspaceGrid, dt);
  }

  stopHyperspace(): void {
    if (this.hyperspacePoints) {
      this.scene.remove(this.hyperspacePoints);
      this.hyperspacePoints = null;
    }
    if (this.hyperspaceGrid) {
      this.scene.remove(this.hyperspaceGrid);
      this.hyperspaceGrid = null;
    }
  }

  render(): void {
    if (this.contextLost) return;
    this.camera.getWorldPosition(this.starfield.position);
    this.renderer.render(this.scene, this.camera);
  }

  private disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) mat?.dispose();
      }
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    for (const obj of this.systemState.systemObjects) this.disposeObject3D(obj);
    disposeTextureCache();
    this.renderer.dispose();
  }
}
