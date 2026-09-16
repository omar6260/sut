# Phase 06 — Logique métier sensible côté serveur et secrets des API

## Objectif
Aucune opération financière, aucun privilège et aucune clé API ne dépend plus du navigateur. Les règles Firestore passent en mode strict.

## Entrées
`docs/inventaire/logique-sensible.md`, `ecritures-croisees.md`, `appels-externes.md`, et la liste des fonctionnalités cassées notée en phase 04.

## Méthode (répéter par domaine)
Ordre : pièces et cadeaux → boutique (commandes, commissions, enchères, codes promo, fidélité) → Éducation (abonnements, essai, inscriptions, notes) → fonds créateur et badges payants → modération et sanctions → réglages plateforme → écritures croisées sociales.

Pour chaque domaine :
1. `architecte` : contrat de chaque fonction (entrée, contrôles, effets, sortie) à partir du code legacy.
2. `dev-backend` : fonction appelable en transaction + tests unitaires reproduisant **exactement** les règles de calcul du legacy (mêmes taux, mêmes arrondis).
3. `dev-frontend` : remplace le bloc legacy lecture → calcul → écriture par `SuktumPlatform.api.call(...)`, en gardant les mêmes messages à l'écran.
4. Passage des préfixes concernés en écriture refusée côté client dans la génération des règles.
5. Tests e2e du domaine + test « tentative de triche » (écriture directe refusée).

## Écritures croisées sociales
Likes, commentaires, votes, abonnés : sous-collections (`kv_post/{id}/likes/{uid}`) ou `FieldValue.increment` avec règles dédiées. Adapte l'adaptateur pour que la forme lue par le legacy reste identique.

## Secrets et appels IA (cahier 2.3 et 3.7)
1. Fonctions `ai/` : `claudeMessages`, `geminiGenerate`, `geminiEmbed`, `visionAnnotate`, `videoAnnotate`, `yangoRequest`, `weather`, `reverseGeocode`. Chaque fonction : authentification, liste blanche des usages (pas de relais générique ouvert), limite par utilisateur et par jour, journal du coût.
2. Supprime les champs de saisie de clés API du back-office (~l. 6 738 – 6 740 et ~l. 9 539) et remplace-les par un indicateur « configurée côté serveur : oui / non ».
3. Clés dans Secret Manager uniquement. Oumar les renseigne lui-même avec `firebase functions:secrets:set`.
4. Remplace les 20+ `fetch` directs par les fonctions serveur.

## Liste globale et export
La liste de toutes les clés (~l. 29 433) et l'export RGPD passent par des fonctions serveur (admin et utilisateur respectivement).

## Définition de « terminé »
- `grep` sans résultat pour `api.anthropic.com`, `generativelanguage.googleapis.com`, `vision.googleapis.com`, `?key=` dans `src/`.
- Règles strictes générées ; aucune classe SERVEUR_SEUL ou ADMIN inscriptible par un client (tests).
- Suite e2e complète verte ; revue `auditeur-securite` : OK.
