#include includes/noise.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform vec3 baseColor;
uniform float uLightPhase;
uniform vec3 uLightPos;
uniform int biomeProfile;
uniform float biomeSeed;
uniform sampler2D interactionFieldTex;
uniform float interactionFieldBlend;

// ─── Biome color functions ───────────────────────────────────────────────────

vec3 continentalBiome(vec3 noisePos, float n) {
  float landMask = smoothstep(-0.05, 0.1, n);
  vec3 ocean = vec3(0.05, 0.12, 0.25);
  vec3 shallow = vec3(0.08, 0.2, 0.35);
  vec3 lowland = mix(vec3(0.15, 0.35, 0.12), baseColor * 0.5, 0.3);
  vec3 highland = mix(vec3(0.45, 0.35, 0.2), baseColor * 0.7, 0.3);
  float h = smoothstep(0.1, 0.5, n);
  vec3 land = mix(lowland, highland, h);
  float depth = smoothstep(-0.4, -0.05, n);
  vec3 oceanC = mix(ocean, shallow, depth);
  return mix(oceanC, land, landMask);
}

vec3 desertBiome(vec3 noisePos, float n) {
  float dune = sin(normalize(vLocalPos).x * 18.0 + n * 4.0 + biomeSeed) * 0.5 + 0.5;
  float highland = smoothstep(0.12, 0.55, n);
  vec3 sand = vec3(0.78, 0.66, 0.38);
  vec3 duneGold = vec3(0.88, 0.75, 0.46);
  vec3 rock = vec3(0.50, 0.34, 0.20);
  vec3 c = mix(sand, duneGold, dune * 0.35);
  return mix(c, rock, highland * 0.55);
}

vec3 mountainBiome(vec3 noisePos, float n) {
  // Ridged multifractal: sharp peaks
  float ridge = 1.0 - abs(snoise(noisePos * 2.2));
  ridge = pow(ridge, 2.5);
  float elevation = smoothstep(0.0, 1.0, n * 0.5 + ridge * 0.5);
  vec3 valley = vec3(0.15, 0.28, 0.10);
  vec3 rock = vec3(0.42, 0.38, 0.32);
  vec3 snow = vec3(0.92, 0.95, 1.0);
  vec3 c = mix(valley, rock, smoothstep(0.2, 0.55, elevation));
  c = mix(c, snow, smoothstep(0.6, 0.82, elevation));
  // Fake ridge shadow: darken steep slope sides
  float shadow = 1.0 - ridge * 0.35;
  return c * shadow;
}

vec3 iceBiome(vec3 noisePos, float n) {
  float crack = smoothstep(0.15, 0.6, abs(snoise(noisePos * 2.4)));
  float ridge = smoothstep(-0.05, 0.45, n);
  vec3 deepIce = vec3(0.52, 0.68, 0.82);
  vec3 paleIce = vec3(0.82, 0.90, 0.97);
  vec3 snow = vec3(0.96, 0.98, 1.0);
  vec3 c = mix(deepIce, paleIce, ridge);
  c = mix(c, snow, smoothstep(0.25, 0.65, n));
  c = mix(c, deepIce * 0.75, crack * 0.25);
  return c;
}

void main() {
  vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
  vec3 toLight = normalize(uLightPos - vWorldPosition);
  float lightDot = dot(vWorldNormal, toLight);
  float n = fbm(noisePos);

  vec3 surfaceColor;

  // All profiles use a large-scale biome selector so every shell has spatial variety.
  // The profile controls which biomes dominate by biasing the selector thresholds.
  vec3 biomeNoisePos = normalize(vLocalPos) * 0.8 + vec3(biomeSeed * 3.71, biomeSeed * 1.37, biomeSeed * 5.13);
  float bsNoise = fbm(biomeNoisePos); // roughly in [-1, 1]
  float bsField = texture2D(interactionFieldTex, vUv).r * 2.0 - 1.0;
  float bs = mix(bsNoise, bsField, interactionFieldBlend);

  vec3 cont  = continentalBiome(noisePos, n);
  vec3 des   = desertBiome(noisePos, n);
  vec3 mount = mountainBiome(noisePos, n);
  vec3 ice   = iceBiome(noisePos, n);

  if (biomeProfile == 0) {
    // Continental — mostly green/ocean, desert and mountain appear toward the edges
    vec3 c = cont;
    c = mix(c, des,   smoothstep( 0.30,  0.55, bs));
    c = mix(c, mount, smoothstep( 0.55,  0.75, bs));
    c = mix(c, ice,   smoothstep( 0.75,  0.90, bs));
    surfaceColor = c;

  } else if (biomeProfile == 1) {
    // Mixed — four zones spread evenly across the selector range
    vec3 c = cont;
    c = mix(c, des,   smoothstep(-0.35, -0.10, bs));
    c = mix(c, mount, smoothstep( 0.05,  0.30, bs));
    c = mix(c, ice,   smoothstep( 0.45,  0.65, bs));
    surfaceColor = c;

  } else if (biomeProfile == 2) {
    // Desert — sand dominates the mid-range; continental edges, mountain highlands
    vec3 c = cont;
    c = mix(c, des,   smoothstep(-0.55, -0.20, bs));
    c = mix(c, mount, smoothstep( 0.40,  0.65, bs));
    c = mix(c, ice,   smoothstep( 0.75,  0.90, bs));
    surfaceColor = c;

  } else {
    // Arctic (biomeProfile == 3) — ice dominates; mountain exposed zones, continental fringe
    vec3 c = cont;
    c = mix(c, mount, smoothstep(-0.30, -0.05, bs));
    c = mix(c, ice,   smoothstep( 0.10,  0.35, bs));
    surfaceColor = c;
  }

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
