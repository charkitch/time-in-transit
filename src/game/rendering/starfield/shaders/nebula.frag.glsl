#include ../../mesh/shaders/includes/noise.glsl

#define MAX_PALETTES 8

uniform vec3 uPrimaryColors[MAX_PALETTES];
uniform vec3 uSecondaryColors[MAX_PALETTES];

varying vec2 vUv;
varying vec4 vShapeWeights;
varying float vPaletteIndex;
varying float vBrightness;
varying float vSeed;
varying float vElongation;

void main() {
  vec2 centered = vUv - 0.5;
  float d = length(centered) * 2.0;

  // Soft circular falloff
  float edgeMask = smoothstep(1.0, 0.6, d);
  if (edgeMask < 0.01) discard;

  // Per-nebula noise domain
  vec3 noiseCoord = vec3(centered * 4.0, vSeed);

  // --- Shape primitives ---
  // Radial: Gaussian core with domain-warped detail
  vec3 warp = vec3(snoise(noiseCoord + vec3(17.0)), snoise(noiseCoord + vec3(43.0)), 0.0) * 0.3;
  float detail = fbm(noiseCoord + warp) * 0.5 + 0.5;
  float radial = exp(-d * d * 3.0) * (0.4 + 0.6 * detail);

  // Shell: ring structure
  float shell = exp(-pow(d - 0.35, 2.0) * 25.0) * (snoise(noiseCoord * 3.0) * 0.3 + 0.7);

  // Filament: elongated wisps
  float filaments = fbm(noiseCoord * vec3(1.0, 3.0, 1.0)) * 0.5 + 0.5;
  filaments = smoothstep(0.3, 0.7, filaments) * (1.0 - smoothstep(0.3, 0.8, d));

  // Absorption: dark cloud shapes
  float absorption = smoothstep(0.35, 0.65, fbm(noiseCoord * 1.5) * 0.5 + 0.5);

  // Blend via shape weights
  float emission = vShapeWeights.x * radial
                 + vShapeWeights.y * shell
                 + vShapeWeights.z * filaments;
  emission *= edgeMask * vBrightness;

  float darkening = vShapeWeights.w * absorption * edgeMask;

  // Color from palette
  int idx = clamp(int(vPaletteIndex), 0, MAX_PALETTES - 1);
  vec3 primary = uPrimaryColors[idx];
  vec3 secondary = uSecondaryColors[idx];
  vec3 color = mix(primary, secondary, d) * emission;
  color *= 1.0 - darkening * 0.5;

  color *= 3.0;

  if (length(color) < 0.005) discard;

  gl_FragColor = vec4(color, 1.0);
}
