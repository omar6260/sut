// Tests des règles Firestore (phase 04) sur l'émulateur : un cas autorisé et un cas refusé par classe.
// Lancer : npm run test:rules   (firebase emulators:exec … "node --test tests/rules")
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'suktum-dev',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
  });
  await env.clearFirestore();
});
after(async () => { await env?.cleanup(); });

const doc = (ctx, path) => ctx.firestore().doc(path);
const A = () => env.authenticatedContext('uidA').firestore();
const B = () => env.authenticatedContext('uidB').firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('non authentifié : tout est refusé', async () => {
  await assertFails(anon().doc('kv_post/p1').get());
  await assertFails(anon().doc('kv_post/p1').set({ data: {}, owner: 'x' }));
});

test('PUBLIC_PROPRIETAIRE (kv_post) : A crée, B lit et modifie (écriture croisée tolérée en phase 04), owner immuable', async () => {
  await assertSucceeds(A().doc('kv_post/p1').set({ data: { caption: 'a' }, owner: 'uidA' }));
  await assertSucceeds(B().doc('kv_post/p1').get());
  await assertSucceeds(B().doc('kv_post/p1').update({ data: { caption: 'b', likes: ['uidB'] } }));
  await assertFails(B().doc('kv_post/p1').update({ owner: 'uidB' }));
  await assertFails(B().doc('kv_post/p2').set({ data: {}, owner: 'uidA' })); // créer au nom d'un autre
});

test('PRIVE en kv_ (kv_cart) : propriétaire seul', async () => {
  await assertSucceeds(A().doc('kv_cart/Awa').set({ data: [{ productId: 'x' }], owner: 'uidA' }));
  await assertSucceeds(A().doc('kv_cart/Awa').get());
  await assertFails(B().doc('kv_cart/Awa').get());
  await assertFails(B().doc('kv_cart/Awa').update({ data: [] }));
});

test('espace privé users/{uid}/private : propriétaire seul', async () => {
  await assertSucceeds(A().doc('users/uidA/private/settings:theme').set({ data: 'light' }));
  await assertFails(B().doc('users/uidA/private/settings:theme').get());
  await assertFails(B().doc('users/uidA/private/settings:theme').set({ data: 'dark' }));
});

test('kv_settings : réglages plateforme inscriptibles, secrets et rôles en lecture seule', async () => {
  await assertSucceeds(A().doc('kv_settings/maintenanceMode').set({ data: { enabled: false }, owner: 'uidA' }));
  await assertSucceeds(B().doc('kv_settings/maintenanceMode').get());
  await assertFails(A().doc('kv_settings/geminiApiKey').set({ data: 'AIza…', owner: 'uidA' }));
  await assertFails(A().doc('kv_settings/moderators').set({ data: [], owner: 'uidA' }));
  await env.withSecurityRulesDisabled(async (ctx) => ctx.firestore().doc('kv_settings/moderators').set({ data: [{ name: 'M' }], owner: 'admin' }));
  await assertSucceeds(A().doc('kv_settings/moderators').get());
  await assertFails(A().doc('kv_settings/moderators').update({ data: [] }));
});

test('collections hors kv_ : refusées', async () => {
  await assertFails(A().doc('autre/x').set({ data: 1, owner: 'uidA' }));
  await assertFails(A().doc('users/uidA').set({ x: 1 }));
});
