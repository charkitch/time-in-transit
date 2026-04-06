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
  makeAsteroidBelt, makeNPCShipMesh, makeFleetShipMesh,
  makeAsteroidBase, makeOortCloudBase, makeMaximumSpaceBase,
  makeTexturedPlanet, makeTexturedGasGiant,
  makeRingSystem,
  addCityLights, addSunAtmosphere, addLightning, addCloudLayer,
  makeDysonShellSegment, addDysonWeatherLayer, makeDysonMiniStar, addDysonCityLights,
  makeLandingSiteMarker,
} from './meshFactory';
import { selectSkin } from './planetSkins';
import { disposeAll as disposeTextureCache } from './textureCache';
import type { InteractionFieldData, SolarSystemData, SystemFactionState } from '../engine';
import { generateNPCShips } from '../mechanics/NPCSystem';
import type { NPCShipState } from '../mechanics/NPCSystem';
import { generateFleetBattle } from '../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../mechanics/FleetBattleSystem';
import { getFaction } from '../data/factions';
import { PRNG } from '../generation/prng';
import { CLUSTER_SEED, RENDER_CONFIG } from '../constants';
import { createBlackHoleGroup, createMicroquasarJetGroup, createXRayAccretorGroup } from './scene/blackHoleVisuals';
import type { SceneEntity, XRayTransferStream } from './scene/types';
import { createXRayTransferStream, updateXRayTransferStreams } from './scene/xrayStreams';
import { sampleAndClassifyByUV } from '../systems/interactionField';
import {
  rotateStations,
  updateFleetShipWorldPositions,
  updateNPCShips,
  updateOrbitalEntities,
} from './scene/orbitAndNpcUpdates';
import type { RuntimeProfile } from '../../runtime/runtimeProfile';
export type { SceneEntity } from './scene/types';

const GALAXY_SEED = 0x5AFEF00D;
const STARFIELD_POS_SCALE = (Math.PI / 2) / 100;
const STARFIELD_YEAR_SCALE = 0.0002;
const LANDING_SITE_OFFSET_PLANET = 4;
const LANDING_SITE_OFFSET_DYSON = 8;

function hashString32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sphereUvToLocal(radius: number, u: number, v: number, offset = 0): THREE.Vector3 {
  const lon = u * Math.PI * 2 - Math.PI;
  const lat = v * Math.PI - Math.PI * 0.5;
  const r = radius + offset;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    Math.cos(lon) * cosLat * r,
    Math.sin(lat) * r,
    Math.sin(lon) * cosLat * r,
  );
}

function dysonPatchUvToLocal(
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  u: number,
  v: number,
  offset = 0,
): THREE.Vector3 {
  const phiLength = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6);
  const thetaLength = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72);
  const phiStart = Math.PI - phiLength * 0.5;
  const thetaStart = Math.PI * 0.5 - thetaLength * 0.5;
  const phi = phiStart + u * phiLength;
  const theta = thetaStart + v * thetaLength;
  const r = curveRadius + offset;
  const sinTheta = Math.sin(theta);
  return new THREE.Vector3(
    r * Math.cos(phi) * sinTheta,
    r * Math.cos(theta),
    r * Math.sin(phi) * sinTheta,
  );
}

function createTidallyBulgedDonorMesh(radius: number, color: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const positions = geometry.attributes.position;
  const bulgeStrength = radius * 0.14;
  const sideCompression = 0.09;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const nx = x / radius;

    // Local +X points toward the accretor via per-frame tidal orientation.
    const towardAccretor = Math.max(0, nx);
    const displacedX = x + bulgeStrength * towardAccretor * towardAccretor;
    const displacedY = y * (1 - sideCompression * towardAccretor);
    const displacedZ = z * (1 - sideCompression * towardAccretor);
    const displacedR = Math.sqrt(displacedX * displacedX + displacedY * displacedY + displacedZ * displacedZ);
    const scale = radius / Math.max(displacedR, 1e-4);

    positions.setXYZ(i, displacedX * scale, displacedY * scale, displacedZ * scale);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
}

