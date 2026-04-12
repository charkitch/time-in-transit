#include includes/noise.glsl
#include includes/hash.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform int surfType;
uniform float polarCapSize;

void main() {
  #include includes/sun_lighting.glsl

  // Only visible on dark side
  float darkMask = smoothstep(0.0, -0.2, sunDot);

  // Same continent noise as the planet surface — cities only on land
  float n = fbm(noisePos);

  // Land mask matches planet surface type thresholds
  float landMask;
  if (surfType == SURF_TYPE_OCEAN) {
    // Ocean world — only tiny islands
    landMask = smoothstep(0.25, 0.4, n);
  } else if (surfType == SURF_TYPE_MARSH) {
    // Marsh — most land is soggy but buildable
    landMask = smoothstep(-0.15, 0.1, n);
  } else if (surfType == SURF_TYPE_DESERT) {
    // Desert — sparser buildable pockets
    landMask = smoothstep(-0.05, 0.2, n) * 0.45;
  } else if (surfType == SURF_TYPE_FOREST_MOON) {
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

  float h = hash(cell, seed);
  float city = 0.0;

  // Tight cluster of 3-5 dots per populated cell
  if (h > 0.4) {
    // Core city
    vec2 o1 = vec2(hash(cell + 1.0, seed) - 0.5, hash(cell + 2.0, seed) - 0.5) * 0.25;
    city += smoothstep(0.10, 0.01, length(local - o1));

    // Inner sprawl — always present in populated cells
    vec2 o2 = o1 + vec2(hash(cell + 3.0, seed) - 0.5, hash(cell + 4.0, seed) - 0.5) * 0.15;
    city += smoothstep(0.07, 0.005, length(local - o2)) * 0.8;

    vec2 o3 = o1 + vec2(hash(cell + 5.0, seed) - 0.5, hash(cell + 6.0, seed) - 0.5) * 0.18;
    city += smoothstep(0.06, 0.005, length(local - o3)) * 0.6;

    if (h > 0.55) {
      // Outer suburbs
      vec2 o4 = o1 + vec2(hash(cell + 7.0, seed) - 0.5, hash(cell + 8.0, seed) - 0.5) * 0.2;
      city += smoothstep(0.05, 0.005, length(local - o4)) * 0.5;

      vec2 o5 = o1 + vec2(hash(cell + 9.0, seed) - 0.5, hash(cell + 10.0, seed) - 0.5) * 0.22;
      city += smoothstep(0.04, 0.005, length(local - o5)) * 0.4;
    }
  }

  city = min(city, 1.0);

  // Polar regions are rural/uninhabited — fade cities near caps
  float polarFade = 1.0;
  if (polarCapSize > 0.0) {
    float lat = abs(norm.y);
    float capStart = 1.0 - polarCapSize * 0.7;
    // Cities thin out well before the cap edge, gone by the cap itself
    polarFade = 1.0 - smoothstep(capStart - 0.15, capStart + 0.02, lat);
  }

  float alpha = darkMask * landMask * city * polarFade * 0.9;
  vec3 color = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.95, 0.7), h);

  gl_FragColor = vec4(color, alpha);
}
