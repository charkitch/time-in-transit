import * as THREE from 'three';
import { STAR_COLORS, STAR_ATTRIBUTES, PALETTE } from '../../constants';
import { makeGlowSprite } from '../meshFactory';
import type { SolarSystemData } from '../../engine';
import { createBlackHoleGroup, createMicroquasarJetGroup, createXRayAccretorGroup, createBeamMaterial, createPulsarSurfaceMaterial } from './blackHoleVisuals';
import type { SceneEntity, XRayTransferStream } from './types';
import { createXRayTransferStream, updateXRayTransferStreams } from './xrayStreams';
import { createTidallyBulgedDonorMesh, disableFogForObject } from './buildSystemSceneUtils';
import type { BeamParams } from './tickSceneAnimations';

// ─── Star visual constants ──────────────────────────────────────────────────

const BLACK_HOLE_LIGHT_COLOR = 0xFF8B47;
const BLACK_HOLE_LIGHT_INTENSITY = 0.9;
const LIGHT_RANGE = 60000;

const XB_BURSTER_RADIUS_MUL = 1.12;
const DISK_HALO_MUL_BURSTER = 11.8;
const DISK_HALO_MUL_MICROQUASAR = 14.8;
const DISK_HALO_MUL_DEFAULT = 10.5;
const DISK_HALO_OPACITY_BURSTER = 0.29;
const DISK_HALO_OPACITY_MICROQUASAR = 0.32;
const DISK_HALO_OPACITY_DEFAULT = 0.24;
const DISK_TINT_MICROQUASAR = 0.96;
const DISK_TINT_DEFAULT = 0.82;

const XRAY_CORONA_MUL_MICROQUASAR = 16.8;
const XRAY_CORONA_MUL_DEFAULT = 12.6;
const XRAY_CORONA_OPACITY_MICROQUASAR = 0.28;
const XRAY_CORONA_OPACITY_DEFAULT = 0.24;

const MQ_JET_COLOR = 0x67D8FF;
const MQ_JET_HALO_COLOR = 0xB6F3FF;
const MQ_JET_HALO_MUL = 19.2;
const MQ_JET_HALO_OPACITY = 0.14;
const MQ_JET_PRECESSION_X = -0.2;
const MQ_JET_PRECESSION_Z = 0.32;
const MQ_JET_OUTER_LENGTH = 75000;
const MQ_JET_TIP_FRACTION = 0.09;

const COMPANION_ORBIT_FRACTION = 0.4;

const PULSAR_BEAM_COLOR = 0x44AAFF;
const PULSAR_BEAM_LENGTH = 60000;
const PULSAR_BEAM_WIDTH_MUL = 0.6;
const PULSAR_BEAM_OUTER_OPACITY = 0.65;
const PULSAR_BEAM_OUTER_FALLOFF = 0.6;
const PULSAR_BEAM_CORE_OPACITY = 0.9;
const PULSAR_BEAM_CORE_FALLOFF = 0.3;
const PULSAR_BEAM_CORE_WIDTH_MUL = 0.3;
const PULSAR_BEAM_TILT = 0.5;
const PULSAR_HOTSPOT_COLOR = 0xAADDFF;
const PULSAR_HOTSPOT_MUL = 1.4;

const INNER_GLOW_MUL = 2.5;
const COMPANION_GLOW_MUL = 6;

// ─── Return type ────────────────────────────────────────────────────────────