function computeDysonCollisionSamples(
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
): { local: THREE.Vector3[]; sampleRadius: number } {
  const phiHalf = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6) * 0.5;
  const thetaHalf = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72) * 0.5;
  const alpha = phiHalf * 0.9;
  const beta = thetaHalf * 0.9;
  const samples: Array<[number, number]> = [
    [0, 0],
    [-alpha, 0],
    [alpha, 0],
    [0, -beta],
    [0, beta],
    [-alpha * 0.68, -beta * 0.68],
    [alpha * 0.68, -beta * 0.68],
    [-alpha * 0.68, beta * 0.68],
    [alpha * 0.68, beta * 0.68],
  ];
  const local = samples.map(([a, b]) => {
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const cosB = Math.cos(b);
    const sinB = Math.sin(b);
    return new THREE.Vector3(
      curveRadius * cosA * cosB,
      curveRadius * sinB,
      curveRadius * sinA * cosB,
    );
  });

  const sampleRadius = Math.max(70, Math.max(arcWidth, arcHeight) * 0.18);
  return { local, sampleRadius };
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
  private dysonShellMaterials: {
    shellMat: THREE.ShaderMaterial;
    weatherMat: THREE.ShaderMaterial;
    cityMat: THREE.ShaderMaterial;
    miniStar: THREE.Object3D;
  }[] = [];
  private readonly canvas: HTMLCanvasElement;
  private runtimeProfile: RuntimeProfile | null;
  private contextLost = false;
  private readonly onContextLost?: () => void;
  private readonly onContextRestored?: () => void;
  private landingSiteCounter = 0;

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

  private disableFogForObject(root: THREE.Object3D): void {
    root.traverse(obj => {
      const meshLike = obj as THREE.Mesh | THREE.Sprite | THREE.Points | THREE.Line;
      const mat = meshLike.material;
      if (!mat) return;

      const materials = Array.isArray(mat) ? mat : [mat];
      for (const material of materials) {
        if ('fog' in material && (material as { fog?: boolean }).fog !== false) {
          (material as { fog?: boolean }).fog = false;
          material.needsUpdate = true;
        }
      }
    });
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
    this.dysonShellMaterials = [];
    this.entities.clear();
    this.npcShips.clear();
    this.battleProjectiles = null;
    this.battleExplosions = null;
    this.fleetBattleData = null;
    this.xRayTransferStreams = [];
    this.xbDiskGroup = null;
    this.landingSiteCounter = 0;

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
    const isAccretingBinary =
      (data.starType === 'XB' || data.starType === 'XBB' || data.starType === 'MQ')
      && data.companion !== null;
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
    } else if (isAccretingBinary) {
      const companion = data.companion!;
      const isBurster = data.starType === 'XBB';
      const isMicroquasar = data.starType === 'MQ';
      const compactRadius = isBurster ? data.starRadius * 1.12 : data.starRadius;
      const diskHaloMul = isBurster ? 11.8 : (isMicroquasar ? 14.8 : 10.5);
      const diskHaloOpacity = isBurster ? 0.29 : (isMicroquasar ? 0.32 : 0.24);

      // Compact accretor visuals: BH for XB and MQ, neutron-star core for XBB.
      this.xbDiskGroup = createXRayAccretorGroup({
        radius: compactRadius,
        accretorKind: isBurster ? 'neutron_star' : 'black_hole',
        donorColor: companion.color,
        diskTintStrength: isMicroquasar ? 0.96 : 0.82,
      });
      starGroup.add(this.xbDiskGroup);

      const diskHalo = makeGlowSprite(isMicroquasar ? 0x8AE8FF : 0xA9DCFF, data.starRadius * diskHaloMul);
      const diskHaloMat = diskHalo.material as THREE.SpriteMaterial;
      diskHaloMat.opacity = diskHaloOpacity;
      starGroup.add(diskHalo);

      const accretorLightColor = isBurster ? 0xCFE5FF : (isMicroquasar ? 0xA8EAFF : starColor);
      const xRayCorona = makeGlowSprite(accretorLightColor, data.starRadius * (isMicroquasar ? 16.8 : 12.6));
      const xRayCoronaMat = xRayCorona.material as THREE.SpriteMaterial;
      xRayCoronaMat.opacity = isMicroquasar ? 0.28 : 0.24;
      starGroup.add(xRayCorona);

      if (isMicroquasar) {
        const jetGroup = createMicroquasarJetGroup({
          radius: data.starRadius,
          color: 0x67D8FF,
        });
        starGroup.add(jetGroup);

        const jetHalo = makeGlowSprite(0xB6F3FF, data.starRadius * 19.2);
        const jetHaloMat = jetHalo.material as THREE.SpriteMaterial;
        jetHaloMat.opacity = 0.14;
        starGroup.add(jetHalo);
      }

      // Light travels with the compact object group (no static starLight needed)
      if (this.starLight) this.scene.remove(this.starLight);
      this.starLight = null;
      starGroup.add(new THREE.PointLight(accretorLightColor, isMicroquasar ? 2.8 : 2, 60000));

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
      companionGroup.add(createTidallyBulgedDonorMesh(companion.radius, companion.color));
      companionGroup.add(makeGlowSprite(companion.color, companion.radius * 6));
      companionGroup.add(new THREE.PointLight(companion.color, 1.5, 60000));
      companionGroup.position.set(
        Math.cos(companion.orbitPhase) * companion.orbitRadius, 0,
        Math.sin(companion.orbitPhase) * companion.orbitRadius,
      );
      this.disableFogForObject(companionGroup);
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
        tidalTargetId: 'star',
      });
    } else {
      // Normal/exotic star sphere. Keep the core opaque so bodies behind it are fully occluded.
      const starGeo = new THREE.SphereGeometry(data.starRadius, 32, 32);
      const starMat = new THREE.MeshBasicMaterial({
        color: starColor,
      });
      starGroup.add(new THREE.Mesh(starGeo, starMat));

      // Glow sprite — size and presence driven by star attributes
      const starAttrs = STAR_ATTRIBUTES[data.starType];
      if (starAttrs?.glow) {
        // Use a spherical glow shell instead of a billboard sprite to avoid
        // depth-intersection banding when the star fills the screen.
        const glowRadius = data.starRadius * Math.max(1.4, starAttrs.glowMul * 0.5);
        const glowGeo = new THREE.SphereGeometry(glowRadius, 24, 24);
        const glowMat = new THREE.MeshBasicMaterial({
          color: starColor,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        });
        const glowShell = new THREE.Mesh(glowGeo, glowMat);
        starGroup.add(glowShell);
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

    this.disableFogForObject(starGroup);
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

    if (isAccretingBinary) {
      const companion = data.companion!;
      const captureRadiusRaw = this.xbDiskGroup?.userData.captureRadius;
      const captureRadius = typeof captureRadiusRaw === 'number' ? captureRadiusRaw : data.starRadius * 2.2;
      const transferStream = createXRayTransferStream(companion.color, captureRadius * 0.96);
      this.scene.add(transferStream.spine);
      this.scene.add(transferStream.ribbon);
      this.systemObjects.push(transferStream.spine, transferStream.ribbon);
      this.xRayTransferStreams.push(transferStream);
      updateXRayTransferStreams({
        streams: this.xRayTransferStreams,
        entities: this.entities,
        camera: this.camera,
        xbDiskGroup: this.xbDiskGroup,
        time: 0,
      });
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
              planet.greatSpot, planet.greatSpotLat, planet.greatSpotSize, planet.interactionField)
          : makePlanet(planet.radius, planet.color, 1, planetSeed, planet.surfaceType, planet.interactionField);
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
      const siteClasses = this.addPlanetLandingSites({
        hostId: planet.id,
        hostLabel: planet.name,
        hostGroup: planetGroup,
        radius: planet.radius,
        field: planet.interactionField,
        bodyKind: planet.type,
      });
      const lightningRoll = rng.next();
      const forceStormLightning = planet.type === 'gas_giant' && siteClasses.has('gas_volatile');
      if (forceStormLightning || lightningRoll < 0.05) {
        this.lightningMaterials.push(addLightning(planetGroup, planet.radius, planetSeed));
      }

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
      const { group: shellGroup, material: shellMat } = makeDysonShellSegment(
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shell.color,
        shell.starPhase,
        shellSeed,
        shell.biomeProfile,
        shell.biomeSeed,
        shell.interactionField,
      );
      const miniStar = makeDysonMiniStar(shell.starPhase, shell.curveRadius * 0.035);
      shellGroup.add(miniStar);
      const shellWeather = addDysonWeatherLayer(
        shellGroup,
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shellSeed,
        shell.starPhase,
        shell.weatherBands,
      );
      const shellCityLights = addDysonCityLights(
        shellGroup,
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shellSeed,
        shell.starPhase,
      );
      this.dysonShellMaterials.push({ shellMat, weatherMat: shellWeather, cityMat: shellCityLights, miniStar });
      shellGroup.userData.interactionMode = shell.interactionMode;
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
      // Orient: patch is at +X in SphereGeometry(phi=PI). Set +X away from star
      // so the concave interior (at -X from sphere center) faces the star.
      const xAxis = shellGroup.position.clone().normalize(); // away from star
      const orbNormal = new THREE.Vector3(sinN * sinI, cosI, -cosN * sinI);
      const zAxis = new THREE.Vector3().crossVectors(xAxis, orbNormal).normalize();
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
      const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      shellGroup.quaternion.setFromRotationMatrix(basis);
      this.scene.add(shellGroup);
      this.systemObjects.push(shellGroup);
      const collision = computeDysonCollisionSamples(shell.curveRadius, shell.arcWidth, shell.arcHeight);

      this.entities.set(shell.id, {
        id: shell.id,
        group: shellGroup,
        orbitRadius: shell.orbitRadius,
        orbitSpeed: shell.orbitSpeed,
        orbitPhase: shell.orbitPhase,
        orbitInclination: shell.orbitInclination,
        orbitNode: shell.orbitNode,
        shellCurveRadius: shell.curveRadius,
        shellArcWidth: shell.arcWidth,
        shellArcHeight: shell.arcHeight,
        type: 'dyson_shell',
        worldPos: new THREE.Vector3(),
        collisionRadius: collision.sampleRadius,
        collisionSampleRadius: collision.sampleRadius,
        collisionSamplesLocal: collision.local,
        collisionSamplesWorld: collision.local.map(() => new THREE.Vector3()),
      });
      this.addDysonLandingSites({
        hostId: shell.id,
        hostLabel: shell.name,
        hostGroup: shellGroup,
        curveRadius: shell.curveRadius,
        arcWidth: shell.arcWidth,
        arcHeight: shell.arcHeight,
        field: shell.interactionField,
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

  private addPlanetLandingSites(params: {
    hostId: string;
    hostLabel: string;
    hostGroup: THREE.Group;
    radius: number;
    field: InteractionFieldData;
    bodyKind: 'rocky' | 'gas_giant';
  }): Set<string> {
    const { hostId, hostLabel, hostGroup, radius, field, bodyKind } = params;
    const siteRng = PRNG.fromIndex(CLUSTER_SEED ^ 0x51A17E, hashString32(hostId));
    const desired = bodyKind === 'gas_giant' ? 2 : 3;
    const acceptedNormals: THREE.Vector3[] = [];
    const classifications = new Set<string>();
    let created = 0;
    let attempts = 0;

    while (created < desired && attempts < desired * 28) {
      attempts++;
      const u = siteRng.next();
      const v = siteRng.next();
      const sampled = sampleAndClassifyByUV(field, u, v);
      const cls = sampled.classification;
      const allowed = bodyKind === 'gas_giant'
        ? cls === 'gas_stable' || cls === 'gas_volatile'
        : cls === 'rocky_landable';
      if (!allowed) continue;

      const pos = sphereUvToLocal(radius, u, v, LANDING_SITE_OFFSET_PLANET);
      const normal = pos.clone().normalize();
      if (acceptedNormals.some(n => n.dot(normal) > 0.9)) continue;
      acceptedNormals.push(normal);

      const marker = makeLandingSiteMarker(cls);
      marker.position.copy(pos);
      marker.lookAt(pos.clone().multiplyScalar(2));
      marker.visible = false;
      hostGroup.add(marker);

      const idx = ++this.landingSiteCounter;
      const id = `site-${hostId}-${idx}`;
      this.entities.set(id, {
        id,
        group: marker,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'landing_site',
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
        siteLabel: `${hostLabel} ${bodyKind === 'gas_giant' ? 'BAND' : 'SITE'} ${created + 1}`,
        siteClassification: cls,
        siteHostLabel: hostLabel,
        siteHostId: hostId,
        siteDiscovered: false,
      });
      classifications.add(cls);
      created++;
    }
    return classifications;
  }

  private addDysonLandingSites(params: {
    hostId: string;
    hostLabel: string;
    hostGroup: THREE.Group;
    curveRadius: number;
    arcWidth: number;
    arcHeight: number;
    field: InteractionFieldData;
  }): void {
    const { hostId, hostLabel, hostGroup, curveRadius, arcWidth, arcHeight, field } = params;
    const siteRng = PRNG.fromIndex(CLUSTER_SEED ^ 0xD1505E, hashString32(hostId));
    const desired = 1;
    let created = 0;

    while (created < desired) {
      let attempts = 0;
      let best: {
        score: number;
        position: THREE.Vector3;
        classification: string;
      } | null = null;

      while (attempts < 96) {
        attempts++;
        const u = 0.36 + siteRng.next() * 0.28;
        const v = 0.36 + siteRng.next() * 0.28;
        const sampled = sampleAndClassifyByUV(field, u, v);
        const cls = sampled.classification;
        if (!(cls === 'shell_accessible' || cls === 'shell_weathered')) continue;

        const pos = dysonPatchUvToLocal(curveRadius, arcWidth, arcHeight, u, v, LANDING_SITE_OFFSET_DYSON);
        const centerDist = Math.hypot(u - 0.5, v - 0.5);
        const centerBias = Math.max(0, 1 - centerDist / 0.20);
        const classBase = cls === 'shell_accessible' ? 100 : 45;
        const calmness = 1 - sampled.value;
        const score = classBase + calmness * 30 + centerBias * 20;
        if (!best || score > best.score) {
          best = {
            score,
            position: pos.clone(),
            classification: cls,
          };
        }
      }
      if (!best) break;

      const marker = makeLandingSiteMarker(best.classification);
      marker.position.copy(best.position);
      marker.lookAt(best.position.clone().multiplyScalar(1.8));
      marker.visible = false;
      hostGroup.add(marker);

      const idx = ++this.landingSiteCounter;
      const id = `site-${hostId}-${idx}`;
      this.entities.set(id, {
        id,
        group: marker,
        orbitRadius: 0,
        orbitSpeed: 0,
        orbitPhase: 0,
        type: 'landing_site',
        worldPos: new THREE.Vector3(),
        collisionRadius: 0,
        siteLabel: `${hostLabel} ZONE ${created + 1}`,
        siteClassification: best.classification,
        siteHostLabel: hostLabel,
        siteHostId: hostId,
        siteDiscovered: false,
      });
      created++;
    }
  }

  getLandingSiteStatsForHost(hostId: string): { total: number; discovered: number } {
    let total = 0;
    let discovered = 0;
    for (const [, entity] of this.entities) {
      if (entity.type !== 'landing_site') continue;
      if (entity.siteHostId !== hostId) continue;
      total++;
      if (entity.siteDiscovered) discovered++;
    }
    return { total, discovered };
  }

  revealLandingSitesForHost(hostId: string): number {
    let revealed = 0;
    for (const [, entity] of this.entities) {
      if (entity.type !== 'landing_site') continue;
      if (entity.siteHostId !== hostId) continue;
      if (entity.siteDiscovered) continue;
      entity.siteDiscovered = true;
      entity.group.visible = true;
      revealed++;
    }
    return revealed;
  }

  revealLandingSitesForHosts(hostIds: Set<string>): number {
    let total = 0;
    for (const hostId of hostIds) {
      total += this.revealLandingSitesForHost(hostId);
    }
    return total;
  }

  getCollidables(): SceneEntity[] {
    return this.collidables;
  }

  updateOrbits(time: number, dt = 0): void {
    updateOrbitalEntities(this.entities, time);
    updateXRayTransferStreams({
      streams: this.xRayTransferStreams,
      entities: this.entities,
      camera: this.camera,
      xbDiskGroup: this.xbDiskGroup,
      time,
    });
    updateFleetShipWorldPositions(this.entities);
    rotateStations(this.entities);
    updateNPCShips({
      npcShips: this.npcShips,
      entities: this.entities,
      collidables: this.collidables,
      dt,
    });

    // Tick lightning shaders
    for (const mat of this.lightningMaterials) {
      mat.uniforms.uTime.value = time;
    }

    const worldPos = new THREE.Vector3();
    for (const entry of this.dysonShellMaterials) {
      entry.miniStar.getWorldPosition(worldPos);
      entry.shellMat.uniforms.uLightPos.value.copy(worldPos);
      entry.weatherMat.uniforms.uLightPos.value.copy(worldPos);
      entry.weatherMat.uniforms.uTime.value = time;
      entry.cityMat.uniforms.uLightPos.value.copy(worldPos);
    }

    // Battle projectile + explosion animation
    if (this.battleProjectiles && dt > 0) {
      updateBattleProjectiles(this.battleProjectiles, dt, this.battleExplosions);
    }
    if (this.battleExplosions && dt > 0) {
      updateBattleExplosions(this.battleExplosions, dt);
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
    if (this.contextLost) return;
    this.camera.getWorldPosition(this.starfield.position);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    disposeTextureCache();
    this.renderer.dispose();
  }
}
