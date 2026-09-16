# Phase 03 — Découpage du fichier monolithique

Date : 2026-09-16 · Branche : `phase-03-decoupage` · Commit : `refactor(legacy): découpage en fichiers sans changement de logique`

## Fait
- `scripts/split-legacy.mjs` : 20 fichiers `src/legacy/js/NN-domaine.js` (plages de `ecrans-et-modules.md`), `styles.css`, `index.template.html`. Chaque coupe est contrôlée (déclaration de premier niveau, ligne précédente non indentée) et chaque morceau passe `node --check`.
- `scripts/build.mjs` : mode simple (un `<script>`, identique au prototype) et `--multi` (20 `<script src>`). `String.replace` remplacé par une fonction de remplacement : le JS contient `$&`/`$'`.
- `scripts/verify-split.mjs` → **IDENTIQUE (2 448 206 octets)**.
- Aucune double déclaration `let`/`const`/`class`/`function` de premier niveau.
- Playwright bascule sur le build `--multi` : **30/30 verts**.
- Test C6 (`node scripts/serve.mjs --coop`) : résultat dans `decisions.md`, rien corrigé.

## Vérification
| Critère | État | Preuve |
|---|---|---|
| `verify-split` → IDENTIQUE | VALIDÉ | `IDENTIQUE (2448206 octets)` ; `cmp dist/index.html legacy/suktum-app.html` silencieux |
| e2e verts sur le build multi | VALIDÉ | `30 passed (50.5s)` |
| C6 documenté | VALIDÉ | `decisions.md` § Phase 03 |
| Rien renommé/reformaté | VALIDÉ | identité octet par octet |

## Risques pour la phase 04
- `19-backoffice.js` (8 613 lignes) contient six blocs utilisateur (communauté, Penc, séries…) : à séparer en phase 08, pas avant.
- Dès que `src/legacy` est modifié, `verify-split` devient rouge par construction : le remplacer par « build simple = build multi » + e2e.
