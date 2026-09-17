// Backend de test « Firestore » : même API que MemoryStorage (readJSON / writeJSON / list / snapshot), mais lit et écrit
// dans l'émulateur Firestore via firebase-admin (contourne les règles). Sert aux assertions et à la préparation d'état.
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const keys = (() => { global.window = global.window || {}; require('../../src/platform/storage-keys.js'); return global.window.SuktumPlatform.keys; })();

export const PROJECT_ID = 'suktum-dev';
export const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
export const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

let app;
export function db() {
  if (!app) app = getApps().length ? getApp() : initializeApp({ projectId: PROJECT_ID });
  return getFirestore(app);
}

/** Vide Firestore et les comptes Auth de l'émulateur (avant chaque test). */
export async function clearEmulator() {
  await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

export class FirestoreStorage {
  constructor() { this.uids = new Map(); } // deviceId → uid (rempli par la fixture après l'auth anonyme)
  registerDevice(deviceId, uid) { this.uids.set(deviceId, uid); }
  uidOf(deviceId) { return this.uids.get(deviceId); }
  /** Pose des custom claims sur le compte d'un appareil (ex. { superadmin: true }) — action réservée au serveur. */
  async setClaims(deviceId, claims) {
    // API REST de l'émulateur Auth (évite d'importer firebase-admin/auth dans le processus Playwright).
    const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:update`, {
      method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: this.uids.get(deviceId), customAttributes: JSON.stringify(claims) }),
    });
    if (!res.ok) throw new Error(`setClaims : ${res.status} ${await res.text()}`);
  }
  #path(key, shared, deviceId) {
    const uid = shared ? null : this.uids.get(deviceId);
    if (!shared && !uid) throw new Error(`FirestoreStorage : uid inconnu pour l'appareil "${deviceId}"`);
    return keys.pathFor(key, !!shared, uid);
  }
  async readJSON(key, shared = true, deviceId = null) {
    const { collection, docId } = this.#path(key, shared, deviceId);
    const snap = await db().collection(collection).doc(docId).get();
    return snap.exists ? snap.data().data : null;
  }
  async writeJSON(key, value, shared = true, deviceId = null) {
    const { collection, docId } = this.#path(key, shared, deviceId);
    const doc = { data: value, updatedAt: FieldValue.serverTimestamp() };
    if (shared) doc.owner = 'test-fixture';
    await db().collection(collection).doc(docId).set(doc, { merge: true });
  }
  async list(deviceId, prefix = '', shared = true) {
    const { prefix: p, id } = keys.splitKey(prefix.includes(':') ? prefix : prefix + ':');
    let q = shared ? db().collection(`kv_${p}`) : db().collection(`users/${this.uids.get(deviceId)}/private`);
    const raw = shared ? id : prefix;
    const start = raw ? keys.encodeId(raw) : '';
    if (start) q = q.where(FieldPath.documentId(), '>=', start).where(FieldPath.documentId(), '<', start + '');
    const snap = await q.get();
    const out = snap.docs.map((d) => (shared ? `${p}:${keys.decodeId(d.id)}` : keys.decodeId(d.id))).sort();
    return { keys: out, prefix, shared: !!shared };
  }
}
