// Implémentation en mémoire de l'interface `window.storage` fournie par l'environnement Claude.
//
// Formes de retour observées dans le legacy (legacy/suktum-app.html) :
//   get(key, shared)     → { key, value, shared } ou null si absent      (l. 6896, 7078-7080, 29438-29439)
//   set(key, value, shared) → { key, value, shared }                     (l. 6904, 7075) — `value` est une chaîne JSON
//   delete(key, shared)  → { key, deleted: true, shared } ; promesse (l. 7081 : `.catch(() => {})`)
//   list(prefix, shared) → { keys: string[], prefix, shared }             (l. 6900, 29433-29434)
//
// Deux espaces : un espace PARTAGÉ commun à tous les utilisateurs de test (shared = true),
// et un espace PRIVÉ par « appareil » de test (shared = false), identifié par `deviceId`.

export class MemoryStorage {
  constructor() {
    this.shared = new Map();
    this.private = new Map(); // deviceId → Map
  }

  #space(deviceId, shared) {
    if (shared) return this.shared;
    if (!this.private.has(deviceId)) this.private.set(deviceId, new Map());
    return this.private.get(deviceId);
  }

  get(deviceId, key, shared = false) {
    assertKey(key);
    const space = this.#space(deviceId, shared);
    if (!space.has(key)) return null;
    return { key, value: space.get(key), shared: !!shared };
  }

  set(deviceId, key, value, shared = false) {
    assertKey(key);
    if (typeof value !== 'string') throw new TypeError(`storage.set : la valeur de "${key}" doit être une chaîne (reçu ${typeof value})`);
    this.#space(deviceId, shared).set(key, value);
    return { key, value, shared: !!shared };
  }

  delete(deviceId, key, shared = false) {
    assertKey(key);
    this.#space(deviceId, shared).delete(key);
    return { key, deleted: true, shared: !!shared };
  }

  list(deviceId, prefix = '', shared = false) {
    if (typeof prefix !== 'string') throw new TypeError('storage.list : le préfixe doit être une chaîne');
    const keys = [...this.#space(deviceId, shared).keys()].filter((k) => k.startsWith(prefix)).sort();
    return { keys, prefix, shared: !!shared };
  }

  /** Lecture directe (côté test) d'une valeur JSON, pratique pour les assertions. */
  readJSON(key, shared = true, deviceId = null) {
    const r = this.get(deviceId, key, shared);
    return r ? JSON.parse(r.value) : null;
  }

  /** Écriture directe (côté test) d'une valeur JSON, pour préparer un état. */
  writeJSON(key, value, shared = true, deviceId = null) {
    return this.set(deviceId, key, JSON.stringify(value), shared);
  }

  snapshot() {
    return {
      shared: Object.fromEntries(this.shared),
      private: Object.fromEntries([...this.private].map(([d, m]) => [d, Object.fromEntries(m)])),
    };
  }
}

function assertKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw new TypeError('storage : la clé doit être une chaîne non vide');
}

/**
 * Branche `window.storage` sur une page Playwright, avant tout script de la page.
 * Chaque page reçoit un `deviceId` : c'est son espace privé (= un téléphone).
 */
export async function installStorage(page, storage, deviceId) {
  await page.exposeBinding('__suktumStorage', (_source, op, key, value, shared) => {
    switch (op) {
      case 'get': return storage.get(deviceId, key, shared);
      case 'set': return storage.set(deviceId, key, value, shared);
      case 'delete': return storage.delete(deviceId, key, shared);
      case 'list': return storage.list(deviceId, key, shared);
      default: throw new Error(`storage : opération inconnue "${op}"`);
    }
  });
  await page.addInitScript(() => {
    window.__SUKTUM_STORAGE_INJECTED = true; // signale à src/platform/boot.js de ne pas initialiser Firebase
    const call = (op, key, value, shared) => window.__suktumStorage(op, key, value ?? null, !!shared);
    window.storage = {
      get: (key, shared) => call('get', key, null, shared),
      set: (key, value, shared) => call('set', key, value, shared),
      delete: (key, shared) => call('delete', key, null, shared),
      list: (prefix, shared) => call('list', prefix ?? '', null, shared),
    };
  });
}
