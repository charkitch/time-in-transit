#include includes/noise.glsl
#include includes/hash.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform float uLightPhase;
uniform vec3 uLightPos;

void main() {
  // Dark side relative to the mini-star light source
  vec3 toLight = normalize(uLightPos - vWorldPosition);
  float lightDot = dot(vWorldNormal, toLight);
  float darkMask = smoothstep(0.0, -0.3, lightDot);

  // Reuse the same continent noise as the shell surface so cities sit on land
  vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
  float n = fbm(noisePos);
  float landMask = smoothstep(-0.05, 0.15, n);

  // Sparse grid — small number of cities across the shell segment
  vec3 norm = normalize(vLocalPos);
  float theta = atan(norm.z, norm.x);
  float phi = acos(clamp(norm.y, -1.0, 1.0));
  vec2 gridUv = vec2(theta * 12.0, phi * 7.0);
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv) - 0.5;

  float h = hash(cell, seed);
  float city = 0.0;

  // High threshold keeps only a handful of populated cells
  if (h > 0.72) {
    vec2 o1 = vec2(hash(cell + 1.0, seed) - 0.5, hash(cell + 2.0, seed) - 0.5) * 0.25;
    city += smoothstep(0.10, 0.01, length(local - o1));

    vec2 o2 = o1 + vec2(hash(cell + 3.0, seed) - 0.5, hash(cell + 4.0, seed) - 0.5) * 0.15;
    city += smoothstep(0.07, 0.005, length(local - o2)) * 0.8;

    vec2 o3 = o1 + vec2(hash(cell + 5.0, seed) - 0.5, hash(cell + 6.0, seed) - 0.5) * 0.18;
    city += smoothstep(0.06, 0.005, length(local - o3)) * 0.6;

    if (h > 0.86) {
      vec2 o4 = o1 + vec2(hash(cell + 7.0, seed) - 0.5, hash(cell + 8.0, seed) - 0.5) * 0.2;
      city += smoothstep(0.05, 0.005, length(local - o4)) * 0.5;
    }
  }

  city = min(city, 1.0);
  float alpha = darkMask * landMask * city * 0.9;
  vec3 color = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.95, 0.7), h);

  gl_FragColor = vec4(color, alpha);
}
