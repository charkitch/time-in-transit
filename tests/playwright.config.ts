import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: isCI ? 1 : 0,
  // Each test boots the game under software WebGL, so the boot dominates.
  // Run tests (not just files) across workers to keep two boots in flight.
  fullyParallel: true,
  workers: isCI ? 2 : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    // Locally there are no retries, so on-first-retry would never record.
    video: isCI ? 'on-first-retry' : 'retain-on-failure',
  },
  webServer: {
    // In CI serve the production build (the artifact that actually deploys);
    // locally use the dev server so no build step is needed to run e2e.
    command: isCI ? 'npm run preview -- --port 5173' : 'npm run dev',
    port: 5173,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
