import * as THREE from 'three';
import type { SurfaceType } from '../../../engine';
import { GLSL_NOISE, GLSL_PLANET_VERTEX, GLSL_PLANET_VARYINGS } from '../glsl';

export function addCloudLayer(
  group: THREE.Group, radius: number, seed: number, density: number,
  surfaceType: SurfaceType = 'continental',
): void {
  const geo = new THREE.SphereGeometry(radius * 1.04, 32, 24);
  const isIce = surfaceType === 'ice';

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      seed: { value: seed },
      density: { value: density },
      isIce: { value: isIce ? 1 : 0 },
    },
    vertexShader: GLSL_PLANET_VERTEX,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform float seed;
      uniform float density;
      uniform int isIce;
      ${GLSL_PLANET_VARYINGS}

      void main() {
        vec3 toStar = normalize(-vWorldPosition);
        float sunDot = dot(vWorldNormal, toStar);

        // Cloud noise at a different scale/offset from surface
        vec3 cloudPos = normalize(vLocalPos) * 3.0
          + vec3(seed * 5.17, seed * 11.31, seed * 2.93);
        float n1 = fbm(cloudPos);
        float n2 = snoise(cloudPos * 2.0 + vec3(77.0));

        // Wispy, patchy pattern
        float cloud = smoothstep(-0.1, 0.4, n1) * smoothstep(-0.3, 0.2, n2);
        cloud = cloud * cloud; // sharpen edges

        // Tint — white-ish, slight blue for ice
        vec3 color = isIce == 1
          ? vec3(0.85, 0.92, 1.0)
          : vec3(0.95, 0.95, 0.97);

        // Lit by sun, fades on dark side
        float lighting = smoothstep(-0.2, 0.7, sunDot) * 0.85 + 0.15;
        color *= lighting;

        float alpha = cloud * density;

        gl_FragColor = vec4(color, alpha);
      }
    `,
  });

  group.add(new THREE.Mesh(geo, mat));
}