interface StarResult {
  starLight: THREE.PointLight | null;
  xbDiskGroup: THREE.Group | null;
  xRayTransferStreams: XRayTransferStream[];
  mqJetParams: BeamParams | null;
  mqJetGroup: THREE.Group | null;
  pulsarBeamGroup: THREE.Group | null;
  pulsarBeamAngle: number;
  pulsarBeamParams: BeamParams | null;
  pulsarStarMat: THREE.ShaderMaterial | null;
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildStar(params: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  entities: Map<string, SceneEntity>;
  systemObjects: THREE.Object3D[];
  data: SolarSystemData;
  systemName: string;
}): StarResult {
  const { scene, camera, entities, systemObjects, data, systemName } = params;

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

  let starLight: THREE.PointLight | null = null;
  let xbDiskGroup: THREE.Group | null = null;
  const xRayTransferStreams: XRayTransferStream[] = [];
  let mqJetParams: BeamParams | null = null;
  let mqJetGroup: THREE.Group | null = null;
  let pulsarBeamGroup: THREE.Group | null = null;
  let pulsarBeamAngle = 0;
  let pulsarBeamParams: BeamParams | null = null;
  let pulsarStarMat: THREE.ShaderMaterial | null = null;

  if (isBlackHole) {
    starGroup.add(createBlackHoleGroup(data.starRadius));

    starLight = new THREE.PointLight(BLACK_HOLE_LIGHT_COLOR, BLACK_HOLE_LIGHT_INTENSITY, LIGHT_RANGE);
    scene.add(starLight);
    systemObjects.push(starLight);
  } else if (isAccretingBinary) {
    const companion = data.companion!;
    const isBurster = data.starType === 'XBB';
    const isMicroquasar = data.starType === 'MQ';
    const compactRadius = isBurster ? data.starRadius * XB_BURSTER_RADIUS_MUL : data.starRadius;
    const diskHaloMul = isBurster ? DISK_HALO_MUL_BURSTER : (isMicroquasar ? DISK_HALO_MUL_MICROQUASAR : DISK_HALO_MUL_DEFAULT);
    const diskHaloOpacity = isBurster ? DISK_HALO_OPACITY_BURSTER : (isMicroquasar ? DISK_HALO_OPACITY_MICROQUASAR : DISK_HALO_OPACITY_DEFAULT);

    // Compact accretor visuals: BH for XB and MQ, neutron-star core for XBB.
    xbDiskGroup = createXRayAccretorGroup({
      radius: compactRadius,
      accretorKind: isBurster ? 'neutron_star' : 'black_hole',
      donorColor: companion.color,
      diskTintStrength: isMicroquasar ? DISK_TINT_MICROQUASAR : DISK_TINT_DEFAULT,
    });
    starGroup.add(xbDiskGroup);

    const diskHalo = makeGlowSprite(isMicroquasar ? 0x8AE8FF : 0xA9DCFF, data.starRadius * diskHaloMul);
    const diskHaloMat = diskHalo.material as THREE.SpriteMaterial;
    diskHaloMat.opacity = diskHaloOpacity;
    starGroup.add(diskHalo);

    const accretorLightColor = isBurster ? 0xCFE5FF : (isMicroquasar ? 0xA8EAFF : starColor);
    const xRayCorona = makeGlowSprite(accretorLightColor, data.starRadius * (isMicroquasar ? XRAY_CORONA_MUL_MICROQUASAR : XRAY_CORONA_MUL_DEFAULT));
    const xRayCoronaMat = xRayCorona.material as THREE.SpriteMaterial;
    xRayCoronaMat.opacity = isMicroquasar ? XRAY_CORONA_OPACITY_MICROQUASAR : XRAY_CORONA_OPACITY_DEFAULT;
    starGroup.add(xRayCorona);

    if (isMicroquasar) {
      const jetGroup = createMicroquasarJetGroup({
        radius: data.starRadius,
        color: MQ_JET_COLOR,
      });
      starGroup.add(jetGroup);
      mqJetGroup = jetGroup;

      const jetHalo = makeGlowSprite(MQ_JET_HALO_COLOR, data.starRadius * MQ_JET_HALO_MUL);
      const jetHaloMat = jetHalo.material as THREE.SpriteMaterial;
      jetHaloMat.opacity = MQ_JET_HALO_OPACITY;
      starGroup.add(jetHalo);

      // Compute jet axis in world space from the precession tilt
      const jetAxis = new THREE.Vector3(0, 1, 0);
      const jetEuler = new THREE.Euler(MQ_JET_PRECESSION_X, 0, MQ_JET_PRECESSION_Z);
      jetAxis.applyEuler(jetEuler).normalize();
      const halfAngle = Math.atan(MQ_JET_TIP_FRACTION);
      mqJetParams = { axis: jetAxis, halfAngle, length: MQ_JET_OUTER_LENGTH, starEntityId: 'star' };
    }

    // Light travels with the compact object group (no static starLight needed)
    starLight = null;
    starGroup.add(new THREE.PointLight(accretorLightColor, isMicroquasar ? 2.8 : 2, LIGHT_RANGE));

    // Compact object orbits opposite the companion, closer to CoM
    starOrbitRadius = companion.orbitRadius * COMPANION_ORBIT_FRACTION;
    starOrbitSpeed = companion.orbitSpeed;
    starOrbitPhase = companion.orbitPhase + Math.PI;
    starGroup.position.set(
      Math.cos(starOrbitPhase) * starOrbitRadius, 0,
      Math.sin(starOrbitPhase) * starOrbitRadius,
    );

    // Companion star
    const companionGroup = new THREE.Group();
    companionGroup.add(createTidallyBulgedDonorMesh(companion.radius, companion.color));
    companionGroup.add(makeGlowSprite(companion.color, companion.radius * COMPANION_GLOW_MUL));
    companionGroup.add(new THREE.PointLight(companion.color, 1.5, LIGHT_RANGE));
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
    // Normal/exotic star sphere
    const starGeo = new THREE.SphereGeometry(data.starRadius, 32, 32);
    const isPulsar = data.starType === 'PU';
    const starMat = isPulsar ? createPulsarSurfaceMaterial(starColor) : new THREE.MeshBasicMaterial({ color: starColor });
    if (isPulsar) pulsarStarMat = starMat as THREE.ShaderMaterial;
    starGroup.add(new THREE.Mesh(starGeo, starMat));

    // Inner glow to fill the center so the star looks uniformly luminous
    starGroup.add(makeGlowSprite(0xFFFFFF, data.starRadius * INNER_GLOW_MUL));

    // Glow sprite — size and presence driven by star attributes
    const starAttrs = STAR_ATTRIBUTES[data.starType];
    if (starAttrs?.glow) {
      starGroup.add(makeGlowSprite(starColor, data.starRadius * starAttrs.glowMul));
    }

    // Pulsar beam jets — tapered cones anchored at the star surface, rotating
    if (isPulsar) {
      const baseWidth = data.starRadius * PULSAR_BEAM_WIDTH_MUL;
      const outerMat = createBeamMaterial(PULSAR_BEAM_COLOR, PULSAR_BEAM_OUTER_OPACITY, PULSAR_BEAM_OUTER_FALLOFF);
      const coreMat = createBeamMaterial(PULSAR_BEAM_COLOR, PULSAR_BEAM_CORE_OPACITY, PULSAR_BEAM_CORE_FALLOFF);
      const beamGroup = new THREE.Group();
      for (const sign of [1, -1]) {
        const beamGeo = new THREE.CylinderGeometry(0, baseWidth, PULSAR_BEAM_LENGTH, 8, 40, true);
        const beam = new THREE.Mesh(beamGeo, outerMat);
        beam.frustumCulled = false;
        beam.position.set(0, sign * (data.starRadius + PULSAR_BEAM_LENGTH / 2), 0);
        if (sign < 0) beam.rotation.x = Math.PI;
        beamGroup.add(beam);
        // Inner brighter core
        const coreGeo = new THREE.CylinderGeometry(0, baseWidth * PULSAR_BEAM_CORE_WIDTH_MUL, PULSAR_BEAM_LENGTH, 6, 40, true);
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.frustumCulled = false;
        core.position.copy(beam.position);
        if (sign < 0) core.rotation.x = Math.PI;
        beamGroup.add(core);
        // Magnetic pole hotspot — bright glow at beam base on star surface
        const hotspot = makeGlowSprite(PULSAR_HOTSPOT_COLOR, data.starRadius * PULSAR_HOTSPOT_MUL);
        hotspot.position.set(0, sign * data.starRadius * 1.05, 0);
        beamGroup.add(hotspot);
      }
      // Tilt slightly off-vertical for characteristic pulsar wobble
      beamGroup.rotation.order = 'YXZ';
      beamGroup.rotation.set(PULSAR_BEAM_TILT, 0, 0);
      starGroup.add(beamGroup);
      pulsarBeamGroup = beamGroup;
      pulsarBeamAngle = 0;
      const halfAngle = Math.atan(baseWidth / PULSAR_BEAM_LENGTH);
      pulsarBeamParams = { axis: new THREE.Vector3(0, 1, 0), halfAngle, length: PULSAR_BEAM_LENGTH, starEntityId: 'star' };
    }

    // Point light
    const lightIntensity = isIntense ? 3 : 2;
    starLight = new THREE.PointLight(starColor, lightIntensity, LIGHT_RANGE);
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

  // X-ray transfer stream for accreting binaries
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

  return {
    starLight,
    xbDiskGroup,
    xRayTransferStreams,
    mqJetParams,
    mqJetGroup,
    pulsarBeamGroup,
    pulsarBeamAngle,
    pulsarBeamParams,
    pulsarStarMat,
  };
}
