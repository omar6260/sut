# Phase 02 — Cartographie complète du prototype

Date : 2026-09-16 · Branche : `phase-02-cartographie`

## Méthode
1. Extraction mécanique : `scripts/extract-prefixes.mjs` → 222 préfixes littéraux, comptages get/set/list/delete et `shared` par préfixe ; 494 appels à clé calculée (variable) signalés à part.
2. Analyse sémantique par **12 lots de 19 préfixes**, chacun confié à un agent portant le rôle du `cartographe` (lecture seule, format de sortie strict en 4 blocs). Rapports bruts conservés dans `docs/inventaire/_lots/`.
3. Consolidation : `scripts/build-inventaire.mjs` → `prefixes.md`, `classification.md`, `ecritures-croisees.md`, `logique-sensible.md`. Vérification : `scripts/check-inventaire.mjs` (couverture 100 % des préfixes extraits, classes valides, 7 fichiers présents).
4. `temps-reel.md`, `appels-externes.md`, `ecrans-et-modules.md` rédigés directement à partir du code (setInterval, fetch, marqueurs de section).
5. Relecture par l'`architecte` et intégration de ses remarques (voir § Relecture).

## Incident
La première vague de 12 agents a été interrompue par la limite de session (429) ; 4 rapports complets ont pu être récupérés depuis les transcriptions (`SubagentHandback`), les 8 autres ont été relancés en deux vagues après le reset. Les sous-agents `.claude/agents/*` n'étaient pas chargés dans cette session (kit déplacé en cours de route) : rôle injecté dans le prompt d'agents génériques. **Démarrer la phase 03 dans une session neuve.**

## Vérification
(complétée à la fin de la phase)

## Écarts avec le plan
- Lots de 19 préfixes au lieu de 10-15 : 12 agents au lieu de ~18, sans perte de qualité constatée (chaque rapport cite ses lignes).
- `settings:` traité comme un préfixe éclaté en groupes de sous-clés (préférences privées / clés API / rôles / tarifs / auto-acceptation / plateforme) plutôt qu'une seule ligne.

## Risques pour la phase 03
- Les zones entremêlées listées dans `ecrans-et-modules.md` § 4 rendent un découpage « par plage » insuffisant : découper par marqueur de section.
- Le build doit rester **identique octet pour octet** au prototype avant tout déplacement de bloc (test `cmp` dans `check-inventaire` ou dans le build).
