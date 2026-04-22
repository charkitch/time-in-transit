import { test, expect } from '../fixtures/gamePage';
import { waitForUIMode } from '../helpers/gameHelpers';

test.describe('WebGL Context Loss Recovery', () => {
  test('context loss shows overlay', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    await gamePage.page.evaluate(() => {
      const renderer = window.__GAME__!.sceneRenderer.renderer;
      const ext = renderer.getContext().getExtension('WEBGL_lose_context')!;
      ext.loseContext();
    });

    // The context loss notice should appear
    await expect(gamePage.page.getByText('Graphics context lost')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('context restore recovers', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // Grab the extension before losing context, store it on window
    await gamePage.page.evaluate(() => {
      const renderer = window.__GAME__!.sceneRenderer.renderer;
      window.__TEST_LOSE_CTX_EXT__ =
        renderer.getContext().getExtension('WEBGL_lose_context') ?? undefined;
      window.__TEST_LOSE_CTX_EXT__!.loseContext();
    });

    await expect(gamePage.page.getByText('Graphics context lost')).toBeVisible({
      timeout: 5_000,
    });

    // Restore the context using the saved extension reference
    await gamePage.page.evaluate(() => {
      window.__TEST_LOSE_CTX_EXT__!.restoreContext();
    });

    // After restore, App increments gameEpoch → new Game instance → flight mode
    await waitForUIMode(gamePage.page, 'flight', 30_000);
    expect(await gamePage.getUIMode()).toBe('flight');
  });

  test('state preserved across context loss', async ({ gamePage }) => {
    await gamePage.waitForGameReady();

    // invertControls is not Rust-synced; setInvertControls also saves to localStorage
    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setInvertControls(true);
    });

    // Grab extension and lose context
    await gamePage.page.evaluate(() => {
      const renderer = window.__GAME__!.sceneRenderer.renderer;
      window.__TEST_LOSE_CTX_EXT__ =
        renderer.getContext().getExtension('WEBGL_lose_context') ?? undefined;
      window.__TEST_LOSE_CTX_EXT__!.loseContext();
    });

    // Restore context
    await gamePage.page.evaluate(() => {
      window.__TEST_LOSE_CTX_EXT__!.restoreContext();
    });

    await waitForUIMode(gamePage.page, 'flight', 30_000);

    const invertControls = await gamePage.page.evaluate(() =>
      window.__STORE__?.getState()?.invertControls,
    );
    expect(invertControls).toBe(true);
  });
});
