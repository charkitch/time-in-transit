import type * as THREE from 'three';

const SOFTWARE_RENDERER_PATTERNS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'microsoft basic render',
  'warp',
];

export function isSoftwareRenderer(renderer: THREE.WebGLRenderer): boolean {
  const gl = renderer.getContext();

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererString = debugInfo
    ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
    : (gl.getParameter(gl.RENDERER) as string);

  const lower = rendererString.toLowerCase();
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => lower.includes(pattern));
}
