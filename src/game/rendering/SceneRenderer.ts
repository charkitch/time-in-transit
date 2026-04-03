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
import { createBlackHoleGroup } from './scene/blackHoleVisuals';
import type { SceneEntity, XRayTransferStream } from './scene/types';
import { createXRayTransferStream, updateXRayTransferStreams } from './scene/xrayStreams';
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
      const transferStream = createXRayTransferStream(data.companion.color, data.starRadius * 2.2);
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
      const { group: shellGroup, material: shellMat } = makeDysonShellSegment(
        shell.curveRadius,
        shell.arcWidth,
        shell.arcHeight,
        shell.color,
        shell.starPhase,
        shellSeed,
        shell.biomeProfile,
        shell.biomeSeed,
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
