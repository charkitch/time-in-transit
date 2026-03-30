import * as THREE from 'three';
import { PALETTE } from '../constants';
import { loadTexture } from './textureCache';
import type { PlanetSkin } from './planetSkins';
import type { SurfaceType } from '../generation/SystemGenerator';

/** Creates a group with filled mesh + wireframe overlay */
export function makeWireframeObject(
  geo: THREE.BufferGeometry,
  fillColor: number,
  wireColor: number = PALETTE.wireframe,
  wireOpacity = 0.6,
): THREE.Group {
  const group = new THREE.Group();

  const fillMat = new THREE.MeshLambertMaterial({ color: fillColor });
  const fillMesh = new THREE.Mesh(geo, fillMat);
  group.add(fillMesh);

  const edgesGeo = new THREE.EdgesGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: wireColor,
    transparent: true,
    opacity: wireOpacity,
  });
  const wireframe = new THREE.LineSegments(edgesGeo, wireMat);
  group.add(wireframe);

  return group;
}

// ── Shared GLSL noise used by procedural planet + city lights ──────────────
const GLSL_NOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100.0);
    for (int i = 0; i < 5; i++) {
      v += a * snoise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }
`;

// Surface type index for GLSL: 0=continental, 1=ocean, 2=marsh, 3=venus
const SURFACE_TYPE_INDEX: Record<SurfaceType, number> = {
  continental: 0, ocean: 1, marsh: 2, venus: 3,
};

/** Procedural planet — surface type drives palette and land/ocean ratio */
export function makePlanet(
  radius: number, color: number, detail: number = 1,
  seed: number = 0, surfaceType: SurfaceType = 'continental',
): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 32, 24);

  const baseColor = new THREE.Color(color);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      seed: { value: seed },
      baseColor: { value: baseColor },
      surfType: { value: SURFACE_TYPE_INDEX[surfaceType] },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform float seed;
      uniform vec3 baseColor;
      uniform int surfType;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);

        vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
        float n = fbm(noisePos);

        vec3 surfaceColor;

        if (surfType == 0) {
          // ── Continental: balanced land/ocean ──
          float landMask = smoothstep(-0.05, 0.1, n);
          vec3 ocean = vec3(0.05, 0.12, 0.25);
          vec3 shallow = vec3(0.08, 0.2, 0.35);
          vec3 lowland = mix(vec3(0.15, 0.35, 0.12), baseColor * 0.5, 0.3);
          vec3 highland = mix(vec3(0.45, 0.35, 0.2), baseColor * 0.7, 0.3);
          float h = smoothstep(0.1, 0.5, n);
          vec3 land = mix(lowland, highland, h);
          float depth = smoothstep(-0.4, -0.05, n);
          vec3 oceanC = mix(ocean, shallow, depth);
          surfaceColor = mix(oceanC, land, landMask);

        } else if (surfType == 1) {
          // ── Ocean world: mostly water, tiny island chains ──
          float landMask = smoothstep(0.25, 0.35, n);
          vec3 deepOcean = vec3(0.02, 0.06, 0.2);
          vec3 midOcean = vec3(0.04, 0.14, 0.35);
          vec3 shallow = vec3(0.08, 0.25, 0.45);
          float depth = smoothstep(-0.5, 0.25, n);
          vec3 oceanC = mix(deepOcean, mix(midOcean, shallow, depth), depth);
          vec3 island = mix(vec3(0.6, 0.55, 0.35), vec3(0.2, 0.4, 0.15), smoothstep(0.35, 0.5, n));
          surfaceColor = mix(oceanC, island, landMask);

        } else if (surfType == 2) {
          // ── Marsh world: murky, swampy, green-brown ──
          float landMask = smoothstep(-0.15, 0.05, n);
          vec3 swampWater = vec3(0.05, 0.1, 0.08);
          vec3 murkyShallow = vec3(0.1, 0.15, 0.08);
          vec3 wetland = vec3(0.12, 0.25, 0.08);
          vec3 dryLand = mix(vec3(0.3, 0.25, 0.12), baseColor * 0.4, 0.3);
          float depth = smoothstep(-0.4, -0.15, n);
          vec3 waterC = mix(swampWater, murkyShallow, depth);
          float h = smoothstep(0.05, 0.4, n);
          vec3 land = mix(wetland, dryLand, h);
          surfaceColor = mix(waterC, land, landMask);

        } else {
          // ── Venus: thick atmosphere, no visible ocean, hazy yellow-orange ──
          vec3 hazeLight = vec3(0.85, 0.7, 0.35);
          vec3 hazeDark = vec3(0.55, 0.35, 0.15);
          vec3 hotSurface = vec3(0.7, 0.4, 0.1);
          // Swirling cloud bands
          vec3 cloudPos = normalize(vLocalPos) * 1.5 + vec3(seed * 5.0, seed * 2.3, seed * 8.1);
          float cloud = fbm(cloudPos + vec3(0.0, n * 0.3, 0.0));
          float band = smoothstep(-0.3, 0.3, cloud);
          surfaceColor = mix(hazeDark, hazeLight, band);
          // Faint hot glow in deeper cracks
          float crack = smoothstep(0.3, 0.5, n);
          surfaceColor = mix(surfaceColor, hotSurface, crack * 0.3);
        }

        // Lighting: sun side brighter, dark side very dim
        float lighting = smoothstep(-0.3, 0.8, sunDot) * 0.85 + 0.15;

        gl_FragColor = vec4(surfaceColor * lighting, 1.0);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));

  // Subtle wireframe overlay
  if (detail >= 0) {
    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const wireMat = new THREE.LineBasicMaterial({
      color: PALETTE.wireframe,
      transparent: true,
      opacity: 0.12,
    });
    group.add(new THREE.LineSegments(edgesGeo, wireMat));
  }

  return group;
}

/** Gas giant with vertex color banding */
export function makeGasGiant(radius: number, baseColor: number, rng: () => number): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const colors: number[] = [];
  const color = new THREE.Color(baseColor);
  const positions = geo.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const band = Math.sin(y * 0.05 + rng() * 2) * 0.5 + 0.5;
    const c = color.clone().lerp(new THREE.Color(0xFFFFFF), band * 0.3);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const group = new THREE.Group();
  const fillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(geo, fillMat));

  const edgesGeo = new THREE.EdgesGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({ color: PALETTE.wireframe, transparent: true, opacity: 0.4 });
  group.add(new THREE.LineSegments(edgesGeo, wireMat));

  return group;
}

/** Coriolis-style space station: ring of box segments */
export function makeStation(size = 60): THREE.Group {
  const group = new THREE.Group();
  const segCount = 12;
  const ringRadius = size;
  const segW = size * 0.35;
  const segH = size * 0.12;
  const segD = size * 0.15;

  for (let i = 0; i < segCount; i++) {
    const angle = (i / segCount) * Math.PI * 2;
    const geo = new THREE.BoxGeometry(segW, segH, segD);
    const seg = makeWireframeObject(geo, 0x223344, PALETTE.stationWire, 0.8);
    seg.position.set(
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius,
      0,
    );
    seg.rotation.z = angle;
    group.add(seg);
  }

  // Central hub
  const hubGeo = new THREE.CylinderGeometry(size * 0.15, size * 0.15, size * 0.3, 8);
  const hub = makeWireframeObject(hubGeo, 0x112233, PALETTE.stationWire, 0.9);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  return group;
}

/** Glow sprite (additive blend) */
export function makeGlowSprite(color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0,   `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/** Instanced asteroid field */
export function makeAsteroidBelt(
  innerRadius: number,
  outerRadius: number,
  count: number,
  rng: () => number,
): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888877 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = innerRadius + rng() * (outerRadius - innerRadius);
    const y = (rng() - 0.5) * 200;
    const scale = 8 + rng() * 25;
    dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** NPC trade ship — small wireframe cone, nose pointing forward (-Z) */
