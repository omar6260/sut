// Garantit : un utilisateur crée un compte depuis l'écran d'accueil, arrive sur le fil,
// et reste connecté après rechargement de la page (session = `settings:username` en stockage privé).
import { test, expect } from '../support/fixtures.js';

test.describe('Inscription', () => {
  test('création de compte, rechargement, compte toujours connecté', async ({ suktum }) => {
    const page = await suktum.openDevice('A');
    await suktum.signUp(page, 'Awa_Dakar');

    // Le compte est bien enregistré dans l'espace partagé, la session dans l'espace privé.
    expect((await suktum.storage.readJSON('user:Awa_Dakar'))).toMatchObject({ username: 'Awa_Dakar', country: 'Sénégal', status: 'active', isMinor: false });
    expect((await suktum.storage.readJSON('settings:username', false, 'A'))).toBe('Awa_Dakar');

    await suktum.reload(page);
    await expect(page.locator('#screen-feed')).toHaveClass(/active/);
    await expect(page.locator('#screen-onboarding')).not.toHaveClass(/active/);
    expect(suktum.errors).toEqual([]);
  });

  test('un nom d’utilisateur vide est refusé', async ({ suktum }) => {
    const page = await suktum.openDevice('A');
    await page.locator('#onboard-country').selectOption({ label: 'Sénégal' });
    await page.locator('#onboard-age-adult-btn').click();
    await page.locator('#screen-onboarding button', { hasText: 'Commencer' }).click();
    await expect(page.locator('#screen-onboarding')).toHaveClass(/active/);
    expect((await suktum.storage.readJSON('settings:username', false, 'A'))).toBeNull();
  });

  test('deux appareils, deux comptes : les sessions privées sont isolées', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    const b = await suktum.openDevice('B');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.signUp(b, 'Moussa_Thies');
    expect((await suktum.storage.readJSON('settings:username', false, 'A'))).toBe('Awa_Dakar');
    expect((await suktum.storage.readJSON('settings:username', false, 'B'))).toBe('Moussa_Thies');
    expect((await suktum.storage.list(null, 'user:', true)).keys).toEqual(['user:Awa_Dakar', 'user:Moussa_Thies']);
  });
});
