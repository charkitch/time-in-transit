#include includes/noise.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform float uTime;
uniform float uLightPhase;
uniform vec3 uLightPos;
uniform vec3 bStart;
uniform vec3 bEnd;
uniform vec3 bCloud;
uniform vec3 bDensity;
uniform vec3 bStorm;

float inBand(float angle, float startA, float endA) {
  if (startA > endA) {
    return step(startA, angle) + step(angle, endA);
  }
  return step(startA, angle) * step(angle, endA);
}

void main() {
  vec3 toLight = normalize(uLightPos - vWorldPosition);
  float lightDot = dot(vWorldNormal, toLight);
  vec3 n = normalize(vLocalPos);

  // Use atan(x, z) to get azimuthal angle aligned with SphereGeometry phi
  float az = atan(n.x, n.z);
  if (az < 0.0) az += 6.28318530718;

  // Rotate az by PI to align with shell's phiStart/phiLength centering
  az = mod(az + 3.14159265, 6.28318530718);

  // Reuse continental cloud generation and lighting.
  vec3 cloudPos = n * 3.0 + vec3(seed * 5.17, seed * 11.31, seed * 2.93);
  float n1 = fbm(cloudPos);
  float n2 = snoise(cloudPos * 2.0 + vec3(77.0));
  float cloudTex = smoothstep(-0.1, 0.4, n1) * smoothstep(-0.3, 0.2, n2);
  cloudTex = cloudTex * cloudTex;

  float m0 = inBand(az, bStart.x, bEnd.x);
  float m1 = inBand(az, bStart.y, bEnd.y);
  float m2 = inBand(az, bStart.z, bEnd.z);

  float cloudMask = m0 * bCloud.x + m1 * bCloud.y + m2 * bCloud.z;
  float cloudDensity = m0 * bDensity.x + m1 * bDensity.y + m2 * bDensity.z;
  float stormMask = m0 * bStorm.x + m1 * bStorm.y + m2 * bStorm.z;

  vec3 nightColor = vec3(1.0, 0.95, 0.8);
  vec3 dawnColor = vec3(1.15, 0.9, 0.65);
  vec3 dayColor = vec3(1.65, 1.45, 1.15);
  vec3 lightColor = mix(
    nightColor,
    mix(dawnColor, dayColor, max(0.0, (uLightPhase - 0.5) * 2.0)),
    min(1.0, uLightPhase * 2.0)
  );
  vec3 cloudColor = mix(vec3(0.85, 0.85, 0.9), vec3(1.0, 1.0, 1.0), uLightPhase);
  float diffuse = smoothstep(-0.2, 0.7, lightDot);
  float ambient = mix(0.16, 0.3, uLightPhase);
  float phaseBrightness = mix(1.0, 1.9, smoothstep(0.0, 1.0, uLightPhase));
  float shellVariance = mix(0.9, 1.1, fract(seed * 19.731));
  float lighting = (diffuse * uLightPhase * 0.85 + ambient) * phaseBrightness * shellVariance;
  vec3 outColor = cloudColor * lightColor * lighting;
  float alpha = cloudTex * cloudMask * cloudDensity;

  // Rare storm flashes in storm-enabled sectors.
  float flashGate = smoothstep(0.92, 0.985, snoise(cloudPos * 1.8 + vec3(uTime * 0.9, 33.0, 71.0)));
  float pulse = smoothstep(0.0, 0.02, fract(uTime * (0.35 + seed * 0.07)));
  pulse *= (1.0 - smoothstep(0.08, 0.14, fract(uTime * (0.35 + seed * 0.07))));
  float lightning = stormMask * flashGate * pulse;
  outColor += vec3(0.55, 0.75, 1.0) * lightning * 1.4;
  alpha = max(alpha, lightning * 0.7);

  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(outColor, alpha);
}
