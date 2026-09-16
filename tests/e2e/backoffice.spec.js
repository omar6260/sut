// Garantit : l'accès caché au back-office (5 taps sur l'avatar du profil), la création du mot de passe
// d'administration à la première visite, la connexion avec ce mot de passe, le refus d'un mauvais mot de passe,
// et l'affichage de la vue d'ensemble (compteurs).
//
// Caractérise aussi le comportement actuel — à corriger en phase 06 (DIAGNOSTIC C2) :
// le hash SHA-256 du mot de passe est écrit dans `settings:adminpin_hash`, lisible par tout client.
import { test, expect } from '../support/fixtures.js';
import { createHash } from 'node:crypto';

const ADMIN_PASSWORD = 'Pirogue#2026';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function openHiddenAdminLogin(page) {
  await page.locator('.tab[data-screen="profile"]').click();
  await expect(page.locator('#screen-profile')).toHaveClass(/active/);
  const avatar = page.locator('#profile-avatar');
  for (let i = 0; i < 5; i++) await avatar.click();
  await expect(page.locator('#screen-admin-login')).toHaveClass(/active/);
}

test.describe('Back-office', () => {
  test('accès caché, création du mot de passe, vue d’ensemble', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Gorgui_Faye');
    await suktum.dismissTour(a);

    await openHiddenAdminLogin(a);
    await expect(a.locator('#admin-login-desc')).toContainText('Première visite');
    await expect(a.locator('#admin-pin-input')).toHaveAttribute('data-mode', 'create');

    // Mot de passe trop faible refusé.
    await a.locator('#admin-pin-input').fill('faible');
    await a.locator('#screen-admin-login button[onclick="checkAdminPin()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Le mot de passe ne respecte pas encore toutes les règles');
    expect(suktum.storage.readJSON('settings:adminpin_hash')).toBeNull();

    // Mot de passe blindé accepté → back-office.
    await a.locator('#admin-pin-input').fill(ADMIN_PASSWORD);
    await a.locator('#screen-admin-login button[onclick="checkAdminPin()"]').click();
    await expect(a.locator('#screen-admin')).toHaveClass(/active/);
    expect(suktum.lastToast(a)).toBe('Mot de passe créé ✓');
    expect(suktum.storage.readJSON('settings:adminpin_hash')).toBe(sha256(ADMIN_PASSWORD));

    // Vue d'ensemble : compteurs cohérents avec l'état.
    await expect(a.locator('#admin-stat-users')).toHaveText('1');
    await expect(a.locator('#admin-stat-posts')).toHaveText('0');
    await expect(a.locator('#admin-stat-products')).toHaveText('0');
    await expect(a.locator('#overview-new-users')).toHaveText('1');

    expect(suktum.errors).toEqual([]);
  });

  test('connexion avec le mot de passe existant ; mauvais mot de passe refusé', async ({ suktum }) => {
    suktum.storage.writeJSON('settings:adminpin_hash', sha256(ADMIN_PASSWORD));
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Gorgui_Faye');
    await suktum.dismissTour(a);

    await openHiddenAdminLogin(a);
    await expect(a.locator('#admin-pin-input')).toHaveAttribute('data-mode', 'verify');

    await a.locator('#admin-pin-input').fill('Mauvais#2026');
    await a.locator('#screen-admin-login button[onclick="checkAdminPin()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Mot de passe incorrect');
    await expect(a.locator('#screen-admin-login')).toHaveClass(/active/);

    await a.locator('#admin-pin-input').fill(ADMIN_PASSWORD);
    await a.locator('#screen-admin-login button[onclick="checkAdminPin()"]').click();
    await expect(a.locator('#screen-admin')).toHaveClass(/active/);
    await expect(a.locator('#admin-stat-users')).toHaveText('1');
  });

  test('moins de 5 taps sur l’avatar ne révèle rien', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    await a.locator('.tab[data-screen="profile"]').click();
    const avatar = a.locator('#profile-avatar');
    for (let i = 0; i < 4; i++) await avatar.click();
    await expect(a.locator('#screen-profile')).toHaveClass(/active/);
    await expect(a.locator('#screen-admin-login')).not.toHaveClass(/active/);
  });
});
