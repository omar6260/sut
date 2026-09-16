# Phase 00 — Mise en place du dépôt

Date : 2026-09-16 · Branche : `phase-00-installation` · Commit : `chore: initialisation du dépôt`

## Ce qui a été fait
- Installation du README : `suktum-app/` est la racine git (`main`), kit remonté à la racine, prototype déplacé dans `legacy/suktum-app.html` (`chmod 444`), commit `chore: import du prototype et du kit agents`.
- `package.json` (`type: module`, Node ≥ 22) avec `build`, `serve`, `test:e2e`, `emulators`, `test:rules`.
- `@playwright/test` 1.63 (Chromium seul, projets `mobile` = Pixel 7 et `desktop`) et `firebase-tools` 15.30 en dépendances de dev.
- `scripts/build.mjs` : copie du prototype tant que `src/legacy/` est vide, sinon concaténation ordonnée. `scripts/serve.mjs` : serveur statique sans dépendance, port 5173.
- Arborescence de `CLAUDE.md` avec un `README.md` d'une ligne par dossier vide (+ `tests/support/` et `docs/source/`).
- `.gitignore`, `.nvmrc`, `docs/journal/a-traiter.md`, `docs/journal/decisions.md`.
- `.claude/settings.json` : refus de `firebase deploy … suktum-prod`, `git push --force`/`-f`, `rm -rf`, écriture dans `legacy/` ; hook `PreToolUse` `protect-legacy.sh` testé (bloque `legacy/`, laisse passer `src/legacy/`).

## Vérification
| Critère | État | Preuve |
|---|---|---|
| `npm install` sur machine propre | VALIDÉ | `package-lock.json` versionné, install exécutée, 0 erreur |
| `npx playwright --version` | VALIDÉ | `Version 1.63.0` ; `npx playwright test --list` charge la config (0 test, attendu) |
| `npm run build` | VALIDÉ | `dist/index.html` identique octet pour octet au prototype (`cmp`) |
| `npm run serve` | VALIDÉ | `GET /` → 200 `text/html`, 2 448 206 octets ; `/inexistant` → 404 ; `/../package.json` → 404 |
| `npm run test:e2e` | NON APPLICABLE | aucun test avant la phase 01 |
| `npm run test:rules`, `npm --prefix functions test` | NON APPLICABLE | pas de `firebase.json` ni de `functions/package.json` avant les phases 04 et 06 (noté dans `a-traiter.md`) |
| Aucune modification de `legacy/` | VALIDÉ | `git diff --stat main -- legacy/` vide ; fichier en 444 |

## Sécurité
Revue faite en ligne (diff = squelette, pas de logique métier ni de secret). Points contrôlés : `serve.mjs` refuse la traversée de chemin et n'expose que `dist/` ; le hook lit `file_path` via JSON, pas via `eval` ; aucune clé ni URL de projet réel dans le dépôt.

## Décisions
Voir `decisions.md`, section « 2026-09-16 — Phase 00 » (racine du dépôt, protection de `legacy/`, build de transition, serveur sans dépendance, Playwright Chromium seul, `node --test` pour les règles, Node 22).

## Écarts avec le plan
- Ajout non demandé mais justifié : hook de protection de `legacy/`, `.nvmrc`, `tests/support/` (exigé par la phase 01), `docs/source/README.md`.
- `test:rules` utilise `firebase emulators:exec` : il échouera proprement tant que `firebase.json` n'existe pas.

## Risques pour la phase 01
- `docs/source/` est vide : sans le guide d'utilisation, le `testeur-qa` écrira les parcours à partir du seul code. **À déposer avant de lancer la phase 01.**
- Le prototype charge Jitsi, FFmpeg.wasm (unpkg) et Google Identity Services au démarrage : à bloquer via `page.route` pour tenir le budget « e2e < 5 min ».
- `window.storage` absent hors de Claude : la phase 01 doit l'injecter avant tout script (`addInitScript`), sinon l'app ne démarre pas.
