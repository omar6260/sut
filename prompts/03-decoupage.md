# Phase 03 — Découpage du fichier monolithique (sans changer une ligne de logique)

## Objectif
Passer de `legacy/suktum-app.html` à des fichiers lisibles, **sans aucune modification de comportement**.

## Principe de sécurité : la reconstitution à l'identique
Le découpage est une opération de copier-coller par plages de lignes. La preuve qu'il est correct :
concaténer les morceaux doit redonner **exactement** le script d'origine.

## Tâches
1. `scripts/split-legacy.mjs` découpe selon `docs/inventaire/ecrans-et-modules.md` :
   - `src/legacy/styles.css` (lignes 44 – 233)
   - `src/legacy/index.template.html` (le balisage, avec des marqueurs `<!-- @@STYLES@@ -->` et `<!-- @@SCRIPTS@@ -->`)
   - `src/legacy/js/NN-domaine.js` (plages contiguës, numérotées pour garder l'ordre : `01-socle.js`, `02-auth.js`, …)
   Coupe uniquement entre deux déclarations de premier niveau, jamais au milieu d'une fonction.
2. `scripts/build.mjs` : réassemble `dist/index.html`. Les fichiers JS restent des **scripts classiques** (pas de modules) pour conserver la portée globale partagée.
3. `scripts/verify-split.mjs` : reconstruit le HTML **en un seul bloc script** et compare octet par octet avec `legacy/suktum-app.html`. Doit afficher `IDENTIQUE`.
4. Deuxième mode de build (`--multi`) : un `<script src>` par fichier, dans l'ordre. Vérifie qu'aucune double déclaration `let`/`const` de premier niveau ne casse le chargement.
5. Relance toute la suite de la phase 01 sur `dist/index.html` (mode `--multi`).
6. **Test de risque C6** : sers `dist/` avec les en-têtes COOP/COEP, vérifie si FFmpeg (filigrane, filtres), la connexion Google et Jitsi fonctionnent. Consigne le résultat dans `docs/journal/decisions.md` sans rien corriger.

## Interdits
Renommer, reformater, « nettoyer » ou corriger quoi que ce soit. Le formatage automatique (Prettier) est **interdit** dans cette phase : il casserait la vérification.

## Définition de « terminé »
`verify-split` → IDENTIQUE ; tests e2e verts sur le build multi-fichiers ; résultat du test C6 documenté ; commit `refactor(legacy): découpage en fichiers sans changement de logique`.
