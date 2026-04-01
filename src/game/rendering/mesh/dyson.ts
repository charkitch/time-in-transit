import * as THREE from 'three';
import type { DysonWeatherBandData } from '../../engine';
import { GLSL_NOISE, GLSL_PLANET_VERTEX, GLSL_PLANET_VARYINGS } from './glsl';

export function makeDysonShellSegment(
  curveRadius: number,
  arcWidth: number,
  arcHeight: number,
  baseColor: number,
  starPhase: number,
  seed = 0,
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

  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      seed: { value: seed },
      baseColor: { value: new THREE.Color(baseColor) },
      uLightPhase: { value: starPhase },
      uLightPos: { value: new THREE.Vector3() },
    },
    vertexShader: GLSL_PLANET_VERTEX,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform float seed;
      uniform vec3 baseColor;
      uniform float uLightPhase;
      uniform vec3 uLightPos;
      ${GLSL_PLANET_VARYINGS}

      void main() {
        vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
        vec3 toLight = normalize(uLightPos - vWorldPosition);
        float lightDot = dot(vWorldNormal, toLight);
        float n = fbm(noisePos);

        // Reuse continental world surface treatment for Dyson shell interiors.
        float landMask = smoothstep(-0.05, 0.1, n);
        vec3 ocean = vec3(0.05, 0.12, 0.25);
        vec3 shallow = vec3(0.08, 0.2, 0.35);
        vec3 lowland = mix(vec3(0.15, 0.35, 0.12), baseColor * 0.5, 0.3);
        vec3 highland = mix(vec3(0.45, 0.35, 0.2), baseColor * 0.7, 0.3);
        float h = smoothstep(0.1, 0.5, n);
        vec3 land = mix(lowland, highland, h);
        float depth = smoothstep(-0.4, -0.05, n);
        vec3 oceanC = mix(ocean, shallow, depth);
        vec3 surfaceColor = mix(oceanC, land, landMask);

        vec3 nightColor = vec3(1.0, 0.95, 0.8);
        vec3 dawnColor = vec3(1.15, 0.9, 0.65);
        vec3 dayColor = vec3(1.65, 1.45, 1.15);
        vec3 lightColor = mix(
          nightColor,
          mix(dawnColor, dayColor, max(0.0, (uLightPhase - 0.5) * 2.0)),
          min(1.0, uLightPhase * 2.0)
        );
        float diffuse = smoothstep(-0.3, 0.8, lightDot);
        float ambient = mix(0.15, 0.32, uLightPhase);
        float phaseBrightness = mix(1.0, 2.1, smoothstep(0.0, 1.0, uLightPhase));
        float shellVariance = mix(0.9, 1.1, fract(seed * 12.9898));
        float lighting = (diffuse * uLightPhase * 0.85 + ambient) * phaseBrightness * shellVariance;
        gl_FragColor = vec4(surfaceColor * lightColor * lighting, 1.0);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));

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
    curveRadius * 1.002,
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
    vertexShader: GLSL_PLANET_VERTEX,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform float seed;
      uniform float uTime;
      uniform float uLightPhase;
      uniform vec3 uLightPos;
      uniform vec3 bStart;
      uniform vec3 bEnd;
      uniform vec3 bCloud;
      uniform vec3 bDensity;
      uniform vec3 bStorm;
      ${GLSL_PLANET_VARYINGS}

      float inBand(float angle, float startA, float endA) {
        return step(startA, angle) * step(angle, endA);
      }

      void main() {
        vec3 toLight = normalize(uLightPos - vWorldPosition);
        float lightDot = dot(vWorldNormal, toLight);
        vec3 n = normalize(vLocalPos);
        float az = atan(n.z, n.x);
        if (az < 0.0) az += 6.28318530718;

        // Reuse continental cloud generation and lighting.
        vec3 cloudPos = n * 3.0 + vec3(seed * 5.17, seed * 11.31, seed * 2.93);
        float n1 = fbm(cloudPos);
        float n2 = snoise(cloudPos * 2.0 + vec3(77.0));
        float cloudTex = smoothstep(-0.1, 0.4, n1) * smoothstep(-0.3, 0.2, n2);
        cloudTex = cloudTex * cloudTex;

        float m0 = inBand(az, bStart.x, bEnd.x);
        float m1 = inBand(az, bStart.y, bEnd.y);
        float m2 = inBand(az, bStart.z, bEnd.z);

        float cloudMask = m0 * bCloud.x + m1 * bCloud.y + m2 * bCloud.z;
        float cloudDensity = m0 * bDensity.x + m1 * bDensity.y + m2 * bDensity.z;
        float stormMask = m0 * bStorm.x + m1 * bStorm.y + m2 * bStorm.z;

        vec3 nightColor = vec3(1.0, 0.95, 0.8);
        vec3 dawnColor = vec3(1.15, 0.9, 0.65);
        vec3 dayColor = vec3(1.65, 1.45, 1.15);
        vec3 lightColor = mix(
          nightColor,
          mix(dawnColor, dayColor, max(0.0, (uLightPhase - 0.5) * 2.0)),
          min(1.0, uLightPhase * 2.0)
        );
        vec3 cloudColor = mix(vec3(0.85, 0.85, 0.9), vec3(1.0, 1.0, 1.0), uLightPhase);
        float diffuse = smoothstep(-0.2, 0.7, lightDot);
        float ambient = mix(0.16, 0.3, uLightPhase);
        float phaseBrightness = mix(1.0, 1.9, smoothstep(0.0, 1.0, uLightPhase));
        float shellVariance = mix(0.9, 1.1, fract(seed * 19.731));
        float lighting = (diffuse * uLightPhase * 0.85 + ambient) * phaseBrightness * shellVariance;
        vec3 outColor = cloudColor * lightColor * lighting;
        float alpha = cloudTex * cloudMask * cloudDensity;

        // Rare storm flashes in storm-enabled sectors.
        float flashGate = smoothstep(0.92, 0.985, snoise(cloudPos * 1.8 + vec3(uTime * 0.9, 33.0, 71.0)));
        float pulse = smoothstep(0.0, 0.02, fract(uTime * (0.35 + seed * 0.07)));
        pulse *= (1.0 - smoothstep(0.08, 0.14, fract(uTime * (0.35 + seed * 0.07))));
        float lightning = stormMask * flashGate * pulse;
        outColor += vec3(0.55, 0.75, 1.0) * lightning * 1.4;
        alpha = max(alpha, lightning * 0.7);

        if (alpha <= 0.001) discard;
        gl_FragColor = vec4(outColor, alpha);
      }
    `,
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
