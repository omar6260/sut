# Phase 02 — Cartographie complète du prototype

## Pourquoi
Les phases 04 à 06 dépendent d'une connaissance exacte des ~245 préfixes de stockage. Une erreur de classification = une faille ou une fonctionnalité cassée.

## Méthode
Travaille par **lots délégués au `cartographe`** (10 à 15 préfixes par appel) pour ne pas saturer ton contexte. Consolide ensuite.

## Livrables (dans `docs/inventaire/`)

### 1. `prefixes.md` — un tableau, une ligne par préfixe
| Préfixe | Structure de la valeur (champs) | shared | Nb lectures | Nb écritures | Nb list | Qui écrit | Écriture croisée ? | Taille max estimée | Contient des médias base64 ? |

Commence par extraire la liste automatiquement :
`grep -oE "(safeGet|saveWithRetry|safeList|window\.storage\.(get|set|delete|list))\(['\`][a-z_]+:" legacy/suktum-app.html`
puis complète les préfixes construits dynamiquement (recherche des concaténations).

### 2. `classification.md`
Pour chaque préfixe, une classe parmi celles de `docs/ARCHITECTURE-CIBLE.md` (PUBLIC_PROPRIETAIRE, PRIVE, PARTICIPANTS, SERVEUR_SEUL, ADMIN), avec **une ligne de justification**.
En cas de doute : SERVEUR_SEUL.

### 3. `ecritures-croisees.md`
Chaque endroit où un utilisateur modifie une donnée appartenant à un autre (likes, commentaires, votes, inscriptions, compteurs, abonnés…). Pour chacun : ligne, fonction, champ modifié, solution proposée (sous-collection, `increment`, fonction serveur).

### 4. `logique-sensible.md`
Toute logique qui doit migrer côté serveur : pièces, achats, commissions, reversements, fonds créateur, badges payants, abonnements, enchères, codes promo, points de fidélité, rôles, sanctions, PIN, 2FA, codes de secours, vérification d'âge et Mode Familial, auto-acceptation. Ligne, fonction, règle métier résumée.

### 5. `appels-externes.md`
Chaque `fetch` et script externe : URL, fonction, secret utilisé, où est stocké ce secret, fonction serveur cible.

### 6. `temps-reel.md`
Les 20 `setInterval` : ligne, période, ce qui est sondé, remplacement proposé.

### 7. `ecrans-et-modules.md`
Découpage du JavaScript en **domaines fonctionnels** (plages de lignes contiguës) : socle/utilitaires, auth, fil, publication, profil, messagerie, lives, Penc, boutique, éducation, back-office, paramètres, diagnostic. Signale les zones où les domaines sont entremêlés. Ce fichier sert à la phase 03.

## Règle
Chaque affirmation cite au moins un numéro de ligne. Rien n'est modifié hors de `docs/inventaire/`.

## Définition de « terminé »
Les 7 fichiers existent ; `prefixes.md` couvre 100 % des préfixes extraits par grep (fournis le script de vérification `scripts/check-inventaire.mjs`) ; demande une relecture à l'`architecte` et intègre ses remarques.
