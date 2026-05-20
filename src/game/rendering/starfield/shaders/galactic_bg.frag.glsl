uniform mat4 uInvProjectionMatrix;
uniform mat4 uInvViewMatrix;
uniform vec2 uGalaxyDir;

varying vec2 vUv;

void main() {
  vec4 clipPos = vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec4 viewDir = uInvProjectionMatrix * clipPos;
  viewDir.xyz /= viewDir.w;
  vec3 worldDir = normalize((uInvViewMatrix * vec4(viewDir.xyz, 0.0)).xyz);

  // Galactic core: directional glow toward galaxy center
  vec3 coreDir = normalize(vec3(uGalaxyDir.x, 0.0, uGalaxyDir.y));
  float coreDot = max(dot(worldDir, coreDir), 0.0);
  float coreGlow = pow(coreDot, 8.0) * 0.12 + pow(coreDot, 40.0) * 0.25;

  vec3 coreColor = vec3(0.25, 0.2, 0.12);

  // Faint galactic plane wash
  float galLat = abs(worldDir.y);
  float planeWash = exp(-galLat * 3.0) * 0.015;

  vec3 finalColor = coreColor * coreGlow + vec3(0.06, 0.06, 0.08) * planeWash;

  gl_FragColor = vec4(finalColor, 1.0);
}
