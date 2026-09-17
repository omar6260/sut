// Mesure (backend Firebase uniquement) : lectures Firestore par écran, avec un jeu de données minimal.
// Sert au rapport de la phase 04 et au suivi des chemins chauds (phase 08). Ne fait échouer que si la mesure est impossible.
import { test, expect, BACKEND } from '../support/fixtures.js';
import { photoFile } from '../support/fixtures-media.js';

test.skip(BACKEND !== 'firebase', 'mesure des lectures Firestore : backend firebase seulement');

test('lectures Firestore par écran', async ({ suktum }, testInfo) => {
  const a = await suktum.openDevice('A');
  await suktum.signUp(a, 'Awa_Dakar');
  await suktum.dismissTour(a);
  // Jeu minimal : 3 publications, 1 cours actif.
  for (let i = 0; i < 3; i++) await suktum.storage.writeJSON(`post:post_${i}`, { id: `post_${i}`, userId: 'Awa_Dakar', type: 'image', data: 'data:image/png;base64,iVBORw0KGgo=', caption: `p${i}`, likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0, status: 'published', createdAt: new Date().toISOString() });
  await suktum.storage.writeJSON('course:course_1', { id: 'course_1', trainerUsername: 'Prof', title: 'Cours', price: 1000, status: 'active', createdAt: new Date().toISOString() });

  const measure = async (label, action) => {
    const before = await a.evaluate(() => ({ ...window.SuktumPlatform.stats }));
    await action();
    await a.waitForTimeout(1500); // laisse finir les rendus asynchrones
    const after = await a.evaluate(() => ({ ...window.SuktumPlatform.stats }));
    return { label, reads: after.reads - before.reads, cacheHits: after.cacheHits - before.cacheHits, writes: after.writes - before.writes };
  };
  const rows = [];
  rows.push(await measure('fil (go feed)', async () => { await a.evaluate(() => go('feed')); }));
  rows.push(await measure('profil', async () => { await a.locator('.tab[data-screen="profile"]').click(); }));
  rows.push(await measure('liste des cours', async () => { await a.evaluate(() => { enterEducationSpaceNormally(); }); await a.evaluate(() => go('education-courses')); }));
  await suktum.grantRole(a, { superadmin: true, adminName: 'Gorgui' });
  rows.push(await measure('back-office (connexion)', async () => {
    await a.locator('.tab[data-screen="profile"]').click();
    for (let i = 0; i < 5; i++) await a.locator('#profile-avatar').click();
    await expect(a.locator('#screen-admin')).toHaveClass(/active/);
  }));
  const byPrefix = await a.evaluate(() => Object.entries(window.SuktumPlatform.stats.byPrefix).sort((x, y) => y[1].reads - x[1].reads).slice(0, 8).map(([p, s]) => `${p}=${s.reads}`).join(', '));
  const report = rows.map((r) => `| ${r.label} | ${r.reads} | ${r.cacheHits} | ${r.writes} |`).join('\n');
  console.log(`\n| Écran | Lectures Firestore | Lectures évitées (cache) | Écritures |\n|---|---|---|---|\n${report}\n\nTop préfixes (cumul) : ${byPrefix}\n`);
  await testInfo.attach('lectures.md', { body: report, contentType: 'text/markdown' });
  expect(rows.every((r) => r.reads >= 0)).toBe(true);
});
