import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TopopolisBiome, InteractionFieldData } from '../../engine';
import type { QualityTier } from '../../../runtime/runtimeProfile';
import planetVertex from './shaders/includes/planet_vertex.glsl';
import topopolisInteriorFrag from './shaders/topopolis_interior.frag.glsl';
import topopolisExteriorFrag from './shaders/topopolis_exterior.frag.glsl';
import topopolisCityLightsFrag from './shaders/topopolis_city_lights.frag.glsl';
import topopolisCloudsFrag from './shaders/topopolis_clouds.frag.glsl';
import topopolisLightningFrag from './shaders/topopolis_lightning.frag.glsl';
import topopolisGlassFrag from './shaders/topopolis_glass.frag.glsl';
import { makeInteractionFieldTexture } from './planet/shared';

const BIOME_INDEX: Record<TopopolisBiome, number> = {
  continental: 0,
  ocean: 1,
  desert: 2,
  alien: 3,
  forest: 4,
  ice: 5,
};

const LOD: Record<QualityTier, { tubularSegments: number; radialSegments: number; cityLights: boolean }> = {
  ultra:  { tubularSegments: 200, radialSegments: 32, cityLights: true },
  high:   { tubularSegments: 120, radialSegments: 20, cityLights: true },
  medium: { tubularSegments: 60,  radialSegments: 12, cityLights: false },
};

/**
 * Parametric helix curve for TubeGeometry.
 * Wraps `coilCount` times around the Y axis at `radius` with `pitch` vertical spacing.
 *
 * Wobble creates intertwining strands that weave close to each other but never cross.
 * The key constraint: adjacent coils must always be separated by > 2 * tubeRadius.
 * Radial wobble swings arms wide; vertical wobble uses frequencies that create
 * near-misses between adjacent wraps without letting them touch.
 */
class HelixCurve extends THREE.Curve<THREE.Vector3> {
  readonly radius: number;
  readonly pitch: number;
  readonly coilCount: number;
  readonly wobbleSeed: number;
  readonly tubeRadius: number;
  readonly phaseOffset: number;

  constructor(radius: number, pitch: number, coilCount: number, wobbleSeed = 0, tubeRadius = 0, phaseOffset = 0) {
    super();
    this.radius = radius;
    this.pitch = pitch;
    this.coilCount = coilCount;
    this.wobbleSeed = wobbleSeed;
    this.tubeRadius = tubeRadius;
    this.phaseOffset = phaseOffset;
  }

  getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2 * this.coilCount + this.phaseOffset;
    const s = this.wobbleSeed;

    // Radial wobble — arms swing wide and pinch tight.
    // Use frequencies that aren't multiples of 2π so adjacent wraps differ.
    const radialWobble = Math.sin(angle * 0.37 + s * 1.1) * 0.22
                       + Math.sin(angle * 1.17 + s * 3.1) * 0.12
                       + Math.sin(angle * 2.73 + s * 7.7) * 0.05;

    // One section dips close to the star — a localized radial plunge.
    // Gaussian-ish bump centered at a seed-determined position along the tube.
    const dipCenter = 0.3 + (Math.sin(s * 2.7) * 0.5 + 0.5) * 0.4; // 0.3–0.7 along tube
    const dipDist = (t - dipCenter) / 0.08;
    const dipStrength = Math.exp(-dipDist * dipDist) * 0.35;

    const r = this.radius * (1 + radialWobble - dipStrength);

    // Vertical wobble — constrained so adjacent coils never cross.
    // Max vertical displacement must be < (pitch - 2*tubeRadius) / 2
    // so that the worst case (one coil up, neighbor down) still leaves a gap.
    const safeMargin = this.tubeRadius * 3;
    const maxYDisplacement = Math.max(0, (this.pitch - safeMargin) * 0.4);

    // Use irrational-ish frequency ratios so each wrap looks different.
    // The wobble at angle θ and angle θ+2π (next coil) will differ,
    // creating the intertwining look. But the amplitude is capped.
    const yWobble = maxYDisplacement * (
      Math.sin(angle * 0.31 + s * 5.3) * 0.6
      + Math.sin(angle * 1.13 + s * 2.9) * 0.25
      + Math.cos(angle * 0.71 + s * 4.1) * 0.15
    );

    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    const y = (t - 0.5) * this.coilCount * this.pitch + yWobble;
    return optionalTarget.set(x, y, z);
  }
}

