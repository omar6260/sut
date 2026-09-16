# Phase 01 — Filet de sécurité : prototype exécutable hors de Claude, figé par des tests

Date : 2026-09-16 · Branche : `phase-01-filet-de-securite` · Commit final : `test: caractérisation du prototype`

## Ce qui a été fait
- `tests/support/memory-storage.js` : `window.storage` en mémoire, formes de retour vérifiées sur le legacy (l. 6 894–6 906 `safeGet/safeList/saveWithRetry`, l. 7 075–7 081 test de santé, l. 29 433–29 439 export complet, l. 30 047–30 071 lectures de rôles). Espace privé par appareil, espace partagé par test. Branché par `page.exposeBinding` (pas de serveur Node : plus simple, isolé par test, parallélisable).
- `tests/support/network-mocks.js` : Anthropic, Gemini (+ embeddings), Vision, Video Intelligence, Nominatim, OpenWeather, Yango simulés ; Jitsi, FFmpeg.wasm, Google Identity, polices remplacés par des stubs ; filet qui coupe tout autre appel externe.
- `tests/support/fixtures.js` : fixture `suktum` (appareils, inscription, toasts, erreurs JS).
- 7 parcours, 15 tests, exécutés sur 2 profils (Pixel 7, Desktop Chrome) = **30 tests, 49 s, 0 `fixme`**.
- `tests/README.md` : lancement, architecture, garantie de chaque parcours, écarts assumés.

## Vérification
| Critère | État | Preuve |
|---|---|---|
| `npm run test:e2e` vert (hors `fixme`) | VALIDÉ | `30 passed (49.0s)` — aucun `fixme` |
| Exécution < 5 minutes | VALIDÉ | 49 s pour les deux profils |
| Aucune modification de `legacy/` | VALIDÉ | `git diff --stat main -- legacy/` vide |
| Aucun `pageerror` au chargement | VALIDÉ | `console.spec` + assertion `suktum.errors` dans chaque parcours principal |
| Contrôle de syntaxe du script principal | VALIDÉ | `node --check` sur les 30 515 lignes de JS : OK |

## Écarts avec le plan
- Le prompt suggérait de déléguer la vérification des formes de retour au `cartographe` et l'écriture des specs au `testeur-qa`. Fait en direct : les zones à lire étaient précisément localisées (≈ 300 lignes) et le contexte principal n'était pas menacé. Les sous-agents seront sollicités dès la phase 02 (cartographie massive), là où ils apportent vraiment.
- `education.spec` prépare deux états d'administration hors interface (statut formateur, activation du cours). Les couvrir par l'interface aurait demandé la candidature formateur (photo + validation IA/admin) et l'écran de validation des cours : à ajouter quand ces écrans seront dans le périmètre d'une phase.

## Découvertes (notées dans `a-traiter.md`)
1. Pixel 7 : lien « CRÉER » de l'écran caméra recouvert par la barre d'onglets.
2. Pixel 7 : colonne d'actions du fil (12 boutons) qui déborde ; « aimer » sous la cloche de notifications.
3. Le pays Sénégal bascule l'interface en wolof par défaut — décision produit à confirmer.
4. Scripts tiers non épinglés (déjà noté en phase 00, confirmé : tout est gardé par `typeof`, les stubs suffisent).

## Décisions (reportées dans `decisions.md`)
- Stockage partagé via `exposeBinding` plutôt qu'un serveur Node.
- Langue française forcée dans `signUp`.
- Clic direct (`dispatchEvent`) uniquement pour les deux boutons recouverts, avec renvoi vers `a-traiter.md`.

## Risques pour la phase suivante (02 — cartographie)
- Les tests couvrent 7 parcours sur les dizaines de fonctionnalités du guide : lives, Penc, stories, paiements en pièces, modération ne sont **pas** figés. Toute phase touchant ces zones doit d'abord ajouter son parcours.
- Les identifiants générés (`post_<Date.now()>`, `order_<Date.now()>`) rendent deux créations dans la même milliseconde ambiguës ; les tests créent un objet à la fois.
- Le filet « appel externe coupé » écrit un `console.warn` mais ne fait pas échouer le test : si un nouvel hôte apparaît, il faut lire la sortie.
