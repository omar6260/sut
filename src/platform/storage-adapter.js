// Adaptateur window.storage → Firestore (phase 04). Script classique. Interface et formes de retour identiques au legacy :
//   get(key, shared)        → { key, value, shared } | null      (value = chaîne JSON)
//   set(key, value, shared) → { key, value, shared }              (value chaîne JSON, stockée parsée dans `data`)
//   delete(key, shared)     → { key, deleted: true, shared }
//   list(prefix, shared)    → { keys, prefix, shared }
// Documents : kv_<prefixe>/<id> = { data, owner, updatedAt } ; privé : users/{uid}/private/<clé> = { data, updatedAt }.
(function () {
  const PLATFORM = (window.SuktumPlatform = window.SuktumPlatform || {});
  const MAX_VALUE_BYTES = 900 * 1024;
  const CACHE_TTL_MS = 10 * 1000;

  PLATFORM.createStorageAdapter = function createStorageAdapter({ db, getUid, deviceId, ready, FieldValue }) {
    const { decodeId, splitKey, privateKeyOf } = PLATFORM.keys;
    const pathFor = (key, shared, uid) => PLATFORM.keys.pathFor(key, shared, uid, deviceId);
    const stats = (PLATFORM.stats = PLATFORM.stats || { reads: 0, writes: 0, deletes: 0, cacheHits: 0, byPrefix: {} });
    const count = (kind, prefix, n = 1) => { stats[kind] += n; const p = (stats.byPrefix[prefix] = stats.byPrefix[prefix] || { reads: 0, writes: 0, deletes: 0, cacheHits: 0 }); p[kind] += n; };
    const cache = new Map(); // cacheKey → { value: string|null, at: ms }
    const cacheKey = (key, shared) => (shared ? 's:' : 'p:') + key;

    const toValue = (snap) => (snap.exists ? JSON.stringify(snap.data().data) : null);
    const remember = (key, shared, value) => cache.set(cacheKey(key, shared), { value, at: Date.now() });

    async function get(key, shared) {
      await ready;
      const c = cache.get(cacheKey(key, !!shared));
      if (c && Date.now() - c.at < CACHE_TTL_MS) { count('cacheHits', splitKey(key).prefix); return c.value === null ? null : { key, value: c.value, shared: !!shared }; }
      const { collection, docId, prefix } = pathFor(key, !!shared, getUid());
      const snap = await db.collection(collection).doc(docId).get();
      count('reads', prefix);
      const value = toValue(snap);
      remember(key, !!shared, value);
      return value === null ? null : { key, value, shared: !!shared };
    }

    async function set(key, value, shared) {
      await ready;
      if (typeof value !== 'string') throw new TypeError(`storage.set : la valeur de "${key}" doit être une chaîne JSON`);
      const { collection, docId, prefix } = pathFor(key, !!shared, getUid());
      if (value.length > MAX_VALUE_BYTES) {
        const err = new Error(`storage.set : valeur trop grande pour "${key}" (${Math.round(value.length / 1024)} Ko > 900 Ko) — préfixe ${prefix}, médias à traiter en phase 07`);
        (PLATFORM.oversized = PLATFORM.oversized || []).push({ key, prefix, bytes: value.length });
        console.warn(err.message);
        throw err;
      }
      const data = JSON.parse(value);
      const ref = db.collection(collection).doc(docId);
      const fields = { data, updatedAt: FieldValue.serverTimestamp() };
      const known = cache.get(cacheKey(key, !!shared));
      if (!shared) {
        await ref.set(fields, { merge: true });
      } else if (known && known.value !== null) {
        await ref.update(fields); // doc connu : `owner` intact
      } else {
        // Création (owner = uid courant). Si le doc existe avec un autre owner, les règles refusent → repli sur update.
        try { await ref.set({ ...fields, owner: getUid() }, { merge: true }); }
        catch (e) { if (e && e.code === 'permission-denied') await ref.update(fields); else throw e; }
      }
      count('writes', prefix);
      remember(key, !!shared, value);
      return { key, value, shared: !!shared };
    }

    async function del(key, shared) {
      await ready;
      const { collection, docId, prefix } = pathFor(key, !!shared, getUid());
      await db.collection(collection).doc(docId).delete();
      count('deletes', prefix);
      remember(key, !!shared, null);
      return { key, deleted: true, shared: !!shared };
    }

    async function list(prefix, shared) {
      await ready;
      if (typeof prefix !== 'string') throw new TypeError('storage.list : le préfixe doit être une chaîne');
      if (prefix === '') throw new Error('storage.list : la liste globale est interdite côté client (export → fonction serveur, phase 06)');
      const { prefix: coll, id: idPrefix } = splitKey(prefix.includes(':') ? prefix : prefix + ':');
      let snap;
      if (shared) {
        let q = db.collection(`kv_${coll}`);
        if (idPrefix) { const enc = PLATFORM.keys.encodeId(idPrefix); q = q.where(window.firebase.firestore.FieldPath.documentId(), '>=', enc).where(window.firebase.firestore.FieldPath.documentId(), '<', enc + ''); }
        snap = await q.get();
      } else {
        const enc = PLATFORM.keys.encodeId(prefix);
        snap = await db.collection(`users/${getUid()}/private`).where(window.firebase.firestore.FieldPath.documentId(), '>=', enc).where(window.firebase.firestore.FieldPath.documentId(), '<', enc + '').get();
      }
      count('reads', coll, Math.max(1, snap.size));
      const keys = [];
      snap.forEach((d) => {
        const key = shared ? `${coll}:${decodeId(d.id)}` : privateKeyOf(d.id, deviceId);
        if (key === null) return;
        keys.push(key);
        remember(key, !!shared, JSON.stringify(d.data().data)); // cache anti N+1 : les get suivants ne relisent pas
      });
      return { keys, prefix, shared: !!shared };
    }

    const invalidate = (...keys) => { for (const k of keys) { cache.delete('s:' + k); cache.delete('p:' + k); } };
    return { get, set, delete: del, list, invalidate, _cache: cache };
  };
})();
