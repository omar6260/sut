# Kit d'agents Claude Code — Refactorisation et mise en production de Suktum

Ce kit contient tout ce qu'il faut pour piloter la migration de Suktum avec Claude Code :
la mémoire du projet (`CLAUDE.md`), 6 sous-agents spécialisés (`.claude/agents/`),
14 prompts de phase prêts à l'emploi (`prompts/`) et 2 documents de référence (`docs/`).

## 1. Installation (une seule fois)

```bash
mkdir suktum && cd suktum && git init
# Copier le contenu de ce kit à la racine du dépôt (y compris le dossier caché .claude)
mkdir -p legacy docs/source
cp /chemin/code-source-suktum.html legacy/suktum-app.html        # NE JAMAIS MODIFIER ce fichier
cp /chemin/cahier-des-charges-suktum.docx docs/source/
cp /chemin/guide-utilisation-suktum.docx docs/source/
git add . && git commit -m "chore: import du prototype et du kit agents"
claude
```

> `code-source-suktum.docx` est un doublon du HTML : ne le donnez pas aux agents, il ne fait que consommer du contexte.

## 2. La méthode de travail (à respecter à chaque phase)

1. **Une phase = une branche = une session neuve.** `git checkout -b phase-04-adaptateur`, puis `/clear` dans Claude Code.
2. **Lancer la phase en mode Plan** (Maj+Tab jusqu'à « plan mode »), puis coller :
   `Lis @prompts/04-adaptateur-firebase.md et exécute cette phase.`
3. **Lire et corriger le plan avant d'accepter.** C'est là que vous évitez 80 % des erreurs.
4. Laisser travailler. Intervenir si l'agent sort du périmètre de la phase.
5. **Revue obligatoire** : coller `@prompts/99-revue-de-phase.md` en fin de phase.
6. Tests verts → merge → tag `phase-04-ok`. Ne jamais démarrer une phase sur une base rouge.

## 3. Ordre des phases et correspondance avec le contrat

| Prompt | Phase | Semaines contrat |
|---|---|---|
| 00 → 03 | Filet de sécurité, cartographie, découpage | S1 – S2 |
| 04 → 06 | Firebase, authentification, logique serveur et secrets | S3 – S6 |
| 07 | Médias et vidéo | S7 – S9 |
| 08 → 09 | Performances, temps réel, push, e-mails, supervision | S10 – S11 |
| 10 | Paiements et livraison | S12 – S13 |
| 11 | Modération et fonctionnalités avancées | S14 – S18 |
| 12 | PWA, Android, Play Store | S19 – S20 |

## 4. Les 3 décisions à faire valider par Gorgui AVANT la phase 05

Voir `docs/DIAGNOSTIC.md`, section « Décisions produit bloquantes ». Sans ces réponses,
l'agent n'a pas le droit de trancher à votre place.

## 5. Conseils d'usage

- Modèle : lancez les phases d'architecture (02, 04, 05, 06) avec le modèle le plus puissant disponible ; les phases mécaniques passent très bien avec un modèle plus rapide.
- Si le contexte sature, demandez : « Résume l'état de la phase dans `docs/journal/phase-XX.md` », puis `/clear` et reprenez depuis ce fichier.
- Ne laissez jamais un agent déployer en production ou manipuler de vraies clés sans votre validation explicite.
