import * as THREE from 'three';
import { STAR_POINT_RENDER_ORDER } from './starfieldConstants';

const vertexShader = /* glsl */ `
  attribute float size;
  varying vec3 vColor;
  uniform float uPixelRatio;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uPixelRatio;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float alpha = exp(-d * d * 3.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor * alpha, alpha);
  }
`;

export function createStarPointMaterial(pixelRatio: number): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader,
    fragmentShader,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

  return material;
}

export function createStarPoints(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  pixelRatio: number,
): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = createStarPointMaterial(pixelRatio);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = STAR_POINT_RENDER_ORDER;

  return points;
}
