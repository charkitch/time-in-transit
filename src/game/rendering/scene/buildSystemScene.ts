import * as THREE from 'three';
import { PALETTE, STAR_COLORS, STAR_ATTRIBUTES } from '../../constants';
import {
  createStarfield,
  createBattleProjectiles,
  createBattleExplosions,
  type BattleExplosions,
} from '../effects';
import {
  makePlanet, makeGasGiant, makeStation, makeGlowSprite,
  makeAsteroidBelt, makeNPCShipMesh, makeFleetShipMesh,
  makeAsteroidBase, makeOortCloudBase, makeMaximumSpaceBase,
  makeTexturedPlanet, makeTexturedGasGiant,
  makeRingSystem,
  addCityLights, addSunAtmosphere, addLightning, addCloudLayer,
  makeDysonShellSegment, addDysonWeatherLayer, makeDysonMiniStar, addDysonCityLights,
} from '../meshFactory';
import { selectSkin } from '../planetSkins';
import type { MoonData, SolarSystemData, SystemFactionState } from '../../engine';
import { generateNPCShips } from '../../mechanics/NPCSystem';
import type { NPCShipState } from '../../mechanics/NPCSystem';
import { generateFleetBattle } from '../../mechanics/FleetBattleSystem';
import type { FleetBattle } from '../../mechanics/FleetBattleSystem';
import { getFaction } from '../../data/factions';
import { PRNG } from '../../generation/prng';
import type { StationArchetype } from '../../archetypes';
import { CLUSTER_SEED, RENDER_CONFIG } from '../../constants';
import { createBlackHoleGroup, createMicroquasarJetGroup, createXRayAccretorGroup, createBeamMaterial, createPulsarSurfaceMaterial } from './blackHoleVisuals';
import type { SceneEntity, XRayTransferStream } from './types';
import { createXRayTransferStream, updateXRayTransferStreams } from './xrayStreams';
import type { RuntimeProfile } from '../../../runtime/runtimeProfile';
import { LandingSiteManager } from './LandingSiteManager';
import type { DysonShellMaterialEntry, BeamParams } from './tickSceneAnimations';

export const GALAXY_SEED = 0x5AFEF00D;
export const STARFIELD_POS_SCALE = (Math.PI / 2) / 100;
export const STARFIELD_YEAR_SCALE = 0.0002;

export function hashString32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function stationSpinAxisForArchetype(archetype: string | null | undefined): THREE.Vector3 {
  // Match spin axis to each model's dominant ring/hub orientation.
  if (archetype === 'refinery_spindle') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
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

function computeStationCollisionSamples(
  archetype: StationArchetype,
  size: number,
): { local: THREE.Vector3[]; sampleRadius: number } | null {
  let ringRadius = 0;
  let tubeRadius = 0;
  let sampleRadius = 0;
  let rotateX = 0;

  switch (archetype) {
    case 'trade_hub':
      ringRadius = size;
      tubeRadius = size * 0.18;
      sampleRadius = size * 0.08;
      break;
    case 'refinery_spindle':
      ringRadius = size * 0.75;
      tubeRadius = size * 0.08;
      sampleRadius = size * 0.07;
      rotateX = Math.PI * 0.5;
      break;
    case 'alien_orrery_reliquary':
      ringRadius = size * 1.15;
      tubeRadius = size * 0.06;
      sampleRadius = size * 0.055;
      rotateX = Math.PI * 0.5;
      break;
    default:
      return null;
  }

  const sampleCount = 32;
  const local: THREE.Vector3[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const a = (i / sampleCount) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * ringRadius, Math.sin(a) * ringRadius, 0);
    if (rotateX !== 0) p.applyAxisAngle(new THREE.Vector3(1, 0, 0), rotateX);
    local.push(p);
  }

  // Add connector arm samples so spokes/trusses are also lethal.
  if (archetype === 'trade_hub') {
    const armCount = 6;
    const armLength = size * 0.74;
    const spokeRadius = size * 0.58;
    const rMin = Math.max(size * 0.16, spokeRadius - armLength * 0.5);
    const rMax = Math.min(ringRadius, spokeRadius + armLength * 0.5);
    const spokeSteps = 5;
    for (let i = 0; i < armCount; i++) {
      const a = (i / armCount) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let j = 0; j < spokeSteps; j++) {
        const t = j / (spokeSteps - 1);
        const r = rMin + (rMax - rMin) * t;
        local.push(new THREE.Vector3(ca * r, sa * r, 0));
      }
    }
  } else if (archetype === 'refinery_spindle') {
    const armCount = 6;
    const armLength = size * 0.62;
    const armRadius = size * 0.36;
    const rMin = Math.max(size * 0.12, armRadius - armLength * 0.5);
    const rMax = Math.min(ringRadius, armRadius + armLength * 0.5);
    const trussSteps = 5;
    for (let i = 0; i < armCount; i++) {
      const a = (i / armCount) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let j = 0; j < trussSteps; j++) {
        const t = j / (trussSteps - 1);
        const r = rMin + (rMax - rMin) * t;
        local.push(new THREE.Vector3(ca * r, 0, sa * r));
      }
    }
  }

  return {
    local,
    sampleRadius: Math.min(tubeRadius, sampleRadius),
  };
}

