import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/**
 * Returns a texture ref immediately; image loads async.
 * Cached by path — survives across system loads.
 */
export function loadTexture(path: string): THREE.Texture {
  const existing = cache.get(path);
  if (existing) return existing;

  const tex = loader.load(path);
  tex.anisotropy = 4; // capped at 4 — safe across all hardware
  cache.set(path, tex);
  return tex;
}

export function disposeAll(): void {
  cache.forEach(tex => tex.dispose());
  cache.clear();
}
