# src/legacy — le prototype découpé, sans changement de logique (phase 03)

Généré par `node scripts/split-legacy.mjs` depuis `legacy/suktum-app.html` (plages de lignes : `docs/inventaire/ecrans-et-modules.md`).

- `index.template.html` : le balisage, avec `<!-- @@STYLES@@ -->` et `<!-- @@SCRIPTS@@ -->`.
- `styles.css` : lignes 45–232 du prototype.
- `js/NN-domaine.js` : 20 scripts **classiques** (pas de modules), concaténés ou chargés dans l'ordre numérique. Une fonction qui cesse d'être globale casse des `onclick=` en silence.

Preuve d'intégrité : `node scripts/verify-split.mjs` → `IDENTIQUE`. À partir de la phase 04, les modifications se font ici et `verify-split` devient documentaire.
