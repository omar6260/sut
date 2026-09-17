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
import { FirestoreStorage, clearEmulator } from './firestore-storage.js';

// SUKTUM_BACKEND=firebase → l'app utilise l'adaptateur Firestore (émulateur) ; sinon stockage en mémoire injecté.
export const BACKEND = process.env.SUKTUM_BACKEND === 'firebase' ? 'firebase' : 'memory';

export const test = base.extend({
  storage: async ({}, use) => {
    if (BACKEND === 'firebase') { await clearEmulator(); await use(new FirestoreStorage()); }
    else await use(new MemoryStorage());
  },

  suktum: async ({ browser, storage }, use, testInfo) => {
    const contexts = [];
    const errors = []; // { device, message }
    const toasts = []; // { device, message } — chaque showToast() du legacy

    const suktum = {
      storage,
      errors,
      toasts,

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
        if (BACKEND === 'memory') await installStorage(page, storage, deviceId);
        await page.exposeBinding('__suktumToast', (_s, message) => { toasts.push({ device: deviceId, message }); });
        await page.addInitScript(() => {
          document.addEventListener('DOMContentLoaded', () => {
            const t = document.getElementById('toast');
            if (!t) return;
            new MutationObserver(() => { if (t.classList.contains('show') && t.textContent) window.__suktumToast(t.textContent); })
              .observe(t, { attributes: true, attributeFilter: ['class'] });
          });
        });
        await page.goto('/');
        if (BACKEND === 'firebase') storage.registerDevice(deviceId, await page.evaluate(() => window.SuktumPlatform.ready));
        return page;
      },

      /** Backend firebase : pose des claims puis force le rafraîchissement du jeton dans la page. */
      async grantRole(page, claims) {
        await storage.setClaims(page.suktumDevice, claims);
        await page.evaluate(() => window.SuktumPlatform.auth.currentUser.getIdToken(true));
      },

      /** Backend firebase : « Continuer avec Google » avec un jeton factice accepté par l'émulateur. */
      async googleSignIn(page, { sub, email }) {
        return page.evaluate(async (p) => { const r = await window.SuktumPlatform.authApi.signInWithGoogleForTests(p); await window.signInWithGoogleSuktum(r); return r; }, { sub, email });
      },

      /** Dernier toast affiché sur un appareil (ou null). */
      lastToast(page) {
        const mine = toasts.filter((t) => t.device === page.suktumDevice);
        return mine.length ? mine[mine.length - 1].message : null;
      },

      /** Recharge la page d'un appareil en conservant son espace privé. */
      async reload(page) {
        await page.reload();
        return page;
      },

      /** Crée un compte depuis l'écran d'accueil, jusqu'à l'affichage du fil. */
      async signUp(page, username, { country = 'Sénégal', minor = false, language = 'fr' } = {}) {
        const onboarding = page.locator('#screen-onboarding');
        await expect(onboarding).toHaveClass(/active/);
        // Sans choix explicite, le Sénégal bascule l'interface en wolof ; le guide d'utilisation fait foi en français.
        await page.locator('#onboarding-language-select').selectOption(language);
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
