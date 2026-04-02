#include includes/noise.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform vec3 baseColor;
uniform int surfType;

void main() {
  vec3 toStar = normalize(-vWorldPosition);
  float sunDot = dot(vWorldNormal, toStar);

  vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
  float n = fbm(noisePos);

  vec3 surfaceColor;

  if (surfType == 0) {
    // -- Continental: balanced land/ocean --
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
    // -- Ocean world: mostly water, tiny island chains --
    float landMask = smoothstep(0.25, 0.35, n);
    vec3 deepOcean = vec3(0.02, 0.06, 0.2);
    vec3 midOcean = vec3(0.04, 0.14, 0.35);
    vec3 shallow = vec3(0.08, 0.25, 0.45);
    float depth = smoothstep(-0.5, 0.25, n);
    vec3 oceanC = mix(deepOcean, mix(midOcean, shallow, depth), depth);
    vec3 island = mix(vec3(0.6, 0.55, 0.35), vec3(0.2, 0.4, 0.15), smoothstep(0.35, 0.5, n));
    surfaceColor = mix(oceanC, island, landMask);

  } else if (surfType == 2) {
    // -- Marsh world: murky, swampy, green-brown --
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
    // -- Venus: thick atmosphere, no visible ocean, hazy yellow-orange --
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
    // -- Barren world: dusty, rocky, nearly airless --
    float ridge = smoothstep(-0.15, 0.45, n);
    vec3 dust = vec3(0.42, 0.36, 0.30);
    vec3 stone = vec3(0.56, 0.49, 0.40);
    vec3 pale = vec3(0.70, 0.65, 0.58);
    surfaceColor = mix(dust, stone, ridge);
    surfaceColor = mix(surfaceColor, pale, smoothstep(0.35, 0.7, n));

  } else if (surfType == 5) {
    // -- Desert world: sand seas with dark rock uplands --
    float dune = sin(normalize(vLocalPos).x * 18.0 + n * 4.0 + seed) * 0.5 + 0.5;
    float highland = smoothstep(0.12, 0.55, n);
    vec3 sand = vec3(0.78, 0.66, 0.38);
    vec3 duneGold = vec3(0.88, 0.75, 0.46);
    vec3 rock = vec3(0.50, 0.34, 0.20);
    surfaceColor = mix(sand, duneGold, dune * 0.35);
    surfaceColor = mix(surfaceColor, rock, highland * 0.55);

  } else if (surfType == 6) {
    // -- Ice world: frozen seas, blue shadows, bright caps --
    float crack = smoothstep(0.15, 0.6, abs(snoise(noisePos * 2.4)));
    float ridge = smoothstep(-0.05, 0.45, n);
    vec3 deepIce = vec3(0.52, 0.68, 0.82);
    vec3 paleIce = vec3(0.82, 0.90, 0.97);
    vec3 snow = vec3(0.96, 0.98, 1.0);
    surfaceColor = mix(deepIce, paleIce, ridge);
    surfaceColor = mix(surfaceColor, snow, smoothstep(0.25, 0.65, n));
    surfaceColor = mix(surfaceColor, deepIce * 0.75, crack * 0.25);

  } else if (surfType == 7) {
    // -- Volcanic world: basalt plains with hot fissures --
    float lava = smoothstep(0.35, 0.62, abs(snoise(noisePos * 3.2)));
    float ash = smoothstep(-0.25, 0.35, n);
    vec3 basalt = vec3(0.12, 0.11, 0.12);
    vec3 ashGray = vec3(0.28, 0.24, 0.22);
    vec3 lavaCore = vec3(1.0, 0.38, 0.06);
    vec3 lavaGlow = vec3(1.0, 0.72, 0.12);
    surfaceColor = mix(basalt, ashGray, ash);
    surfaceColor = mix(surfaceColor, lavaCore, lava);
    surfaceColor = mix(surfaceColor, lavaGlow, lava * smoothstep(0.0, 0.6, sunDot + 0.2) * 0.35);

  } else if (surfType == 8) {
    // -- Forest moon: dense green canopy, muted seas, Endor-like and rare --
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

  } else {
    // -- Mountain world (surfType == 9): ridged peaks, elevation-based coloring --
    float ridge = 1.0 - abs(snoise(noisePos * 2.2));
    ridge = pow(ridge, 2.5);
    float elevation = smoothstep(0.0, 1.0, n * 0.5 + ridge * 0.5);
    vec3 valley = vec3(0.15, 0.28, 0.10);
    vec3 rock = mix(vec3(0.42, 0.38, 0.32), baseColor * 0.6, 0.3);
    vec3 snow = vec3(0.92, 0.95, 1.0);
    surfaceColor = mix(valley, rock, smoothstep(0.2, 0.55, elevation));
    surfaceColor = mix(surfaceColor, snow, smoothstep(0.6, 0.82, elevation));
    // Fake self-shadowing from ridge gradients
    float shadow = 1.0 - ridge * 0.35;
    surfaceColor *= shadow;
  }

  // Lighting: sun side brighter, dark side very dim
  float lighting = smoothstep(-0.3, 0.8, sunDot) * 0.85 + 0.15;

  gl_FragColor = vec4(surfaceColor * lighting, 1.0);
}