export function makeNPCShipMesh(color: number = 0x44CCFF): THREE.Group {
  const geo = new THREE.ConeGeometry(8, 24, 4);
  geo.rotateX(Math.PI / 2);
  return makeWireframeObject(geo, color, color, 0.8);
}

/** Fleet battle ship — variable-scale wireframe. Capital ships use elongated box. */
export function makeFleetShipMesh(color: number, scale: number): THREE.Group {
  let geo: THREE.BufferGeometry;
  if (scale > 1.5) {
    // Capital ship: elongated box
    geo = new THREE.BoxGeometry(6 * scale, 4 * scale, 20 * scale);
  } else {
    // Fighter: cone like NPC ships
    geo = new THREE.ConeGeometry(8 * scale, 24 * scale, 4);
    geo.rotateX(Math.PI / 2);
  }
  return makeWireframeObject(geo, color, color, 0.8);
}

/** Secret asteroid base — small, angular, hidden among rocks */
export function makeAsteroidBase(size = 35): THREE.Group {
  const group = new THREE.Group();
  // Irregular main hull — dodecahedron for a rocky, carved-out look
  const hullGeo = new THREE.DodecahedronGeometry(size, 0);
  const hull = makeWireframeObject(hullGeo, 0x554433, 0xAA7744, 0.5);
  group.add(hull);

  // Docking arm — thin cylinder sticking out
  const armGeo = new THREE.CylinderGeometry(size * 0.06, size * 0.06, size * 1.2, 6);
  const arm = makeWireframeObject(armGeo, 0x665544, 0xBB8855, 0.6);
  arm.rotation.z = Math.PI / 4;
  arm.position.set(size * 0.4, size * 0.4, 0);
  group.add(arm);

  // Dim amber light
  const light = new THREE.PointLight(0xAA7744, 0.4, size * 8);
  group.add(light);

  return group;
}

