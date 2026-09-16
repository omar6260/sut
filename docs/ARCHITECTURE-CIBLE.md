# Architecture cible

## Vue d'ensemble
```
Navigateur / App Android (Capacitor)
  └─ src/legacy/*  (code métier existant, découpé)
       └─ window.storage  ← src/platform/storage-adapter.js
            ├─ lectures publiques et privées → Firestore (SDK web, règles de sécurité)
            └─ écritures sensibles → callable Functions (api-client.js)
  └─ src/platform/auth.js      → Firebase Auth (anonyme + Google + custom token)
  └─ src/platform/media.js     → Storage (URL signées) / Cloudflare Stream (vidéos)
  └─ src/platform/realtime.js  → écouteurs Firestore (remplace setInterval)

Cloud Functions v2 (europe-west1)
  auth/  coins/  shop/  edu/  admin/  ai/  media/  payments/  moderation/  notifications/  scheduled/
  Secret Manager : ANTHROPIC_API_KEY, GEMINI_API_KEY, GCP vision, CLOUDFLARE_*, WAVE_*, OM_*, RESEND_API_KEY, YANGO_*
```

## Correspondance clé → document (adaptateur)
| Appel legacy | Stockage Firestore |
|---|---|
| `set('post:abc', v, true)` | `kv_post/abc` → `{ data: v, owner: uid, updatedAt }` |
| `set('draft:1', v, false)` | `users/{uid}/private/draft:1` → `{ data: v, updatedAt }` |
| `list('enrollment:c1__', true)` | requête `kv_enrollment` par plage d'ID `c1__` → `c1__\uf8ff` |
| `delete('story:x', true)` | suppression `kv_story/x` |

- Encodage des ID : remplacer `/` par `%2F` (interdit dans les ID Firestore) ; fonction réversible et testée.
- La valeur est stockée **décodée** dans `data` (pas en chaîne JSON) pour permettre les requêtes en phase 08.
- Le préfixe détermine la collection **et** la classe de sécurité (voir `docs/inventaire/classification.md`).

## Classes de sécurité des préfixes
| Classe | Lecture | Écriture | Exemples probables |
|---|---|---|---|
| PUBLIC_PROPRIETAIRE | tous les connectés | propriétaire (`owner == uid`) | `post:`, `product:`, `course:` |
| PRIVE | propriétaire | propriétaire | brouillons, préférences |
| PARTICIPANTS | membres listés | membres listés | `dm:`, chats de cours |
| SERVEUR_SEUL | selon cas | **Functions uniquement** | `coinbalance:`, `order:`, `gift:`, `settings:`, rôles, `auditlog:` |
| ADMIN | rôle vérifié par claim | Functions uniquement | signalements, sanctions, reversements |

Les rôles sont portés par des **custom claims** Firebase Auth (`role`, `country`, `domain`), attribués uniquement par une fonction réservée au super-admin.

## Principes
- Idempotence de toutes les fonctions de paiement (clé d'idempotence, journal des webhooks).
- Transactions Firestore pour tout compteur ou solde.
- Pagination par curseur partout où une liste peut dépasser 50 éléments.
- Deux projets Firebase : `suktum-dev` (émulateurs et recette) et `suktum-prod`.
