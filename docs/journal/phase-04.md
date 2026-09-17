# Phase 04 — Adaptateur `window.storage` sur Firestore

Date : 2026-09-17 · Branche : `phase-04-adaptateur` · Projet Firebase : `suktum-dev` (émulateurs)

## Fait
- `src/platform/storage-keys.js` : encodage réversible clé ↔ ID Firestore (14 cas limites testés : `/`, `%`, vide, `.`, `..`, `__x__`, espaces, accents, emojis).
- `src/platform/storage-adapter.js` : `get/set/delete/list`, formes de retour du legacy, `owner` fixé à la création (update sinon, repli pour les écritures croisées), cache anti-N+1 (10 s, `list` alimente les `get`), compteurs `SuktumPlatform.stats`, garde 900 Ko (`SuktumPlatform.oversized`), liste globale `''` interdite.
- `src/platform/boot.js` : Firebase compat servi localement (`dist/vendor/`), émulateurs sur localhost, **auth anonyme provisoire**, `window.storage` injecté avant le legacy ; inactif si un stockage de test est déjà injecté.
- `scripts/build.mjs --multi` insère SDK + plateforme avant les 20 scripts legacy ; `verify-split` reste IDENTIQUE.
- `scripts/generate-rules.mjs` → `firestore.rules` depuis `classification.md` (politique 04 ; `--phase 06` pour la politique complète). `storage.rules` : tout refusé.
- Tests : `npm run test:rules` (10/10 : 6 règles + 4 adaptateur sur émulateur) ; `npm run test:e2e:firebase` (**30/30** contre l'émulateur, 1,4 min) ; `npm run test:e2e` (mémoire) toujours 30/30.
- Projet `suktum-dev` + app Web créés ; `firebase.json`, `.firebaserc`, config publique dans `src/platform/firebase-config.js`.

## Écart assumé avec le prompt (décision, voir `decisions.md`)
Le prompt demandait SERVEUR_SEUL et ADMIN en lecture seule dès cette phase. La classification (phase 02) range `user`, `notif`, `order`, `enrollment`, `coinbalance`… en SERVEUR_SEUL : les bloquer aurait fait échouer l'inscription, chaque connexion (`coinbalance` l. 7236), chaque publication et chaque commande — contraire à « chaque fonctionnalité continue de fonctionner après chaque phase ». Politique 04 : PRIVE → propriétaire ; **secrets et listes de rôles** de `settings:` → lecture seule ; le reste ouvert aux authentifiés. Le générateur porte déjà la politique 06.

## Fonctionnalités bloquées ou changées (liste de travail phase 06)
| Fonction | Effet en 04 | Traitement |
|---|---|---|
| Saisie des clés API au back-office (l. 9541, 26288, 26434, 21428) | écriture refusée → toast « Connexion faible » | Secret Manager (06) |
| Création/révocation de modérateurs, DG, spécialistes, rôles, équipe technique (`settings:moderators`…) | écriture refusée | Auth + custom claims (05/06) |
| Export complet (`window.storage.list('')`, l. 29433) | erreur explicite | Function admin (06) |
| Wishlist visible par autrui (`wishlistVisible`), balayage vendeur (l. 22422) | `wishlist` PRIVE → invisible pour les autres | règle « visible » ou Function (06) |
| Publication d'un média > 900 Ko (vidéo, photo non compressée, PDF, audio) | erreur « valeur trop grande », journalisée dans `SuktumPlatform.oversized` | Storage/Stream (07, D9) |
| Opt-out de notifications d'autrui (lecture privée) | inchangé : `null` → comportement du prototype | fan-out serveur (06) |

## Rapport de lectures Firestore (jeu minimal : 1 utilisateur, 3 publications, 1 cours)
| Écran | Lectures | Évitées (cache) | Écritures |
|---|---|---|---|
| Fil | 32 | 32 | 6 |
| Profil | 20 | 23 | 0 |
| Liste des cours | 12 | 18 | 2 |
| Back-office (connexion) | **245** | 94 | 7 |
Top préfixes : `settings` 86, `post` 49, `user` 35, `order` 17, `live` 12. Le cache évite déjà ~45 % des lectures. Le back-office et `settings:` (une lecture par sous-clé, ~230 `get` dans le code) sont le premier chemin chaud ; un `get` groupé de `kv_settings` en une requête (phase 08) le ramènerait à ~30.

## Vérification
| Critère | État | Preuve |
|---|---|---|
| Tests verts (hors bloqués) | VALIDÉ | e2e émulateur 30/30 ; règles+adaptateur 10/10 ; e2e mémoire 30/30 |
| Rapport de lectures | VALIDÉ | ci-dessus (`tests/e2e/lectures.spec.js`) |
| Revue sécurité | VALIDÉ (en ligne) | aucun secret côté client (config Web publique seulement) ; `owner` immuable testé ; non authentifié refusé ; collections hors `kv_` refusées ; `storage.rules` fermé ; secrets `settings:` en lecture seule |
| `legacy/` intact, `src/legacy` intact | VALIDÉ | `verify-split` IDENTIQUE |

## Reste à faire côté console (Oumar/Gorgui), non bloquant pour les émulateurs
1. Activer l'API Firestore puis créer la base en `europe-west1` : https://console.firebase.google.com/project/suktum-dev/firestore
2. Activer Authentication → fournisseur « Anonyme » (phase 04) puis « Google » (phase 05).
3. Ne **pas** déployer les règles/hosting avant la revue de la phase 05 (rule 8).

## Risques pour la phase 05
- L'identité reste le nom d'utilisateur ; l'auth anonyme donne un uid par navigateur : la phase 05 doit lier `settings:username` (privé) à un vrai compte et migrer `owner`.
- `adminpin_hash` reste inscriptible (transitoire) : à retirer dès que les custom claims existent.
