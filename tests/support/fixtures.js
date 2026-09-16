// Fixtures Playwright pour les tests de caractérisation du prototype.
//
//   test('…', async ({ suktum }) => {
//     const a = await suktum.openDevice('A');       // un « téléphone » avec son espace privé
//     await suktum.signUp(a, 'Awa_Dakar');           // création de compte jusqu'au fil
//     const b = await suktum.openDevice('B');
//     …
//   });
//
// Tous les appareils d'un même test partagent le même espace partagé (MemoryStorage.shared).
import { test as base, expect } from '@playwright/test';
import { MemoryStorage, installStorage } from './memory-storage.js';
import { installNetworkMocks } from './network-mocks.js';

export const test = base.extend({
  storage: async ({}, use) => {
    await use(new MemoryStorage());
  },

  suktum: async ({ browser, storage }, use, testInfo) => {
    const contexts = [];
    const errors = []; // { device, message }

    const suktum = {
      storage,
      errors,

      /** Ouvre un nouveau contexte navigateur (= un appareil) et charge l'application. */
      async openDevice(deviceId = `device-${contexts.length + 1}`) {
        const context = await browser.newContext({
          ...testInfo.project.use,
          permissions: [], // pas de géolocalisation → le sélecteur de pays de secours s'affiche
        });
        contexts.push(context);
        await installNetworkMocks(context);
        const page = await context.newPage();
        page.suktumDevice = deviceId;
        page.on('pageerror', (e) => errors.push({ device: deviceId, message: e.message }));
        await installStorage(page, storage, deviceId);
        await page.goto('/');
        return page;
      },

      /** Recharge la page d'un appareil en conservant son espace privé. */
      async reload(page) {
        await page.reload();
        return page;
      },

      /** Crée un compte depuis l'écran d'accueil, jusqu'à l'affichage du fil. */
      async signUp(page, username, { country = 'Sénégal', minor = false } = {}) {
        const onboarding = page.locator('#screen-onboarding');
        await expect(onboarding).toHaveClass(/active/);
        await page.locator('#onboard-username').fill(username);
        await page.locator('#onboard-country').selectOption({ label: country });
        await page.locator(minor ? '#onboard-age-minor-btn' : '#onboard-age-adult-btn').click();
        await page.locator('#screen-onboarding button', { hasText: 'Commencer' }).click();
        await expect(page.locator('#screen-feed')).toHaveClass(/active/);
        return page;
      },

      /** Ferme une éventuelle visite guidée / modale d'accueil qui masquerait le fil. */
      async dismissTour(page) {
        const skip = page.locator('#onboarding-tour-overlay button, #onboarding-tour-skip, [onclick*="skipOnboardingTour"], [onclick*="closeOnboardingTour"]').first();
        if (await skip.isVisible().catch(() => false)) await skip.click();
      },
    };

    await use(suktum);
    for (const c of contexts) await c.close().catch(() => {});
  },
});

export { expect };