/** Secret Oort cloud base — cold, distant, icy blue */
export function makeOortCloudBase(size = 45): THREE.Group {
  const group = new THREE.Group();

  // Main structure: octahedron — crystalline, cold
  const coreGeo = new THREE.OctahedronGeometry(size, 0);
  const core = makeWireframeObject(coreGeo, 0x112244, 0x4488CC, 0.7);
  group.add(core);

  // Ring of ice shards — small tetrahedra orbiting
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const shardGeo = new THREE.TetrahedronGeometry(size * 0.2, 0);
    const shard = makeWireframeObject(shardGeo, 0x224466, 0x66AADD, 0.4);
    shard.position.set(
      Math.cos(angle) * size * 1.5,
      (i % 2 === 0 ? 1 : -1) * size * 0.3,
      Math.sin(angle) * size * 1.5,
    );
    shard.rotation.set(angle, angle * 0.7, 0);
    group.add(shard);
  }

  // Cold blue glow
  const glow = makeGlowSprite(0x4488CC, size * 4);
  group.add(glow);
  const light = new THREE.PointLight(0x4488CC, 0.6, size * 12);
  group.add(light);

  return group;
}

/** Maximum space base — at the edge of the void, eerie purple-black */
export function makeMaximumSpaceBase(size = 55): THREE.Group {
  const group = new THREE.Group();

  // Central monolith — tall, thin box
  const monolithGeo = new THREE.BoxGeometry(size * 0.3, size * 2, size * 0.3);
  const monolith = makeWireframeObject(monolithGeo, 0x0A0A1A, 0x8844FF, 0.9);
  group.add(monolith);

  // Surrounding ring structure — broken/incomplete, ancient
  const segCount = 8;
  const ringRadius = size * 1.8;
  for (let i = 0; i < segCount; i++) {
    // Skip some segments for a broken look
    if (i === 2 || i === 5) continue;
    const angle = (i / segCount) * Math.PI * 2;
    const segGeo = new THREE.BoxGeometry(size * 0.25, size * 0.08, size * 0.12);
    const seg = makeWireframeObject(segGeo, 0x110022, 0xAA66FF, 0.6);
    seg.position.set(
      Math.cos(angle) * ringRadius,
      Math.sin(angle * 3) * size * 0.3,
      Math.sin(angle) * ringRadius,
    );
    seg.rotation.y = -angle;
    group.add(seg);
  }

  // Void glow — deep purple, pulsing feel
  const glow = makeGlowSprite(0x6622CC, size * 6);
  group.add(glow);
  const light = new THREE.PointLight(0x8844FF, 0.8, size * 15);
  group.add(light);

  return group;
}

/** Textured rocky/terrestrial planet — falls back to procedural when no skin */
export function makeTexturedPlanet(
  radius: number,
  fallbackColor: number,
  skin: PlanetSkin | null,
  wireOverlay: boolean,
  seed: number = 0,
  surfaceType: SurfaceType = 'continental',
): THREE.Group {
  // No skin available — use procedural continent/ocean shader
  if (!skin) {
    return makePlanet(radius, fallbackColor, 1, seed, surfaceType);
  }

  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.8,
    metalness: 0.1,
  });

  mat.map = loadTexture(skin.albedo);
  if (skin.normal) mat.normalMap = loadTexture(skin.normal);
  if (skin.roughness) mat.roughnessMap = loadTexture(skin.roughness);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));

  if (wireOverlay) {
    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const wireMat = new THREE.LineBasicMaterial({
      color: PALETTE.wireframe,
      transparent: true,
      opacity: 0.15,
    });
    group.add(new THREE.LineSegments(edgesGeo, wireMat));
  }

  return group;
}

/** Textured gas giant — sphere with banding texture, or solid fallback */
export function makeTexturedGasGiant(
  radius: number,
  fallbackColor: number,
  skin: PlanetSkin | null,
  wireOverlay: boolean,
): THREE.Group {
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.9,
    metalness: 0.0,
  });

  if (skin) {
    mat.map = loadTexture(skin.albedo);
    if (skin.normal) mat.normalMap = loadTexture(skin.normal);
  }

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));

  if (wireOverlay) {
    const edgesGeo = new THREE.EdgesGeometry(geo, 15);
    const wireMat = new THREE.LineBasicMaterial({
      color: PALETTE.wireframe,
      transparent: true,
      opacity: 0.15,
    });
    group.add(new THREE.LineSegments(edgesGeo, wireMat));
  }

  return group;
}

