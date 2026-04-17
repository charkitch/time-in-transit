#include includes/noise.glsl
#include includes/hash.glsl
#include includes/planet_varyings.glsl
#include includes/gate_discard.glsl
#include includes/topopolis_biomes.glsl

uniform float seed;
uniform float uLightPhase;
uniform vec3 uLightPos;
uniform float uAspect;
uniform float uNoiseScale;
uniform float biomeSeed;
uniform sampler2D interactionFieldTex;
uniform float interactionFieldBlend;
void main() {
  applyGateDiscard();
  // Inside a topopolis, the entire interior is inhabited — no dark side.
  // Dim slightly on the sunlit side so lights pop more on the far side.
  vec3 toLight = normalize(uLightPos - vWorldPosition);
  float lightDot = dot(vWorldNormal, toLight);
  float brightness = mix(1.0, 0.35, smoothstep(-0.3, 0.5, lightDot));

  // Use UV coordinates for grid — u along tube, v around circumference.
  // Scale u by aspect ratio so grid cells are square in world space.
  float density = 12.0;
  vec2 gridUv = vec2(vUv.x * density * uAspect, vUv.y * density);
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv) - 0.5;

  vec3 biomeP, biomeTintUnused;
  blendBiomes(biomeP, biomeTintUnused);

  float fieldMacro = texture2D(interactionFieldTex, vUv).r * 2.0 - 1.0;
  vec3 macroPos = vLocalPos * uNoiseScale + vec3(seed * 13.37, biomeSeed * 7.13, seed * 3.71);
  float fallbackMacro = fbm(macroPos);
  float macro = mix(fallbackMacro, fieldMacro, interactionFieldBlend);
  float seaShift = biomeP.x * 0.25;
  float landMask = smoothstep(-0.06, 0.09, macro - seaShift);

  float h = hash(cell, seed);
  float city = 0.0;

  // Cities at populated cells — higher density than planets
  if (h > 0.45) {
    vec2 o1 = vec2(hash(cell + 1.0, seed) - 0.5, hash(cell + 2.0, seed) - 0.5) * 0.25;
    city += smoothstep(0.12, 0.01, length(local - o1));

    vec2 o2 = o1 + vec2(hash(cell + 3.0, seed) - 0.5, hash(cell + 4.0, seed) - 0.5) * 0.15;
    city += smoothstep(0.08, 0.005, length(local - o2)) * 0.8;

    vec2 o3 = o1 + vec2(hash(cell + 5.0, seed) - 0.5, hash(cell + 6.0, seed) - 0.5) * 0.18;
    city += smoothstep(0.06, 0.005, length(local - o3)) * 0.6;

    if (h > 0.65) {
      vec2 o4 = o1 + vec2(hash(cell + 7.0, seed) - 0.5, hash(cell + 8.0, seed) - 0.5) * 0.2;
      city += smoothstep(0.05, 0.005, length(local - o4)) * 0.5;
    }
  }

  city = min(city, 1.0);
  // Dock zones are all infrastructure — full land coverage, brighter lights
  landMask = mix(landMask, 1.0, dockZoneBlend);
  brightness = mix(brightness, 1.0, dockZoneBlend * 0.5);
  float alpha = brightness * city * landMask * 0.95 * (1.0 - windowBlend);
  vec3 color = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.95, 0.7), h);

  gl_FragColor = vec4(color, alpha);
}
