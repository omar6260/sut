# Phase 04 — Adaptateur `window.storage` sur Firestore (données persistantes)

## Objectif
Rendre Suktum persistant et multi-appareils **sans modifier les ~2 100 appels métier**, en réimplémentant l'interface `window.storage` sur Firestore.

## Prérequis
Phases 01 à 03 terminées. `docs/inventaire/prefixes.md` et `classification.md` validés.
Commence en mode Plan : demande à l'`architecte` un plan découpé, soumets-le à Oumar, puis confie l'exécution à `dev-backend` et `dev-frontend`.

## Spécification de `src/platform/storage-adapter.js`
- Interface identique au legacy : `get`, `set`, `delete`, `list`, mêmes formes de retour, mêmes erreurs levées (le legacy attrape les exceptions dans `safeGet` et affiche un toast dans `saveWithRetry`).
- Correspondance : voir `docs/ARCHITECTURE-CIBLE.md`.
  - `shared = true` → `kv_<prefixe>/<idEncodé>` avec `{ data, owner, updatedAt }`
  - `shared = false` → `users/{uid}/private/<cléEncodée>`
  - Encodage réversible des ID (tests unitaires : `/`, `__`, espaces, accents, emojis, clé vide).
- `set` : `value` arrive en chaîne JSON → la stocker parsée dans `data` ; `get` renvoie `value` re-sérialisé. Si la valeur dépasse 900 Ko, lever une erreur explicite et journaliser le préfixe (les médias base64 seront traités en phase 07).
- `owner` : fixé à la création à l'`uid` courant, jamais modifié ensuite.
- `list(prefix)` :
  - `'post:'` → tous les ID de `kv_post` ;
  - `'enrollment:c1__'` → requête par plage d'ID ;
  - `''` (liste globale, ligne ~29 433) → interdit côté client : lever une erreur et noter la fonction serveur à créer en phase 06.
- **Cache anti N+1 (risque C1)** : `list` récupère les documents complets et alimente un cache mémoire ; les `get` suivants sur ces clés dans les 10 secondes lisent le cache. `set` et `delete` invalident la clé. Compteur de lectures Firestore exposé dans `window.SuktumPlatform.stats` pour les tests.
- Mode hors-ligne désactivé à ce stade.

## Branchement
- `src/platform/firebase.js` : initialisation (config par variables de build), connexion aux émulateurs en local.
- Injection de `window.storage = createStorageAdapter(...)` **avant** le premier script legacy, et attente de l'initialisation de l'authentification avant tout appel.
- Authentification provisoire pour cette phase : Firebase Auth **anonyme**. (La vraie authentification arrive en phase 05.)

## Règles Firestore provisoires
Générées depuis `classification.md` par `scripts/generate-rules.mjs` (pas écrites à la main).
Pour cette phase : PUBLIC_PROPRIETAIRE et PARTICIPANTS en lecture/écriture pour tout utilisateur authentifié (les écritures croisées fonctionnent encore), PRIVE limité au propriétaire, **SERVEUR_SEUL et ADMIN en lecture seule**. Note dans le journal chaque fonctionnalité que ce blocage casse : c'est la liste de travail de la phase 06.

## Tests
- Unitaires de l'adaptateur contre l'émulateur : aller-retour de valeurs, list par préfixe et par plage, delete, erreurs, cache.
- La suite e2e de la phase 01 tourne maintenant contre l'émulateur (plus de stockage mémoire). Deux navigateurs = deux utilisateurs anonymes distincts.
- Mesure et consigne dans le journal le nombre de lectures Firestore pour : ouverture du fil, profil, liste des cours, back-office.

## Définition de « terminé »
Tests verts (hors fonctionnalités bloquées par SERVEUR_SEUL, listées) ; rapport de lectures par écran ; revue `auditeur-securite` sans bloquant ; commit.
