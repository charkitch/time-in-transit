#include includes/noise.glsl
#include includes/planet_varyings.glsl
#include includes/gate_discard.glsl
#include includes/topopolis_biomes.glsl

uniform float seed;
uniform float biomeSeed;
uniform float density;
uniform float uAspect;
uniform float uNoiseScale;
uniform float uTime;
uniform sampler2D interactionFieldTex;
uniform float interactionFieldBlend;
void main() {
  applyGateDiscard();
  // Cloud noise in aspect-corrected UV space so wisps aren't stretched.
  // Slow drift along the tube length to simulate interior weather circulation.
  float drift = uTime * 0.008;
  vec3 cloudPos = vLocalPos * uNoiseScale * 1.5 + vec3(seed * 5.17 + drift, seed * 11.31, seed * 2.93);

  float n1 = fbm(cloudPos);
  float n2 = snoise(cloudPos * 2.0 + vec3(77.0));

  vec3 biomeP, biomeTintUnused;
  blendBiomes(biomeP, biomeTintUnused);

  float fieldMacro = texture2D(interactionFieldTex, vUv).r * 2.0 - 1.0;
  vec3 terrainPos = vLocalPos * uNoiseScale + vec3(seed * 13.37, biomeSeed * 7.13, seed * 3.71);
  float fallbackMacro = fbm(terrainPos);
  float macro = mix(fallbackMacro, fieldMacro, interactionFieldBlend);
  float seaShift = biomeP.x * 0.25;
  float landMask = smoothstep(-0.06, 0.09, macro - seaShift);
  float humidity = clamp((1.0 - biomeP.y) * 0.8 + (1.0 - landMask) * 0.6, 0.15, 1.0);

  // Wispy, patchy clouds — same character as planet clouds
  float cloud = smoothstep(-0.1, 0.4, n1) * smoothstep(-0.3, 0.2, n2);
  cloud = cloud * cloud;
  cloud *= humidity;

  vec3 color = vec3(0.92, 0.94, 0.97);
  float alpha = cloud * density * (1.0 - windowBlend) * (1.0 - dockZoneBlend);

  gl_FragColor = vec4(color, alpha);
}
