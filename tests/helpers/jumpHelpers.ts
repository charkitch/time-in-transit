import type { Page } from '@playwright/test';
import { waitForUIMode } from './gameHelpers';

/**
 * Set a hyperspace jump target by system index.
 */
export async function setJumpTarget(page: Page, systemIndex: number) {
  await page.evaluate((idx) => {
    window.__STORE__!.getState().setHyperspaceTarget(idx);
  }, systemIndex);
}

/**
 * Trigger a hyperspace jump via the Game instance.
 */
export async function triggerJump(page: Page) {
  await page.evaluate(() => {
    window.__GAME__!.requestJump();
  });
}

/**
 * Get a valid jump target index from the cluster (nearest reachable system).
 */
export async function getJumpTarget(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const store = window.__STORE__;
    if (!store) return null;
    const state = store.getState();
    const cluster = state.cluster;
    if (!cluster?.length) return null;
    const current = cluster[state.currentSystemId];
    if (!current) return null;

    return cluster.reduce<{ idx: number | null; dist: number }>(
      (best, s, i) => {
        if (i === state.currentSystemId) return best;
        const dist = Math.hypot(s.x - current.x, s.y - current.y);
        return dist < best.dist ? { idx: i, dist } : best;
      },
      { idx: null, dist: Infinity },
    ).idx;
  });
}

/**
 * Perform a full jump sequence: set target, trigger, wait for arrival back in flight mode.
 */
export async function performFullJump(page: Page, systemIndex: number, timeout = 30_000) {
  await setJumpTarget(page, systemIndex);
  await triggerJump(page);
  await waitForUIMode(page, 'flight', timeout);
}
