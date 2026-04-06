import * as THREE from 'three';
import type { DysonBiomeProfile, DysonWeatherBandData, InteractionFieldData } from '../../engine';
import planetVertex from './shaders/includes/planet_vertex.glsl';
import dysonShellFrag from './shaders/dyson_shell.frag.glsl';
import dysonWeatherFrag from './shaders/dyson_weather.frag.glsl';
import dysonCityLightsFrag from './shaders/dyson_city_lights.frag.glsl';
import dysonShellExteriorFrag from './shaders/dyson_shell_exterior.frag.glsl';
import { makeInteractionFieldTexture } from './planet/shared';

export const BIOME_PROFILE_INDEX: Record<DysonBiomeProfile, number> = {
  continental: 0,
  mixed: 1,
  desert: 2,
  arctic: 3,
};

export function makeDysonShellSegment(
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  baseColor: number,
  starPhase: number,
  seed = 0,
  biomeProfile: DysonBiomeProfile = 'continental',
  biomeSeed = 0,
  interactionField?: InteractionFieldData,
): { group: THREE.Group; material: THREE.ShaderMaterial } {
  const group = new THREE.Group();
  const phiLength = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6);
  const thetaLength = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72);
  const phiStart = Math.PI - phiLength * 0.5;
  const thetaStart = Math.PI * 0.5 - thetaLength * 0.5;
  const geo = new THREE.SphereGeometry(
    curveRadius,
    36,
    24,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );

  const interactionTex = makeInteractionFieldTexture(interactionField);
  const interactionFieldBlend = interactionField ? 0.14 : 0.0;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      seed: { value: seed },
      baseColor: { value: new THREE.Color(baseColor) },
      uLightPhase: { value: starPhase },
      uLightPos: { value: new THREE.Vector3() },
      biomeProfile: { value: BIOME_PROFILE_INDEX[biomeProfile] },
      biomeSeed: { value: biomeSeed },
      interactionFieldTex: { value: interactionTex },
      interactionFieldBlend: { value: interactionFieldBlend },
    },
    vertexShader: planetVertex,
    fragmentShader: dysonShellFrag,
  });

  group.add(new THREE.Mesh(geo, mat));

  // Industrial exterior (convex/outside face)
  const exteriorMat = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: {
      seed: { value: seed },
    },
    vertexShader: planetVertex,
    fragmentShader: dysonShellExteriorFrag,
  });
  group.add(new THREE.Mesh(geo, exteriorMat));

  const edgesGeo = new THREE.EdgesGeometry(geo, 14);
  const wireMat = new THREE.LineBasicMaterial({
    color: 0x9BA3B2,
    transparent: true,
    opacity: 0.22,
  });
  group.add(new THREE.LineSegments(edgesGeo, wireMat));

  return { group, material: mat };
}

/**
 * Sector-mixed weather overlay for Dyson shell segments.
 * Includes cloud opacity and optional lightning flashes in storm sectors.
 */
export function addDysonWeatherLayer(
  group: THREE.Group,
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  seed: number,
  starPhase: number,
  weatherBands: DysonWeatherBandData[],
): THREE.ShaderMaterial {
  const phiLength = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6);
  const thetaLength = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72);
  const phiStart = Math.PI - phiLength * 0.5;
  const thetaStart = Math.PI * 0.5 - thetaLength * 0.5;
  const geo = new THREE.SphereGeometry(
    curveRadius * 0.998,
    36,
    24,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );

  const norm = (angle: number) => {
    const tau = Math.PI * 2;
    let out = angle % tau;
    if (out < 0) out += tau;
    return out;
  };
  const band0 = weatherBands[0];
  const band1 = weatherBands[1];
  const band2 = weatherBands[2];

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.BackSide,
    uniforms: {
      seed: { value: seed },
      uTime: { value: 0.0 },
      uLightPhase: { value: starPhase },
      uLightPos: { value: new THREE.Vector3() },
      bStart: { value: new THREE.Vector3(norm(band0?.startAngle ?? 0), norm(band1?.startAngle ?? 0), norm(band2?.startAngle ?? 0)) },
      bEnd: { value: new THREE.Vector3(norm(band0?.endAngle ?? 0), norm(band1?.endAngle ?? 0), norm(band2?.endAngle ?? 0)) },
      bCloud: { value: new THREE.Vector3(band0?.hasClouds ? 1 : 0, band1?.hasClouds ? 1 : 0, band2?.hasClouds ? 1 : 0) },
      bDensity: { value: new THREE.Vector3(band0?.cloudDensity ?? 0, band1?.cloudDensity ?? 0, band2?.cloudDensity ?? 0) },
      bStorm: { value: new THREE.Vector3(band0?.hasLightning ? 1 : 0, band1?.hasLightning ? 1 : 0, band2?.hasLightning ? 1 : 0) },
    },
    vertexShader: planetVertex,
    fragmentShader: dysonWeatherFrag,
  });

  group.add(new THREE.Mesh(geo, mat));
  return mat;
}

export function addDysonCityLights(
  group: THREE.Group,
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  seed: number,
  starPhase: number,
): THREE.ShaderMaterial {
  const phiLength = THREE.MathUtils.clamp(arcWidth / curveRadius, 0.55, 1.6);
  const thetaLength = THREE.MathUtils.clamp(arcHeight / curveRadius, 0.22, 0.72);
  const phiStart = Math.PI - phiLength * 0.5;
  const thetaStart = Math.PI * 0.5 - thetaLength * 0.5;
  const geo = new THREE.SphereGeometry(
    curveRadius * 0.997,
    36,
    24,
    phiStart,
    phiLength,
    thetaStart,
    thetaLength,
  );

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      seed: { value: seed },
      uLightPhase: { value: starPhase },
      uLightPos: { value: new THREE.Vector3() },
    },
    vertexShader: planetVertex,
    fragmentShader: dysonCityLightsFrag,
  });

  group.add(new THREE.Mesh(geo, mat));
  return mat;
}

export function makeDysonMiniStar(phase: number, size: number): THREE.Group {
  const group = new THREE.Group();
  const off = new THREE.Color(0x1A0000);
  const dawn = new THREE.Color(0xFF6600);
  const day = new THREE.Color(0xFFF0A0);
  const clamped = THREE.MathUtils.clamp(phase, 0, 1);

  const starColor = clamped <= 0.5
    ? off.clone().lerp(dawn, clamped * 2.0)
    : dawn.clone().lerp(day, (clamped - 0.5) * 2.0);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size, 16, 12),
    new THREE.MeshBasicMaterial({ color: starColor }),
  );
  group.add(core);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(size * 2.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: starColor,
      transparent: true,
      opacity: clamped * 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(halo);

  return group;
}
