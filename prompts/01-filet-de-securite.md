# Phase 01 — Filet de sécurité : faire tourner le prototype hors de Claude et le figer par des tests

## Pourquoi cette phase existe
On va déplacer 37 000 lignes. Sans tests de caractérisation, chaque régression sera découverte par Gorgui. Cette phase ne change **aucun** comportement.

## Contexte
Hors de Claude, `window.storage` n'existe pas. On va le simuler **uniquement pour les tests**.

## Tâches
1. Crée `tests/support/memory-storage.js` : implémentation en mémoire de l'interface exacte
   `get(key, shared)`, `set(key, value, shared)`, `delete(key, shared)`, `list(prefix, shared)`,
   avec les formes de retour du legacy (`{key, value, shared}`, `{keys, prefix, shared}`, `null`).
   Espace privé séparé par « utilisateur de test » ; espace partagé commun à tous les contextes Playwright (serveur Node local minimal ou `page.exposeBinding`).
   Délègue au `cartographe` la vérification des formes de retour attendues autour des lignes 6 894 – 6 906, 7 075 et 29 433.
2. Simule `fetch` vers `api.anthropic.com` et `generativelanguage.googleapis.com` avec des réponses fixes (`page.route`).
3. Charge `legacy/suktum-app.html` dans Playwright avec ce stockage injecté avant tout script (`addInitScript`).
4. Confie au `testeur-qa` l'écriture des parcours de caractérisation, dans cet ordre, chacun dans son fichier :
   - `inscription.spec` : création de compte, rechargement, compte toujours connecté.
   - `publication.spec` : A publie une photo avec légende et #hashtag ; B la voit dans « Récent » ; B aime et commente ; A voit la notification.
   - `messagerie.spec` : A écrit à B ; B lit.
   - `boutique.spec` : A crée un produit ; B commande ; statut visible des deux côtés.
   - `education.spec` : un formateur crée un cours et une leçon ; un élève s'inscrit (essai 7 jours).
   - `backoffice.spec` : accès caché (5 taps sur l'avatar), connexion admin, affichage de la vue d'ensemble.
   - `console.spec` : aucun `pageerror` au chargement.
5. Documente dans `tests/README.md` comment lancer les tests et ce que chaque parcours garantit.

## Règles
- Si un parcours ne fonctionne pas dans le prototype actuel, **ne le corrige pas** : marque le test `test.fixme` avec la raison, et ajoute une ligne dans `docs/journal/a-traiter.md`.
- Ne modifie pas `legacy/`.

## Définition de « terminé »
`npm run test:e2e` vert (hors `fixme` documentés), exécution < 5 minutes, commit `test: caractérisation du prototype`.
