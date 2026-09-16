# Revue de fin de phase (à coller à la fin de chaque phase)

Avant de déclarer la phase terminée, exécute cette revue dans l'ordre :

1. **Périmètre** : compare `git diff main...HEAD --stat` au prompt de la phase. Liste tout fichier modifié hors périmètre et justifie-le ou annule-le.
2. **Tests** : lance `npm run build`, `npm run test:e2e`, `npm run test:rules`, `npm --prefix functions test`. Rapporte les résultats bruts.
3. **Sécurité** : délègue à `auditeur-securite` la revue du diff. Corrige tous les BLOQUANTS, puis relance la revue.
4. **Définition de « terminé »** : reprends chaque critère du prompt de la phase et indique VALIDÉ ou NON VALIDÉ avec la preuve (commande, sortie, fichier).
5. **Journal** : crée `docs/journal/phase-XX.md` avec : ce qui a été fait, décisions prises (et reportées dans `decisions.md`), écarts avec le plan, dette ajoutée dans `a-traiter.md`, risques pour la phase suivante.
6. **Mise à jour de `CLAUDE.md`** si une commande, une convention ou une architecture a changé.
7. Propose le message de merge. **Ne merge pas toi-même.**
