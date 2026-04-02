#include includes/noise.glsl
#include includes/planet_varyings.glsl

uniform float seed;
uniform vec3 baseColor;
uniform float uLightPhase;
uniform vec3 uLightPos;

void main() {
  vec3 noisePos = normalize(vLocalPos) * 2.0 + vec3(seed * 13.37, seed * 7.13, seed * 3.71);
  vec3 toLight = normalize(uLightPos - vWorldPosition);
  float lightDot = dot(vWorldNormal, toLight);
  float n = fbm(noisePos);

  // Reuse continental world surface treatment for Dyson shell interiors.
  float landMask = smoothstep(-0.05, 0.1, n);
  vec3 ocean = vec3(0.05, 0.12, 0.25);
  vec3 shallow = vec3(0.08, 0.2, 0.35);
  vec3 lowland = mix(vec3(0.15, 0.35, 0.12), baseColor * 0.5, 0.3);
  vec3 highland = mix(vec3(0.45, 0.35, 0.2), baseColor * 0.7, 0.3);
  float h = smoothstep(0.1, 0.5, n);
  vec3 land = mix(lowland, highland, h);
  float depth = smoothstep(-0.4, -0.05, n);
  vec3 oceanC = mix(ocean, shallow, depth);
  vec3 surfaceColor = mix(oceanC, land, landMask);

  vec3 nightColor = vec3(1.0, 0.95, 0.8);
  vec3 dawnColor = vec3(1.15, 0.9, 0.65);
  vec3 dayColor = vec3(1.65, 1.45, 1.15);
  vec3 lightColor = mix(
    nightColor,
    mix(dawnColor, dayColor, max(0.0, (uLightPhase - 0.5) * 2.0)),
    min(1.0, uLightPhase * 2.0)
  );
  float diffuse = smoothstep(-0.3, 0.8, lightDot);
  float ambient = mix(0.15, 0.32, uLightPhase);
  float phaseBrightness = mix(1.0, 2.1, smoothstep(0.0, 1.0, uLightPhase));
  float shellVariance = mix(0.9, 1.1, fract(seed * 12.9898));
  float lighting = (diffuse * uLightPhase * 0.85 + ambient) * phaseBrightness * shellVariance;
  gl_FragColor = vec4(surfaceColor * lightColor * lighting, 1.0);
}
