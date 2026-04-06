#include includes/noise.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform vec3 baseColor;
uniform int gasType;
uniform int uGreatSpot;
uniform float uSpotLat;
uniform float uSpotSize;
uniform sampler2D interactionFieldTex;
uniform float interactionFieldBlend;

void main() {
  vec3 toStar = normalize(-vWorldPosition);
  float sunDot = dot(vWorldNormal, toStar);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);

  vec3 norm = normalize(vLocalPos);
  // Latitude — drives horizontal banding
  float lat = norm.y;
  float u = atan(norm.z, norm.x) / 6.28318530718 + 0.5;
  float v = asin(clamp(norm.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
  float interaction = (texture2D(interactionFieldTex, vec2(u, v)).r * 2.0 - 1.0) * interactionFieldBlend;

  // Noise inputs
  vec3 np = norm * 3.0 + vec3(seed * 7.7, seed * 3.1, seed * 11.3);
  float n1 = snoise(np);
  float n2 = snoise(np * 2.5 + vec3(50.0));
  float n3 = fbm(np * 1.5);

  vec3 surfaceColor;

  if (gasType == 0) {
    // -- Jovian: bold warm bands, Great Red Spot style storms --
    float band = sin(lat * 18.0 + n1 * 1.5 + interaction * 2.2) * 0.5 + 0.5;
    float fineBand = sin(lat * 45.0 + n2 * 0.8 + interaction * 3.1) * 0.5 + 0.5;
    vec3 bright = vec3(0.9, 0.75, 0.5);
    vec3 dark = vec3(0.6, 0.35, 0.15);
    vec3 belt = vec3(0.75, 0.55, 0.3);
    surfaceColor = mix(dark, bright, band);
    surfaceColor = mix(surfaceColor, belt, fineBand * 0.3);
    // Storm spots
    float storm = smoothstep(0.55, 0.7, n3 + interaction * 0.35) * smoothstep(0.2, 0.0, abs(lat - 0.3 - seed * 0.1));
    vec3 stormColor = vec3(0.85, 0.3, 0.15);
    surfaceColor = mix(surfaceColor, stormColor, storm * 0.8);

  } else if (gasType == 1) {
    // -- Saturnian: pale gold/cream with subtle delicate bands --
    float band = sin(lat * 25.0 + n1 * 0.6 + interaction * 1.8) * 0.5 + 0.5;
    float whisper = sin(lat * 60.0 + n2 * 0.4 + interaction * 2.7) * 0.5 + 0.5;
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
    // -- Neptunian: deep blue-cyan with bright white cloud streaks --
    float band = sin(lat * 14.0 + n1 * 2.0 + interaction * 1.6) * 0.5 + 0.5;
    vec3 deep = vec3(0.05, 0.1, 0.4);
    vec3 mid = vec3(0.1, 0.25, 0.6);
    vec3 bright = vec3(0.2, 0.45, 0.8);
    surfaceColor = mix(deep, mid, band);
    surfaceColor = mix(surfaceColor, bright, band * band * 0.5);
    // Bright white cloud wisps — elongated along latitude
    float wisp = smoothstep(0.5, 0.8, snoise(vec3(norm.x * 8.0 + seed, lat * 3.0, norm.z * 8.0)) + interaction * 0.25);
    surfaceColor = mix(surfaceColor, vec3(0.8, 0.9, 1.0), wisp * 0.6);
    // Dark spot
    float spot = smoothstep(0.6, 0.75, n3 + interaction * 0.30) * smoothstep(0.25, 0.0, abs(lat + 0.2));
    surfaceColor = mix(surfaceColor, vec3(0.02, 0.04, 0.2), spot * 0.7);

  } else if (gasType == 3) {
    // -- Inferno: hot Jupiter, close-orbit scorched giant --
    float band = sin(lat * 12.0 + n1 * 2.5 + interaction * 2.8) * 0.5 + 0.5;
    vec3 molten = vec3(0.95, 0.3, 0.05);
    vec3 dark = vec3(0.3, 0.05, 0.02);
    vec3 bright = vec3(1.0, 0.7, 0.2);
    surfaceColor = mix(dark, molten, band);
    // Roiling convection cells
    float cells = abs(n3 + interaction * 0.4);
    surfaceColor = mix(surfaceColor, bright, cells * 0.4);
    // Incandescent glow on star-facing side
    float scorchMask = smoothstep(-0.2, 0.6, sunDot);
    surfaceColor = mix(surfaceColor, vec3(1.0, 0.85, 0.4), scorchMask * 0.25);
    // Dark terminator storms
    float terminator = smoothstep(0.1, 0.0, abs(sunDot)) * smoothstep(0.3, 0.6, n3 + interaction * 0.2);
    surfaceColor = mix(surfaceColor, vec3(0.15, 0.02, 0.0), terminator * 0.5);

  } else if (gasType == 4) {
    // -- Chromatic: alien, iridescent, shifting prismatic bands --
    float band = sin(lat * 20.0 + n1 * 1.8 + interaction * 2.1) * 0.5 + 0.5;
    float shift = sin(lat * 35.0 + n2 * 1.2 + seed * 5.0 + interaction * 2.9) * 0.5 + 0.5;
    // Rainbow cycle driven by latitude + noise
    float hue = fract(lat * 0.8 + n1 * 0.3 + seed * 0.1 + interaction * 0.15);
    // HSV to RGB approximation
    vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    rainbow = pow(rainbow, vec3(0.8)); // desaturate slightly
    vec3 dark = rainbow * 0.3;
    surfaceColor = mix(dark, rainbow, band);
    // Metallic sheen bands
    float sheen = pow(shift, 3.0);
    surfaceColor = mix(surfaceColor, vec3(0.95, 0.95, 1.0), sheen * 0.2);
    // Deep vortex swirls
    float vortex = smoothstep(0.45, 0.7, abs(snoise(np * 3.0)) + interaction * 0.25);
    surfaceColor = mix(surfaceColor, surfaceColor * 0.4, vortex * 0.3);

  } else {
    // -- Helium: near-featureless silver-white, faint ghost bands --
    // Stripped atmosphere — almost no colour, just subtle structure
    vec3 pale  = vec3(0.88, 0.90, 0.94); // cold white with a blue cast
    vec3 frost = vec3(0.72, 0.76, 0.82); // slightly darker grey-blue
    float band = sin(lat * 22.0 + n1 * 0.5 + interaction * 1.2) * 0.5 + 0.5;
    surfaceColor = mix(frost, pale, band * 0.35 + 0.65);
    // Very faint wisps — barely visible texture
    float wisp = smoothstep(0.55, 0.75, snoise(np * 5.0 + vec3(seed)) + interaction * 0.2);
    surfaceColor = mix(surfaceColor, vec3(0.60, 0.65, 0.72), wisp * 0.12);
    // Limb darkening — edges go slightly cooler
    float limb = 1.0 - pow(max(0.0, dot(vWorldNormal, viewDir)), 0.6);
    surfaceColor = mix(surfaceColor, vec3(0.45, 0.50, 0.60), limb * 0.18);
  }

  // -- Great Spot --
  if (uGreatSpot == 1) {
    // Elliptical spot: tighter in latitude, wider in longitude
    float spotLatDist = abs(lat - uSpotLat);
    float lonAngle = atan(norm.z, norm.x);
    // Anchor longitude based on seed for determinism
    float spotLon = seed * 2.71828;
    float spotLonDist = abs(sin((lonAngle - spotLon) * 0.5));
    float spotRadius = 0.08 + uSpotSize * 0.12;
    float spotMask = smoothstep(spotRadius * 1.3, spotRadius * 0.3,
      sqrt(spotLatDist * spotLatDist + spotLonDist * spotLonDist * 0.6));
    // Add swirl distortion
    float swirl = snoise(norm * 8.0 + vec3(seed * 3.0)) * 0.3;
    spotMask *= (1.0 + swirl * 0.5);
    spotMask = clamp(spotMask, 0.0, 1.0);

    vec3 spotColor;
    if (gasType == 0) {
      // Jovian: warm red/orange oval
      spotColor = mix(vec3(0.7, 0.25, 0.1), vec3(0.9, 0.4, 0.15), swirl + 0.5);
    } else if (gasType == 1) {
      // Saturnian: pale golden swirl
      spotColor = mix(vec3(0.75, 0.68, 0.4), vec3(0.85, 0.78, 0.5), swirl + 0.5);
    } else if (gasType == 2) {
      // Neptunian: dark blue-black oval
      spotColor = mix(vec3(0.02, 0.03, 0.15), vec3(0.05, 0.08, 0.25), swirl + 0.5);
    } else if (gasType == 3) {
      // Inferno: intensely bright convection mega-cell
      spotColor = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.9, 0.3), swirl + 0.5);
    } else if (gasType == 4) {
      // Chromatic: iridescent vortex eye with contrasting hue
      float spotHue = fract(uSpotLat * 0.5 + 0.5);
      spotColor = 0.5 + 0.5 * cos(6.28318 * (spotHue + vec3(0.5, 0.83, 0.17)));
    } else {
      // Helium: faint dark-grey depression
      spotColor = mix(vec3(0.40, 0.44, 0.52), vec3(0.55, 0.58, 0.64), swirl + 0.5);
    }
    surfaceColor = mix(surfaceColor, spotColor, spotMask * 0.85);
  }

  // Lighting
  float lighting = smoothstep(-0.3, 0.8, sunDot) * 0.8 + 0.2;

  gl_FragColor = vec4(surfaceColor * lighting, 1.0);
}
