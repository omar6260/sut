// Encodage réversible clé legacy ↔ chemin Firestore. Script classique (portée globale via window.SuktumPlatform).
// Clé legacy : '<prefixe>:<id>' (ex. 'post:post_123', 'enrollment:c1__awa', 'settings:theme').
// Document Firestore : collection 'kv_<prefixe>', ID = id encodé. Contraintes Firestore : pas de '/', pas de '' , '.' ou '..',
// pas de forme '__x__', ≤ 1500 octets. On encode '%' et '/' (percent-encoding), plus les cas limites ci-dessous.
(function () {
  const PLATFORM = (window.SuktumPlatform = window.SuktumPlatform || {});

  function splitKey(key) {
    if (typeof key !== 'string' || key.length === 0) throw new TypeError('storage : la clé doit être une chaîne non vide');
    const i = key.indexOf(':');
    if (i <= 0) throw new TypeError(`storage : clé sans préfixe "${key}"`);
    return { prefix: key.slice(0, i), id: key.slice(i + 1) };
  }

  function encodeId(id) {
    let s = id.replace(/%/g, '%25').replace(/\//g, '%2F');
    if (s === '') s = '%00';
    else if (s === '.') s = '%2E';
    else if (s === '..') s = '%2E%2E';
    else if (/^__.*__$/.test(s)) s = '%5F' + s.slice(1); // '__x__' est réservé par Firestore
    return s;
  }

  function decodeId(docId) {
    if (docId === '%00') return '';
    return docId.replace(/%5F/g, '_').replace(/%2E/g, '.').replace(/%2F/g, '/').replace(/%25/g, '%');
  }

  // Chemin Firestore d'une clé. `privateUid` : uid du propriétaire pour l'espace privé (shared = false).
  // `deviceId` : l'espace privé est par (utilisateur, appareil) — ID = encode('<deviceId>|<clé>').
  function pathFor(key, shared, privateUid, deviceId) {
    const { prefix, id } = splitKey(key);
    if (shared) return { collection: `kv_${prefix}`, docId: encodeId(id), prefix, id };
    if (!privateUid) throw new Error('storage : espace privé sans utilisateur');
    return { collection: `users/${privateUid}/private`, docId: encodeId((deviceId || 'default') + '|' + key), prefix, id };
  }
  const privateKeyOf = (docId, deviceId) => { const raw = decodeId(docId); const head = (deviceId || 'default') + '|'; return raw.startsWith(head) ? raw.slice(head.length) : null; };

  PLATFORM.keys = { splitKey, encodeId, decodeId, pathFor, privateKeyOf };
})();
