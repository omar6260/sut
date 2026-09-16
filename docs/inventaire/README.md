# Inventaire du prototype (phase 02)

À consulter **avant toute modification** du legacy. Chaque affirmation cite un numéro de ligne de `legacy/suktum-app.html`.

| Fichier | Contenu | Sert à |
|---|---|---|
| `prefixes.md` | 222 préfixes de stockage (+ `settings:` en 7 groupes) : structure, `shared`, comptages, qui écrit, écriture croisée, taille, médias base64 | phase 04 (adaptateur), phase 07 (médias) |
| `classification.md` | classe de sécurité par préfixe (PUBLIC_PROPRIETAIRE / PRIVE / PARTICIPANTS / SERVEUR_SEUL / ADMIN) avec justification | phase 04 (règles Firestore), phase 06 |
| `ecritures-croisees.md` | 188 sites où un utilisateur modifie une donnée d'autrui, avec solution (sous-collection, `increment()`, transaction serveur) | phases 04, 06, 08 |
| `logique-sensible.md` | 294 règles métier à migrer côté serveur (pièces, achats, commissions, rôles, sanctions, PIN/2FA, âge, auto-acceptation) | phase 06 |
| `appels-externes.md` | 28 `fetch` + 3 scripts tiers : URL, secret, où il est stocké, fonction serveur cible | phases 06, 07 |
| `temps-reel.md` | 20 `setInterval` : sondages de données à remplacer par `onSnapshot`, minuteries d'interface à conserver | phase 09 |
| `ecrans-et-modules.md` | découpage du fichier en domaines (plages de lignes), zones entremêlées, ordre de concaténation | phase 03 |
| `relecture-architecte.md` | remarques de l'architecte sur l'inventaire et ce qui a été intégré | phases 04, 06, 08 |
| `_lots/lot-NN.md` | rapports bruts des 12 lots d'analyse (source des 4 premiers fichiers) | traçabilité |

## Régénérer / vérifier

```bash
node scripts/extract-prefixes.mjs        # comptages mécaniques (clés littérales)
node scripts/build-inventaire.mjs        # _lots/*.md → prefixes, classification, ecritures-croisees, logique-sensible
node scripts/check-inventaire.mjs        # couverture 100 % des préfixes extraits, classes valides, 7 fichiers présents
```

Pour corriger une ligne, modifier le lot concerné dans `_lots/` puis relancer `build-inventaire` (les fichiers consolidés sont générés).

## Limites connues
- Les comptages get/set/list/delete ne couvrent que les clés **littérales** ; 494 appels utilisent une variable (`safeGet(k, …)`) et sont attribués dans la colonne « qui écrit » quand le lot les a retrouvés, sans être comptés.
- Les mentions « (à vérifier) » signalent une déduction non confirmée par lecture directe.
