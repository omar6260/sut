// Tests unitaires de l'adaptateur window.storage → Firestore contre l'émulateur (règles actives).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const require = createRequire(import.meta.url);
global.window = { firebase };
require('../../src/platform/storage-keys.js');
require('../../src/platform/storage-adapter.js');
const PLATFORM = global.window.SuktumPlatform;

let env, storageA, storageB;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'suktum-dev', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 } });
  await env.clearFirestore();
  const make = (uid) => PLATFORM.createStorageAdapter({ db: env.authenticatedContext(uid).firestore(), getUid: () => uid, ready: Promise.resolve(uid), FieldValue: firebase.firestore.FieldValue });
  storageA = make('uidA'); storageB = make('uidB');
});
after(async () => { await env?.cleanup(); });

test('aller-retour partagé : formes de retour du legacy', async () => {
  assert.equal(await storageA.get('post:p1', true), null);
  const set = await storageA.set('post:p1', JSON.stringify({ caption: 'Ma pirogue', likes: [] }), true);
  assert.deepEqual(set, { key: 'post:p1', value: '{"caption":"Ma pirogue","likes":[]}', shared: true });
  storageA._cache.clear();
  const got = await storageA.get('post:p1', true);
  assert.deepEqual(got, { key: 'post:p1', value: '{"caption":"Ma pirogue","likes":[]}', shared: true });
  assert.deepEqual(await storageA.delete('post:p1', true), { key: 'post:p1', deleted: true, shared: true });
  assert.equal(await storageA.get('post:p1', true), null);
});

test('privé : isolé par utilisateur, clés spéciales', async () => {
  await storageA.set('settings:username', JSON.stringify('Awa'), false);
  await storageB.set('settings:username', JSON.stringify('Moussa'), false);
  storageA._cache.clear(); storageB._cache.clear();
  assert.equal((await storageA.get('settings:username', false)).value, '"Awa"');
  assert.equal((await storageB.get('settings:username', false)).value, '"Moussa"');
  await storageA.set('draft:a/b c.é🚀', JSON.stringify(1), false);
  storageA._cache.clear();
  assert.equal((await storageA.get('draft:a/b c.é🚀', false)).value, '1');
});

test('list par préfixe et par plage, et cache anti N+1', async () => {
  await storageA.set('enrollment:c1__awa', JSON.stringify({ s: 'awa' }), true);
  await storageA.set('enrollment:c1__ibou', JSON.stringify({ s: 'ibou' }), true);
  await storageA.set('enrollment:c2__awa', JSON.stringify({ s: 'awa' }), true);
  storageA._cache.clear();
  const all = await storageA.list('enrollment:', true);
  assert.deepEqual(all.keys.sort(), ['enrollment:c1__awa', 'enrollment:c1__ibou', 'enrollment:c2__awa']);
  const range = await storageA.list('enrollment:c1__', true);
  assert.deepEqual(range, { keys: ['enrollment:c1__awa', 'enrollment:c1__ibou'], prefix: 'enrollment:c1__', shared: true });
  const before = PLATFORM.stats.reads;
  await storageA.get('enrollment:c1__awa', true); await storageA.get('enrollment:c1__ibou', true);
  assert.equal(PLATFORM.stats.reads, before, 'les get après list viennent du cache');
  assert.ok(PLATFORM.stats.cacheHits >= 2);
});

test('écriture croisée : B modifie le doc de A sans toucher owner ; liste globale interdite ; valeur trop grande', async () => {
  await storageA.set('post:p2', JSON.stringify({ likes: [] }), true);
  await storageB.set('post:p2', JSON.stringify({ likes: ['B'] }), true); // B n'a pas le doc en cache → set refusé (owner) → repli update
  storageA._cache.clear();
  assert.equal((await storageA.get('post:p2', true)).value, '{"likes":["B"]}');
  await assert.rejects(storageA.list('', true), /liste globale/);
  await assert.rejects(storageA.set('post:big', JSON.stringify('x'.repeat(950 * 1024)), true), /trop grande/);
  assert.equal(PLATFORM.oversized[0].prefix, 'post');
});
