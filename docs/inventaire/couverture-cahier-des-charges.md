# Couverture du cahier des charges — où chaque exigence est traitée

Source : `docs/source/cahier-des-charges-suktum.docx` (§3 travail à réaliser, §4 fonctionnalités à reproduire fidèlement, §5 ordre recommandé).
Principe contractuel (§4) : **rien n'est reconçu** ; chaque fonctionnalité est branchée sur l'infrastructure en conservant son comportement et son interface exacts. Le legacy découpé (`src/legacy/js/`) est la source de vérité de l'interface ; les tests de caractérisation (`tests/e2e/`) la figent.

## 1. Travail à réaliser (§3) → phases du kit

| § | Exigence | Phase | État | Notes |
|---|---|---|---|---|
| 3.1 | Base de données + authentification | 04 (adaptateur Firestore), 05 (Firebase Auth) | 04 en cours | Choix Firebase (option 1 du cahier). Le préfixe → collection : `docs/inventaire/prefixes.md`. Le paramètre `shared` **n'est pas fiable** (12 préfixes contredits, phase 02) : routage par table, pas par `shared` |
| 2.3 | Clé Claude côté serveur | 06 | à faire | 8 appels Anthropic sans clé aujourd'hui (`appels-externes.md` §1) |
| 3.2 | Médias hors base64, vidéos longues, upload direct, miniature auto, CDN | 07 (Storage + Cloudflare Stream) ; déport provisoire dès 04 (D9) | à faire | 24 préfixes portent du base64 ; limite Firestore 1 Mio/doc |
| 3.3 | Encaissement Wave / Orange Money / carte (webhooks) | 10 | à faire | Les taux/prix en `settings:` restent valables (§3.3) mais deviennent SERVEUR_SEUL |
| 3.4 | Décaissement (reversements) | 10, **après validation juridique** | à faire | Vigilance renforcée du cahier reprise telle quelle |
| 3.5 | Temps réel (chat de cours, doc collaboratif, notifications) | 09 | à faire | 20 `setInterval` cartographiés (`temps-reel.md`) |
| 3.6 | Notifications push (FCM) | 09 | à faire | |
| 3.7 | Modération images (Vision), vidéos (Video Intelligence), texte (Claude/Gemini) | 06 (clés serveur), 07 (pipeline média), 11 | à faire | Déjà câblé côté client dans le prototype avec clés exposées (C2) |
| 3.8 | PWA puis Android / Play Store | 12 | à faire | |
| 3.9 | Yango Delivery | 10 | à faire | Intégration inachevée (coordonnées `[0,0]`, `a-traiter.md`) |
| 3.10 | Diagnostic & alertes précoces | conservé tel quel ; Sentry en 09 | partiel | L'outil back-office existant est gardé |
| 3.11 | Sécurité du back-office côté serveur | 05/06 (Auth + custom claims) | à faire | `settings:adminpin_hash` caractérisé par `backoffice.spec` — ce test **change** en phase 06 |
| 3.12 | Vérification du jeton Google côté serveur | 05 (Firebase Auth Google) | à faire | `GOOGLE_CLIENT_ID` vide dans le prototype |
| 3.13 | E-mails transactionnels (Resend) | 09 | à faire | |
| 3.14 | Supervision (Sentry, UptimeRobot) | 09 | à faire | |
| 6 | CGU/confidentialité, paiements, mineurs, fiscalité | hors code — juriste | à suivre par Gorgui | Mode Familial et compte parent existent (D3, D8) |

## 2. Fonctionnalités à reproduire fidèlement (§4) → où elles vivent, comment elles sont protégées

Légende « Test » : ✅ figé par un test de caractérisation (phase 01) · ➖ pas encore de test (à ajouter **avant** de toucher au domaine, règle de la phase 01).

### 4.1 Fil social et contenu
| Fonctionnalité | Fichier legacy | Test | Risque migration (phase 02) |
|---|---|---|---|
| Publication vidéo/photo, légende, hashtags, mentions, son, programmation | `05-feed-publication.js` (`publishPost` l. 10493) | ✅ publication.spec | médias base64 (07) ; `releaseScheduledPosts` exécuté par tout client → cron (06) |
| Likes, dislikes, commentaires, favoris, repartage, téléchargement, signalement | `08-feed-interactions.js` | ✅ like + commentaire | écritures croisées sur `post:` → sous-collections (04/08) |
| Stories 24 h / permanentes, Duo, Stitch, filtres vidéo, mode sensible, filigrane FFmpeg | `07-stories-video.js`, `05-feed-publication.js` (FFmpeg l. 8910) | ➖ | C6 : FFmpeg multi-thread incompatible avec Jitsi (décision phase 07) |
| Recherche, suggestions, blocage, QR code, export RGPD | `06-recherche-notifications.js`, `11-profil.js` | ✅ recherche (messagerie.spec) | export = Function admin |
| Sondages, trends, pourboires | `19-backoffice.js` (sondages l. 31142), `16-live-monetisation.js` | ➖ | pourboires = `gift:` SERVEUR_SEUL |
| Lecture à voix haute, traduction (Claude) | `08-feed-interactions.js` | ➖ | clé Claude serveur (06) |

