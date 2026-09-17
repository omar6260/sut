# Phase 06 — Logique métier côté serveur et secrets (en cours)

Branche : `phase-06-logique-serveur` · Méthode : infrastructure commune (`functions/src/lib/kv.ts`, `src/platform/overrides/`, invalidation de cache `touched`), puis un agent par domaine dans un worktree isolé, fusion et e2e par l'orchestrateur.

## État au 2026-09-17 soir
| Domaine | Serveur (`functions/src/`) | Client (`src/platform/overrides/`) | Tests unitaires | E2E émulateur |
|---|---|---|---|---|
| Boutique | ✅ 25 fonctions | ✅ `10-boutique.js` | ✅ | ✅ `boutique-serveur.spec` (6) + `boutique.spec` |
| Pièces / cadeaux / fonds / badges / Premium / billets | ✅ 29 fonctions | ✅ `10-pieces.js` | ✅ | (via parcours existants) |
| Éducation | ✅ 42 fonctions | ❌ à écrire | ✅ | — |
| Social (likes, commentaires, votes, abonnements, notifications) | ✅ 32 fonctions | ❌ à écrire | ✅ | — |
| IA et secrets (relais, quotas, `secretsStatus`) | ✅ 11 fonctions | ❌ (29 `fetch` directs restent) | ✅ | — |
| Modération / sanctions / réglages / équipes | ❌ | ❌ | — | — |
| Règles strictes (`--phase 06`) | ❌ pas encore activées | | | |

Incident : deux limites de session (16 h et 21 h) ont interrompu les six agents parallèles ; le travail commité a été sauvegardé et fusionné, les worktrees supprimés. **Suite en séquentiel, un agent à la fois** (moins de relectures du legacy).

## Correctif de sécurité découvert en route
L'espace privé était par uid : après « Continuer avec Google », un second appareil partageait `settings:username` et pouvait **contourner le PIN par rechargement**. Désormais par (uid, appareil) — `PLATFORM.deviceId` (localStorage), ID de document `encode('<deviceId>|<clé>')`. Tests 48/48.

## Reste à faire (ordre)
1. Surcharge client Éducation (`overrides/20-education.js`) + spec.
2. Surcharge client Social (`overrides/30-social.js`) + spec.
3. Surcharge client IA (`overrides/40-ia.js`) + suppression des champs de clés au back-office ; DoD `grep` = 0.
4. Domaine modération/admin (serveur + client + `setRole` dans les écrans d'équipe).
5. `node scripts/generate-rules.mjs --phase 06`, tests de règles « triche », e2e complète, revue sécurité, journal, merge.
