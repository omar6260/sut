# Diagnostic technique du prototype Suktum

Analyse réalisée sur `code-source-suktum.html` (37 411 lignes, 2 448 206 octets).

## 1. Structure du fichier
| Zone | Lignes | Contenu |
|---|---|---|
| `<head>` et scripts externes | 1 – 43 | Jitsi (`meet.jit.si/external_api.js`) |
| CSS | 44 – 233 | Styles globaux |
| Scripts externes | 234 – 235 | FFmpeg.wasm 0.11.6 (unpkg), Google Identity Services |
| Balisage HTML | 236 – 6 892 | Tous les écrans, modales et formulaires |
| JavaScript | 6 893 – 37 409 | Un seul `<script>`, ~1 960 fonctions dans la portée globale |

- 1 483 gestionnaires `onclick=` inline : les fonctions **doivent rester globales** tant qu'ils existent.
- 985 usages de `innerHTML` : surface XSS importante, à auditer.
- 20 `setInterval` : temps réel simulé par sondage.

## 2. Couche de stockage — le bon point de levier
Tout l'accès aux données passe presque exclusivement par 3 fonctions (lignes 6 894 – 6 906) :

| Fonction | Appels | Rôle |
|---|---|---|
| `safeGet(key, shared)` | 1 052 | lit et parse le JSON, `null` en cas d'erreur |
| `saveWithRetry(key, value, shared)` | 728 | sérialise et écrit, toast si échec |
| `safeList(prefix, shared)` | 328 | liste les clés d'un préfixe |

S'y ajoutent des appels directs : 112 `window.storage.delete`, et une douzaine de `get`, `set` et `list`
(test de santé ligne ~7 075, export global ligne ~29 433, rôles admin lignes ~30 047 – 30 071).

→ **Conséquence** : un adaptateur qui réimplémente l'interface `window.storage` sur Firestore permet
de rendre l'application persistante **sans toucher aux 2 100 appels métier**. C'est l'objet de la phase 04.

Environ 245 préfixes de clés distincts (`user:`, `post:`, `enrollment:`, `coinbalance:`, `devicelink:`, `settings:`…).
Les plus listés : `enrollment:` (29), `report:` (9), `post:` (7), `servicebooking:` (7).

## 3. Problèmes critiques identifiés

### C1 — Motif « tout charger puis filtrer » (coût et performance)
Exemple ligne 8 842 : `safeList('post:')` puis un `safeGet` par publication, puis filtrage en JavaScript.
Sur Firestore, chaque document lu est facturé : ouvrir le fil lirait **toutes** les publications de la plateforme.
Acceptable pour 50 testeurs, ruineux à 10 000 utilisateurs. → Cache dans l'adaptateur (phase 04), puis vraies requêtes paginées sur les chemins chauds (phase 08).

### C2 — Toutes les règles métier sensibles sont côté client
- Ligne 7 235 : le solde de pièces est lu, incrémenté et réécrit par le navigateur (`coinbalance:`). **N'importe qui peut se créditer.**
- Ligne 28 820 : `settings:adminpin_hash` est lisible par tous → attaque hors ligne sur le PIN admin.
- Rôles admin, modérateurs, DG régionaux (`settings:moderators`, `settings:regionaladmins`…) : lisibles et modifiables côté client.
- Clés API Gemini, Vision et Video Intelligence saisies au back-office et stockées en réglages partagés, puis utilisées dans des `fetch` depuis le navigateur.
→ Des règles Firestore seules ne suffisent pas : ces écritures doivent passer par Cloud Functions (phase 06).

### C3 — Écritures croisées entre utilisateurs
Likes, commentaires, votes de sondage, inscriptions et compteurs modifient souvent **le document d'un autre utilisateur**
(lecture → modification → réécriture complète). Deux conséquences :
- une règle « seul le propriétaire écrit » casse ces fonctionnalités ;
- deux utilisateurs simultanés s'écrasent mutuellement (dernier écrit gagnant).
→ L'inventaire doit repérer chaque cas ; ils deviennent des sous-collections, des `increment()` ou des fonctions transactionnelles.

### C4 — Identité fondée sur le nom d'utilisateur et l'appareil
`currentUser` est une simple chaîne (ligne 7 045). L'identité repose sur un `deviceId` stocké (lignes 7 511, 7 890) et `devicelink:`.
Sans mot de passe, n'importe qui connaissant un nom d'utilisateur pourrait se connecter à sa place une fois sur un vrai serveur.

### C5 — Médias en base64 dans les valeurs
Limite Firestore : 1 Mio par document. Toute vidéo ou grande photo en base64 échouera. → Phase 07 : Storage + Cloudflare Stream.

### C6 — FFmpeg.wasm 0.11.6 et isolation cross-origin
La version multi-thread exige `SharedArrayBuffer`, donc les en-têtes COOP/COEP, qui peuvent casser la connexion Google (popup)
et l'iframe Jitsi. À tester dès la phase 03 : cœur mono-thread (`@ffmpeg/core-st`) ou filigrane et filtres côté serveur via Cloudflare Stream.

### C7 — Dépendances externes non maîtrisées
Jitsi public (`meet.jit.si`), FFmpeg via unpkg, Nominatim, OpenWeatherMap, Yango (`b2b.taxi.yandex.net`).
À auto-héberger, épingler ou relayer par le serveur.

## 4. Décisions produit bloquantes (à faire valider par Gorgui avant la phase 05)

**D1 — Connexion sur un nouvel appareil.** Le nom d'utilisateur seul ne peut pas prouver l'identité.
Proposition : compte créé en authentification anonyme Firebase lié à l'appareil ; sur un nouvel appareil, reconnexion obligatoire par Google, PIN (vérifié serveur, tentatives limitées) ou code 2FA.

**D2 — Migration des données de test.** Existe-t-il des données réelles dans l'environnement Claude à conserver ?
Si oui, prévoir un export via l'outil de diagnostic du back-office et un script d'import. Sinon, démarrage à vide.

**D3 — Mineurs.** Le guide prévoit le Mode Familial pour les 13 – 17 ans. La date de naissance « n'est jamais conservée telle quelle » :
confirmer ce qui est stocké (tranche d'âge, booléen) pour concevoir le modèle et les règles.