/** Textured planetary ring */
export function makeTexturedRing(
  innerR: number,
  outerR: number,
  skin: PlanetSkin,
): THREE.Mesh {
  const geo = new THREE.RingGeometry(innerR, outerR, 64);
  const mat = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
    roughness: 1.0,
    metalness: 0.0,
  });

  if (skin.ring) {
    mat.map = loadTexture(skin.ring);
    mat.alphaMap = loadTexture(skin.ring);
  }

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** City lights on the dark side of a planet (skip gas giants + venus) */
export function addCityLights(
  group: THREE.Group, radius: number, seed: number,
  surfaceType: SurfaceType = 'continental',
): void {
  // Venus: thick atmosphere hides everything — no city lights
  if (surfaceType === 'venus') return;

  const geo = new THREE.SphereGeometry(radius * 1.005, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      seed: { value: seed },
      surfType: { value: SURFACE_TYPE_INDEX[surfaceType] },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      ${GLSL_NOISE}
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;
      uniform float seed;
      uniform int surfType;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453);
      }

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);

        // Only visible on dark side
        float darkMask = smoothstep(0.0, -0.2, sunDot);

        // Same continent noise as the planet surface — cities only on land
        vec3 noisePos = normalize(vLocalPos) * 2.0
          + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
        float n = fbm(noisePos);

        // Land mask matches planet surface type thresholds
        float landMask;
        if (surfType == 1) {
          // Ocean world — only tiny islands
          landMask = smoothstep(0.25, 0.4, n);
        } else if (surfType == 2) {
          // Marsh — most land is soggy but buildable
          landMask = smoothstep(-0.15, 0.1, n);
        } else {
          // Continental
          landMask = smoothstep(-0.05, 0.15, n);
        }

        // Denser city grid — tighter cells, more dots per cluster
        vec3 norm = normalize(vLocalPos);
        float theta = atan(norm.z, norm.x);
        float phi = acos(clamp(norm.y, -1.0, 1.0));
        vec2 gridUv = vec2(theta * 35.0, phi * 20.0);
        vec2 cell = floor(gridUv);
        vec2 local = fract(gridUv) - 0.5;

        float h = hash(cell);
        float city = 0.0;

        // Tight cluster of 3-5 dots per populated cell
        if (h > 0.4) {
          // Core city
          vec2 o1 = vec2(hash(cell + 1.0) - 0.5, hash(cell + 2.0) - 0.5) * 0.25;
          city += smoothstep(0.10, 0.01, length(local - o1));

          // Inner sprawl — always present in populated cells
          vec2 o2 = o1 + vec2(hash(cell + 3.0) - 0.5, hash(cell + 4.0) - 0.5) * 0.15;
          city += smoothstep(0.07, 0.005, length(local - o2)) * 0.8;

          vec2 o3 = o1 + vec2(hash(cell + 5.0) - 0.5, hash(cell + 6.0) - 0.5) * 0.18;
          city += smoothstep(0.06, 0.005, length(local - o3)) * 0.6;

          if (h > 0.55) {
            // Outer suburbs
            vec2 o4 = o1 + vec2(hash(cell + 7.0) - 0.5, hash(cell + 8.0) - 0.5) * 0.2;
            city += smoothstep(0.05, 0.005, length(local - o4)) * 0.5;

            vec2 o5 = o1 + vec2(hash(cell + 9.0) - 0.5, hash(cell + 10.0) - 0.5) * 0.22;
            city += smoothstep(0.04, 0.005, length(local - o5)) * 0.4;
          }
        }

        city = min(city, 1.0);
        float alpha = darkMask * landMask * city * 0.9;
        vec3 color = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.95, 0.7), h);

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
}

/** Atmospheric glow on the sunlit side of a planet (skip gas giants) */
export function addSunAtmosphere(group: THREE.Group, radius: number): void {
  const geo = new THREE.SphereGeometry(radius * 1.06, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);

        // Fresnel rim — strongest at edges, visible from all angles
        float rim = 1.0 - max(dot(vWorldNormal, vViewDir), 0.0);
        rim = pow(rim, 2.0);

        // Broad sunlit glow — covers most of the sun-facing hemisphere
        float sunMask = smoothstep(-0.2, 0.6, sunDot);

        // Diffuse brightening across the whole lit face (not just rim)
        float faceBright = max(sunDot, 0.0) * 0.25;

        float alpha = (rim * 0.7 + faceBright) * sunMask;
        vec3 color = vec3(0.7, 0.88, 1.0);

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
}

/** Planetary ring */
export function makeRingMesh(innerR: number, outerR: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(innerR, outerR, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xAABBCC,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