function disableFogForObject(root: THREE.Object3D): void {
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

export interface SystemSceneState {
  systemObjects: THREE.Object3D[];
  lightningMaterials: THREE.ShaderMaterial[];
  dysonShellMaterials: DysonShellMaterialEntry[];
  xRayTransferStreams: XRayTransferStream[];
  xbDiskGroup: THREE.Group | null;
  mqJetParams: BeamParams | null;
  mqJetGroup: THREE.Group | null;
  pulsarBeamGroup: THREE.Group | null;
  pulsarBeamAngle: number;
  pulsarBeamParams: BeamParams | null;
  pulsarStarMat: THREE.ShaderMaterial | null;
  battleProjectiles: THREE.Points | null;
  battleExplosions: BattleExplosions | null;
  fleetBattleData: FleetBattle | null;
  collidables: SceneEntity[];
  starLight: THREE.PointLight | null;
}

export function buildSystemScene(params: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  runtimeProfile: RuntimeProfile | null;
  entities: Map<string, SceneEntity>;
  npcShips: Map<string, NPCShipState>;
  landingSites: LandingSiteManager;
  data: SolarSystemData;
  systemId: number;
  galaxyYear?: number;
  systemName?: string;
  factionState?: SystemFactionState;
  galaxyX?: number;
  galaxyY?: number;
}): { state: SystemSceneState; starfield: THREE.Points } {
  const {
    scene, camera, renderer, runtimeProfile: _runtimeProfile,
    entities, npcShips, landingSites,
    data, systemId,
    galaxyYear = 0,
    systemName = '',
    factionState,
    galaxyX = 0,
    galaxyY = 0,
  } = params;

  const systemObjects: THREE.Object3D[] = [];
  const lightningMaterials: THREE.ShaderMaterial[] = [];
  const dysonShellMaterials: DysonShellMaterialEntry[] = [];
  const xRayTransferStreams: XRayTransferStream[] = [];
  let xbDiskGroup: THREE.Group | null = null;
  let mqJetParams: BeamParams | null = null;
  let mqJetGroup: THREE.Group | null = null;
  let pulsarBeamGroup: THREE.Group | null = null;
  let pulsarBeamAngle = 0;
  let pulsarBeamParams: BeamParams | null = null;
  let pulsarStarMat: THREE.ShaderMaterial | null = null;
  let battleProjectiles: THREE.Points | null = null;
  let battleExplosions: BattleExplosions | null = null;
  let fleetBattleData: FleetBattle | null = null;
  let starLight: THREE.PointLight | null = null;

  const yaw = galaxyX * STARFIELD_POS_SCALE + galaxyYear * STARFIELD_YEAR_SCALE;
  const pitch = galaxyY * STARFIELD_POS_SCALE;
  const starfield = createStarfield(GALAXY_SEED, yaw, pitch);
  scene.add(starfield);

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

    starLight = new THREE.PointLight(0xFF8B47, 0.9, 60000);
    scene.add(starLight);
    systemObjects.push(starLight);
  } else if (isAccretingBinary) {
    const companion = data.companion!;
    const isBurster = data.starType === 'XBB';
    const isMicroquasar = data.starType === 'MQ';
    const compactRadius = isBurster ? data.starRadius * 1.12 : data.starRadius;
    const diskHaloMul = isBurster ? 11.8 : (isMicroquasar ? 14.8 : 10.5);
    const diskHaloOpacity = isBurster ? 0.29 : (isMicroquasar ? 0.32 : 0.24);

    // Compact accretor visuals: BH for XB and MQ, neutron-star core for XBB.
    xbDiskGroup = createXRayAccretorGroup({
      radius: compactRadius,
      accretorKind: isBurster ? 'neutron_star' : 'black_hole',
      donorColor: companion.color,
      diskTintStrength: isMicroquasar ? 0.96 : 0.82,
    });
    starGroup.add(xbDiskGroup);

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
      mqJetGroup = jetGroup;

      const jetHalo = makeGlowSprite(0xB6F3FF, data.starRadius * 19.2);
      const jetHaloMat = jetHalo.material as THREE.SpriteMaterial;
      jetHaloMat.opacity = 0.14;
      starGroup.add(jetHalo);

      // Compute jet axis in world space from the precession tilt
      const jetAxis = new THREE.Vector3(0, 1, 0);
      const jetEuler = new THREE.Euler(-0.2, 0, 0.32);
      jetAxis.applyEuler(jetEuler).normalize();
      const outerLength = 75000;
      // half-angle of the outer sheath cone: atan(tipRadius / length)
      const halfAngle = Math.atan((outerLength * 0.09) / outerLength);
      mqJetParams = { axis: jetAxis, halfAngle, length: outerLength, starEntityId: 'star' };
    }

    // Light travels with the compact object group (no static starLight needed)
    starLight = null;
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
    disableFogForObject(companionGroup);
    scene.add(companionGroup);
    systemObjects.push(companionGroup);

    entities.set('companion-star', {
      id: 'companion-star',
      name: systemName,
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
    const isPulsar = data.starType === 'PU';
    const starMat = isPulsar ? createPulsarSurfaceMaterial(starColor) : new THREE.MeshBasicMaterial({ color: starColor });
    if (isPulsar) pulsarStarMat = starMat as THREE.ShaderMaterial;
    starGroup.add(new THREE.Mesh(starGeo, starMat));

    // Inner glow to fill the center so the star looks uniformly luminous
    const innerGlow = makeGlowSprite(0xFFFFFF, data.starRadius * 2.5);
    starGroup.add(innerGlow);

    // Glow sprite — size and presence driven by star attributes
    const starAttrs = STAR_ATTRIBUTES[data.starType];
    if (starAttrs?.glow) {
      const glow = makeGlowSprite(starColor, data.starRadius * starAttrs.glowMul);
      starGroup.add(glow);
    }

    // Pulsar beam jets — tapered cones anchored at the star surface, rotating
    if (data.starType === 'PU') {
      const beamColor = 0x44AAFF;
      const beamLen = 60000;
      const baseWidth = data.starRadius * 0.6;
      const outerMat = createBeamMaterial(beamColor, 0.65, 0.6);
      const coreMat = createBeamMaterial(beamColor, 0.9, 0.3);
      const beamGroup = new THREE.Group();
      for (const sign of [1, -1]) {
        const beamGeo = new THREE.CylinderGeometry(0, baseWidth, beamLen, 8, 40, true);
        const beam = new THREE.Mesh(beamGeo, outerMat);
        beam.frustumCulled = false;
        beam.position.set(0, sign * (data.starRadius + beamLen / 2), 0);
        if (sign < 0) beam.rotation.x = Math.PI;
        beamGroup.add(beam);
        // Inner brighter core
        const coreGeo = new THREE.CylinderGeometry(0, baseWidth * 0.3, beamLen, 6, 40, true);
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.frustumCulled = false;
        core.position.copy(beam.position);
        if (sign < 0) core.rotation.x = Math.PI;
        beamGroup.add(core);
        // Magnetic pole hotspot — bright glow at beam base on star surface
        const hotspot = makeGlowSprite(0xAADDFF, data.starRadius * 1.4);
        hotspot.position.set(0, sign * data.starRadius * 1.05, 0);
        beamGroup.add(hotspot);
      }
      // Tilt slightly off-vertical for characteristic pulsar wobble
      beamGroup.rotation.order = 'YXZ';
      beamGroup.rotation.set(0.5, 0, 0);
      starGroup.add(beamGroup);
      pulsarBeamGroup = beamGroup;
      pulsarBeamAngle = 0;
      const halfAngle = Math.atan(baseWidth / beamLen);
      pulsarBeamParams = { axis: new THREE.Vector3(0, 1, 0), halfAngle, length: beamLen, starEntityId: 'star' };
    }

    // Point light
    const lightIntensity = isIntense ? 3 : 2;
    starLight = new THREE.PointLight(starColor, lightIntensity, 60000);
    scene.add(starLight);
    systemObjects.push(starLight);
  }

  disableFogForObject(starGroup);
  scene.add(starGroup);
  systemObjects.push(starGroup);

  entities.set('star', {
    id: 'star',
    name: systemName,
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
    const captureRadiusRaw = xbDiskGroup?.userData.captureRadius;
    const captureRadius = typeof captureRadiusRaw === 'number' ? captureRadiusRaw : data.starRadius * 2.2;
    const transferStream = createXRayTransferStream(companion.color, captureRadius * 0.96);
    scene.add(transferStream.spine);
    scene.add(transferStream.ribbon);
    systemObjects.push(transferStream.spine, transferStream.ribbon);
    xRayTransferStreams.push(transferStream);
    updateXRayTransferStreams({
      streams: xRayTransferStreams,
      entities,
      camera,
      xbDiskGroup,
      time: 0,
    });
  }

  const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 97 + 13);
  // Fork an isolated PRNG for skin selection — parent rng stream is unaffected
  // by how many skins are picked, and determinism holds whether textures are on or off.
  const skinRng = rng.fork();
  const texturesEnabled = RENDER_CONFIG.planetTexturesEnabled;
  const wireOverlay = RENDER_CONFIG.planetWireOverlayEnabled;

  const addMoon = (
    moon: MoonData,
    index: number,
    planet: { id: string; name: string },
  ): void => {
    const moonSeed = rng.next() * 100;
    const suffix = String.fromCharCode(97 + index); // a, b, c, ...
    const { planetTexturesEnabled: textured, planetWireOverlayEnabled: wireOvl } = RENDER_CONFIG;
    const moonGroup = textured
      ? makeTexturedPlanet(moon.radius, moon.color, selectSkin('moon', skinRng), wireOvl, moonSeed, moon.surfaceType,
          moon.polarCapSize, moon.climateState)
      : makePlanet(moon.radius, moon.color, 0, moonSeed, moon.surfaceType,
          undefined, moon.polarCapSize, moon.climateState);
    if (moon.hasClouds) {
      addCloudLayer(moonGroup, moon.radius, moonSeed, moon.cloudDensity, moon.surfaceType);
    }
    addCityLights(moonGroup, moon.radius, moonSeed, moon.surfaceType, moon.polarCapSize);
    addSunAtmosphere(moonGroup, moon.radius);
    if (rng.next() < 0.05) {
      lightningMaterials.push(addLightning(moonGroup, moon.radius, moonSeed));
    }
    scene.add(moonGroup);
    systemObjects.push(moonGroup);
    entities.set(moon.id, {
      id: moon.id,
      name: `${planet.name}-${suffix}`,
      group: moonGroup,
      orbitRadius: moon.orbitRadius,
      orbitSpeed: moon.orbitSpeed,
      orbitPhase: moon.orbitPhase,
      parentId: planet.id,
      type: 'moon',
      worldPos: new THREE.Vector3(),
      collisionRadius: moon.radius,
    });
  };

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
        : makeTexturedPlanet(planet.radius, planet.color, skin, wireOverlay, planetSeed, planet.surfaceType,
            planet.polarCapSize, planet.climateState);
    } else {
      planetGroup = planet.type === 'gas_giant'
        ? makeGasGiant(planet.radius, planet.color, () => rng.next(), planetSeed, planet.gasType,
            planet.greatSpot, planet.greatSpotLat, planet.greatSpotSize, planet.interactionField)
        : makePlanet(planet.radius, planet.color, 1, planetSeed, planet.surfaceType, planet.interactionField,
            planet.polarCapSize, planet.climateState);
    }
    // Cloud layer for rocky planets
    if (planet.hasClouds && planet.type !== 'gas_giant') {
      addCloudLayer(planetGroup, planet.radius, planetSeed, planet.cloudDensity, planet.surfaceType);
    }
    // City lights + sun atmosphere for non-gas-giant planets
    if (planet.type !== 'gas_giant') {
      addCityLights(planetGroup, planet.radius, planetSeed, planet.surfaceType, planet.polarCapSize);
      addSunAtmosphere(planetGroup, planet.radius);
    }

    planetGroup.position.set(planet.orbitRadius, 0, 0);
    if (planet.axialTilt) {
      planetGroup.rotation.z = planet.axialTilt;
    }
    scene.add(planetGroup);
    systemObjects.push(planetGroup);

    entities.set(planet.id, {
      id: planet.id,
      name: planet.name,
      group: planetGroup,
      orbitRadius: planet.orbitRadius,
      orbitSpeed: planet.orbitSpeed,
      orbitPhase: planet.orbitPhase,
      type: 'planet',
      worldPos: new THREE.Vector3(),
      collisionRadius: planet.radius * 1.04,
      axialTilt: planet.axialTilt || undefined,
    });
    const siteClasses = landingSites.addPlanetSites({
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
      lightningMaterials.push(addLightning(planetGroup, planet.radius, planetSeed));
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
      const stationSeed = hashString32(`${systemId}:${planet.id}:station`);
      const stationArchetype = planet.stationArchetype ?? 'trade_hub';
      const stationScale = stationArchetype === 'alien_graveloom' ? 1.35 : stationArchetype.startsWith('alien_') ? 1.15 : 1.0;
      const stationSize = 60 * stationScale;
      const stationCollisionRadius = stationSize * 0.38;
      const ringCollision = computeStationCollisionSamples(stationArchetype, stationSize);
      const stationGroup = makeStation({
        size: stationSize,
        archetype: stationArchetype,
        seed: stationSeed,
      });
      const stationId = `station-${planet.id}`;
      scene.add(stationGroup);
      systemObjects.push(stationGroup);
      entities.set(stationId, {
        id: stationId,
        name: `${planet.name} Station`,
        group: stationGroup,
        orbitRadius: planet.radius * 2.5,
        orbitSpeed: planet.orbitSpeed * 2,
        orbitPhase: rng.next() * Math.PI * 2,
        parentId: planet.id,
        type: 'station',
        worldPos: new THREE.Vector3(),
        collisionRadius: stationCollisionRadius,
        interactionRadius: stationSize,
        collisionSampleRadius: ringCollision?.sampleRadius,
        collisionSamplesLocal: ringCollision?.local,
        collisionSamplesWorld: ringCollision ? ringCollision.local.map(() => new THREE.Vector3()) : undefined,
        stationSpinAxis: stationSpinAxisForArchetype(stationArchetype),
      });
    }

    // Moons
    planet.moons.forEach((moon, mi) =>
      addMoon(moon, mi, planet),
    );
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
    dysonShellMaterials.push({ shellMat, weatherMat: shellWeather, cityMat: shellCityLights, miniStar });
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
    scene.add(shellGroup);
    systemObjects.push(shellGroup);
    const collision = computeDysonCollisionSamples(shell.curveRadius, shell.arcWidth, shell.arcHeight);

    entities.set(shell.id, {
      id: shell.id,
      name: shell.name,
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
    landingSites.addDysonSites({
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
    scene.add(belt);
    systemObjects.push(belt);
  }

  // Secret bases
  for (const base of data.secretBases) {
    let baseGroup: THREE.Group;
    let baseSize = 45;
    let baseCollisionRadius = 30;
    switch (base.type) {
      case 'asteroid':
        baseSize = 35;
        baseCollisionRadius = 24;
        baseGroup = makeAsteroidBase(baseSize);
        break;
      case 'oort_cloud':
        baseSize = 45;
        baseCollisionRadius = 30;
        baseGroup = makeOortCloudBase(baseSize);
        break;
      case 'maximum_space':
        baseSize = 55;
        baseCollisionRadius = 36;
        baseGroup = makeMaximumSpaceBase(baseSize);
        break;
    }
    baseGroup.position.set(
      Math.cos(base.orbitPhase) * base.orbitRadius,
      0,
      Math.sin(base.orbitPhase) * base.orbitRadius,
    );
    scene.add(baseGroup);
    systemObjects.push(baseGroup);

    entities.set(base.id, {
      id: base.id,
      name: base.name,
      group: baseGroup,
      orbitRadius: base.orbitRadius,
      orbitSpeed: base.orbitSpeed,
      orbitPhase: base.orbitPhase,
      type: 'station', // reuse station type so docking works
      worldPos: new THREE.Vector3(),
      collisionRadius: baseCollisionRadius,
      interactionRadius: baseSize,
      stationSpinAxis: new THREE.Vector3(0, 0, 1),
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
      scene.add(icePoints);
      systemObjects.push(icePoints);
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
      scene.add(voidPoints);
      systemObjects.push(voidPoints);
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
    const mesh = makeNPCShipMesh({
      archetype: shipData.archetype,
      sizeClass: shipData.sizeClass,
      seed: shipData.visualSeed,
    });
    const startPos = shipData.waypointA.clone().lerp(shipData.waypointB, shipData.t);
    mesh.position.copy(startPos);
    scene.add(mesh);
    systemObjects.push(mesh);

    entities.set(shipData.id, {
      id: shipData.id,
      name: shipData.name,
      group: mesh,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      type: 'npc_ship',
      worldPos: startPos.clone(),
      collisionRadius: 0,
    });

    npcShips.set(shipData.id, {
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
      tradeRange: shipData.tradeRange,
      cargo: shipData.cargo,
      commLines: shipData.commLines,
      factionTag: shipData.factionTag,
      archetype: shipData.archetype,
      sizeClass: shipData.sizeClass,
      visualSeed: shipData.visualSeed,
    });
  }

  // Fleet battle
  if (factionState) {
    const battle = generateFleetBattle(data, systemId, galaxyYear, factionState);
    fleetBattleData = battle;

    if (battle) {
      const battleGroup = new THREE.Group();
      battleGroup.position.copy(battle.position);
      scene.add(battleGroup);
      systemObjects.push(battleGroup);

      const factionA = getFaction(battle.factionA);
      const factionB = getFaction(battle.factionB);
      const colorA = factionA?.color ?? 0xFF4444;
      const colorB = factionB?.color ?? 0x4488FF;
      const nameA = `${factionA?.name ?? 'Unknown'} Fleet`;
      const nameB = `${factionB?.name ?? 'Unknown'} Fleet`;

      const addFleetShips = (ships: typeof battle.shipsA, color: number, name: string) =>
        ships.map((ship) => {
          const mesh = makeFleetShipMesh(color, ship.scale);
          mesh.position.copy(ship.localOffset);
          battleGroup.add(mesh);
          const worldPos = ship.localOffset.clone().add(battle.position);
          entities.set(ship.id, {
            id: ship.id,
            name,
            group: mesh,
            orbitRadius: 0,
            orbitSpeed: 0,
            orbitPhase: 0,
            type: 'fleet_ship',
            worldPos,
            collisionRadius: 0,
          });
          return worldPos;
        });

      const shipWorldPosA = addFleetShips(battle.shipsA, colorA, nameA);
      const shipWorldPosB = addFleetShips(battle.shipsB, colorB, nameB);

      // Create projectile + explosion effects
      battleProjectiles = createBattleProjectiles(
        scene, battle.position,
        shipWorldPosA, shipWorldPosB,
        colorA, colorB,
      );
      systemObjects.push(battleProjectiles);

      battleExplosions = createBattleExplosions(scene);
      for (const s of battleExplosions.sprites) {
        systemObjects.push(s);
      }
    }
  }

  // Rebuild collidables
  const collidables: SceneEntity[] = [];
  for (const [, entity] of entities) {
    if (entity.collisionRadius > 0) {
      collidables.push(entity);
    }
  }

  if (import.meta.env.DEV) {
    renderer.compile(scene, camera);
    const failed: string[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial) {
        const prog = (renderer.properties.get(obj.material) as any)?.currentProgram;
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

  const state: SystemSceneState = {
    systemObjects,
    lightningMaterials,
    dysonShellMaterials,
    xRayTransferStreams,
    xbDiskGroup,
    mqJetParams,
    mqJetGroup,
    pulsarBeamGroup,
    pulsarBeamAngle,
    pulsarBeamParams,
    pulsarStarMat,
    battleProjectiles,
    battleExplosions,
    fleetBattleData,
    collidables,
    starLight,
  };

  return { state, starfield };
}
