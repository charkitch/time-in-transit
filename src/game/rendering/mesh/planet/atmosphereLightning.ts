import * as THREE from 'three';
import { GLSL_PLANET_VERTEX, GLSL_PLANET_VARYINGS, GLSL_HASH } from '../glsl';

export function addSunAtmosphere(group: THREE.Group, radius: number): void {
  const geo = new THREE.SphereGeometry(radius * 1.06, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
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
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
}

/**
 * Rare lightning flashes on the dark side of planets and gas giants.
 * Returns the ShaderMaterial so the caller can update uTime each frame.
 */
export function addLightning(
  group: THREE.Group, radius: number, seed: number,
): THREE.ShaderMaterial {
  const geo = new THREE.SphereGeometry(radius * 1.002, 32, 24);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0.0 },
      seed:  { value: seed },
    },
    vertexShader: GLSL_PLANET_VERTEX,
    fragmentShader: `
      ${GLSL_HASH}
      ${GLSL_PLANET_VARYINGS}
      uniform float uTime;
      uniform float seed;

      float distToSeg(vec2 p, vec2 a, vec2 b) {
        vec2 ab = b - a, ap = p - a;
        float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
        return length(p - (a + ab * t));
      }

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);
        // Only on dark side; fade out near the terminator
        float darkMask = smoothstep(0.05, -0.2, sunDot);
        if (darkMask <= 0.001) discard;

        // Spherical UV for cell grid
        vec3 n = normalize(vLocalPos);
        float theta = atan(n.z, n.x) / 3.14159265;  // -1..1
        float phi   = acos(clamp(n.y, -1.0, 1.0)) / 3.14159265; // 0..1

        float gridScale = 9.0;
        vec2 uvGrid    = vec2(theta * gridScale, phi * gridScale * 0.55);
        vec2 cellCoord = floor(uvGrid);
        vec2 local     = fract(uvGrid) - 0.5; // -0.5..0.5

        // ~20% of cells can produce storms
        float cHash = hash(cellCoord, seed);
        if (cHash < 0.80) discard;

        // Flash timing: 0.3-0.8 Hz, visible for ~12% of period
        // Avoid reversed smoothstep args (undefined GLSL behaviour)
        float flashRate = 0.3 + cHash * 0.5;
        float phase = fract(uTime * flashRate + cHash * 17.3);
        float flash = smoothstep(0.0, 0.02, phase)
                    * (1.0 - smoothstep(0.10, 0.14, phase));
        if (flash <= 0.001) discard;

        // Jagged bolt: 3 connected segments
        float h1 = hash(cellCoord, seed + 1.0);
        float h2 = hash(cellCoord, seed + 2.0);
        float h3 = hash(cellCoord, seed + 3.0);
        float h4 = hash(cellCoord, seed + 4.0);
        float h5 = hash(cellCoord, seed + 5.0);

        vec2 p0 = vec2((h1 - 0.5) * 0.22, -0.43);
        vec2 p1 = vec2((h2 - 0.5) * 0.38, -0.12 + (h3 - 0.5) * 0.08);
        vec2 p2 = vec2((h4 - 0.5) * 0.3,   0.12);
        vec2 p3 = vec2((h5 - 0.5) * 0.22,  0.43);

        float w = 0.022;
        float d = min(distToSeg(local, p0, p1),
                  min(distToSeg(local, p1, p2),
                      distToSeg(local, p2, p3)));
        float bolt = smoothstep(w, w * 0.1, d);

        // One sub-branch off the mid-segment
        float h6 = hash(cellCoord, seed + 6.0);
        float h7 = hash(cellCoord, seed + 7.0);
        vec2 bStart = mix(p1, p2, 0.45);
        vec2 bEnd   = bStart + vec2((h6 - 0.5) * 0.17, h7 * 0.12 + 0.08);
        float branch = smoothstep(w * 0.75, w * 0.1,
                         distToSeg(local, bStart, bEnd)) * 0.65;

        // Soft glow halo around the bolt
        float glow = smoothstep(w * 6.0, 0.0, d) * 0.4;

        float total = max(bolt, branch) + glow;
        float alpha = total * flash * darkMask;
        if (alpha <= 0.001) discard;

        vec3 color = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 1.0, 1.0), bolt);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
  return mat;
}
