// Configuration Playwright — Chromium uniquement, profil mobile (Pixel 7) + desktop.
// Les tests chargent dist/index.html servi par scripts/serve.mjs sur le port 5173.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Backend Firebase : les cold starts de l'émulateur Functions (plusieurs appels enchaînés) demandent des délais plus longs.
  timeout: process.env.SUKTUM_BACKEND === 'firebase' ? 90_000 : 30_000,
  expect: { timeout: process.env.SUKTUM_BACKEND === 'firebase' ? 15_000 : 5_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'fr-SN',
    timezoneId: 'Africa/Dakar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build -- --multi && npm run serve',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
