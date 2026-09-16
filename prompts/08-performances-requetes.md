# Phase 08 — Performances et coûts : de « tout charger » aux vraies requêtes

## Objectif
Chaque écran lit un nombre de documents **borné** (≤ 60 lectures à l'ouverture), quel que soit le nombre d'utilisateurs.

## Tâches
1. `testeur-qa` : jeu de données de charge sur l'émulateur (5 000 utilisateurs, 50 000 publications, 2 000 produits, 300 cours, 30 000 inscriptions) et mesure des lectures par écran avec `SuktumPlatform.stats`.
2. `architecte` : classe les écrans par coût × fréquence. Priorité attendue : fil (onglets Pour vous, Amis, Local, Récent, Communauté), `enrollment:` (29 listes), messagerie, boutique, profil, back-office.
3. Pour chaque chemin chaud, crée dans `src/platform/queries/` une fonction dédiée (requête filtrée, triée, paginée par curseur) et remplace **uniquement** l'appel `safeList + boucle safeGet` correspondant du legacy. Ajoute les index dans `firestore.indexes.json`.
4. Onglet « Pour vous » : score calculé côté serveur (fonction planifiée ou déclenchée) à partir des signaux décrits dans le guide (likes, visionnages complets, abonnements, tendances), stocké par utilisateur, lu par page de 10. « Pourquoi cette vidéo ? » lit les raisons stockées.
5. Dénormalise les compteurs (likes, vues, abonnés) mis à jour par déclencheurs.
6. Défilement infini : chargement de la page suivante à l'approche de la fin.

## Définition de « terminé »
Tableau avant / après des lectures par écran sur le jeu de charge ; aucun écran principal au-dessus du plafond ; e2e verts.
