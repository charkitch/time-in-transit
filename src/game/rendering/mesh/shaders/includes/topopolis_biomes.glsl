// Shared biome parameters and blending for topopolis interior shaders.
uniform float biomeCount;
uniform float biomeIndices[10];

vec3 biomeParams(float idx) {
  // x: sea bias (-dry .. +wet), y: dryness, z: coldness
  if (idx < 0.5) return vec3(0.00, 0.30, 0.20); // continental
  if (idx < 1.5) return vec3(0.35, 0.10, 0.25); // ocean
  if (idx < 2.5) return vec3(-0.30, 0.95, 0.20); // desert
  if (idx < 3.5) return vec3(0.02, 0.20, 0.15); // alien
  if (idx < 4.5) return vec3(0.06, 0.20, 0.28); // forest
  return vec3(0.12, 0.18, 0.95); // ice
}

vec3 biomeTint(float idx) {
  if (idx < 0.5) return vec3(0.20, 0.30, 0.12);
  if (idx < 1.5) return vec3(0.14, 0.24, 0.28);
  if (idx < 2.5) return vec3(0.40, 0.28, 0.12);
  if (idx < 3.5) return vec3(0.14, 0.30, 0.32);
  if (idx < 4.5) return vec3(0.12, 0.34, 0.14);
  return vec3(0.58, 0.66, 0.78);
}

// Blend adjacent biome regions along the tube length.
// Returns blended params in biomeP, blended tint in biomeTintOut.
void blendBiomes(out vec3 biomeP, out vec3 biomeTintOut) {
  float tubePos = vUv.x * biomeCount;
  int idx0 = int(clamp(floor(tubePos), 0.0, 9.0));
  int idx1 = int(clamp(ceil(tubePos), 0.0, 9.0));
  float zoneBlend = smoothstep(0.28, 0.72, fract(tubePos));

  float biome0 = biomeIndices[idx0];
  float biome1 = biomeIndices[idx1];
  biomeP = mix(biomeParams(biome0), biomeParams(biome1), zoneBlend);
  biomeTintOut = mix(biomeTint(biome0), biomeTint(biome1), zoneBlend);
}
