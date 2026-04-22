import type { Page } from '@playwright/test';

/**
 * Wait for the game's UI mode to reach the specified value.
 */
export async function waitForUIMode(page: Page, mode: string, timeout = 30_000) {
  await page.waitForFunction(
    (m) => window.__STORE__?.getState()?.ui?.mode === m,
    mode,
    { timeout },
  );
}

/**
 * Return a snapshot of the full game state from the Zustand store.
 */
export async function getGameState(page: Page) {
  return page.evaluate(() => {
    const store = window.__STORE__;
    if (!store) return null;
    const s = store.getState();
    return {
      ui: { mode: s.ui.mode },
      player: { shields: s.player.shields, fuel: s.player.fuel, credits: s.player.credits },
      currentSystemId: s.currentSystemId,
    };
  });
}

/**
 * Clear all saved game data from localStorage for a clean test slate.
 */
export async function clearSaveData(page: Page) {
  await page.evaluate(async () => {
    localStorage.clear();

    try {
      const dir = await navigator.storage.getDirectory();
      const files = [
        'save-autosave.json',
        'save-autosave-interval.json',
        'save-autosave-system-entry.json',
        'save-autosave-last-system-entry.json',
        ...Array.from({ length: 5 }, (_, i) => `save-slot-${i}.json`),
      ];
      for (const file of files) {
        try {
          await dir.removeEntry(file);
        } catch {
          // file didn't exist — no-op
        }
      }
    } catch {
      // FileSystem API unavailable — localStorage clear above is still useful
    }
  });
}
