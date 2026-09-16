# Journal des décisions

Format : date · décision · raison · alternative écartée. Les décisions **produit** sont validées par Gorgui ; les décisions **techniques** par Oumar.

## 2026-09-16 — Phase 00

**Racine du dépôt = `suktum-app/`, kit remonté à la racine, prototype déplacé dans `legacy/suktum-app.html`.**
Raison : c'est la disposition attendue par `CLAUDE.md` et les prompts (`legacy/`, `docs/`, `.claude/`). Le dossier `suktum-agents-kit/` a été fusionné puis supprimé pour éviter deux `CLAUDE.md` concurrents.
Alternative écartée : garder le kit dans un sous-dossier — Claude Code n'aurait chargé ni la mémoire ni les sous-agents.

**`legacy/suktum-app.html` protégé par trois moyens : `chmod 444`, refus `Edit/Write(legacy/**)` dans `.claude/settings.json`, hook `PreToolUse` (`.claude/hooks/protect-legacy.sh`).**
Raison : la règle « jamais modifié » doit être mécanique, pas de bonne volonté. Le hook distingue `<racine>/legacy/` (protégé) de `src/legacy/` (autorisé dès la phase 03).
Alternative écartée : hook git `pre-commit` — non versionné, donc absent sur une machine propre.

**`scripts/build.mjs` copie le prototype tel quel tant que `src/legacy/` est vide, puis concatène `src/legacy/*` dans l'ordre lexicographique.**
Raison : `npm run build` et `npm run test:e2e` fonctionnent dès la phase 01 sans attendre le découpage de la phase 03 ; la phase 03 n'aura qu'à remplir `src/legacy/`.
Alternative écartée : Vite dès maintenant — le legacy est un unique fichier HTML avec 1 483 `onclick=` inline ; un bundler n'apporte rien avant le découpage et introduit un risque de casser la portée globale.

**`scripts/serve.mjs` : serveur statique Node sans dépendance, port 5173.**
Raison : zéro dépendance supplémentaire ; le port 5173 est celui que Vite utilisera plus tard, donc la config Playwright ne changera pas.
Alternative écartée : paquets `serve` ou `http-server` — une dépendance de plus pour 40 lignes.

**Playwright : Chromium uniquement, deux projets `mobile` (Pixel 7) et `desktop` (Desktop Chrome), locale `fr-SN`, fuseau `Africa/Dakar`.**
Raison : cible utilisateur mobile Android au Sénégal ; le back-office est plutôt desktop. Un seul moteur pour tenir le budget « e2e < 5 min ».
Alternative écartée : WebKit/Firefox — ajoutés plus tard si un bug spécifique l'exige.

**Tests des règles Firestore avec le lanceur intégré `node --test` (Node 22).**
Raison : aucune dépendance de test supplémentaire ; `@firebase/rules-unit-testing` est indépendant du lanceur.
Alternative écartée : Vitest/Jest — à reconsidérer en phase 06 si `functions/` en a besoin, pour n'avoir qu'un seul lanceur.

**Version Node figée à 22 (`.nvmrc`, `engines`).**
Raison : Node 22 est la cible des Cloud Functions v2 ; même version partout évite les surprises.