export interface TopopolisCoilMeshResult {
  /** Per-coil-wrap groups for frustum culling */
  groups: THREE.Group[];
  interiorMaterials: THREE.ShaderMaterial[];
  cityLightMaterials: THREE.ShaderMaterial[];
  cloudMaterials: THREE.ShaderMaterial[];
  lightningMaterials: THREE.ShaderMaterial[];
  /** Sampled helix centerline points for collision detection */
  helixSamples: THREE.Vector3[];
  /** The helix curve, for computing landing site positions */
  curve: THREE.Curve<THREE.Vector3>;
  tubeRadius: number;
  coilCount: number;
  gatesPerWrap: number;
  /** Gate opening positions on the outward tube surface (local space). */
  gateSurfacePositions: THREE.Vector3[];
}

/**
 * Build a multi-strand topopolis — several thin tubes weaving around each other
 * like intertwining spaghetti strands around the star.
 */
export function makeTopopolisCoil(
  orbitRadius: number,
  coilCount: number,
  tubeRadius: number,
  helixPitch: number,
  baseColor: number,
  biomeSequence: TopopolisBiome[],
  biomeSeed: number,
  qualityTier: QualityTier,
  seed = 0,
  interactionField?: InteractionFieldData,
): TopopolisCoilMeshResult {
  // Default to ultra for now while tuning visuals
  const lod = LOD['ultra'];
  void qualityTier;
  const groups: THREE.Group[] = [];
  const interiorMaterials: THREE.ShaderMaterial[] = [];
  const cityLightMaterials: THREE.ShaderMaterial[] = [];
  const cloudMaterials: THREE.ShaderMaterial[] = [];
  const lightningMaterials: THREE.ShaderMaterial[] = [];
  const helixSamples: THREE.Vector3[] = [];

  // Single strand that weaves around itself via the wobble in the helix curve.
  const strandCount = 1;
  const strandTubeRadius = tubeRadius;

  // Build all strand curves and collect samples from all of them for collision.
  // All strands share the SAME wobble seed so they deform identically —
  // only the phase offset differs. This guarantees they never cross.
  const strandCurves: HelixCurve[] = [];
  for (let strand = 0; strand < strandCount; strand++) {
    const phaseOffset = (strand / strandCount) * Math.PI * 2;
    const curve = new HelixCurve(
      orbitRadius, helixPitch, coilCount,
      seed, strandTubeRadius,
      phaseOffset,
    );
    strandCurves.push(curve);

    // Sample this strand for collision detection
    const pathLength = coilCount * Math.sqrt((2 * Math.PI * orbitRadius) ** 2 + helixPitch ** 2);
    const sampleCount = Math.max(coilCount * 60, Math.ceil(pathLength / (strandTubeRadius * 1.5)));
    for (let i = 0; i <= sampleCount; i++) {
      helixSamples.push(curve.getPointAt(i / sampleCount));
    }
  }

  // Use first strand as the primary curve for landing site placement
  const primaryCurve = strandCurves[0];

  const biomeIndices = new Array(10).fill(0);
  biomeSequence.forEach((biome, i) => {
    if (i < 10) biomeIndices[i] = BIOME_INDEX[biome];
  });
  const biomeCount = Math.max(1, biomeSequence.length);

  const interactionTex = makeInteractionFieldTexture(interactionField);
  const interactionFieldBlend = interactionField ? 0.25 : 0.0;

  const wrapPathLength = Math.sqrt((2 * Math.PI * orbitRadius) ** 2 + helixPitch ** 2);
  const tubeCircumference = 2 * Math.PI * strandTubeRadius;
  const uvAspect = wrapPathLength / tubeCircumference;
  const noiseScale = (2 * Math.PI) / tubeCircumference * 2.5;

  // Flyable gate openings — shader holes + collision gaps at same positions.
  // Only 2 per wrap are real gates; the rest of the 12 collars are decorative.
  const flyableGatesPerWrap = 2;
  const gateShaderRadius = 0.06;
  // Gate opening radius in circumference-normalized units.
  // 0.12 = gate-sized portal on the outward side (~24% of circumference).
  const gateOpeningRadius = 0.12;

  // Build each strand, split into per-wrap segments for frustum culling
  for (let strand = 0; strand < strandCount; strand++) {
    const strandCurve = strandCurves[strand];

    for (let wrap = 0; wrap < coilCount; wrap++) {
      const group = new THREE.Group();

      const tStart = wrap / coilCount;
      const tEnd = (wrap + 1) / coilCount;
      const wrapCurve = new HelixCurveSegment(strandCurve, tStart, tEnd);

      const strandSeed = seed + strand * 17.3;
      const tubeGeo = new THREE.TubeGeometry(
        wrapCurve,
        lod.tubularSegments,
        strandTubeRadius,
        lod.radialSegments,
        false,
      );

      // Interior surface (habitats) — BackSide
      const interiorMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          seed: { value: strandSeed + wrap * 7.3 },
          baseColor: { value: new THREE.Color(baseColor) },
          uLightPhase: { value: 0.0 },
          uLightPos: { value: new THREE.Vector3() },
          biomeSeed: { value: biomeSeed },
          interactionFieldTex: { value: interactionTex },
          interactionFieldBlend: { value: interactionFieldBlend },
          biomeCount: { value: biomeCount },
          biomeIndices: { value: biomeIndices },
          uAspect: { value: uvAspect },
          uNoiseScale: { value: noiseScale },
          gatesPerWrap: { value: flyableGatesPerWrap },
          gateRadius: { value: gateOpeningRadius },
          gateAspect: { value: uvAspect },
          windowsPerWrap: { value: flyableGatesPerWrap },
          windowRadius: { value: gateShaderRadius },
        },
        vertexShader: planetVertex,
        fragmentShader: topopolisInteriorFrag,
      });
      group.add(new THREE.Mesh(tubeGeo, interiorMat));
      interiorMaterials.push(interiorMat);

      // Exterior surface — FrontSide (industrial panels)
      const exteriorMat = new THREE.ShaderMaterial({
        side: THREE.FrontSide,
        uniforms: {
          seed: { value: strandSeed + wrap * 13.1 },
          gatesPerWrap: { value: flyableGatesPerWrap },
          gateRadius: { value: gateOpeningRadius },
          gateAspect: { value: uvAspect },
          windowsPerWrap: { value: flyableGatesPerWrap },
          windowRadius: { value: gateShaderRadius },
        },
        vertexShader: planetVertex,
        fragmentShader: topopolisExteriorFrag,
      });
      group.add(new THREE.Mesh(tubeGeo, exteriorMat));

      // Window glass pane — transparent tinted surface at window positions only
      const glassMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        uniforms: {
          gatesPerWrap: { value: flyableGatesPerWrap },
          gateRadius: { value: gateOpeningRadius },
          gateAspect: { value: uvAspect },
          windowsPerWrap: { value: flyableGatesPerWrap },
          windowRadius: { value: gateShaderRadius },
        },
        vertexShader: planetVertex,
        fragmentShader: topopolisGlassFrag,
      });
      const glassGeo = new THREE.TubeGeometry(
        wrapCurve, lod.tubularSegments, strandTubeRadius * 1.001, lod.radialSegments, false,
      );
      group.add(new THREE.Mesh(glassGeo, glassMat));

      // City lights — BackSide, additive (skip on medium quality)
      if (lod.cityLights) {
        const cityMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          uniforms: {
            seed: { value: strandSeed + wrap * 19.7 },
            biomeSeed: { value: biomeSeed },
            windowsPerWrap: { value: flyableGatesPerWrap },
            windowRadius: { value: gateShaderRadius },
            gateRadius: { value: gateOpeningRadius },
            gateAspect: { value: uvAspect },
            uLightPhase: { value: 0.0 },
            uLightPos: { value: new THREE.Vector3() },
            uAspect: { value: uvAspect },
            uNoiseScale: { value: noiseScale },
            interactionFieldTex: { value: interactionTex },
            interactionFieldBlend: { value: interactionFieldBlend },
            biomeCount: { value: biomeCount },
            biomeIndices: { value: biomeIndices },
          },
          vertexShader: planetVertex,
          fragmentShader: topopolisCityLightsFrag,
        });
        const cityGeo = new THREE.TubeGeometry(
          wrapCurve,
          lod.tubularSegments,
          strandTubeRadius * 0.997,
          lod.radialSegments,
          false,
        );
        group.add(new THREE.Mesh(cityGeo, cityMat));
        cityLightMaterials.push(cityMat);

        // Interior clouds — BackSide, slightly inset from city lights
        const cloudMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
          uniforms: {
            seed: { value: strandSeed + wrap * 31.3 },
            biomeSeed: { value: biomeSeed },
            windowsPerWrap: { value: flyableGatesPerWrap },
            windowRadius: { value: gateShaderRadius },
            gateRadius: { value: gateOpeningRadius },
            gateAspect: { value: uvAspect },
            density: { value: 0.45 },
            uAspect: { value: uvAspect },
            uNoiseScale: { value: noiseScale },
            uTime: { value: 0.0 },
            interactionFieldTex: { value: interactionTex },
            interactionFieldBlend: { value: interactionFieldBlend },
            biomeCount: { value: biomeCount },
            biomeIndices: { value: biomeIndices },
          },
          vertexShader: planetVertex,
          fragmentShader: topopolisCloudsFrag,
        });
        const cloudGeo = new THREE.TubeGeometry(
          wrapCurve, lod.tubularSegments, strandTubeRadius * 0.985, lod.radialSegments, false,
        );
        group.add(new THREE.Mesh(cloudGeo, cloudMat));
        cloudMaterials.push(cloudMat);

        // Interior lightning storms — rare flashes inside the tube
        const lightningMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          uniforms: {
            uTime: { value: 0.0 },
            seed: { value: strandSeed + wrap * 43.7 },
            windowsPerWrap: { value: flyableGatesPerWrap },
            windowRadius: { value: gateShaderRadius },
          gateRadius: { value: gateOpeningRadius },
          gateAspect: { value: uvAspect },
          uAspect: { value: uvAspect },
        },
        vertexShader: planetVertex,
        fragmentShader: topopolisLightningFrag,
      });
        const lightningGeo = new THREE.TubeGeometry(
          wrapCurve, lod.tubularSegments, strandTubeRadius * 0.990, lod.radialSegments, false,
        );
        group.add(new THREE.Mesh(lightningGeo, lightningMat));
        lightningMaterials.push(lightningMat);
      }

      groups.push(group);
    }
  }

  // Entrance panels — annular caps at each end of the tube
  const entranceGroup = new THREE.Group();
  const entranceMat = new THREE.MeshBasicMaterial({
    color: 0x3A4450,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x88AACC,
    side: THREE.DoubleSide,
  });

  // Gate stations — structural collars wrapping the tube with a gate opening.
  // Each collar is a torus ring around the tube, plus brighter accent bands
  // and a gate marker on the outward-facing side.
  const collarMat = new THREE.MeshBasicMaterial({
    color: 0x556677,
    side: THREE.DoubleSide,
  });
  const collarAccentMat = new THREE.MeshBasicMaterial({
    color: 0x88BBDD,
    side: THREE.DoubleSide,
  });
  // Decorative collars — 12 per wrap, visual structure only (no collision gap)
  const collarCount = Math.max(2, Math.floor(coilCount * 12));
  const collarsPerWrap = collarCount / coilCount;
  for (const strandCurve of strandCurves) {
    for (let g = 1; g < collarCount; g++) {
      const t = g / collarCount;

      // Skip collars near flyable gate positions
      const wrapUvX = (g % collarsPerWrap) / collarsPerWrap;
      const gateSpacing = 1.0 / flyableGatesPerWrap;
      const nearestGateUvX = Math.round((wrapUvX - gateSpacing * 0.5) / gateSpacing) * gateSpacing + gateSpacing * 0.5;
      if (Math.abs(wrapUvX - nearestGateUvX) < 0.09) continue;

      const center = strandCurve.getPointAt(t);
      const tangent = strandCurve.getTangentAt(t).normalize();

      const collarThickness = strandTubeRadius * 0.06;
      const collarGeo = new THREE.TorusGeometry(
        strandTubeRadius * 1.02, collarThickness, 8, 32,
      );
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.copy(center);
      const up = Math.abs(tangent.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const collarMatrix = new THREE.Matrix4().lookAt(
        center, center.clone().add(tangent), up,
      );
      collar.quaternion.setFromRotationMatrix(collarMatrix);
      entranceGroup.add(collar);

      [-1, 1].forEach((side) => {
        const accentGeo = new THREE.TorusGeometry(
          strandTubeRadius * 1.01, collarThickness * 0.4, 6, 32,
        );
        const accent = new THREE.Mesh(accentGeo, collarAccentMat);
        accent.position.copy(center).add(
          tangent.clone().multiplyScalar(side * strandTubeRadius * 0.12),
        );
        accent.quaternion.copy(collar.quaternion);
        entranceGroup.add(accent);
      });
    }
  }

  // Gate-framing collars — structural rings at each flyable gate opening
  // Merged into a single geometry to minimise draw calls.
  {
    const collarThickness = strandTubeRadius * 0.08;
    const templateGeo = new THREE.TorusGeometry(
      strandTubeRadius * 1.03, collarThickness, 8, 32,
    );
    const gateCollarGeos: THREE.BufferGeometry[] = [];
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();

    strandCurves.forEach((strandCurve) => {
      for (let wrap = 0; wrap < coilCount; wrap++) {
        for (let fg = 0; fg < flyableGatesPerWrap; fg++) {
          const gateUvX = (fg + 0.5) / flyableGatesPerWrap;
          const t = (wrap + gateUvX) / coilCount;
          const center = strandCurve.getPointAt(t);
          const tangent = strandCurve.getTangentAt(t).normalize();

          const up = Math.abs(tangent.y) < 0.9
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
          const lookAt = new THREE.Matrix4().lookAt(
            center, center.clone().add(tangent), up,
          );
          quat.setFromRotationMatrix(lookAt);
          mat4.compose(center, quat, new THREE.Vector3(1, 1, 1));

          const clone = templateGeo.clone().applyMatrix4(mat4);
          gateCollarGeos.push(clone);
        }
      }
    });

    if (gateCollarGeos.length > 0) {
      const merged = mergeGeometries(gateCollarGeos);
      if (merged) {
        entranceGroup.add(new THREE.Mesh(merged, collarAccentMat));
      }
      gateCollarGeos.forEach((g) => g.dispose());
    }
    templateGeo.dispose();
  }

  // Compute gate surface positions — the point on the outward tube surface
  // where each gate opening is. Used for 3D distance collision checks.
  const gateSurfacePositions: THREE.Vector3[] = [];
  for (let wrap = 0; wrap < coilCount; wrap++) {
    const tStart = wrap / coilCount;
    const tEnd = (wrap + 1) / coilCount;
    const wrapCurve = new HelixCurveSegment(primaryCurve, tStart, tEnd);
    for (let fg = 0; fg < flyableGatesPerWrap; fg++) {
      const uvX = (fg + 0.5) / flyableGatesPerWrap;
      const center = wrapCurve.getPointAt(uvX);
      const tangent = wrapCurve.getTangentAt(uvX).normalize();
      // Outward direction — away from star, perpendicular to tube tangent
      const toStar = center.clone().normalize().negate();
      const outward = new THREE.Vector3()
        .crossVectors(tangent, toStar).cross(tangent).normalize();
      // Position on the tube surface at the gate opening
      gateSurfacePositions.push(center.add(outward.multiplyScalar(strandTubeRadius)));
    }
  }
  // Endpoint entrance gates — at tube ends, centered (no outward offset needed)
  gateSurfacePositions.push(
    primaryCurve.getPointAt(0),
    primaryCurve.getPointAt(1),
  );

  // Entrance panels at each end of each strand
  for (const strandCurve of strandCurves) {
    [0, 1].forEach((endIdx) => {
      const t = endIdx === 0 ? 0 : 1;
      const center = strandCurve.getPointAt(t);
      const tangent = strandCurve.getTangentAt(t).normalize();

      const outerR = strandTubeRadius;
      const innerR = strandTubeRadius * 0.65;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, lod.radialSegments, 1);
      const ring = new THREE.Mesh(ringGeo, entranceMat);
      ring.position.copy(center);
      ring.lookAt(center.clone().add(tangent));
      entranceGroup.add(ring);

      const rimGeo = new THREE.RingGeometry(outerR - 3, outerR, lod.radialSegments, 1);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.copy(center);
      rim.lookAt(center.clone().add(tangent));
      entranceGroup.add(rim);

      const innerRimGeo = new THREE.RingGeometry(innerR, innerR + 4, lod.radialSegments, 1);
      const innerRim = new THREE.Mesh(innerRimGeo, rimMat);
      innerRim.position.copy(center);
      innerRim.lookAt(center.clone().add(tangent));
      entranceGroup.add(innerRim);
    });
  }

  groups[0]?.add(entranceGroup);

  return { groups, interiorMaterials, cityLightMaterials, cloudMaterials, lightningMaterials, helixSamples, curve: primaryCurve, tubeRadius: strandTubeRadius, coilCount, gatesPerWrap: flyableGatesPerWrap, gateSurfacePositions };
}

/**
 * A sub-segment of a parent curve, remapping t from [0,1] to [tStart,tEnd].
 */
class HelixCurveSegment extends THREE.Curve<THREE.Vector3> {
  private parent: THREE.Curve<THREE.Vector3>;
  private tStart: number;
  private tEnd: number;

  constructor(parent: THREE.Curve<THREE.Vector3>, tStart: number, tEnd: number) {
    super();
    this.parent = parent;
    this.tStart = tStart;
    this.tEnd = tEnd;
  }

  getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    const globalT = this.tStart + t * (this.tEnd - this.tStart);
    return this.parent.getPoint(globalT, optionalTarget);
  }
}
