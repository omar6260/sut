// Garantit (phase 05, D1/D3) : un nom d'utilisateur est réservé côté serveur ; un autre appareil ne peut pas
// l'utiliser ; « Continuer avec Google » retrouve le compte sur un nouvel appareil ; un compte 13–17 porte le claim familyMode.
import { test, expect, BACKEND } from '../support/fixtures.js';

test.skip(BACKEND !== 'firebase', 'identité serveur = backend firebase');

test.describe('Identité', () => {
  test('nom réservé : un autre appareil ne peut pas se connecter avec, mais Google retrouve le compte', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    // A lie son compte à Google (même uid).
    const linked = await suktum.googleSignIn(a, { sub: 'google-awa', email: 'awa@example.com' });
    expect(linked.uid).toBe(suktum.storage.uidOf('A'));

    // B tape le même nom : refus, invitation à passer par Google.
    const b = await suktum.openDevice('B');
    await b.locator('#onboarding-language-select').selectOption('fr');
    await b.locator('#onboard-username').fill('Awa_Dakar');
    await b.locator('#onboard-country').selectOption({ label: 'Sénégal' });
    await b.locator('#onboard-age-adult-btn').click();
    await b.locator('#screen-onboarding button', { hasText: 'Commencer' }).click();
    await expect.poll(() => suktum.lastToast(b)).toContain('déjà utilisé');
    await expect(b.locator('#screen-onboarding')).toHaveClass(/active/);

    // B « continue avec Google » avec le compte d'Awa : récupération proposée, puis fil.
    const r = await suktum.googleSignIn(b, { sub: 'google-awa', email: 'awa@example.com' });
    expect(r.usernames).toEqual(['Awa_Dakar']);
    await expect(b.locator('#google-account-recovery-area')).toBeVisible();
    await expect(b.locator('#google-recovery-btn')).toHaveText('Continuer en tant que @Awa_Dakar');
    await b.locator('#google-recovery-btn').click();
    await expect(b.locator('#screen-feed')).toHaveClass(/active/);
    expect(await b.evaluate(() => currentUser)).toBe('Awa_Dakar');
    expect(suktum.errors).toEqual([]);
  });

  test('compte 13–17 ans : claim familyMode posé par le serveur ; Mode Familial actif', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Ibou_15', { minor: true });
    const claims = await a.evaluate(async () => (await window.SuktumPlatform.auth.currentUser.getIdTokenResult(true)).claims);
    expect(claims.familyMode).toBe(true);
    expect(await suktum.storage.readJSON('restrictedmode:Ibou_15')).toBe(true);
    expect(await suktum.storage.readJSON('user:Ibou_15')).toMatchObject({ isMinor: true, ageBracket: '13-17' });
  });

  test('code de sécurité (PIN) : activé côté serveur, exigé à la récupération sur un nouvel appareil, 5 essais max', async ({ suktum }) => {
    test.setTimeout(90_000); // 5 tentatives serveur + 2 appareils
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.googleSignIn(a, { sub: 'google-awa', email: 'awa@example.com' });
    await a.evaluate(() => window.SuktumPlatform.authApi.setPin('4321'));
    expect(await suktum.storage.readJSON('user:Awa_Dakar')).not.toHaveProperty('securityPin');

    const b = await suktum.openDevice('B');
    await suktum.googleSignIn(b, { sub: 'google-awa', email: 'awa@example.com' });
    await b.locator('#google-recovery-btn').click();
    await expect(b.locator('#screen-pin-verify')).toHaveClass(/active/, { timeout: 20_000 });
    for (const wrong of ['0000', '1111', '2222', '3333', '5555']) {
      await b.locator('#pin-login-input').fill(wrong);
      await b.locator('#screen-pin-verify button[onclick="submitPinVerification()"]').click();
      await expect.poll(() => suktum.lastToast(b)).toBe('Code incorrect');
    }
    await b.locator('#pin-login-input').fill('4321');
    await b.locator('#screen-pin-verify button[onclick="submitPinVerification()"]').click();
    await expect.poll(() => suktum.lastToast(b), { timeout: 15_000 }).toContain('Trop de tentatives');
    await expect(b.locator('#screen-pin-verify')).toHaveClass(/active/, { timeout: 20_000 });
  });
});
