import * as THREE from 'three';
import { PALETTE } from '../constants';
import { loadTexture } from './textureCache';
import type { PlanetSkin } from './planetSkins';
import type { SurfaceType, GasGiantType } from '../generation/SystemGenerator';
import { PRNG } from '../generation/prng';

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

// Surface type index for GLSL
const SURFACE_TYPE_INDEX: Record<SurfaceType, number> = {
  continental: 0,
  ocean: 1,
  marsh: 2,
  venus: 3,
  barren: 4,
  desert: 5,
  ice: 6,
  volcanic: 7,
  forest_moon: 8,
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

        } else if (surfType == 3) {
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

        } else if (surfType == 4) {
          // ── Barren world: dusty, rocky, nearly airless ──
          float ridge = smoothstep(-0.15, 0.45, n);
          vec3 dust = vec3(0.42, 0.36, 0.30);
          vec3 stone = vec3(0.56, 0.49, 0.40);
          vec3 pale = vec3(0.70, 0.65, 0.58);
          surfaceColor = mix(dust, stone, ridge);
          surfaceColor = mix(surfaceColor, pale, smoothstep(0.35, 0.7, n));

        } else if (surfType == 5) {
          // ── Desert world: sand seas with dark rock uplands ──
          float dune = sin(normalize(vLocalPos).x * 18.0 + n * 4.0 + seed) * 0.5 + 0.5;
          float highland = smoothstep(0.12, 0.55, n);
          vec3 sand = vec3(0.78, 0.66, 0.38);
          vec3 duneGold = vec3(0.88, 0.75, 0.46);
          vec3 rock = vec3(0.50, 0.34, 0.20);
          surfaceColor = mix(sand, duneGold, dune * 0.35);
          surfaceColor = mix(surfaceColor, rock, highland * 0.55);

        } else if (surfType == 6) {
          // ── Ice world: frozen seas, blue shadows, bright caps ──
          float crack = smoothstep(0.15, 0.6, abs(snoise(noisePos * 2.4)));
          float ridge = smoothstep(-0.05, 0.45, n);
          vec3 deepIce = vec3(0.52, 0.68, 0.82);
          vec3 paleIce = vec3(0.82, 0.90, 0.97);
          vec3 snow = vec3(0.96, 0.98, 1.0);
          surfaceColor = mix(deepIce, paleIce, ridge);
          surfaceColor = mix(surfaceColor, snow, smoothstep(0.25, 0.65, n));
          surfaceColor = mix(surfaceColor, deepIce * 0.75, crack * 0.25);

        } else if (surfType == 7) {
          // ── Volcanic world: basalt plains with hot fissures ──
          float lava = smoothstep(0.35, 0.62, abs(snoise(noisePos * 3.2)));
          float ash = smoothstep(-0.25, 0.35, n);
          vec3 basalt = vec3(0.12, 0.11, 0.12);
          vec3 ashGray = vec3(0.28, 0.24, 0.22);
          vec3 lavaCore = vec3(1.0, 0.38, 0.06);
          vec3 lavaGlow = vec3(1.0, 0.72, 0.12);
          surfaceColor = mix(basalt, ashGray, ash);
          surfaceColor = mix(surfaceColor, lavaCore, lava);
          surfaceColor = mix(surfaceColor, lavaGlow, lava * smoothstep(0.0, 0.6, sunDot + 0.2) * 0.35);

        } else {
          // ── Forest moon: dense green canopy, muted seas, Endor-like and rare ──
          float landMask = smoothstep(-0.18, 0.02, n);
          vec3 deepWater = vec3(0.03, 0.09, 0.13);
          vec3 shallow = vec3(0.07, 0.16, 0.12);
          vec3 lowForest = vec3(0.08, 0.24, 0.10);
          vec3 highForest = vec3(0.18, 0.32, 0.12);
          vec3 rock = vec3(0.42, 0.34, 0.24);
          vec3 waterC = mix(deepWater, shallow, smoothstep(-0.4, -0.08, n));
          vec3 forest = mix(lowForest, highForest, smoothstep(0.0, 0.4, n));
          forest = mix(forest, rock, smoothstep(0.35, 0.65, n) * 0.2);
          surfaceColor = mix(waterC, forest, landMask);
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

// Gas giant type index for GLSL: 0=jovian, 1=saturnian, 2=neptunian, 3=inferno, 4=chromatic
const GAS_TYPE_INDEX: Record<GasGiantType, number> = {
  jovian: 0, saturnian: 1, neptunian: 2, inferno: 3, chromatic: 4,
};

/** Procedural gas giant — type drives banding style and palette */
export function makeGasGiant(
  radius: number, baseColor: number, rng: () => number,
  seed: number = 0, gasType: GasGiantType = 'jovian',
): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 32, 24);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      seed: { value: seed },
      baseColor: { value: new THREE.Color(baseColor) },
      gasType: { value: GAS_TYPE_INDEX[gasType] },
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
      uniform int gasType;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);

        vec3 norm = normalize(vLocalPos);
        // Latitude — drives horizontal banding
        float lat = norm.y;

        // Noise inputs
        vec3 np = norm * 3.0 + vec3(seed * 7.7, seed * 3.1, seed * 11.3);
        float n1 = snoise(np);
        float n2 = snoise(np * 2.5 + vec3(50.0));
        float n3 = fbm(np * 1.5);

        vec3 surfaceColor;

        if (gasType == 0) {
          // ── Jovian: bold warm bands, Great Red Spot style storms ──
          float band = sin(lat * 18.0 + n1 * 1.5) * 0.5 + 0.5;
          float fineBand = sin(lat * 45.0 + n2 * 0.8) * 0.5 + 0.5;
          vec3 bright = vec3(0.9, 0.75, 0.5);
          vec3 dark = vec3(0.6, 0.35, 0.15);
          vec3 belt = vec3(0.75, 0.55, 0.3);
          surfaceColor = mix(dark, bright, band);
          surfaceColor = mix(surfaceColor, belt, fineBand * 0.3);
          // Storm spots
          float storm = smoothstep(0.55, 0.7, n3) * smoothstep(0.2, 0.0, abs(lat - 0.3 - seed * 0.1));
          vec3 stormColor = vec3(0.85, 0.3, 0.15);
          surfaceColor = mix(surfaceColor, stormColor, storm * 0.8);

        } else if (gasType == 1) {
          // ── Saturnian: pale gold/cream with subtle delicate bands ──
          float band = sin(lat * 25.0 + n1 * 0.6) * 0.5 + 0.5;
          float whisper = sin(lat * 60.0 + n2 * 0.4) * 0.5 + 0.5;
          vec3 cream = vec3(0.92, 0.85, 0.65);
          vec3 gold = vec3(0.8, 0.7, 0.45);
          vec3 pale = vec3(0.95, 0.92, 0.8);
          surfaceColor = mix(gold, cream, band);
          surfaceColor = mix(surfaceColor, pale, whisper * 0.2);
          // Faint polar hexagon hint
          float polar = smoothstep(0.75, 0.9, abs(lat));
          float hex = sin(atan(norm.z, norm.x) * 6.0) * 0.5 + 0.5;
          surfaceColor = mix(surfaceColor, vec3(0.7, 0.65, 0.5), polar * hex * 0.15);

        } else if (gasType == 2) {
          // ── Neptunian: deep blue-cyan with bright white cloud streaks ──
          float band = sin(lat * 14.0 + n1 * 2.0) * 0.5 + 0.5;
          vec3 deep = vec3(0.05, 0.1, 0.4);
          vec3 mid = vec3(0.1, 0.25, 0.6);
          vec3 bright = vec3(0.2, 0.45, 0.8);
          surfaceColor = mix(deep, mid, band);
          surfaceColor = mix(surfaceColor, bright, band * band * 0.5);
          // Bright white cloud wisps — elongated along latitude
          float wisp = smoothstep(0.5, 0.8, snoise(vec3(norm.x * 8.0 + seed, lat * 3.0, norm.z * 8.0)));
          surfaceColor = mix(surfaceColor, vec3(0.8, 0.9, 1.0), wisp * 0.6);
          // Dark spot
          float spot = smoothstep(0.6, 0.75, n3) * smoothstep(0.25, 0.0, abs(lat + 0.2));
          surfaceColor = mix(surfaceColor, vec3(0.02, 0.04, 0.2), spot * 0.7);

        } else if (gasType == 3) {
          // ── Inferno: hot Jupiter, close-orbit scorched giant ──
          float band = sin(lat * 12.0 + n1 * 2.5) * 0.5 + 0.5;
          vec3 molten = vec3(0.95, 0.3, 0.05);
          vec3 dark = vec3(0.3, 0.05, 0.02);
          vec3 bright = vec3(1.0, 0.7, 0.2);
          surfaceColor = mix(dark, molten, band);
          // Roiling convection cells
          float cells = abs(n3);
          surfaceColor = mix(surfaceColor, bright, cells * 0.4);
          // Incandescent glow on star-facing side
          float scorchMask = smoothstep(-0.2, 0.6, sunDot);
          surfaceColor = mix(surfaceColor, vec3(1.0, 0.85, 0.4), scorchMask * 0.25);
          // Dark terminator storms
          float terminator = smoothstep(0.1, 0.0, abs(sunDot)) * smoothstep(0.3, 0.6, n3);
          surfaceColor = mix(surfaceColor, vec3(0.15, 0.02, 0.0), terminator * 0.5);

        } else {
          // ── Chromatic: alien, iridescent, shifting prismatic bands ──
          float band = sin(lat * 20.0 + n1 * 1.8) * 0.5 + 0.5;
          float shift = sin(lat * 35.0 + n2 * 1.2 + seed * 5.0) * 0.5 + 0.5;
          // Rainbow cycle driven by latitude + noise
          float hue = fract(lat * 0.8 + n1 * 0.3 + seed * 0.1);
          // HSV to RGB approximation
          vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
          rainbow = pow(rainbow, vec3(0.8)); // desaturate slightly
          vec3 dark = rainbow * 0.3;
          surfaceColor = mix(dark, rainbow, band);
          // Metallic sheen bands
          float sheen = pow(shift, 3.0);
          surfaceColor = mix(surfaceColor, vec3(0.95, 0.95, 1.0), sheen * 0.2);
          // Deep vortex swirls
          float vortex = smoothstep(0.45, 0.7, abs(snoise(np * 3.0)));
          surfaceColor = mix(surfaceColor, surfaceColor * 0.4, vortex * 0.3);
        }

        // Lighting
        float lighting = smoothstep(-0.3, 0.8, sunDot) * 0.8 + 0.2;

        gl_FragColor = vec4(surfaceColor * lighting, 1.0);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));

  // Wireframe overlay
  const edgesGeo = new THREE.EdgesGeometry(geo, 15);
  const wireMat = new THREE.LineBasicMaterial({
    color: PALETTE.wireframe,
    transparent: true,
    opacity: 0.12,
  });
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
  // No skin available — use the procedural surface variant for this body.
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
  seed: number = 0,
  gasType: GasGiantType = 'jovian',
): THREE.Group {
  // No skin — use procedural shader
  if (!skin) {
    return makeGasGiant(radius, fallbackColor, () => 0, seed, gasType);
  }

  const geo = new THREE.SphereGeometry(radius, 32, 24);
  const mat = new THREE.MeshStandardMaterial({
    color: fallbackColor,
    roughness: 0.9,
    metalness: 0.0,
  });

  mat.map = loadTexture(skin.albedo);
  if (skin.normal) mat.normalMap = loadTexture(skin.normal);

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

// ── Procedural ring system ────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

const RING_PALETTES: Record<GasGiantType, readonly RGB[]> = {
  jovian:    [[185, 145,  88], [205, 165,  98], [165, 125,  68], [195, 152,  78]],
  saturnian: [[218, 198, 142], [235, 218, 168], [202, 182, 122], [225, 205, 152]],
  neptunian: [[118, 142, 178], [98,  122, 168], [138, 162, 188], [108, 135, 172]],
  inferno:   [[205, 98,  52],  [225, 118,  62], [182,  78,  42], [215, 108,  58]],
  chromatic: [[168, 118, 208], [118, 208, 168], [208, 168, 118], [168, 208, 118]],
};

/** Generate a procedural ring canvas texture with radial bands and Cassini-style gaps */
function makeRingCanvasTexture(
  seed: number,
  innerFrac: number,
  gasType: GasGiantType,
): THREE.CanvasTexture {
  const SIZE = 512;
  const rng = new PRNG(seed ^ 0xAB3D7F);
  const palette = RING_PALETTES[gasType];

  // Build 1D band profile (opacity + color) over BANDS samples
  const BANDS = 256;
  const opacities = new Float32Array(BANDS);
  const colors: RGB[] = [];

  // Variable-width bands with randomized opacity
  let pos = 0;
  let bandWidth = rng.int(6, 22);
  let bandOpacity = rng.float(0.35, 0.92);
  let colorIdx = Math.floor(rng.next() * palette.length);
  for (let i = 0; i < BANDS; i++) {
    if (pos >= bandWidth) {
      pos = 0;
      bandWidth = rng.int(6, 22);
      bandOpacity = rng.float(0.25, 0.92);
      colorIdx = (colorIdx + rng.int(0, palette.length - 1)) % palette.length;
    }
    opacities[i] = bandOpacity;
    colors.push(palette[colorIdx]);
    pos++;
  }

  // Cassini-style sharp gaps
  const numGaps = rng.int(1, 4);
  for (let g = 0; g < numGaps; g++) {
    const gapCenter = rng.float(0.08, 0.92);
    const gapHalf = rng.float(0.018, 0.07);
    for (let i = 0; i < BANDS; i++) {
      const dist = Math.abs(i / BANDS - gapCenter);
      if (dist < gapHalf) {
        opacities[i] *= dist / gapHalf;
      }
    }
  }

  // Fade at both edges so the ring has soft boundaries
  for (let i = 0; i < BANDS; i++) {
    const t = i / (BANDS - 1);
    const fade = Math.min(t * 6, 1) * Math.min((1 - t) * 6, 1);
    opacities[i] *= fade;
  }

  // Paint canvas — UVs are a flat projection: center (0.5,0.5) = planet center,
  // UV dist 0.5 = outerR.  So uvDist = sqrt(dx²+dy²) where dx = (px/SIZE - 0.5)*2.
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(SIZE, SIZE);
  const data = imgData.data;

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const dx = (px / SIZE - 0.5) * 2;   // -1 … +1  (1 = outerR in UV)
      const dy = (py / SIZE - 0.5) * 2;
      const uvDist = Math.sqrt(dx * dx + dy * dy);
      const t = (uvDist - innerFrac) / (1.0 - innerFrac);
      if (t < 0 || t > 1) continue;

      const bi = Math.min(BANDS - 1, Math.floor(t * BANDS));
      const alpha = Math.max(0, opacities[bi]);
      const col = colors[bi];
      const idx = (py * SIZE + px) * 4;
      data[idx]     = col[0];
      data[idx + 1] = col[1];
      data[idx + 2] = col[2];
      data[idx + 3] = Math.round(alpha * 220);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** Ring band definitions [innerMul, outerMul] for each ring count variant */
const RING_BAND_CONFIGS: Record<number, [number, number][]> = {
  1: [[1.40, 2.20]],
  2: [[1.40, 1.85], [2.00, 2.60]],
  3: [[1.40, 1.70], [1.90, 2.22], [2.42, 2.80]],
};

/**
 * Build a ring system group: 1–3 rings with procedural band textures and a
 * random inclination baked into the group's rotation.
 */
export function makeRingSystem(
  radius: number,
  ringCount: number,
  ringInclination: number,
  seed: number,
  gasType: GasGiantType,
): THREE.Group {
  const group = new THREE.Group();
  const rng = new PRNG(seed ^ 0x4E2B9C);
  const configs = RING_BAND_CONFIGS[Math.max(1, Math.min(3, ringCount))] ?? RING_BAND_CONFIGS[1];

  for (const [innerMul, outerMul] of configs) {
    const innerR = radius * innerMul;
    const outerR = radius * outerMul;
    const innerFrac = innerMul / outerMul;
    const ringSeed = Math.floor(rng.next() * 0xFFFFFF);

    const tex = makeRingCanvasTexture(ringSeed, innerFrac, gasType);
    const geo = new THREE.RingGeometry(innerR, outerR, 128);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      alphaMap: tex,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(geo, mat));
  }

  // Flat orbital plane + inclination tilt
  group.rotation.x = Math.PI / 2;
  group.rotation.z = ringInclination;
  return group;
}

/** City lights on the dark side of a planet (skip clearly uninhabited worlds) */
export function addCityLights(
  group: THREE.Group, radius: number, seed: number,
  surfaceType: SurfaceType = 'continental',
): void {
  // Atmospherically hostile or obviously barren worlds should stay dark.
  if (surfaceType === 'venus' || surfaceType === 'barren' || surfaceType === 'ice' || surfaceType === 'volcanic') return;

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
        } else if (surfType == 5) {
          // Desert — sparser buildable pockets
          landMask = smoothstep(-0.05, 0.2, n) * 0.45;
        } else if (surfType == 8) {
          // Forest moon — sparse settlements beneath dense canopy
          landMask = smoothstep(-0.1, 0.12, n) * 0.35;
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

/**
 * Rare lightning flashes on the dark side of planets and gas giants.
 * Returns the ShaderMaterial so the caller can update uTime each frame.
 */
export function addLightning(
  group: THREE.Group, radius: number, seed: number,
): THREE.ShaderMaterial {
  const geo = new THREE.SphereGeometry(radius * 1.002, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0.0 },
      seed:  { value: seed },
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
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalPos;
      uniform float uTime;
      uniform float seed;

      float hashv(vec2 p, float s) {
        return fract(sin(dot(p, vec2(127.1, 311.7)) + s) * 43758.5453);
      }

      float distToSeg(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a, ap = p - a;
        float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
        return length(p - (a + ab * t));
      }

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);
        // Only on dark side; fade out near the terminator
        float darkMask = smoothstep(0.05, -0.2, sunDot);
        if (darkMask <= 0.001) discard;

        // Spherical UV for cell grid
        vec3 n = normalize(vLocalPos);
        float theta = atan(n.z, n.x) / 3.14159265;  // -1..1
        float phi   = acos(clamp(n.y, -1.0, 1.0)) / 3.14159265; // 0..1

        float gridScale = 9.0;
        vec2 uvGrid    = vec2(theta * gridScale, phi * gridScale * 0.55);
        vec2 cellCoord = floor(uvGrid);
        vec2 local     = fract(uvGrid) - 0.5; // -0.5..0.5

        // ~20% of cells can produce storms
        float cHash = hashv(cellCoord, seed);
        if (cHash < 0.80) discard;

        // Flash timing: 0.3-0.8 Hz, visible for ~12% of period
        // Avoid reversed smoothstep args (undefined GLSL behaviour)
        float flashRate = 0.3 + cHash * 0.5;
        float phase = fract(uTime * flashRate + cHash * 17.3);
        float flash = smoothstep(0.0, 0.02, phase)
                    * (1.0 - smoothstep(0.10, 0.14, phase));
        if (flash <= 0.001) discard;

        // Jagged bolt: 3 connected segments
        float h1 = hashv(cellCoord, seed + 1.0);
        float h2 = hashv(cellCoord, seed + 2.0);
        float h3 = hashv(cellCoord, seed + 3.0);
        float h4 = hashv(cellCoord, seed + 4.0);
        float h5 = hashv(cellCoord, seed + 5.0);

        vec2 p0 = vec2((h1 - 0.5) * 0.22, -0.43);
        vec2 p1 = vec2((h2 - 0.5) * 0.38, -0.12 + (h3 - 0.5) * 0.08);
        vec2 p2 = vec2((h4 - 0.5) * 0.3,   0.12);
        vec2 p3 = vec2((h5 - 0.5) * 0.22,  0.43);

        float w = 0.022;
        float d = min(distToSeg(local, p0, p1),
                  min(distToSeg(local, p1, p2),
                      distToSeg(local, p2, p3)));
        float bolt = smoothstep(w, w * 0.1, d);

        // One sub-branch off the mid-segment
        float h6 = hashv(cellCoord, seed + 6.0);
        float h7 = hashv(cellCoord, seed + 7.0);
        vec2 bStart = mix(p1, p2, 0.45);
        vec2 bEnd   = bStart + vec2((h6 - 0.5) * 0.17, h7 * 0.12 + 0.08);
        float branch = smoothstep(w * 0.75, w * 0.1,
                         distToSeg(local, bStart, bEnd)) * 0.65;

        // Soft glow halo around the bolt
        float glow = smoothstep(w * 6.0, 0.0, d) * 0.4;

        float total = max(bolt, branch) + glow;
        float alpha = total * flash * darkMask;
        if (alpha <= 0.001) discard;

        vec3 color = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 1.0, 1.0), bolt);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
  return mat;
}

/** Planetary ring (plain fallback — prefer makeRingSystem) */
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
