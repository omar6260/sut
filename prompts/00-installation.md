# Phase 00 — Mise en place du dépôt

## Rôle
Tu es lead technique. Tu prépares un dépôt propre pour une migration longue et outillée.

## Contexte
Lis `CLAUDE.md` et `docs/DIAGNOSTIC.md`. Le prototype est dans `legacy/suktum-app.html` : **lecture seule, jamais modifié**.

## Tâches
1. Initialise `package.json` (type `module`) avec les scripts `build`, `serve`, `test:e2e`, `emulators`, `test:rules`.
2. Installe Playwright (Chromium seulement, profil mobile Pixel 7 + desktop) et `firebase-tools` en dépendance de dev.
3. Crée l'arborescence décrite dans `CLAUDE.md` avec des `README.md` d'une ligne dans chaque dossier vide.
4. `.gitignore` : `node_modules`, `dist`, `.env*`, `*.log`, `firebase-debug.log`, `.firebase/`, `functions/lib`.
5. Crée `docs/journal/a-traiter.md` et `docs/journal/decisions.md` (format : date, décision, raison, alternative écartée).
6. Ajoute `.claude/settings.json` qui **refuse** : `firebase deploy*--project suktum-prod*`, `git push --force*`, `rm -rf*`.
7. Script `npm run serve` : serveur statique local de `dist/` sur le port 5173.

## Interdits
Aucune modification de `legacy/`. Aucun framework frontend.

## Définition de « terminé »
`npm install` fonctionne sur une machine propre ; `npx playwright --version` répond ; commit `chore: initialisation du dépôt`.
