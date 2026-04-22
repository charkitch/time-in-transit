import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface GPUSnapshot {
  geometries: number;
  textures: number;
}

/**
 * Get a snapshot of GPU memory usage from the Three.js renderer.
 */
export async function getGPUSnapshot(page: Page): Promise<GPUSnapshot> {
  return page.evaluate(() => {
    const renderer = window.__GAME__?.sceneRenderer?.renderer;
    if (!renderer) return { geometries: 0, textures: 0 };
    return {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    };
  });
}

/**
 * Assert that GPU memory didn't grow beyond acceptable bounds between two snapshots.
 * maxGrowthFactor of 2.0 means "after" can be at most 2x "before".
 */
export function assertMemoryBounded(
  before: GPUSnapshot,
  after: GPUSnapshot,
  maxGrowthFactor = 2.0,
) {
  const baseGeometries = Math.max(before.geometries, 1);
  expect(after.geometries).toBeLessThanOrEqual(baseGeometries * maxGrowthFactor);
}
