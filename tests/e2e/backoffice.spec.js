// Garantit (phase 05) : l'accès caché (5 taps sur l'avatar) n'ouvre le back-office que si le compte porte un rôle
// (custom claim posé côté serveur) ; sans rôle, refus ; la vue d'ensemble affiche des compteurs cohérents.
// Plus aucun mot de passe d'administration côté client (backend mémoire : le back-office n'est pas testable, seul le refus l'est).
import { test, expect, BACKEND } from '../support/fixtures.js';

async function fiveTaps(page) {
  await page.locator('.tab[data-screen="profile"]').click();
  await expect(page.locator('#screen-profile')).toHaveClass(/active/);
  const avatar = page.locator('#profile-avatar');
  for (let i = 0; i < 5; i++) await avatar.click();
}

test.describe('Back-office', () => {
  test.skip(BACKEND !== 'firebase', 'back-office = rôles en custom claims (backend firebase)');

  test('sans rôle : 5 taps ne donnent pas accès', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    await fiveTaps(a);
    await expect(a.locator('#screen-admin')).not.toHaveClass(/active/);
    await expect.poll(() => suktum.lastToast(a)).toBe('Accès réservé à l’équipe Suktum');
    await expect(a.locator('#screen-profile')).toHaveClass(/active/);
  });

  test('super-admin (claim serveur) : accès, vue d’ensemble ; moins de 5 taps ne révèle rien', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Gorgui_Faye');
    await suktum.dismissTour(a);
    await suktum.grantRole(a, { superadmin: true, adminName: 'Gorgui' });
    await a.locator('.tab[data-screen="profile"]').click();
    for (let i = 0; i < 4; i++) await a.locator('#profile-avatar').click();
    await expect(a.locator('#screen-admin')).not.toHaveClass(/active/);
    await a.waitForTimeout(2200); // la fenêtre de 5 taps est de 2 s
    await fiveTaps(a);
    await expect(a.locator('#screen-admin')).toHaveClass(/active/);
    await expect(a.locator('#admin-stat-users')).toHaveText('1');
    await expect(a.locator('#admin-stat-posts')).toHaveText('0');
    await expect(a.locator('#overview-new-users')).toHaveText('1');
    expect(await suktum.storage.readJSON('settings:adminpin_hash')).toBeNull();
    expect(suktum.errors).toEqual([]);
  });

  test('modérateur (claim) : accès avec périmètre restreint', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Modo_Thies');
    await suktum.dismissTour(a);
    await suktum.grantRole(a, { moderator: true, country: 'Sénégal', adminName: 'Modo' });
    await fiveTaps(a);
    await expect(a.locator('#screen-admin')).toHaveClass(/active/);
    expect(await a.evaluate(() => ({ isModerator, adminScope, isGenuineOwnerSession }))).toEqual({ isModerator: true, adminScope: 'Sénégal', isGenuineOwnerSession: false });
  });
});
