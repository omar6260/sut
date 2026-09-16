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
| Critère | État | Preuve |
|---|---|---|
| Les 7 fichiers existent | VALIDÉ | `node scripts/check-inventaire.mjs` → 7 « présent » |
| `prefixes.md` couvre 100 % des préfixes extraits | VALIDÉ | 245 documentés / 238 extraits (222 littéraux + 16 par affectation ; `settings` en 7 groupes) — couverture 100 % |
| `scripts/check-inventaire.mjs` fourni | VALIDÉ | code de sortie 0 |
| Relecture par l'architecte intégrée | VALIDÉ | `docs/inventaire/relecture-architecte.md` (rapport + tableau d'intégration), lots 13 et 90 |
| Rien modifié hors `docs/inventaire/` | VALIDÉ (écart assumé) | ajouts dans `scripts/` (3 scripts demandés/nécessaires) et `docs/journal/` (revue de phase) ; `legacy/` et `src/` intacts |

## Relecture de l'architecte — points structurants à retenir
1. **Règles ≠ filtres** : les listes globales casseront 4 écrans en phase 04 sans `readers[]` (ou Functions de liste).
2. **1 Mio/document** : la phase 04 doit déporter les blobs ou suivre la phase 07.
3. **`shared` n'est pas fiable** (12 préfixes contredits) : routage par table de préfixes uniquement.
4. Coût : ~40 000 lectures par ouverture du fil, ~2,8 M lectures/heure/spectateur de live → aucun test utilisateur sur un live avant la phase 08/09.
5. Six décisions produit D4–D9 (`decisions.md`) à obtenir avant d'écrire la table de routage.

## Écarts avec le plan
- Lots de 19 préfixes au lieu de 10-15 : 12 agents au lieu de ~18, sans perte de qualité constatée (chaque rapport cite ses lignes).
- `settings:` traité comme un préfixe éclaté en groupes de sous-clés (préférences privées / clés API / rôles / tarifs / auto-acceptation / plateforme) plutôt qu'une seule ligne.

## Risques pour la phase 03
- Les zones entremêlées listées dans `ecrans-et-modules.md` § 4 rendent un découpage « par plage » insuffisant : découper par marqueur de section.
- Le build doit rester **identique octet pour octet** au prototype avant tout déplacement de bloc (test `cmp` dans `check-inventaire` ou dans le build).
