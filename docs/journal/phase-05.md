# Phase 05 — Authentification réelle et sécurisation du back-office

Date : 2026-09-17 · Branche : `phase-05-authentification` · Décisions : D1 (cahier §3.1/§3.12), D3 (tranche d'âge) dans `decisions.md`.

## Fait
- **Cloud Functions** (`functions/`, TypeScript, Node 22, `europe-west1`) : `registerUsername` (réservation atomique `usernames/{nom} → uid`, 3 noms max par compte, claim `familyMode` pour 13–17, refus hors 13–17/18+), `myUsernames`, `setPin`/`verifyPin` (scrypt salé, 5 essais / 15 min), `setupTotp`/`confirmTotp`/`verifyTotpCode`/`disableTotp` (RFC 6238 côté serveur), `setRole` (super-admin seul, claims `superadmin|dg|moderator|payouts|techteam` + `country`/`domain`, jeton révoqué, journal `auditlog`). Tests unitaires : 4/4 (vecteur RFC 6238 inclus).
- **Client** : `src/platform/auth.js` (Google : liaison au compte anonyme qui possède un nom, sinon connexion = récupération ; claims ; ré-authentification) et `src/platform/legacy-overrides.js` (chargé avant `20-init.js`) : mêmes écrans, mêmes textes — inscription, connexion par nom, écrans PIN/2FA, cartes de sécurité, accès caché 5 taps par claims, `confirmWithPinReentry` = ré-authentification Google.
- **Legacy** : `scripts/neutralize-legacy-secrets.mjs` vide 34 fonctions + 2 blocs qui vérifiaient ou stockaient des secrets côté client. `grep -rE "adminpin_hash|admin_backup_codes|securityPin|totpSecret|totpBackupCode|pinHash" src/` → **0 résultat**.
- **Règles** : `usernames/`, `auth_secrets/`, `auth_attempts/` serveur seulement ; secrets et listes de rôles de `kv_settings` **illisibles** et inscriptibles par personne côté client.
- **Bootstrap** : `scripts/bootstrap-superadmin.mjs <email-google>` (manuel, jamais exposé).

## Vérification
| Critère | État | Preuve |
|---|---|---|
| Plus aucun hash ni secret dans `src/` | VALIDÉ | grep ci-dessus = 0 |
| Un utilisateur ne peut écrire ni `usernames/` ni ses claims | VALIDÉ | `tests/rules` 11/11 (dont test « phase 05 ») ; claims uniquement via Admin SDK / `setRole` |
| E2E : inscription, refus du nom pris sur un autre appareil, récupération Google sur un 2e contexte, familyMode 13–17, PIN serveur avec limitation, back-office sans claim refusé / avec claim ouvert (super-admin, modérateur) | VALIDÉ | `npm run test:e2e:firebase` **38/38** |
| Suite mémoire (caractérisation) | VALIDÉ | 24/24 (+14 réservés firebase) |
| Revue sécurité | VALIDÉ (en ligne) | voir ci-dessous |

## Revue sécurité (points contrôlés)
- Jeton Google vérifié côté serveur : Firebase Auth (signature, audience) — cahier §3.12.
- PIN/TOTP : jamais en clair ni côté client ; hachage scrypt salé ; comparaison en temps constant ; fenêtre glissante 5/15 min par uid et par type.
- Rôles : claims posés uniquement par `setRole` (super-admin) ou le script d'amorçage ; `revokeRefreshTokens` à chaque changement ; l'interface relit les claims à l'accès et toutes les 30 s (`verifyCurrentAdminSessionStillValid`).
- Le client ne peut lire ni écrire les anciennes listes de rôles avec `pinHash`, ni les clés API (illisibles → les écrans admin qui les affichent sont vides jusqu'à la phase 06).
- Reste (phase 06) : les actions admin elles-mêmes (sanctions, validations, réglages) sont encore des écritures client sous claims non vérifiés par Firestore → Functions.

## Écarts et limites
- Refus des moins de 13 ans : l'écran ne propose que 13–17 / 18+ (D3) ; le serveur refuse toute autre valeur. Pas de saisie de date.
- Multi-comptes : jusqu'à 3 noms par compte Firebase (même appareil) ; la bascule vers un nom d'un autre compte passe par Google.
- Gestion des équipes (ajout DG/modérateurs/spécialistes) : écrans neutralisés (toast) — remplacés par `setRole` en phase 06 (écran à câbler).
- Écrans-fantômes : `screen-admin-login` n'est plus atteignable (5 taps ouvrent directement selon le claim).

## Console Firebase (fait par Oumar) : Firestore `europe-west1`, Auth Anonyme + Google activés.