### 4.2 Lives et messagerie
| Fonctionnalité | Fichier | Test | Risque |
|---|---|---|---|
| Lives Jitsi, condition 1 000 abonnés / dérogation, cadeaux avec commission, billets | `16-live-monetisation.js` | ➖ | coût de sondage 2,8 M lectures/h/spectateur → 08/09 ; Jitsi bloqué sous COEP (07) |
| Messagerie texte/photo/vocal, groupes | `18-messagerie-support.js` | ✅ texte (messagerie.spec) | `dm:` = tableau réécrit, médias 2 Mo → sous-collection (06) |

### 4.3 Marketplace
| Fonctionnalité | Fichier | Test | Risque |
|---|---|---|---|
| Catalogue, import CSV, commandes, suivi, commission, reversements | `14-boutique-vendeur.js`, `17-boutique-catalogue-commandes.js` | ✅ produit + commande + statut | commission/net calculés client → Function `createOrder` (06) |
| Coordonnées, chat lié, WhatsApp, réponses rapides | `17-…`, `18-…` | ➖ | |
| Annuaire local, story boutique, traduction, classement vendeurs | `19-backoffice.js` (annuaire l. 31078), `14-…` | ➖ | |

### 4.4 Espace Éducation
| Fonctionnalité | Fichier | Test | Risque |
|---|---|---|---|
| Candidature formateur (photo, paiement, diplôme), badge Vérifié | `12-education-noyau.js` (`submitTrainerApplication` l. 16478) | ➖ (statut simulé) | approbation + rôle → Function + claim (06) |
| Cours multi-niveaux, multi-formats | `13-education-cours.js` (`createCourse` l. 17984) | ✅ cours + leçon | contenu de cours → règle unique PARTICIPANTS (D8) ; vidéos/podcasts → Storage |
| Exercices, examens, correction IA, QCM | `13-…` | ➖ | corrigés lisibles par l'élève (`correctIndex`) → sous-document serveur (06) |
| Chat de cours, doc collaboratif, FAQ, avis | `13-…` | ➖ | sondage 4 s → `onSnapshot` (09) |
| Conférences programmées, rappels, calendrier, co-enseignement | `13-…`, `16-…` | ➖ | rappels exécutés par les clients → cron (06) |
| Abonnement mensuel, essai 7 jours, accès financé par l'État, aperçu gratuit | `12-…` | ✅ essai + inscription | abonnement/approbation → Function (06) |
| Révision examens nationaux, badges, bulletin, attestations | `13-…`, `19-backoffice.js` | ➖ | attestation émise côté client → Function (06) |
| Compte parent/tuteur avec consentement | `13-…` (l. 20134) | ➖ | `parentlink` → Function (06) ; revue juridique mineurs (§6) |

### 4.5 Back-office et gouvernance
| Fonctionnalité | Fichier | Test | Risque |
|---|---|---|---|
| Accès caché 5 taps, rôles hiérarchisés (super-admin, DG pays/domaine, modérateur, reversements) | `11-profil.js` (`handleAvatarTap`), `19-backoffice.js` (`checkAdminPin` l. 29816) | ✅ accès + mot de passe | hash et rôles côté client → Auth + claims (05/06) ; **le test change** |
| Journal d'audit, résumé IA quotidien/hebdo | `19-…` | ➖ | chaîne de hachage calculée client → Function (06) |
| Auto-acceptation, actualité officielle, défis, réglages financiers, multi-devises | `19-…`, `03-preferences.js` | ➖ | interrupteurs `settings:autoApprove*` → lus uniquement par Functions (06) |

## 3. Ce que cette matrice impose au plan
1. **Avant chaque phase qui touche un domaine « ➖ »**, ajouter son parcours de caractérisation (règle de la phase 01). Priorités : stories/duo (07), lives (07-09), examens/QCM (06), candidature formateur (06), parent/tuteur (06), rôles admin (05/06).
2. **Aucun écran n'est reconstruit** : les 244 `screen-*` du gabarit restent, `go()` reste global, les `onclick=` inline restent tant qu'une phase ne dit pas le contraire.
3. Les tests qui figent une faille (hash admin côté client) sont marqués « à changer en phase 06 » dans `tests/README.md`.
