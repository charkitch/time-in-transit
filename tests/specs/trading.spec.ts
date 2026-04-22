import { test, expect } from '../fixtures/gamePage';
import { dockAndComplete } from '../helpers/dockingHelpers';
import { getCargoCount } from '../helpers/tradingHelpers';

test.describe('Trading', () => {
  test('buy a good via BUY button', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    const creditsBefore = (await gamePage.getPlayerState()).credits;
    const cargoBefore = await getCargoCount(gamePage.page);

    // Find an enabled BUY button and click it
    const buyBtn = gamePage.page.locator('button:has-text("BUY"):not([disabled])').first();
    await expect(buyBtn).toBeVisible();
    await buyBtn.click();

    const creditsAfter = (await gamePage.getPlayerState()).credits;
    const cargoAfter = await getCargoCount(gamePage.page);

    expect(creditsAfter).toBeLessThan(creditsBefore);
    expect(cargoAfter).toBe(cargoBefore + 1);
  });

  test('sell a good via SELL button', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Buy a good first so the Rust engine has the cargo on record
    const buyBtn = gamePage.page.locator('button:has-text("BUY"):not([disabled])').first();
    await expect(buyBtn).toBeVisible({ timeout: 5_000 });
    await buyBtn.click();

    const creditsAfterBuy = (await gamePage.getPlayerState()).credits;

    // Sell it back
    const sellBtn = gamePage.page.locator('button:has-text("SELL"):not([disabled])').first();
    await expect(sellBtn).toBeVisible({ timeout: 5_000 });
    await sellBtn.click();

    const creditsAfterSell = (await gamePage.getPlayerState()).credits;
    expect(creditsAfterSell).toBeGreaterThan(creditsAfterBuy);
  });

  test('BUY button disabled when cargo full', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Fill cargo to max
    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().addCargo('Alloys', 20, 10);
    });

    // All BUY buttons should be disabled
    const buyButtons = gamePage.page.locator('button:has-text("BUY")');
    const count = await buyButtons.count();
    expect(count).toBeGreaterThan(0);
    await Promise.all(
      Array.from({ length: count }, (_, i) => expect(buyButtons.nth(i)).toBeDisabled()),
    );
  });

  test('BUY button disabled when insufficient credits', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Set credits to 0
    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setCredits(0);
    });

    // All BUY buttons should be disabled
    const buyButtons = gamePage.page.locator('button:has-text("BUY")');
    const count = await buyButtons.count();
    expect(count).toBeGreaterThan(0);
    await Promise.all(
      Array.from({ length: count }, (_, i) => expect(buyButtons.nth(i)).toBeDisabled()),
    );
  });

  test('refuel is full in dev mode (INFINITE_FUEL_DEV)', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Click REFUEL tab
    await gamePage.page.getByText('REFUEL', { exact: true }).click();

    // In dev mode, fuel is always full — refuel button should be disabled
    const refuelBtn = gamePage.page.locator('button:has-text("REFUEL")').last();
    await expect(refuelBtn).toBeDisabled();
  });

  test('shield repair via UI', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Click REFUEL tab (repair is on same tab)
    await gamePage.page.getByText('REFUEL', { exact: true }).click();

    const repairBtn = gamePage.page.locator('button:has-text("REPAIR")');

    // At full shields (100 after docking), REPAIR should be disabled
    await expect(repairBtn).toBeDisabled();

    // Damage shields in TS state — button should become enabled
    await gamePage.page.evaluate(() => {
      window.__STORE__!.getState().setShields(50);
    });
    await expect(repairBtn).toBeEnabled();
  });

  test('credits display updates after purchase', async ({ gamePage }) => {
    await gamePage.waitForGameReady();
    await dockAndComplete(gamePage.page);

    // Read displayed credits
    const creditsText = await gamePage.page.locator('text=CR').first().innerText();
    const displayedBefore = parseInt(creditsText.replace(/[^0-9]/g, ''), 10);

    // Buy something
    const buyBtn = gamePage.page.locator('button:has-text("BUY"):not([disabled])').first();
    await buyBtn.click();

    // Credits display should have changed
    const creditsTextAfter = await gamePage.page.locator('text=CR').first().innerText();
    const displayedAfter = parseInt(creditsTextAfter.replace(/[^0-9]/g, ''), 10);
    expect(displayedAfter).toBeLessThan(displayedBefore);
  });
});
