import * as THREE from 'three';
import { PALETTE, STAR_COLORS, STAR_ATTRIBUTES } from '../constants';
import {
  createStarfield, createHyperspaceTunnel, updateHyperspaceTunnel,
  createHyperspaceGrid, updateHyperspaceGrid,
  createBattleProjectiles, updateBattleProjectiles,
  createBattleExplosions, updateBattleExplosions,
  type BattleExplosions,
} from './effects';
import {
  makePlanet, makeGasGiant, makeStation, makeGlowSprite,
  makeAsteroidBelt, makeRingMesh, makeNPCShipMesh, makeFleetShipMesh,
  makeAsteroidBase, makeOortCloudBase, makeMaximumSpaceBase,
  makeTexturedPlanet, makeTexturedGasGiant, makeTexturedRing,
  makeRingSystem,
  addCityLights, addSunAtmosphere, addLightning, addCloudLayer,
  makeDysonShellSegment, addDysonWeatherLayer,
} from './meshFactory';
import { selectSkin } from './planetSkins';
import { disposeAll as disposeTextureCache } from './textureCache';
import type { SolarSystemData, SystemFactionState } from '../engine';
import { generateNPCShips } from '../mechanics/NPCSystem';
import type { NPCShipState } from '../mechanics/NPCSystem';
import { generateFleetBattle } from '../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import { getFaction } from '../data/factions';
import { PRNG } from '../generation/prng';
import { CLUSTER_SEED, RENDER_CONFIG } from '../constants';

const _npcCollisionVec = new THREE.Vector3();
const _streamVecA = new THREE.Vector3();
const _streamVecB = new THREE.Vector3();
const _streamVecC = new THREE.Vector3();
const _streamVecD = new THREE.Vector3();
const _streamVecE = new THREE.Vector3();
const _streamVecF = new THREE.Vector3();
const _streamVecG = new THREE.Vector3();
const _streamVecH = new THREE.Vector3();
const _streamVecI = new THREE.Vector3();
const GALAXY_SEED = 0x5AFEF00D;
const STARFIELD_POS_SCALE = (Math.PI / 2) / 100;
const STARFIELD_YEAR_SCALE = 0.0002;

interface XRayTransferStream {
  donorId: string;
  accretorId: string;
  curveBias: number;
  phase: number;
  flowSpeed: number;
  diskImpactRadius: number;
  curveBuffer: Float32Array;
  spine: THREE.Mesh;
  ribbon: THREE.Mesh;
  donorColor: THREE.Color;
  highlightColor: THREE.Color;
}

let xRayStreamRibbonTexture: THREE.CanvasTexture | null = null;

interface BlackHoleVisualStyle {
  diskColor: string;
  midColor: string;
  hotColor: string;
  crescentColor: string;
  outerGlowColor: number;
  brightArcColor: number;
  outerGlowOpacity: number;
}

