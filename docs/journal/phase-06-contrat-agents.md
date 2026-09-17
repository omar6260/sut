# Phase 06 — Contrat commun aux agents (à lire avant toute modification)

## Contexte à lire d'abord
`CLAUDE.md`, `docs/ARCHITECTURE-CIBLE.md`, `docs/inventaire/logique-sensible.md` (ton domaine), `docs/inventaire/ecritures-croisees.md`, `docs/inventaire/prefixes.md` (structures), `docs/journal/phase-05.md` (identité : uid, `usernames/{nom} → uid`, claims), `functions/src/lib/kv.ts` (helpers), `src/platform/auth.js` (`SuktumPlatform.api.call(name, data)`), `src/platform/legacy-overrides.js` (exemple de surcharge), `tests/support/fixtures.js` (`suktum.*`, `cheatWrite`, `grantRole`).

## Où écrire (et où ne PAS écrire)
- Serveur : `functions/src/<domaine>/index.ts` uniquement (+ `functions/test/<domaine>.test.ts`). **N'édite pas** `functions/src/index.ts` : liste tes exports dans ton rapport final, l'orchestrateur les câble.
- Client : `src/platform/overrides/<NN>-<domaine>.js` (script classique, IIFE, réassigne les fonctions globales du legacy ; s'exécute avant `initIdentity()`). **N'édite pas** `legacy-overrides.js`, `boot.js`, `storage-adapter.js`, `scripts/build.mjs`, `scripts/generate-rules.mjs`.
- Legacy (`src/legacy/js/*.js`) : seulement pour **vider** le corps d'une fonction que tu surcharges (garde le nom, remplace le corps par `/* phase 06 : logique serveur — voir src/platform/overrides/<fichier> */` + `return;`) ou retirer un bloc lecture → calcul → écriture. Jamais de reformatage, jamais de renommage, jamais d'édition hors de ton domaine. `legacy/` (racine) est interdit.
- Tests e2e : `tests/e2e/<domaine>-serveur.spec.js` (backend firebase : `test.skip(BACKEND !== 'firebase')`), avec un test « tentative de triche » via `suktum.cheatWrite(page, 'coinbalance:Awa', 999999)` attendu `'permission-denied'` **une fois les règles strictes actives** (les règles strictes sont générées par l'orchestrateur : écris le test, marque-le `test.fixme` si tu ne peux pas le vérifier).
- Ne lance pas `firebase deploy`. Émulateurs : `npm run test:e2e:firebase`, `npm run test:rules`, `npm --prefix functions test`.

## Conventions serveur
- `onCall({ region: REGION })`, entrée validée par **zod**, `requireAuth` / `requireUsername(req, username)` (le client passe `currentUser`) / `requireRole(req, [...])`.
- Toute opération dépendant d'une lecture = **transaction** (`db().runTransaction`) avec `kvGet(key, tx)` / `kvSet(key, data, tx, ownerIfNew)`. Montants FCFA en entiers, **mêmes taux, mêmes arrondis, mêmes messages** que le legacy (cite la ligne legacy en commentaire).
- Retour : `{ ok: true, touched: ['prefixe:id', …], ...résultat }` — `touched` liste les clés modifiées (le client invalide son cache).
- Notifications : garder la forme `notif:` du legacy (`createNotification` l. 11452 : `{ id, toUser, type, fromUser, postId, text, read, createdAt }`), écrites côté serveur via `kvSet('notif:'+id, …, tx, 'server')`.
- Journal admin : `audit(actorName, actorRole, action, detail)`.
- Secrets : `defineSecret('NOM')` uniquement ; en émulateur, valeur absente = comportement « IA indisponible » du legacy (catch).

## Conventions client (overrides)
- Reproduire **exactement** les toasts et l'enchaînement d'écrans du legacy ; en cas d'erreur serveur, afficher `e.message`.
- Après un appel, relire via les fonctions de rendu existantes (`renderFeed()`, `renderProfile()` …), jamais de rendu ad hoc.
- Aucun calcul de montant côté client : le serveur renvoie ce qui doit être affiché.

## Rapport final attendu (format strict)
1. `### FONCTIONS` — tableau : nom | entrée (zod) | contrôles | effets (clés `touched`) | sortie | ligne legacy remplacée.
2. `### EXPORTS` — la ligne `export { … } from './<domaine>/index.js';` à ajouter dans `functions/src/index.ts`.
3. `### PREFIXES_SERVEUR` — préfixes désormais écrits **uniquement** par le serveur (pour les règles strictes).
4. `### TESTS` — fichiers ajoutés et résultat brut (`npm --prefix functions test`, e2e du domaine).
5. `### RESTE` — ce qui n'est pas couvert, avec ligne legacy.
Commits : Conventional Commits en français, sur ta branche de worktree, sans push.
