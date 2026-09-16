# Phase 05 — Authentification réelle et sécurisation du back-office

## Prérequis bloquant
Les décisions **D1** et **D3** de `docs/DIAGNOSTIC.md` doivent être tranchées et consignées dans `docs/journal/decisions.md`.
Si elles ne le sont pas : arrête-toi et demande-les à Oumar.

## Objectif
Chaque action est rattachée à une identité prouvée côté serveur. Personne ne peut agir au nom d'un autre. Le back-office n'a plus aucun secret côté client.

## Tâches — Utilisateurs
1. Délègue au `cartographe` le parcours complet actuel : inscription, `currentUser`, `getOrCreateDeviceId` (~l. 7 890), `devicelink:` (~l. 7 511), connexion Google, PIN, 2FA, multi-comptes (3 par appareil), vérification d'âge.
2. Fonctions serveur (`functions/src/auth/`) :
   - `registerUsername` : réserve le nom de manière atomique (`usernames/{username} → uid`), calcule la tranche d'âge selon D3, refuse les moins de 13 ans, positionne le claim `familyMode` pour les 13 – 17 ans.
   - `linkGoogle` / connexion Google : vérification du jeton côté serveur (cahier 3.12).
   - `verifyPin` et `setupTotp` / `verifyTotp` : hash côté serveur uniquement, limitation à 5 tentatives par 15 minutes.
   - Reconnexion sur un nouvel appareil selon D1.
3. Frontend (`src/platform/auth.js`) : remplace la logique d'identité du legacy en conservant les écrans existants. `currentUser` reste une chaîne (nom d'utilisateur) pour ne rien casser, mais n'est plus la source de vérité : l'`uid` l'est.
4. Multi-comptes : un compte actif à la fois, bascule par reconnexion (jetons conservés de façon sûre).

## Tâches — Back-office (cahier 3.11)
1. Supprime toute vérification de mot de passe, PIN ou code de secours côté client (`settings:adminpin_hash`, codes super-admin, ~l. 28 820 et 30 040 – 30 071).
2. Rôles en **custom claims** : `superadmin`, `dg` (avec `country` et `domain`), `moderator`, `payouts`, `techteam`. Fonction `setRole` réservée au super-admin, journalisée dans `auditlog`.
3. Premier super-admin : script d'amorçage manuel exécuté par Oumar (jamais exposé).
4. L'accès caché (5 taps) reste, mais n'ouvre le back-office que si le claim le permet.
5. Ré-authentification récente exigée pour les actions destructrices (kill switch, révocations).

## Tests
Tests de règles : un utilisateur ne peut pas écrire `usernames/` ni se donner un rôle. E2E : inscription, reconnexion sur un second contexte navigateur selon D1, refus d'un moins de 13 ans, Mode Familial actif pour un compte de 15 ans, back-office inaccessible sans claim.

## Définition de « terminé »
Plus aucun hash ni secret d'administration dans `src/` (preuve par grep dans le rapport) ; revue `auditeur-securite` : verdict OK ; commit.
