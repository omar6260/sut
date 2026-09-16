// Garantit : le prototype se charge hors de l'environnement Claude (stockage simulé) sans erreur JavaScript,
// et affiche l'écran d'accueil (création de compte).
import { test, expect } from '../support/fixtures.js';

test.describe('Chargement', () => {
  test('aucune erreur JavaScript au chargement, écran d’accueil affiché', async ({ suktum }) => {
    const page = await suktum.openDevice('A');
    await expect(page.locator('#screen-onboarding')).toHaveClass(/active/);
    await expect(page.locator('#onboard-username')).toBeVisible();
    // Le stockage simulé répond : la langue/thème ont été lus sans lever d'erreur.
    await page.waitForLoadState('networkidle');
    expect(suktum.errors, 'erreurs JavaScript (pageerror)').toEqual([]);
  });

  test('le stockage simulé respecte les formes de retour du legacy', async ({ suktum }) => {
    const page = await suktum.openDevice('A');
    const result = await page.evaluate(async () => {
      const out = {};
      out.missing = await window.storage.get('test:absent', true);
      out.set = await window.storage.set('test:k', JSON.stringify({ a: 1 }), true);
      out.get = await window.storage.get('test:k', true);
      out.list = await window.storage.list('test:', true);
      out.del = await window.storage.delete('test:k', true);
      out.afterDel = await window.storage.get('test:k', true);
      out.privateIsolated = await window.storage.get('test:k', false);
      return out;
    });
    expect(result.missing).toBeNull();
    expect(result.set).toEqual({ key: 'test:k', value: '{"a":1}', shared: true });
    expect(result.get).toEqual({ key: 'test:k', value: '{"a":1}', shared: true });
    expect(result.list).toEqual({ keys: ['test:k'], prefix: 'test:', shared: true });
    expect(result.del).toEqual({ key: 'test:k', deleted: true, shared: true });
    expect(result.afterDel).toBeNull();
    expect(result.privateIsolated).toBeNull();
  });
});
