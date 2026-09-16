# Phase 10 — Paiements : encaissement, décaissement et livraison

## Avertissement
Phase à plus haut risque financier. **Travaille exclusivement en mode test/sandbox.** Aucune clé de production dans le dépôt ni dans la session.

## Prérequis
Comptes marchands et accès sandbox fournis par Gorgui (Wave Business, Orange Money, passerelle carte choisie). S'ils manquent : implémente derrière une interface avec un fournisseur simulé, et arrête-toi avant l'intégration réelle.

## Architecture imposée
- Interface `PaymentProvider` côté serveur : `createCheckout`, `verifyWebhook`, `getStatus`, `refund`. Une implémentation par fournisseur.
- Collection `payments/{id}` : `{ uid, purpose, targetRef, amountXof (entier), provider, status, providerRef, idempotencyKey, createdAt, confirmedAt }`.
- Machine à états stricte : `created → pending → succeeded | failed | expired`, puis `refunded`.
- **L'effet métier** (badge, Premium, abonnement Éducation, commande, pièces, billet de live) n'est déclenché **que** par le webhook vérifié ou une vérification serveur du statut, dans une transaction, une seule fois.
- Webhooks : vérification de signature, journal brut dans `webhook_events`, réponse rapide, traitement idempotent.
- Réconciliation : fonction planifiée qui revérifie les paiements `pending` de plus de 30 minutes.

## Tâches
1. `cartographe` : tous les parcours de paiement manuel actuels et les calculs de commission.
2. Encaissement : Wave, Orange Money, carte. Le parcours manuel reste disponible comme secours, activable au back-office.
3. Commissions : calcul serveur identique au legacy, enregistré sur chaque transaction.
4. **Décaissement (cahier 3.4)** : calcul automatique des sommes dues, mais **validation humaine obligatoire** par un rôle `payouts` puis confirmation par un second administrateur (quatre yeux) avant tout envoi. L'automatisation complète reste désactivée par défaut, derrière un interrupteur réservé au super-admin.
5. Yango (cahier 3.9) : relais serveur, coordonnées GPS du vendeur saisies par sélection sur carte, statut de livraison sur la commande.

## Tests
Parcours complets en sandbox ; webhook rejoué 3 fois → effet appliqué une seule fois ; webhook à signature invalide refusé ; montant modifié par le client ignoré ; décaissement impossible sans double validation.

## Définition de « terminé »
Revue `auditeur-securite` : verdict OK sans réserve sur la grille « Argent » ; document `docs/paiements.md` pour Gorgui (fonctionnement, réconciliation, remboursement).
