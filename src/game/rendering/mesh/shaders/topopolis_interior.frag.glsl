#include includes/noise.glsl
#include includes/hash.glsl
#include includes/planet_varyings.glsl
#include includes/gate_discard.glsl
#include includes/topopolis_biomes.glsl

uniform float seed;
uniform vec3 baseColor;
uniform float uLightPhase;
uniform vec3 uLightPos;
uniform float biomeSeed;
uniform sampler2D interactionFieldTex;
uniform float interactionFieldBlend;
uniform float uAspect;
uniform float uNoiseScale;

void main() {
  applyGateDiscard();

  vec2 uv = vUv;

  vec3 biomeP, tint;
  blendBiomes(biomeP, tint);

  // Interaction field is the macro terrain source; fallback noise fills in if absent.
  float field = texture2D(interactionFieldTex, uv).r * 2.0 - 1.0;

  // Sample 3D noise on the tube geometry surface — isotropic and seamless across wraps.
  vec3 noisePos = vLocalPos * uNoiseScale + vec3(seed * 13.37, biomeSeed * 7.13, seed * 3.71);
  float fallbackMacro = fbm(noisePos);

  float macro = mix(fallbackMacro, field, interactionFieldBlend);

  vec3 detailPos = vLocalPos * uNoiseScale * 3.0 + vec3(biomeSeed * 0.9, seed * 0.7, seed * 3.1);
  float detail = snoise(detailPos) * 0.55 + snoise(detailPos * 2.0 + 17.0) * 0.30;

  float seaShift = biomeP.x * 0.25;
  float landMetric = macro + detail * 0.14 - seaShift;
  float landMask = smoothstep(-0.06, 0.09, landMetric);
  float elevation = smoothstep(0.02, 0.70, macro + detail * 0.12);

  float dryness = biomeP.y;
  float coldness = biomeP.z;

  // Water palette
  vec3 deepWater = vec3(0.02, 0.06, 0.18);
  vec3 shallowWater = vec3(0.08, 0.22, 0.38);
  vec3 reefWater = vec3(0.10, 0.30, 0.28);
  float shore = smoothstep(-0.15, 0.02, landMetric);
  vec3 water = mix(deepWater, shallowWater, shore);
  water = mix(water, reefWater, (1.0 - dryness) * shore * 0.45);

  // Land palette
  vec3 lowland = mix(vec3(0.16, 0.34, 0.13), baseColor * 0.55, 0.35);
  vec3 highland = mix(vec3(0.44, 0.34, 0.21), baseColor * 0.75, 0.30);
  vec3 desert = vec3(0.84, 0.71, 0.44);
  vec3 rock = vec3(0.48, 0.36, 0.26);
  vec3 tundra = vec3(0.74, 0.78, 0.84);

  vec3 land = mix(lowland, highland, elevation);
  land = mix(land, desert, dryness * 0.55);
  land = mix(land, rock, smoothstep(0.55, 0.92, elevation) * 0.55);
  land = mix(land, tundra, coldness * smoothstep(0.20, 0.80, elevation));
  land = mix(land, tint, 0.24);

  vec3 biomeColor = mix(water, land, landMask);

  // Lighting from star.
  vec3 toStar = normalize(uLightPos - vWorldPosition);
  float sunDot = dot(vWorldNormal, toStar);
  float light = smoothstep(-0.4, 0.7, sunDot) * 0.65 + 0.35;

  // Cosmetic windows
  if (windowBlend > 0.0) {
    vec3 glassTint = vec3(0.35, 0.55, 0.7);
    biomeColor = mix(biomeColor, glassTint, windowBlend * 0.35);
  }

  // Dock zones — orbital-scale ecumenopolis via domain-warped voronoi
  if (dockZoneBlend > 0.0) {
    vec3 urbanPos = vLocalPos * uNoiseScale + vec3(seed * 7.91, biomeSeed * 11.03, seed * 5.29);

    // Domain warp: offset voronoi input with snoise so cells flow organically
    vec3 warp = vec3(
      snoise(urbanPos * 0.7 + 10.0),
      snoise(urbanPos * 0.7 + 50.0),
      snoise(urbanPos * 0.7 + 90.0)
    ) * 0.45;
    vec3 warpedPos = urbanPos + warp;

    // District scale — large zones with per-district tone variation
    vec2 districts = voronoi3(warpedPos);
    float districtEdge = districts.x;
    float districtId = districts.y;

    vec3 builtDark  = vec3(0.20, 0.19, 0.18);
    vec3 builtLight = vec3(0.38, 0.36, 0.34);
    vec3 builtColor = mix(builtDark, builtLight, smoothstep(0.2, 0.8, districtId));
    float warmCool = fract(districtId * 7.13) - 0.5;
    builtColor *= mix(vec3(0.97, 0.96, 1.04), vec3(1.04, 1.0, 0.96), step(0.0, warmCool));

    // Corridor scale — luminous transport arteries at cell edges
    vec2 corridors = voronoi3(warpedPos * 3.5);
    float corridorLine = smoothstep(0.06, 0.01, corridors.x);
    float majorArtery = smoothstep(0.10, 0.02, districtEdge);
    builtColor = mix(builtColor, vec3(0.55, 0.50, 0.40), corridorLine * 0.6);
    builtColor = mix(builtColor, vec3(0.65, 0.55, 0.35), majorArtery * 0.7);

    // Fine texture — high-frequency noise for built-surface granularity
    float fineGrain = snoise(urbanPos * 18.0 + 137.0) * 0.5
                    + snoise(urbanPos * 35.0 + 251.0) * 0.25;
    builtColor += builtColor * fineGrain * 0.12;

    // Urban coverage — near-total in the core, with organic fringes at the bleed edge
    float urbanNoise = fbm(urbanPos) + snoise(urbanPos * 2.5 + 31.0) * 0.12;
    float urbanMask = smoothstep(-0.5, 0.1, urbanNoise + dockZoneBlend * 1.5 - 0.5);

    // Interstitial gaps — thin dark crevices within the urban mass
    float gap = smoothstep(0.15, 0.0, urbanNoise + dockZoneBlend * 0.8);
    builtColor = mix(builtColor, vec3(0.10, 0.10, 0.12), gap * 0.5);

    // Blend: dockZoneBlend drives the overall transition, urbanMask adds fringe detail
    biomeColor = mix(biomeColor, builtColor, urbanMask * dockZoneBlend);
  }

  gl_FragColor = vec4(biomeColor * light, 1.0);
}
