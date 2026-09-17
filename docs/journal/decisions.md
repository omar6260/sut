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

## 2026-09-16 — Phase 01

**Espace partagé de `window.storage` fourni par `page.exposeBinding` (un `MemoryStorage` par test), pas par un serveur Node local.**
Raison : zéro processus supplémentaire, isolation totale entre tests, parallélisme gratuit ; A et B d'un même test partagent l'instance par construction.
Alternative écartée : mini-serveur HTTP partagé — état global entre tests, nettoyage à gérer, ports à réserver.

**La fixture `signUp` sélectionne explicitement « Français ».**
Raison : le prototype bascule en wolof pour le Sénégal ; le guide d'utilisation (source de vérité n° 2) est en français et les assertions portent sur ses textes.
Alternative écartée : asserter sur les textes wolof — fragile, et non couvert par le guide.

**Deux boutons recouverts sur Pixel 7 sont actionnés par `dispatchEvent('click')`, avec renvoi vers `a-traiter.md`.**
Raison : caractériser la logique (like, commentaire) sans corriger le CSS du prototype, interdit en phase 01.
Alternative écartée : `click({ force: true })` — clique aux coordonnées, donc sur l'élément qui recouvre.

## Décisions produit en attente (issues de la phase 02) — à valider par Gorgui avant la phase 04

- **D4 — Changement de nom d'utilisateur.** `changeUsername` (l. 23478-23510) réécrit tous les posts, profils et fils privés. Garder la fonctionnalité ⇒ ID Firestore = uid immuable, username = champ (encodage des clés en phase 04). La retirer ⇒ username comme ID.
- **D5 — Opt-out de notifications.** Jamais fonctionnel dans le prototype (§1l). Le faire fonctionner en phase 06 ou retirer l'option de l'interface ?
- **D6 — Ajustement de solde par l'admin** (l. 35211) : sans effet dans le prototype. Confirmer que c'est voulu (avec journal `coinadjustment`).
- **D7 — Visibilité de la wishlist** : lecture par autrui si `wishlistVisible` (l. 16131) et balayage vendeur « retour en stock » (l. 22422). Garder les deux ?
- **D8 — Contenu de cours avant inscription** : vidéos, podcasts, FAQ, concours visibles en catalogue ou seulement après inscription ? (fixe la règle unique « cours », §1a).
- **D9 — Ordre 04/07** : déport provisoire des médias vers Storage dès la phase 04, ou aucun test avec médias avant la phase 07 ?

## 2026-09-16 — Phase 03

**Découpage par plages de lignes en 20 fichiers JS + `styles.css` + `index.template.html`, reconstitution IDENTIQUE octet par octet (`scripts/verify-split.mjs`).**
Raison : preuve mécanique qu'aucune logique n'a changé ; chaque morceau passe `node --check`, aucune double déclaration `let`/`const`/`class` de premier niveau, 30 tests e2e verts sur le build multi-fichiers.
Alternative écartée : découpage par marqueur de section (276 fichiers) — trop fin pour la phase 04, qui travaille par domaine.

**Test de risque C6 (COOP/COEP) — résultat, rien corrigé** (`node scripts/serve.mjs --coop`, Chromium, vrai réseau) :
| | sans COOP/COEP | avec `COOP: same-origin` + `COEP: require-corp` |
|---|---|---|
| `crossOriginIsolated` / `SharedArrayBuffer` | non / non → **FFmpeg.wasm 0.11.6 multi-thread inutilisable** (filigrane, filtres) | oui / oui |
| Script FFmpeg (unpkg) | chargé | chargé |
| Google Identity (`accounts.google.com/gsi/client`) | chargé (`GOOGLE_CLIENT_ID` vide de toute façon) | chargé (popup non testée ; COOP `same-origin` est connu pour casser la fenêtre de connexion) |
| Jitsi (`meet.jit.si/external_api.js`) | chargé | **BLOQUÉ** — `ERR_BLOCKED_BY_RESPONSE … CoEP` : le serveur public n'envoie pas de `Cross-Origin-Resource-Policy` → lives et Penc impossibles |
Conclusion pour la phase 07 : les deux configurations sont incompatibles avec le prototype tel quel. Options : (a) cœur FFmpeg **mono-thread** (`@ffmpeg/core-st`, sans SAB ni COOP/COEP, Jitsi conservé) ; (b) filigrane/filtres côté Cloudflare Stream et suppression de FFmpeg ; (c) COOP/COEP + Jitsi auto-hébergé/JaaS avec en-têtes CORP. Recommandation : (b) à terme, (a) en transition.

## 2026-09-17 — Phase 04

**Règles Firestore de phase 04 : PRIVE → propriétaire ; secrets et listes de rôles de `settings:` → lecture seule ; tout le reste ouvert aux utilisateurs authentifiés.**
Raison : bloquer SERVEUR_SEUL maintenant (comme le prompt le suggérait) casserait l'inscription, la connexion, la publication et la commande, faute de Functions ; la stratégie « aucune régression par phase » prime. La politique complète est générée par `node scripts/generate-rules.mjs --phase 06`.
Alternative écartée : blocage total avec liste d'exceptions — la liste aurait contenu la moitié des préfixes, sans valeur de sécurité sur un projet de dev.

**Routage de l'adaptateur par le paramètre `shared` du legacy (phase 04), classification appliquée dans les règles.**
Raison : reproduit exactement le comportement actuel (y compris ses défauts) ; le routage par table de préfixes (recommandé par l'architecte) s'imposera quand `user` sera éclaté (05/06).

**SDK Firebase servi localement (`dist/vendor/`, bundles compat 10.14.1), pas depuis un CDN.**
Raison : les tests coupent tout réseau externe ; pas de dépendance à `gstatic` au premier rendu ; épinglage exact.

**Décisions produit D4–D9 : en attente, valeurs par défaut = comportement du prototype** (renommage conservé, opt-out inopérant conservé, wishlist PRIVE, contenu de cours après inscription, médias > 900 Ko refusés jusqu'à la phase 07).

## 2026-09-17 — Décisions produit D1 et D3 (Oumar, pour Gorgui)

**D1 — Connexion sur un nouvel appareil : conforme au cahier des charges (§3.1, §3.12).** Inscription par nom d'utilisateur sans mot de passe, session rattachée à l'appareil (compte Firebase anonyme, jeton serveur) ; sur un nouveau téléphone, l'utilisateur retrouve son compte avec « Continuer avec Google » (jeton vérifié côté serveur par Firebase Auth), en un seul geste. Le PIN de sécurité et le 2FA existants restent des protections supplémentaires, vérifiées côté serveur. Un nom d'utilisateur existant saisi sur un autre appareil n'ouvre plus la session : il propose la récupération Google.

**D3 — Mineurs : tranche d'âge auto-déclarée (13–17 / 18+), jamais de date de naissance.** Comme le prototype (`isMinor`, `ageBracket`). Le serveur pose le claim `familyMode` pour 13–17 et refuse toute autre valeur.
