#include ../../mesh/shaders/includes/noise.glsl

uniform mat4 uInvProjectionMatrix;
uniform mat4 uInvViewMatrix;
uniform vec2 uGalaxyOffset;
uniform float uBandFalloff;
uniform float uNebulaScale;
uniform float uDustScale;
uniform vec3 uNebulaWarmColor;
uniform vec3 uNebulaCoolColor;

varying vec2 vUv;

void main() {
  vec4 clipPos = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 viewDir = uInvProjectionMatrix * clipPos;
  viewDir.xyz /= viewDir.w;
  vec3 worldDir = normalize((uInvViewMatrix * vec4(viewDir.xyz, 0.0)).xyz);

  float galLat = abs(worldDir.y);
  float bandBrightness = exp(-galLat * uBandFalloff);

  vec3 nebulaCoord = worldDir * uNebulaScale + vec3(uGalaxyOffset, 0.0);
  float n1 = snoise(nebulaCoord) * 0.5 + 0.5;
  float n2 = snoise(nebulaCoord * 2.1 + vec3(100.0)) * 0.5 + 0.5;
  float n3 = snoise(nebulaCoord * 4.3 + vec3(200.0)) * 0.5 + 0.5;
  float nebulaValue = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1) * bandBrightness;

  float colorMix = snoise(worldDir * uNebulaScale * 0.5 + vec3(uGalaxyOffset.y, 0.0, uGalaxyOffset.x));
  vec3 nebulaColor = mix(uNebulaWarmColor, uNebulaCoolColor, colorMix * 0.5 + 0.5);

  vec3 dustCoord = worldDir * uDustScale + vec3(uGalaxyOffset * 0.5, 0.0);
  float dust = snoise(dustCoord) * 0.5 + 0.5;
  dust = smoothstep(0.35, 0.65, dust) * bandBrightness;

  vec3 bandColor = vec3(0.08, 0.08, 0.12);
  vec3 finalColor = bandColor * bandBrightness * 0.06 + nebulaColor * nebulaValue * 0.04;
  finalColor = max(finalColor - vec3(dust * 0.03), vec3(0.0));

  gl_FragColor = vec4(finalColor, 1.0);
}
