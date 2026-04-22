import { test as base, type Page } from '@playwright/test';

export interface GamePage {
  page: Page;
  waitForGameReady(): Promise<void>;
  getUIMode(): Promise<string>;
  getGeometryCount(): Promise<number>;
  getPlayerState(): Promise<{ shields: number; fuel: number; credits: number }>;
  getCargo(): Promise<Record<string, number>>;
  getHeat(): Promise<number>;
}

export const test = base.extend<{ gamePage: GamePage }>({
  gamePage: async ({ page }, use) => {
    const gamePage: GamePage = {
      page,

      async waitForGameReady() {
        await page.goto('/');
        await page.waitForFunction(
          () => window.__STORE__ != null,
          null,
          { timeout: 30_000 },
        );
        await page.waitForFunction(
          () => window.__STORE__?.getState()?.ui?.mode === 'flight',
          null,
          { timeout: 30_000 },
        );
      },

      async getUIMode() {
        return page.evaluate(() =>
          window.__STORE__?.getState()?.ui?.mode ?? 'unknown',
        );
      },

      async getGeometryCount() {
        return page.evaluate(() => {
          const renderer = window.__GAME__?.sceneRenderer?.renderer;
          return renderer?.info?.memory?.geometries ?? 0;
        });
      },

      async getPlayerState() {
        return page.evaluate(() => {
          const s = window.__STORE__?.getState();
          return {
            shields: s?.player?.shields ?? 0,
            fuel: s?.player?.fuel ?? 0,
            credits: s?.player?.credits ?? 0,
          };
        });
      },

      async getCargo() {
        return page.evaluate(() => {
          const s = window.__STORE__?.getState();
          return s?.player?.cargo ?? {};
        });
      },

      async getHeat() {
        return page.evaluate(() => {
          const s = window.__STORE__?.getState();
          return s?.player?.heat ?? 0;
        });
      },
    };

    await use(gamePage);
  },
});

export { expect } from '@playwright/test';