function createBlackHoleDiskTexture(style: BlackHoleVisualStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outer = canvas.width * 0.46;
  const inner = canvas.width * 0.2;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0.0, style.hotColor);
  grad.addColorStop(0.2, style.diskColor);
  grad.addColorStop(0.4, style.midColor);
  grad.addColorStop(0.66, style.crescentColor.replace('0.95', '0.24'));
  grad.addColorStop(1.0, style.crescentColor.replace('0.95', '0'));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fill();

  const crescent = ctx.createRadialGradient(cx + canvas.width * 0.11, cy - canvas.height * 0.06, canvas.width * 0.03, cx, cy, outer);
  crescent.addColorStop(0.0, style.crescentColor);
  crescent.addColorStop(0.24, style.diskColor.replace('0.92', '0.74'));
  crescent.addColorStop(0.56, style.midColor.replace('0.72', '0.14'));
  crescent.addColorStop(1.0, style.midColor.replace('0.72', '0'));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = crescent;
  ctx.beginPath();
  ctx.ellipse(cx + canvas.width * 0.06, cy - canvas.height * 0.04, canvas.width * 0.36, canvas.height * 0.22, -0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createBlackHoleGroup(radius: number, xRayMode = false): THREE.Group {
  const group = new THREE.Group();
  const style: BlackHoleVisualStyle = xRayMode
    ? {
      diskColor: 'rgba(255,214,248,0.92)',
      midColor: 'rgba(154,208,255,0.72)',
      hotColor: 'rgba(245,248,255,0.98)',
      crescentColor: 'rgba(255,255,255,0.95)',
      outerGlowColor: 0x8FD4FF,
      brightArcColor: 0xFEE0FF,
      outerGlowOpacity: 0.3,
    }
    : {
      diskColor: 'rgba(255,210,150,0.92)',
      midColor: 'rgba(255,144,72,0.72)',
      hotColor: 'rgba(255,250,235,0.98)',
      crescentColor: 'rgba(255,255,245,0.95)',
      outerGlowColor: 0xFF7A2E,
      brightArcColor: 0xFFF1CF,
      outerGlowOpacity: 0.24,
    };

  const disk = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.6, radius * 2.9, 96),
    new THREE.MeshBasicMaterial({
      map: createBlackHoleDiskTexture(style),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  disk.rotation.x = Math.PI / 2;
  disk.rotation.z = 0.45;
  disk.scale.set(1.2, 0.68, 1);
  group.add(disk);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.62, radius * 0.09, 10, 72),
    new THREE.MeshBasicMaterial({
      color: style.brightArcColor,
      transparent: true,
      opacity: xRayMode ? 0.5 : 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.rotation.z = 0.54;
  innerRing.scale.set(1.08, 0.72, 1);
  group.add(innerRing);

  const outerGlow = makeGlowSprite(style.outerGlowColor, radius * (xRayMode ? 5.6 : 5.2));
  const outerGlowMat = outerGlow.material as THREE.SpriteMaterial;
  outerGlowMat.opacity = style.outerGlowOpacity;
  group.add(outerGlow);

  const brightArc = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.78, radius * 0.16, 10, 96, Math.PI * 1.12),
    new THREE.MeshBasicMaterial({
      color: style.brightArcColor,
      transparent: true,
      opacity: xRayMode ? 0.86 : 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  brightArc.rotation.x = Math.PI / 2;
  brightArc.rotation.z = 0.62;
  brightArc.position.x = radius * 0.16;
  brightArc.scale.set(1.06, 0.64, 1);
  group.add(brightArc);

  const shadowCore = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x020202 }),
  );
  group.add(shadowCore);

  const innerShadow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  group.add(innerShadow);

  group.userData.blackHole = true;
  return group;
}

function getXRayStreamRibbonTexture(): THREE.CanvasTexture {
  if (xRayStreamRibbonTexture) return xRayStreamRibbonTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    xRayStreamRibbonTexture = new THREE.CanvasTexture(canvas);
    return xRayStreamRibbonTexture;
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0.0, 'rgba(255,255,255,0.02)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.28)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
  vertical.addColorStop(0.0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,1)');
  vertical.addColorStop(0.8, 'rgba(255,255,255,0.55)');
  vertical.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < 18; i++) {
    const x = (i / 18) * canvas.width;
    const w = 18 + (i % 5) * 12;
    const band = ctx.createLinearGradient(x - w, 0, x + w, 0);
    band.addColorStop(0.0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    band.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = band;
    ctx.fillRect(x - w, 0, w * 2, canvas.height);
  }

  ctx.globalCompositeOperation = 'source-over';
  xRayStreamRibbonTexture = new THREE.CanvasTexture(canvas);
  xRayStreamRibbonTexture.wrapS = THREE.RepeatWrapping;
  xRayStreamRibbonTexture.wrapT = THREE.ClampToEdgeWrapping;
  xRayStreamRibbonTexture.repeat.set(2.4, 1);
  xRayStreamRibbonTexture.needsUpdate = true;
  return xRayStreamRibbonTexture;
}

function createXRayTransferStream(donorColorValue: number, diskImpactRadius: number): XRayTransferStream {
  const donorColor = new THREE.Color(donorColorValue);
  const highlightColor = donorColor.clone().lerp(new THREE.Color(0xFFF7EE), 0.62);
  const ribbonSegmentCount = 44;

  // Curve centerline — written each frame, sampled by both tube and ribbon
  const curveBuffer = new Float32Array(36 * 3);

  // Pre-allocate tube mesh (cylinder along the stream spine)
  const tubeSeg = 20;
  const tubeSides = 6;
  const tubePositions = new Float32Array(tubeSeg * tubeSides * 3);
  const tubeIndices = new Uint16Array((tubeSeg - 1) * tubeSides * 6);
  for (let s = 0; s < tubeSeg - 1; s++) {
    for (let n = 0; n < tubeSides; n++) {
      const idx = (s * tubeSides + n) * 6;
      const a = s * tubeSides + n;
      const b = s * tubeSides + (n + 1) % tubeSides;
      const c = (s + 1) * tubeSides + n;
      const d = (s + 1) * tubeSides + (n + 1) % tubeSides;
      tubeIndices[idx] = a; tubeIndices[idx + 1] = b; tubeIndices[idx + 2] = c;
      tubeIndices[idx + 3] = b; tubeIndices[idx + 4] = d; tubeIndices[idx + 5] = c;
    }
  }
  const spine = new THREE.Mesh(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(tubePositions, 3))
      .setIndex(new THREE.BufferAttribute(tubeIndices, 1)),
    new THREE.MeshBasicMaterial({
      color: highlightColor,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const ribbonPositions = new Float32Array(ribbonSegmentCount * 2 * 3);
  const ribbonColors = new Float32Array(ribbonSegmentCount * 2 * 3);
  const ribbonUvs = new Float32Array(ribbonSegmentCount * 2 * 2);
  const ribbonIndices = new Uint16Array((ribbonSegmentCount - 1) * 6);
  for (let i = 0; i < ribbonSegmentCount; i++) {
    const t = i / (ribbonSegmentCount - 1);
    const color = donorColor.clone().lerp(highlightColor, 0.18 + Math.sin(t * Math.PI) * 0.4);
    for (let side = 0; side < 2; side++) {
      const vertexIndex = i * 2 + side;
      ribbonColors[vertexIndex * 3] = color.r;
      ribbonColors[vertexIndex * 3 + 1] = color.g;
      ribbonColors[vertexIndex * 3 + 2] = color.b;
      ribbonUvs[vertexIndex * 2] = t;
      ribbonUvs[vertexIndex * 2 + 1] = side;
    }
    if (i < ribbonSegmentCount - 1) {
      const idx = i * 6;
      const base = i * 2;
      ribbonIndices[idx] = base;
      ribbonIndices[idx + 1] = base + 1;
      ribbonIndices[idx + 2] = base + 2;
      ribbonIndices[idx + 3] = base + 1;
      ribbonIndices[idx + 4] = base + 3;
      ribbonIndices[idx + 5] = base + 2;
    }
  }

  const ribbon = new THREE.Mesh(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3))
      .setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3))
      .setAttribute('uv', new THREE.BufferAttribute(ribbonUvs, 2))
      .setIndex(new THREE.BufferAttribute(ribbonIndices, 1)),
    new THREE.MeshBasicMaterial({
      color: highlightColor,
      map: getXRayStreamRibbonTexture(),
      alphaMap: getXRayStreamRibbonTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  return {
    donorId: 'companion-star',
    accretorId: 'star',
    curveBias: 0.22,
    phase: Math.random() * Math.PI * 2,
    flowSpeed: 0.065,
    diskImpactRadius,
    curveBuffer,
    spine,
    ribbon,
    donorColor,
    highlightColor,
  };
}

function writeQuadraticPoint(
  target: Float32Array,
  offset: number,
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
): void {
  const omt = 1 - t;
  const a = omt * omt;
  const b = 2 * omt * t;
  const c = t * t;
  target[offset] = start.x * a + control.x * b + end.x * c;
  target[offset + 1] = start.y * a + control.y * b + end.y * c;
  target[offset + 2] = start.z * a + control.z * b + end.z * c;
}

export interface SceneEntity {
  id: string;
  group: THREE.Object3D;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination?: number;
  orbitNode?: number;
  shellCurveRadius?: number;
  parentId?: string;
  type: 'planet' | 'station' | 'star' | 'moon' | 'npc_ship' | 'fleet_ship' | 'dyson_shell';
  worldPos: THREE.Vector3; // updated each frame
  collisionRadius: number;
}

export class SceneRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shipGroup: THREE.Group;

  private starfield: THREE.Points;
  private entities: Map<string, SceneEntity> = new Map();
  private npcShips: Map<string, NPCShipState> = new Map();
  private starLight: THREE.PointLight | null = null;
  private hyperspacePoints: THREE.Points | null = null;
  private hyperspaceGrid: THREE.LineSegments | null = null;
  private systemObjects: THREE.Object3D[] = [];
  private lightningMaterials: THREE.ShaderMaterial[] = [];
  private battleProjectiles: THREE.Points | null = null;
  private battleExplosions: BattleExplosions | null = null;
  private fleetBattleData: FleetBattle | null = null;
  private collidables: SceneEntity[] = [];
  private xRayTransferStreams: XRayTransferStream[] = [];
  private xbDiskGroup: THREE.Group | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Prefer WebGL2, with WebGL1 fallback for older environments.
    const gl2 = canvas.getContext('webgl2', { antialias: true });
    const gl1 = gl2 ? null : (canvas.getContext('webgl', { antialias: true }) ?? canvas.getContext('experimental-webgl'));
    this.renderer = gl2
      ? new THREE.WebGLRenderer({ canvas, context: gl2, antialias: true })
      : gl1
        ? new THREE.WebGLRenderer({ canvas, context: gl1 as WebGLRenderingContext, antialias: true })
        : new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
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

    // Ambient light
    this.scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.3));

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  loadSystem(
    data: SolarSystemData,
    systemId: number,
    galaxyYear = 0,
    systemName = '',
    factionState?: SystemFactionState,
    galaxyX = 0,
    galaxyY = 0,
  ): void {
    // Remove old system objects
    this.systemObjects.forEach(o => this.scene.remove(o));
    this.systemObjects = [];
    this.lightningMaterials = [];
    this.entities.clear();
    this.npcShips.clear();
    this.battleProjectiles = null;
    this.battleExplosions = null;
    this.fleetBattleData = null;
    this.xRayTransferStreams = [];
    this.xbDiskGroup = null;

    this.scene.remove(this.starfield);
    this.starfield.geometry.dispose();
    (this.starfield.material as THREE.Material).dispose();
    const yaw = galaxyX * STARFIELD_POS_SCALE + galaxyYear * STARFIELD_YEAR_SCALE;
    const pitch = galaxyY * STARFIELD_POS_SCALE;
    this.starfield = createStarfield(GALAXY_SEED, yaw, pitch);
    this.scene.add(this.starfield);

    // Star
    const starColor = STAR_COLORS[data.starType] ?? PALETTE.starG;
    const isBlackHole = data.starType === 'BH';
    const isIntense = data.starType === 'NS' || data.starType === 'PU' || data.starType === 'MG';
    const starGroup = new THREE.Group();
    let starOrbitRadius = 0;
    let starOrbitSpeed = 0;
    let starOrbitPhase = 0;

    if (isBlackHole) {
      starGroup.add(createBlackHoleGroup(data.starRadius));

      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = new THREE.PointLight(0xFF8B47, 0.9, 60000);
      this.scene.add(this.starLight);
      this.systemObjects.push(this.starLight);
    } else if (data.starType === 'XB' && data.companion) {
      const companion = data.companion;

      // Compact accretor — same visual language as BH, but brighter in X-ray.
      this.xbDiskGroup = createBlackHoleGroup(data.starRadius, true);
      starGroup.add(this.xbDiskGroup);

      const diskHalo = makeGlowSprite(0xA9DCFF, data.starRadius * 10.5);
      const diskHaloMat = diskHalo.material as THREE.SpriteMaterial;
      diskHaloMat.opacity = 0.24;
      starGroup.add(diskHalo);

      const xRayCorona = makeGlowSprite(starColor, data.starRadius * 12.6);
      const xRayCoronaMat = xRayCorona.material as THREE.SpriteMaterial;
      xRayCoronaMat.opacity = 0.24;
      starGroup.add(xRayCorona);

      // Light travels with the compact object group (no static starLight needed)
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = null;
      starGroup.add(new THREE.PointLight(starColor, 2, 60000));

      // Compact object orbits opposite the companion, closer to CoM
      starOrbitRadius = companion.orbitRadius * 0.4;
      starOrbitSpeed = companion.orbitSpeed;
      starOrbitPhase = companion.orbitPhase + Math.PI;
      starGroup.position.set(
        Math.cos(starOrbitPhase) * starOrbitRadius, 0,
        Math.sin(starOrbitPhase) * starOrbitRadius,
      );

      // Companion star
      const companionGroup = new THREE.Group();
      companionGroup.add(new THREE.Mesh(
        new THREE.SphereGeometry(companion.radius, 8, 8),
        new THREE.MeshBasicMaterial({ color: companion.color }),
      ));
      companionGroup.add(makeGlowSprite(companion.color, companion.radius * 6));
      companionGroup.add(new THREE.PointLight(companion.color, 1.5, 60000));
      companionGroup.position.set(
        Math.cos(companion.orbitPhase) * companion.orbitRadius, 0,
        Math.sin(companion.orbitPhase) * companion.orbitRadius,
      );
      this.scene.add(companionGroup);
      this.systemObjects.push(companionGroup);

      this.entities.set('companion-star', {
        id: 'companion-star',
        group: companionGroup,
        orbitRadius: companion.orbitRadius,
        orbitSpeed: companion.orbitSpeed,
        orbitPhase: companion.orbitPhase,
        type: 'star',
        worldPos: new THREE.Vector3(
          Math.cos(companion.orbitPhase) * companion.orbitRadius, 0,
          Math.sin(companion.orbitPhase) * companion.orbitRadius,
        ),
        collisionRadius: companion.radius,
      });
    } else {
      // Normal/exotic star sphere
      const starGeo = new THREE.SphereGeometry(data.starRadius, 8, 8);
      const starMat = new THREE.MeshBasicMaterial({ color: starColor });
      starGroup.add(new THREE.Mesh(starGeo, starMat));

      // Glow sprite — size and presence driven by star attributes
      const starAttrs = STAR_ATTRIBUTES[data.starType];
      if (starAttrs?.glow) {
        const glow = makeGlowSprite(starColor, data.starRadius * starAttrs.glowMul);
        starGroup.add(glow);
      }

      // Pulsar beam jets — tapered cones anchored at the star surface
      if (data.starType === 'PU') {
        const beamColor = 0x44AAFF;
        const beamLen = data.starRadius * 12;
        const baseWidth = data.starRadius * 0.6;
        const tipWidth = data.starRadius * 0.05;
        const beamMat = new THREE.MeshBasicMaterial({
          color: beamColor,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        for (const sign of [1, -1]) {
          const beamGeo = new THREE.CylinderGeometry(tipWidth, baseWidth, beamLen, 8, 1, true);
          const beam = new THREE.Mesh(beamGeo, beamMat);
          // Position so the wide base sits at the star surface
          beam.position.set(0, sign * (data.starRadius + beamLen / 2), 0);
          if (sign < 0) beam.rotation.x = Math.PI;
          starGroup.add(beam);
          // Inner brighter core
          const coreGeo = new THREE.CylinderGeometry(tipWidth * 0.3, baseWidth * 0.3, beamLen, 6, 1, true);
          const coreMat = beamMat.clone();
          coreMat.opacity = 0.7;
          const core = new THREE.Mesh(coreGeo, coreMat);
          core.position.copy(beam.position);
          if (sign < 0) core.rotation.x = Math.PI;
          starGroup.add(core);
        }
      }

      // Point light
      const lightIntensity = isIntense ? 3 : 2;
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = new THREE.PointLight(starColor, lightIntensity, 60000);
      this.scene.add(this.starLight);
      this.systemObjects.push(this.starLight);
    }

    this.scene.add(starGroup);
    this.systemObjects.push(starGroup);

    this.entities.set('star', {
      id: 'star',
      group: starGroup,
      orbitRadius: starOrbitRadius,
      orbitSpeed: starOrbitSpeed,
      orbitPhase: starOrbitPhase,
      type: 'star',
      worldPos: new THREE.Vector3(
        Math.cos(starOrbitPhase) * starOrbitRadius, 0,
        Math.sin(starOrbitPhase) * starOrbitRadius,
      ),
      collisionRadius: data.starRadius,
    });

    if (data.starType === 'XB' && data.companion) {
      const transferStream = createXRayTransferStream(data.companion.color, data.starRadius * 1.9);
      this.scene.add(transferStream.spine);
      this.scene.add(transferStream.ribbon);
      this.systemObjects.push(transferStream.spine, transferStream.ribbon);
      this.xRayTransferStreams.push(transferStream);
      this.updateXRayTransferStreams(0);
    }

    const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 97 + 13);
    // Fork an isolated PRNG for skin selection — parent rng stream is unaffected
    // by how many skins are picked, and determinism holds whether textures are on or off.
    const skinRng = rng.fork();
    const texturesEnabled = RENDER_CONFIG.planetTexturesEnabled;
    const wireOverlay = RENDER_CONFIG.planetWireOverlayEnabled;

    // Planets
    for (const planet of data.planets) {
      let planetGroup: THREE.Group;
      // Stable seed per planet — shared between continent shader and city lights
      const planetSeed = rng.next() * 100;
      if (texturesEnabled) {
        const category = planet.type === 'gas_giant' ? 'gas' : 'rocky';
        const skin = selectSkin(category, skinRng);
        planetGroup = planet.type === 'gas_giant'
          ? makeTexturedGasGiant(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.gasType)
          : makeTexturedPlanet(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.surfaceType);
      } else {
        planetGroup = planet.type === 'gas_giant'
          ? makeGasGiant(planet.radius, planet.color, () => rng.next(), planetSeed, planet.gasType,
              planet.greatSpot, planet.greatSpotLat, planet.greatSpotSize)
          : makePlanet(planet.radius, planet.color, 1, planetSeed, planet.surfaceType);
      }
      // Cloud layer for rocky planets
      if (planet.hasClouds && planet.type !== 'gas_giant') {
        addCloudLayer(planetGroup, planet.radius, planetSeed, planet.cloudDensity, planet.surfaceType);
      }
      // City lights + sun atmosphere for non-gas-giant planets
      if (planet.type !== 'gas_giant') {
        addCityLights(planetGroup, planet.radius, planetSeed, planet.surfaceType);
        addSunAtmosphere(planetGroup, planet.radius);
      }
      if (rng.next() < 0.05) {
        this.lightningMaterials.push(addLightning(planetGroup, planet.radius, planetSeed));
      }

      planetGroup.position.set(planet.orbitRadius, 0, 0);
      this.scene.add(planetGroup);
      this.systemObjects.push(planetGroup);

      this.entities.set(planet.id, {
        id: planet.id,
        group: planetGroup,
        orbitRadius: planet.orbitRadius,
        orbitSpeed: planet.orbitSpeed,
        orbitPhase: planet.orbitPhase,
        type: 'planet',
        worldPos: new THREE.Vector3(),
        collisionRadius: planet.radius,
      });

      // Rings
      if (planet.hasRings) {
        const ringSeed = Math.floor(rng.next() * 0xFFFFFF);
        const ringGroup = makeRingSystem(
          planet.radius,
          planet.ringCount,
          planet.ringInclination,
          ringSeed,
          planet.gasType,
        );
        planetGroup.add(ringGroup);
      }

      // Station
      if (planet.hasStation) {
        const stationGroup = makeStation(60);
        const stationId = `station-${planet.id}`;
        this.scene.add(stationGroup);
        this.systemObjects.push(stationGroup);
        this.entities.set(stationId, {
          id: stationId,
          group: stationGroup,
          orbitRadius: planet.radius * 2.5,
          orbitSpeed: planet.orbitSpeed * 2,
          orbitPhase: rng.next() * Math.PI * 2,
          parentId: planet.id,
          type: 'station',
          worldPos: new THREE.Vector3(),
          collisionRadius: 0,
        });
      }

      // Moons
      for (const moon of planet.moons) {
        const moonSeed = rng.next() * 100;
        let moonGroup: THREE.Group;
        if (texturesEnabled) {
          const skin = selectSkin('moon', skinRng);
          moonGroup = makeTexturedPlanet(moon.radius, moon.color, skin, wireOverlay, moonSeed, moon.surfaceType);
        } else {
          moonGroup = makePlanet(moon.radius, moon.color, 0, moonSeed, moon.surfaceType);
        }
        if (moon.hasClouds) {
          addCloudLayer(moonGroup, moon.radius, moonSeed, moon.cloudDensity, moon.surfaceType);
        }
        addCityLights(moonGroup, moon.radius, moonSeed, moon.surfaceType);
        addSunAtmosphere(moonGroup, moon.radius);
        if (rng.next() < 0.05) {
          this.lightningMaterials.push(addLightning(moonGroup, moon.radius, moonSeed));
        }
        this.scene.add(moonGroup);
        this.systemObjects.push(moonGroup);
        this.entities.set(moon.id, {
          id: moon.id,
          group: moonGroup,
          orbitRadius: moon.orbitRadius,
          orbitSpeed: moon.orbitSpeed,
          orbitPhase: moon.orbitPhase,
          parentId: planet.id,
          type: 'moon',
          worldPos: new THREE.Vector3(),
          collisionRadius: moon.radius,
        });
      }
    }

    for (const shell of data.dysonShells) {
      const shellSeed = rng.next() * 100;
      const shellGroup = makeDysonShellSegment(
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shell.color,
        shellSeed,
      );
      const shellWeather = addDysonWeatherLayer(
        shellGroup,
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shellSeed,
        shell.weatherBands,
      );
      this.lightningMaterials.push(shellWeather);
      shellGroup.userData.interactionMode = shell.interactionMode;
      {
        const a = shell.orbitPhase;
        const r = shell.orbitRadius;
        const incl = shell.orbitInclination;
        const node = shell.orbitNode;
        const cosN = Math.cos(node), sinN = Math.sin(node);
        const cosA = Math.cos(a), sinA = Math.sin(a);
        const cosI = Math.cos(incl), sinI = Math.sin(incl);
        shellGroup.position.set(
          r * (cosN * cosA - sinN * sinA * cosI),
          r * sinA * sinI,
          r * (sinN * cosA + cosN * sinA * cosI),
        );
      }
      shellGroup.lookAt(0, 0, 0);
      shellGroup.rotateY(Math.PI);
      this.scene.add(shellGroup);
      this.systemObjects.push(shellGroup);

      this.entities.set(shell.id, {
        id: shell.id,
        group: shellGroup,
        orbitRadius: shell.orbitRadius,
        orbitSpeed: shell.orbitSpeed,
        orbitPhase: shell.orbitPhase,
        orbitInclination: shell.orbitInclination,
        orbitNode: shell.orbitNode,
        shellCurveRadius: shell.curveRadius,
        type: 'dyson_shell',
        worldPos: new THREE.Vector3(),
        collisionRadius: Math.max(120, shell.curveRadius * 0.35),
      });
    }

    // Asteroid belt
    if (data.asteroidBelt) {
      const ab = data.asteroidBelt;
      const belt = makeAsteroidBelt(ab.innerRadius, ab.outerRadius, ab.count, () => rng.next());
      this.scene.add(belt);
      this.systemObjects.push(belt);
    }

    // Secret bases
    for (const base of data.secretBases) {
      let baseGroup: THREE.Group;
      switch (base.type) {
        case 'asteroid':
          baseGroup = makeAsteroidBase(35);
          break;
        case 'oort_cloud':
          baseGroup = makeOortCloudBase(45);
          break;
        case 'maximum_space':
          baseGroup = makeMaximumSpaceBase(55);
          break;
      }
      baseGroup.position.set(
        Math.cos(base.orbitPhase) * base.orbitRadius,
        0,
        Math.sin(base.orbitPhase) * base.orbitRadius,
      );
      this.scene.add(baseGroup);
      this.systemObjects.push(baseGroup);

      this.entities.set(base.id, {
        id: base.id,
        group: baseGroup,
        orbitRadius: base.orbitRadius,
        orbitSpeed: base.orbitSpeed,
        orbitPhase: base.orbitPhase,
        type: 'station', // reuse station type so docking works
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
      });

      // Ambient particles around secret bases
      if (base.type === 'oort_cloud') {
        // Sparse icy debris cloud
        const iceGeo = new THREE.BufferGeometry();
        const iceCount = 120;
        const icePositions = new Float32Array(iceCount * 3);
        for (let i = 0; i < iceCount; i++) {
          const angle2 = rng.next() * Math.PI * 2;
          const dist = base.orbitRadius + (rng.next() - 0.5) * 2000;
          const y2 = (rng.next() - 0.5) * 600;
          icePositions[i * 3] = Math.cos(angle2) * dist;
          icePositions[i * 3 + 1] = y2;
          icePositions[i * 3 + 2] = Math.sin(angle2) * dist;
        }
        iceGeo.setAttribute('position', new THREE.BufferAttribute(icePositions, 3));
        const iceMat = new THREE.PointsMaterial({ color: 0x88BBDD, size: 15, transparent: true, opacity: 0.3 });
        const icePoints = new THREE.Points(iceGeo, iceMat);
        this.scene.add(icePoints);
        this.systemObjects.push(icePoints);
      } else if (base.type === 'maximum_space') {
        // Faint void motes — strange purple specks at the edge of nothing
        const voidGeo = new THREE.BufferGeometry();
        const voidCount = 60;
        const voidPositions = new Float32Array(voidCount * 3);
        for (let i = 0; i < voidCount; i++) {
          const angle2 = rng.next() * Math.PI * 2;
          const dist = base.orbitRadius + (rng.next() - 0.5) * 3000;
          const y2 = (rng.next() - 0.5) * 1000;
          voidPositions[i * 3] = Math.cos(angle2) * dist;
          voidPositions[i * 3 + 1] = y2;
          voidPositions[i * 3 + 2] = Math.sin(angle2) * dist;
        }
        voidGeo.setAttribute('position', new THREE.BufferAttribute(voidPositions, 3));
        const voidMat = new THREE.PointsMaterial({ color: 0x6622CC, size: 20, transparent: true, opacity: 0.2 });
        const voidPoints = new THREE.Points(voidGeo, voidMat);
        this.scene.add(voidPoints);
        this.systemObjects.push(voidPoints);
      }
    }

    // NPC trade ships — waypoints derived from planet initial positions
    const planetIds = data.planets.map(p => p.id);
    const planetPositions = data.planets.map(p =>
      new THREE.Vector3(
        Math.cos(p.orbitPhase) * p.orbitRadius,
        0,
        Math.sin(p.orbitPhase) * p.orbitRadius,
      )
    );

    const npcData = generateNPCShips(data, systemId, galaxyYear, systemName, planetPositions, planetIds, data.mainStationPlanetId);
    for (const shipData of npcData) {
      const mesh = makeNPCShipMesh(shipData.color);
      const startPos = shipData.waypointA.clone().lerp(shipData.waypointB, shipData.t);
      mesh.position.copy(startPos);
      this.scene.add(mesh);
      this.systemObjects.push(mesh);

      this.entities.set(shipData.id, {
        id: shipData.id,
        group: mesh,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'npc_ship',
        worldPos: startPos.clone(),
        collisionRadius: 0,
      });

      this.npcShips.set(shipData.id, {
        id: shipData.id,
        name: shipData.name,
        originSystemName: shipData.originSystemName,
        waypointA: shipData.waypointA,
        waypointB: shipData.waypointB,
        planetIdA: shipData.planetIdA,
        planetIdB: shipData.planetIdB,
        t: shipData.t,
        direction: shipData.direction,
        speed: shipData.speed,
        cargo: shipData.cargo,
        commLines: shipData.commLines,
        factionTag: shipData.factionTag,
      });
    }

    // Fleet battle
    if (factionState) {
      const battle = generateFleetBattle(data, systemId, galaxyYear, factionState);
      this.fleetBattleData = battle;

      if (battle) {
        const battleGroup = new THREE.Group();
        battleGroup.position.copy(battle.position);
        this.scene.add(battleGroup);
        this.systemObjects.push(battleGroup);

        const factionA = getFaction(battle.factionA);
        const factionB = getFaction(battle.factionB);
        const colorA = factionA?.color ?? 0xFF4444;
        const colorB = factionB?.color ?? 0x4488FF;

        const shipWorldPosA: THREE.Vector3[] = [];
        const shipWorldPosB: THREE.Vector3[] = [];

        for (const ship of battle.shipsA) {
          const mesh = makeFleetShipMesh(colorA, ship.scale);
          mesh.position.copy(ship.localOffset);
          battleGroup.add(mesh);

          const worldPos = ship.localOffset.clone().add(battle.position);
          shipWorldPosA.push(worldPos);

          this.entities.set(ship.id, {
            id: ship.id,
            group: mesh,
            orbitRadius: 0,
            orbitSpeed: 0,
            orbitPhase: 0,
            type: 'fleet_ship',
            worldPos: worldPos,
            collisionRadius: 0,
          });
        }

        for (const ship of battle.shipsB) {
          const mesh = makeFleetShipMesh(colorB, ship.scale);
          mesh.position.copy(ship.localOffset);
          battleGroup.add(mesh);

          const worldPos = ship.localOffset.clone().add(battle.position);
          shipWorldPosB.push(worldPos);

          this.entities.set(ship.id, {
            id: ship.id,
            group: mesh,
            orbitRadius: 0,
            orbitSpeed: 0,
            orbitPhase: 0,
            type: 'fleet_ship',
            worldPos: worldPos,
            collisionRadius: 0,
          });
        }

        // Create projectile + explosion effects
        this.battleProjectiles = createBattleProjectiles(
          this.scene, battle.position,
          shipWorldPosA, shipWorldPosB,
          colorA, colorB,
        );
        this.systemObjects.push(this.battleProjectiles);

        this.battleExplosions = createBattleExplosions(this.scene);
        for (const s of this.battleExplosions.sprites) {
          this.systemObjects.push(s);
        }
      }
    }

    this.rebuildCollidables();

    if (import.meta.env.DEV) {
      this.renderer.compile(this.scene, this.camera);
      const failed: string[] = [];
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
          const prog = (this.renderer.properties.get(obj.material) as any)?.currentProgram;
          if (!prog) {
            failed.push(obj.name || obj.uuid);
          }
        }
      });
      if (failed.length > 0) {
        const msg = `SHADER COMPILATION FAILED:\n${failed.join('\n')}`;
        console.error(msg);
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:16px;background:#a00;color:#fff;font:bold 14px monospace;white-space:pre-wrap;z-index:99999';
        div.textContent = msg;
        document.body.appendChild(div);
      }
    }
  }

  private rebuildCollidables(): void {
    this.collidables = [];
    for (const [, entity] of this.entities) {
      if (entity.collisionRadius > 0) {
        this.collidables.push(entity);
      }
    }
  }

  getCollidables(): SceneEntity[] {
    return this.collidables;
  }

  updateOrbits(time: number, dt = 0): void {
    for (const [, entity] of this.entities) {
      if (entity.type === 'star' && entity.orbitRadius === 0) continue;
      if (entity.type === 'npc_ship' || entity.type === 'fleet_ship') continue;

      const angle = entity.orbitPhase + time * entity.orbitSpeed;

      if (entity.parentId) {
        const parent = this.entities.get(entity.parentId);
        if (parent) {
          entity.group.position.set(
            parent.worldPos.x + Math.cos(angle) * entity.orbitRadius,
            parent.worldPos.y,
            parent.worldPos.z + Math.sin(angle) * entity.orbitRadius,
          );
        }
      } else if (entity.type === 'dyson_shell' && entity.orbitInclination != null && entity.orbitNode != null) {
        const [x, y, z] = this.computeDysonShellPosition(
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

      if (entity.type === 'dyson_shell') {
        entity.group.lookAt(0, 0, 0);
        entity.group.rotateY(Math.PI);
        // worldPos must be the shell surface center, not the orbital position.
        // The panel geometry is centered at local (0,0,-curveRadius); after
        // lookAt+rotateY that point lands on the star-facing side of the group.
        entity.worldPos.set(0, 0, -(entity.shellCurveRadius ?? 0));
        entity.group.localToWorld(entity.worldPos);
      } else {
        entity.worldPos.copy(entity.group.position);
      }
    }

    this.updateXRayTransferStreams(time);

    // Fleet ships are children of the battle group, so their local position is
    // not their world position. Keep scanner/targeting coordinates in world
    // space and avoid the generic orbit code snapping them back to the origin.
    for (const [, entity] of this.entities) {
      if (entity.type !== 'fleet_ship') continue;
      entity.group.getWorldPosition(entity.worldPos);
    }

    // Station slowly rotates
    for (const [id, entity] of this.entities) {
      if (entity.type === 'station') {
        entity.group.rotation.z += 0.001;
      }
      void id;
    }

    // NPC ship patrol movement
    if (dt > 0) {
      for (const [, npcState] of this.npcShips) {
        const entity = this.entities.get(npcState.id);
        if (!entity) continue;

        // Keep waypoints tracking orbiting planets
        const pa = this.entities.get(npcState.planetIdA);
        const pb = this.entities.get(npcState.planetIdB);
        if (pa) npcState.waypointA.copy(pa.worldPos);
        if (pb) npcState.waypointB.copy(pb.worldPos);

        const dist = npcState.waypointA.distanceTo(npcState.waypointB);
        if (dist < 1) continue;

        npcState.t += (npcState.speed * dt / dist) * npcState.direction;
        if (npcState.t >= 1) { npcState.t = 1; npcState.direction = -1; }
        if (npcState.t <= 0) { npcState.t = 0; npcState.direction = 1; }

        entity.group.position.lerpVectors(npcState.waypointA, npcState.waypointB, npcState.t);

        // Push NPC out of any collidable body
        for (const body of this.collidables) {
          const diff = _npcCollisionVec.copy(entity.group.position).sub(body.worldPos);
          const dist = diff.length();
          const minDist = body.collisionRadius + 10;
          if (dist < minDist && dist > 0.001) {
            const normal = diff.normalize();
            entity.group.position.copy(body.worldPos).addScaledVector(normal, minDist);
          }
        }

        // Separate NPC ships from each other
        const NPC_SEPARATION = 30;
        for (const [otherId, otherState] of this.npcShips) {
          if (otherId === npcState.id) continue;
          const otherEntity = this.entities.get(otherState.id);
          if (!otherEntity) continue;
          const diff = entity.group.position.clone().sub(otherEntity.worldPos);
          const d = diff.length();
          if (d < NPC_SEPARATION && d > 0.001) {
            entity.group.position.addScaledVector(diff.normalize(), (NPC_SEPARATION - d) * 0.5);
          }
        }

        entity.worldPos.copy(entity.group.position);
      }
    }

    // Tick lightning shaders
    for (const mat of this.lightningMaterials) {
      mat.uniforms.uTime.value = time;
    }

    // Battle projectile + explosion animation
    if (this.battleProjectiles && dt > 0) {
      updateBattleProjectiles(this.battleProjectiles, dt, this.battleExplosions);
    }
    if (this.battleExplosions && dt > 0) {
      updateBattleExplosions(this.battleExplosions, dt);
    }
  }

  private computeDysonShellPosition(
    angle: number, r: number, incl: number, node: number,
  ): [number, number, number] {
    const cosN = Math.cos(node), sinN = Math.sin(node);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const cosI = Math.cos(incl), sinI = Math.sin(incl);
    return [
      r * (cosN * cosA - sinN * sinA * cosI),
      r * sinA * sinI,
      r * (sinN * cosA + cosN * sinA * cosI),
    ];
  }

  private updateXRayTransferStreams(time: number): void {
    for (const stream of this.xRayTransferStreams) {
      const donor = this.entities.get(stream.donorId);
      const accretor = this.entities.get(stream.accretorId);
      if (!donor || !accretor) continue;

      const donorPos = donor.worldPos;
      const accretorPos = accretor.worldPos;
      const diskTarget = _streamVecE.copy(donorPos).sub(accretorPos);
      diskTarget.y = 0;
      if (diskTarget.lengthSq() < 1e-6) {
        diskTarget.set(1, 0, 0);
      } else {
        diskTarget.normalize();
      }
      const diskDirX = diskTarget.x;
      diskTarget.multiplyScalar(stream.diskImpactRadius).add(accretorPos);
      // Tilt the disk impact point to match the accretion disk's rotation.z = 0.45
      diskTarget.y = accretorPos.y + diskDirX * stream.diskImpactRadius * Math.tan(0.45);

      const flow = _streamVecA.copy(diskTarget).sub(donorPos);
      const dist = flow.length();
      if (dist < 1) continue;

      flow.normalize();
      const lateral = _streamVecB.set(-flow.z, 0, flow.x).normalize();
      const control = _streamVecC.copy(donorPos).lerp(diskTarget, 0.58);
      control.addScaledVector(lateral, Math.max(dist * stream.curveBias, 65));
      control.y += Math.sin(time * 0.32 + stream.phase) * Math.max(dist * 0.015, 4);

      // Write bezier centerline into curveBuffer
      const curveBuffer = stream.curveBuffer;
      const curvePointCount = curveBuffer.length / 3;
      for (let i = 0; i < curvePointCount; i++) {
        const t = i / (curvePointCount - 1);
        writeQuadraticPoint(curveBuffer, i * 3, donorPos, control, diskTarget, t);
      }

      // Build tube mesh from curveBuffer using a stable perpendicular frame
      const tubeAttr = stream.spine.geometry.attributes.position as THREE.BufferAttribute;
      const tubeArr = tubeAttr.array as Float32Array;
      const tubeSeg = 20;
      const tubeSides = 6;
      const ribbonHalfWidth = Math.max(dist * 0.026, 20);
      for (let s = 0; s < tubeSeg; s++) {
        const t = s / (tubeSeg - 1);
        const ci = Math.min(Math.floor(t * (curvePointCount - 1)), curvePointCount - 2);
        const ct = t * (curvePointCount - 1) - ci;
        const cOff = ci * 3;
        const nOff = (ci + 1) * 3;
        const cx = curveBuffer[cOff] + (curveBuffer[nOff] - curveBuffer[cOff]) * ct;
        const cy = curveBuffer[cOff + 1] + (curveBuffer[nOff + 1] - curveBuffer[cOff + 1]) * ct;
        const cz = curveBuffer[cOff + 2] + (curveBuffer[nOff + 2] - curveBuffer[cOff + 2]) * ct;
        const pIdx = Math.max(0, ci - 1) * 3;
        const fIdx = Math.min(curvePointCount - 1, ci + 2) * 3;
        const tubeTangent = _streamVecF.set(
          curveBuffer[fIdx] - curveBuffer[pIdx],
          curveBuffer[fIdx + 1] - curveBuffer[pIdx + 1],
          curveBuffer[fIdx + 2] - curveBuffer[pIdx + 2],
        ).normalize();
        // Stable frame: cross with world-up, fallback to world-X if near-parallel
        const tubeN1 = _streamVecH.set(0, 1, 0).cross(tubeTangent);
        if (tubeN1.lengthSq() < 0.01) tubeN1.set(1, 0, 0);
        tubeN1.normalize();
        const tubeN2 = _streamVecI.crossVectors(tubeTangent, tubeN1).normalize();
        const endTaper = 0.28 + 0.72 * Math.cos(t * Math.PI / 2);
        const midBulge = Math.pow(Math.sin(t * Math.PI), 0.7);
        const tubeRadius = ribbonHalfWidth * (0.38 * endTaper + 0.62 * midBulge) * 0.28;
        for (let n = 0; n < tubeSides; n++) {
          const angle = (n / tubeSides) * Math.PI * 2;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          const vi = (s * tubeSides + n) * 3;
          tubeArr[vi] = cx + (tubeN1.x * ca + tubeN2.x * sa) * tubeRadius;
          tubeArr[vi + 1] = cy + (tubeN1.y * ca + tubeN2.y * sa) * tubeRadius;
          tubeArr[vi + 2] = cz + (tubeN1.z * ca + tubeN2.z * sa) * tubeRadius;
        }
      }
      tubeAttr.needsUpdate = true;

      const spineMat = stream.spine.material as THREE.MeshBasicMaterial;
      spineMat.color.copy(stream.highlightColor);

      const cameraPos = this.camera.getWorldPosition(_streamVecG);
      const ribbonAttr = stream.ribbon.geometry.attributes.position as THREE.BufferAttribute;
      const ribbonArr = ribbonAttr.array as Float32Array;
      const ribbonSegments = ribbonArr.length / 6;
      for (let i = 0; i < ribbonSegments; i++) {
        const t = i / (ribbonSegments - 1);
        const sample = t * (curvePointCount - 1);
        const basePoint = Math.floor(sample);
        const nextPoint = Math.min(curvePointCount - 1, basePoint + 1);
        const blend = sample - basePoint;
        const baseOffset = basePoint * 3;
        const nextOffset = nextPoint * 3;
        const px = curveBuffer[baseOffset] + (curveBuffer[nextOffset] - curveBuffer[baseOffset]) * blend;
        const py = curveBuffer[baseOffset + 1] + (curveBuffer[nextOffset + 1] - curveBuffer[baseOffset + 1]) * blend;
        const pz = curveBuffer[baseOffset + 2] + (curveBuffer[nextOffset + 2] - curveBuffer[baseOffset + 2]) * blend;

        const prevPoint = Math.max(0, basePoint - 1);
        const futurePoint = Math.min(curvePointCount - 1, nextPoint + 1);
        const prevOffset = prevPoint * 3;
        const futureOffset = futurePoint * 3;
        const tangent = _streamVecF.set(
          curveBuffer[futureOffset] - curveBuffer[prevOffset],
          curveBuffer[futureOffset + 1] - curveBuffer[prevOffset + 1],
          curveBuffer[futureOffset + 2] - curveBuffer[prevOffset + 2],
        ).normalize();
        const toCamera = _streamVecE.set(cameraPos.x - px, cameraPos.y - py, cameraPos.z - pz).normalize();
        const side = _streamVecD.crossVectors(toCamera, tangent);
        if (side.lengthSq() < 1e-6) {
          side.copy(lateral);
        } else {
          side.normalize();
        }

        // Taper to 0.28 at disk end (not zero) so stream stays visible as it enters the disk
        const endTaper = 0.28 + 0.72 * Math.cos(t * Math.PI / 2);  // 1→0.28
        const midBulge = Math.pow(Math.sin(t * Math.PI), 0.7); // peaks in middle
        const envelope = 0.38 * endTaper + 0.62 * midBulge;
        const pulse = 0.94 + 0.06 * Math.sin(time * stream.flowSpeed * 18 - t * 9 + stream.phase);
        const width = ribbonHalfWidth * envelope * pulse;

        const leftIndex = i * 6;
        ribbonArr[leftIndex] = px + side.x * width;
        ribbonArr[leftIndex + 1] = py + side.y * width;
        ribbonArr[leftIndex + 2] = pz + side.z * width;
        ribbonArr[leftIndex + 3] = px - side.x * width;
        ribbonArr[leftIndex + 4] = py - side.y * width;
        ribbonArr[leftIndex + 5] = pz - side.z * width;
      }
      ribbonAttr.needsUpdate = true;

      const ribbonMat = stream.ribbon.material as THREE.MeshBasicMaterial;
      ribbonMat.color.copy(stream.highlightColor);
      ribbonMat.opacity = 0.34 + Math.sin(time * 0.22 + stream.phase) * 0.04;
      if (ribbonMat.map) {
        ribbonMat.map.offset.x = -time * stream.flowSpeed;
      }
      if (ribbonMat.alphaMap) {
        ribbonMat.alphaMap.offset.x = -time * stream.flowSpeed;
      }
    }

    if (this.xbDiskGroup) {
      // Children order from createBlackHoleGroup: disk, innerRing, outerGlow, brightArc, shadowCore, innerShadow
      const disk = this.xbDiskGroup.children[0] as THREE.Mesh;
      const innerRing = this.xbDiskGroup.children[1] as THREE.Mesh;
      const brightArc = this.xbDiskGroup.children[3] as THREE.Mesh;
      disk.rotation.z = 0.45 + time * 0.06;
      innerRing.rotation.z = 0.54 + time * 0.10;
      brightArc.rotation.z = 0.62 + time * 0.08;
    }
  }

  getEntityWorldPos(id: string): THREE.Vector3 | null {
    return this.entities.get(id)?.worldPos ?? null;
  }

  getAllEntities(): Map<string, SceneEntity> {
    return this.entities;
  }

  getNPCShip(id: string): NPCShipState | undefined {
    return this.npcShips.get(id);
  }

  getFleetBattle(): FleetBattle | null {
    return this.fleetBattleData;
  }

  getXRayStreamCurveBuffer(): Float32Array | null {
    return this.xRayTransferStreams.length > 0 ? this.xRayTransferStreams[0].curveBuffer : null;
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
    this.camera.getWorldPosition(this.starfield.position);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    disposeTextureCache();
    this.renderer.dispose();
  }
}
