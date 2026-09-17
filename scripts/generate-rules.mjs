// Génère firestore.rules depuis docs/inventaire/classification.md — jamais écrit à la main.
// Usage : node scripts/generate-rules.mjs [--phase 04|06]
//   04 (défaut) : PRIVE → propriétaire ; secrets/rôles de kv_settings → lecture seule ; le reste : tout utilisateur authentifié.
//   06          : classification complète (SERVEUR_SEUL et ADMIN en lecture seule côté client).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const phaseIdx = process.argv.indexOf('--phase');
const phase = phaseIdx > 0 ? process.argv[phaseIdx + 1] : '04';
const md = await readFile(path.join(root, 'docs', 'inventaire', 'classification.md'), 'utf8');
const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Préfixe') ).map((l) => l.split('|').slice(1, 3).map((c) => c.trim())).filter(([p, c]) => /^[a-zA-Z0-9_]+$/.test(p));
const byClass = {};
for (const [p, c] of rows) (byClass[c] = byClass[c] || []).push(`kv_${p}`);

// Sous-clés de kv_settings en lecture seule dès la phase 04 (secrets, rôles avec hash) — groupes « clés API » et « rôles et accès ».
const SETTINGS_READ_ONLY = ['geminiApiKey', 'gcvVisionKey', 'gcvVideoKey', 'google_vision_api_key', 'google_video_api_key', 'weatherApiKey', 'yangoApiKey', 'governanceAIProvider',
  'admin_backup_codes', 'adminpin_hash', 'moderators', 'regionaladmins', 'payoutspecialists', 'customroles', 'techteammembers'];
// Phase 05 : `adminpin_hash` n'est plus ni lu ni écrit par le client (rôles en custom claims).

const list = (arr) => '[' + arr.map((x) => `'${x}'`).join(', ') + ']';
const priv = byClass.PRIVE || [];
const readOnly = phase === '06' ? [...(byClass.SERVEUR_SEUL || []), ...(byClass.ADMIN || [])] : [];

const rules = `rules_version = '2';
// GÉNÉRÉ par scripts/generate-rules.mjs (phase ${phase}) depuis docs/inventaire/classification.md — ne pas éditer à la main.
service cloud.firestore {
  match /databases/{database}/documents {
    function authed() { return request.auth != null; }
    function isOwner() { return resource != null && resource.data.owner == request.auth.uid; }
    function ownerUnchanged() { return !('owner' in request.resource.data) || ('owner' in resource.data && request.resource.data.owner == resource.data.owner); }
    function isPrivate(c) { return c in ${list(priv)}; }
    function isReadOnly(c) { return c in ${list(readOnly)}; }
    function isKv(c) { return c.matches('kv_.*') && c != 'kv_settings'; }

    // Espace privé (shared = false dans le legacy) : le propriétaire seul.
    match /users/{uid}/private/{doc} {
      allow read, write: if authed() && request.auth.uid == uid;
    }

    // Réglages partagés : lecture par tous les authentifiés ; secrets et rôles en lecture seule côté client.
    match /kv_settings/{id} {
      allow read: if authed() && !(id in ${list([...SETTINGS_READ_ONLY, 'adminpin_hash'])});
      allow create: if authed() && !(id in ${list(SETTINGS_READ_ONLY)}) && request.resource.data.owner == request.auth.uid;
      allow update: if authed() && !(id in ${list(SETTINGS_READ_ONLY)}) && ownerUnchanged();
      allow delete: if authed() && !(id in ${list(SETTINGS_READ_ONLY)});
    }

    // usernames/, auth_secrets/, auth_attempts/ : serveur uniquement (aucune règle → refusé).
    // Collections kv_<prefixe> (shared = true dans le legacy).
    match /{collection}/{id} {
      allow read: if authed() && isKv(collection) && (!isPrivate(collection) || isOwner());
      allow create: if authed() && isKv(collection) && !isReadOnly(collection) && request.resource.data.owner == request.auth.uid;
      allow update: if authed() && isKv(collection) && !isReadOnly(collection) && ownerUnchanged() && (!isPrivate(collection) || isOwner());
      allow delete: if authed() && isKv(collection) && !isReadOnly(collection) && (!isPrivate(collection) || isOwner());
    }
  }
}
`;
await writeFile(path.join(root, 'firestore.rules'), rules);
console.log(`firestore.rules (phase ${phase}) : ${rows.length} préfixes — PRIVE ${priv.length}, lecture seule ${readOnly.length} + ${SETTINGS_READ_ONLY.length} sous-clés settings`);
