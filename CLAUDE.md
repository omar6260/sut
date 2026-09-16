# SUKTUM — Mémoire du projet pour Claude Code

## Contexte
Suktum (« notre pirogue ») est un réseau social vidéo pour le Sénégal et l'Afrique de l'Ouest :
fil vidéo, messagerie et lives, boutique, Espace Éducation, salons vocaux Penc, back-office multi-pays.
Propriétaire : Gorgui Faye. Développeur responsable : Oumar.

Le point de départ est un **prototype monolithique** : `legacy/suktum-app.html`
(37 411 lignes, 2,4 Mo, ~1 960 fonctions globales), conçu pour tourner dans l'environnement
Claude où `window.storage` et les appels à `api.anthropic.com` sont fournis automatiquement.
**Hors de cet environnement, rien ne se sauvegarde.**

Sources de vérité, par ordre de priorité :
1. `docs/source/cahier-des-charges-suktum.docx` — périmètre contractuel.
2. `docs/source/guide-utilisation-suktum.docx` — comportement attendu côté utilisateur.
3. `legacy/suktum-app.html` — comportement de référence (lecture seule, jamais modifié).
4. `docs/DIAGNOSTIC.md` et `docs/ARCHITECTURE-CIBLE.md` — analyse et cible technique.
5. `docs/inventaire/` — cartographie produite en phase 02 (à consulter avant toute modification).

## Stratégie : migration par étranglement (strangler), jamais de réécriture
- On **ne réécrit pas** l'application. On remplace les fondations sous elle, par étapes testées.
- Chaque fonctionnalité listée dans le guide d'utilisation doit continuer de fonctionner après chaque phase.
- Le code métier global (fonctions appelées par les 1 480 `onclick=` inline) reste global tant que la phase ne dit pas explicitement le contraire.

## Règles d'or (non négociables)
1. **Aucune clé API, aucun secret, aucun hash de mot de passe ou de PIN côté navigateur.** Tout passe par Cloud Functions + Secret Manager.
2. **Le client n'est jamais digne de confiance** pour : soldes de pièces, achats, commissions, reversements, rôles, sanctions, badges payants, réglages de la plateforme. Ces écritures se font exclusivement côté serveur.
3. **Aucune modification hors du périmètre de la phase en cours.** Un problème repéré ailleurs est noté dans `docs/journal/a-traiter.md`, pas corrigé.
4. **Pas de décision produit.** Si un choix change l'expérience utilisateur, s'arrêter et poser la question.
5. **Tout changement est vérifié** : tests Playwright de caractérisation verts + tests d'émulateur Firebase verts avant de déclarer une tâche terminée.
6. **Petits commits** au format Conventional Commits en français : `feat(auth): ...`, `refactor(storage): ...`.
7. Toute donnée affichée via `innerHTML` doit passer par `escapeHtml()` (985 usages de `innerHTML` dans le legacy).
8. Ne jamais lancer `firebase deploy` vers le projet de production sans validation explicite d'Oumar. Travailler sur l'émulateur ou le projet `suktum-dev`.

## Pile technique cible
- Frontend : JavaScript vanilla existant, découpé en fichiers, assemblé par `scripts/build.mjs`, puis Vite progressivement.
- Backend : Firebase — Auth, Firestore, Cloud Functions v2 (TypeScript, Node 22), Storage, Hosting, Cloud Messaging. Région `europe-west1`.
- Vidéo : Cloudflare Stream (transcodage, HLS, CDN). E-mails : Resend. Supervision : Sentry + UptimeRobot.
- Paiements : Wave Business, Orange Money, passerelle carte (PayDunya ou CinetPay).
- Android : Capacitor → Google Play (compte développeur de Gorgui).

## Arborescence cible
```
legacy/                 prototype d'origine (lecture seule)
src/legacy/             legacy découpé en fichiers ordonnés (phase 03)
src/platform/           nouvelles briques : storage-adapter, auth, api-client, media, realtime
functions/src/          Cloud Functions par domaine : auth, coins, shop, edu, admin, ai, media, payments
firestore.rules  storage.rules  firestore.indexes.json
tests/e2e/              Playwright (caractérisation + parcours)
tests/rules/            tests des règles de sécurité sur émulateur
docs/inventaire/        cartographie (phase 02)
docs/journal/           journal des phases, décisions, a-traiter.md
```

## Commandes
- `npm run build` — assemble `src/legacy` en `dist/index.html` (un seul `<script>`) ; `npm run build -- --multi` — un `<script src>` par fichier (mode des tests e2e)
- `node scripts/verify-split.mjs` — prouve que `src/legacy` reconstitue le prototype octet pour octet (phase 03)
- `npm run serve` — sert `dist/` sur http://localhost:5173 (lancé automatiquement par Playwright)
- `npm run test:e2e` — Playwright (30 tests, ~1 min ; voir `tests/README.md` pour la fixture `suktum` et les écarts assumés)
- `npm run emulators` — émulateurs Firebase
- `npm run test:rules` — tests des règles Firestore
- `npm --prefix functions test` — tests unitaires des fonctions

## Sous-agents disponibles
- `cartographe` — analyse du legacy, lecture seule.
- `architecte` — conception et découpage des tâches, lecture seule.
- `dev-backend` — Cloud Functions, règles, modèle de données.
- `dev-frontend` — refactorisation du legacy et intégration des briques `src/platform`.
- `auditeur-securite` — revue de sécurité, lecture seule.
- `testeur-qa` — tests Playwright et émulateur.
Utilise-les proactivement : délègue l'analyse massive du legacy au `cartographe` pour préserver le contexte principal.

## Communication
Réponds en français. Sois direct. En fin de tâche : ce qui a été fait, comment c'est vérifié, ce qui reste, les risques.
