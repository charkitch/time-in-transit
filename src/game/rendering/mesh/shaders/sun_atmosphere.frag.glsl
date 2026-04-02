varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDir;

void main() {
  vec3 toStar = normalize(-vWorldPosition);
  float sunDot = dot(vWorldNormal, toStar);

  // Fresnel rim — strongest at edges, visible from all angles
  float rim = 1.0 - max(dot(vWorldNormal, vViewDir), 0.0);
  rim = pow(rim, 2.0);

  // Broad sunlit glow — covers most of the sun-facing hemisphere
  float sunMask = smoothstep(-0.2, 0.6, sunDot);

  // Diffuse brightening across the whole lit face (not just rim)
  float faceBright = max(sunDot, 0.0) * 0.25;

  float alpha = (rim * 0.7 + faceBright) * sunMask;
  vec3 color = vec3(0.7, 0.88, 1.0);

  gl_FragColor = vec4(color, alpha);
}
