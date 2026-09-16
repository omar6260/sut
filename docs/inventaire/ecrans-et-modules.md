# Écrans et modules — découpage du prototype en domaines fonctionnels

Objectif : donner à la phase 03 des **plages de lignes contiguës** à extraire en fichiers `src/legacy/NN-<domaine>.*`,
et signaler les zones où les domaines sont entremêlés. Repères : les 276 marqueurs `/* ---------- TITRE ---------- */`
du script (`grep -n "^/\* ---------- " legacy/suktum-app.html`) et les 244 sections `id="screen-…"` du balisage.

## 1. Structure globale du fichier

| Plage | Contenu | Fichier cible (phase 03) |
|---|---|---|
| 1 – 43 | `<head>` : méta, Jitsi (l. 40) | `00-head.html` |
| 44 – 233 | CSS global (`<style>`) | `10-styles.css` |
| 234 – 235 | scripts FFmpeg.wasm (unpkg), Google Identity | `00-head.html` (à épingler localement) |
| 236 – 6 892 | balisage : 244 écrans `<section class="screen">` + barre d'onglets (l. 6 820) + toast (l. 6 827) | `20-markup-*.html` (découpé par domaine, voir § 3) |
| 6 893 – 37 409 | un seul `<script>` : ~1 960 fonctions globales | `30-…js` à `90-…js` (voir § 2) |
| 37 407 – 37 409 | `/* INIT */ initIdentity();` | `99-init.js` — **doit rester le dernier** |

## 2. Domaines JavaScript (l. 6 893 – 37 409)

Les plages sont données dans l'ordre du fichier ; l'ordre de concaténation doit être préservé (déclarations `let`/`const` globales utilisées plus bas).

| # | Domaine | Plage | Marqueurs de début | Notes |
|---|---|---|---|---|
| 30 | **Socle** : stockage, identité, erreurs, diagnostic | 6 894 – 7 204 | STORAGE HELPERS (6 894), IDENTITY (6 955), CONNEXION AVEC GOOGLE (6 982), ALERTE PRÉCOCE (7 051), OUTIL DE DIAGNOSTIC (7 066), SEUILS D'ALERTE (7 094), JOURNAL DES ERREURS (7 178) | `safeGet/saveWithRetry/safeList` (l. 6 896-6 906), `showToast`, `escapeHtml` (6 907-6 913) : **point d'accroche de l'adaptateur phase 04** |
| 31 | **Auth / session / compte** | 7 205 – 8 001 | MESSAGE DE BIENVENUE (7 205) → `initIdentity` (7 257), `completeOnboarding` (~7 800), `logoutAccount`, CHANGEMENT RAPIDE DE COMPTE (7 887) | contient la récompense quotidienne de pièces (l. 7 233-7 236) → **entremêlé avec la monétisation** |
| 32 | **Préférences d'interface** | 8 002 – 8 620 | LANGUE (8 002), SOUS-TITRES (8 010), MULTI-DEVISES (8 087), PALETTES (8 144), MODE SOMBRE (8 175), TEMPS D'ÉCRAN (8 350), STATUT EN LIGNE (8 388), AUTORISATION DE LIVE (8 439) | 8 439-8 620 est une règle métier des lives, pas une préférence |
| 33 | **Navigation** | 8 621 – 8 839 | NAVIGATION (8 621), MODE EXAMEN (8 622) → `go()` (8 647) | `go()` connaît **tous** les écrans (8 665-8 839) : dépendance transverse à conserver globale |
| 40 | **Fil et publication (médias)** | 8 840 – 11 244 | POSTS / FEED (8 840), FFmpeg (8 910), DÉCOUPAGE (9 034), MODÉRATION IA (9 534), SONS (9 654-10 071), IMAGES PÉDAGOGIQUES (10 072), PUBLICATIONS PROGRAMMÉES (10 136), TEXTE SEUL (10 211), CARROUSEL (10 297), BROUILLON (10 399), ANALYSE D'AUDIENCE (10 416), PAS INTÉRESSÉ (10 716), TRANSPARENCE ALGO (10 835), DICTÉE/RECHERCHE VOCALE (11 048-11 127), DIAPORAMA (11 128) | `publishPost` (10 493) ; 10 072 est de l'éducation égaré ici |
| 41 | **Recherche et notifications** | 11 245 – 11 859 | RECHERCHE GÉNÉRALE (11 245), CENTRE DE NOTIFICATIONS (11 376), GROUPÉES (11 477), NE PAS DÉRANGER (11 517) | `createNotification` (11 452), `renderNotifications` (11 567) — appelées par tous les domaines |
| 42 | **Stories, duo, stitch, lecture vidéo** | 11 860 – 12 729 | STORIES (11 860), QUESTIONS (12 021), AJOUTEZ LA VÔTRE (12 022), DUO (12 152), STITCH (12 279), RE-VISIONNAGE / REPRISE / VITESSE / PiP (12 385-12 729) | |
| 43 | **Fil : rendu, interactions, favoris, playlists** | 12 730 – 15 271 | VU PAR (12 730), PLAYLISTS (12 732-12 882), COMPARATEUR (12 883, boutique égarée), `renderFeed` (13 284), PALIER 1M (13 538), DOSSIERS FAVORIS (13 902), RÉACTIONS (13 965), ZOOM (13 967), `toggleLike` (14 283), `openCommentsScreen` (14 306), VOTE FONCTIONNALITÉS (14 399), SONDAGE COURS (14 400, éducation égarée), PANIER (14 567, boutique égarée), MULTI-CLIPS (14 568), RÉPONSE VIDÉO (14 891), MOTS INTERDITS (14 965), ACCUSÉS DE LECTURE (14 978), PRÉFÉRENCES NOTIF (14 986), CATÉGORIES INTERDITES (15 056), BROUILLONS COMMENTAIRES (15 078), CO-CRÉATEUR (15 079), PARTAGER AVEC UN AMI (15 197) | **zone la plus entremêlée du fichier** : fil, boutique, éducation, modération se succèdent par blocs de 20 à 300 lignes |
| 44 | **Explorer** | 15 272 – 15 393 | DISCOVER (15 272) | `renderDiscoverSearchResults` |
| 60a | **Éducation — administration** | 15 394 – 15 876 | ADMIN — ESPACE ÉDUCATION (15 394), SUIVI D'ACTIVITÉ DES FORMATEURS (15 487) | `approveCourse` (15 426), `approveEnrollment` (15 453) : back-office égaré avant le profil |
| 45 | **Profil** | 15 877 – 16 440 | HISTORIQUE DE VISIONNAGE (15 877), CONTENU DU JOUR (15 897), PROFILE (15 971), PROFIL PUBLIC (15 984), QUI A VU (16 008), RECOMMANDATIONS (16 050) | `handleAvatarTap` (accès admin caché), `openUserProfile` (15 987), `toggleBlockUser` (~16 247) |
| 50 | **Espace vendeur (noyau)** | 16 441 | ESPACE VENDEUR (16 441) — marqueur sans corps (une ligne) | |
| 60b | **Éducation — noyau, abonnements, essai** | 16 442 – 17 101 | ESPACE ÉDUCATION (16 442), ABONNEMENT BOUTIQUE (16 514, **boutique égarée**), ABONNEMENT ÉDUCATION (16 664), ESSAI 7 JOURS (16 708), ACCÈS FINANCÉ (16 785) | `isEducationSubActive` (16 776), `submitTrainerApplication` (16 478) |
| 60c | **Éducation — cours, leçons, formateur, élèves** | 17 102 – 20 915 | SUGGESTIONS (17 102), `renderEducationHub` (17 215), `enrollInCourse` (17 603), EXERCICES (17 672-17 965), ESPACE FORMATEUR (17 966), `createCourse` (17 984), ÉLÈVES/NOTES (18 058), `openManageCourse` (18 204), CHAT/FAQ/AVIS/BADGES (18 256-18 359), EXAMENS (18 360), QUIZ (18 564), DISCUSSION ÉLÈVES (18 670), VIDÉOTHÈQUE (19 150), REMPLAÇANT (19 169), CO-ENSEIGNEMENT (19 217), EMPLOI DU TEMPS (19 260), rappels/anniversaires/rapports (19 290-19 600, **mélange éducation + vendeur**), PODCASTS (19 601), OBJECTIF DE VENTE (19 698, vendeur), MODÈLE DE LEÇON (19 738), `addLessonToCourse` (19 774), RÉSULTATS/CONCOURS (19 953-20 133), PARENT/MODE FAMILIAL (20 134-20 340), ATTESTATION/BINÔME/RESSOURCES/VOCABULAIRE/OBJECTIF (20 341-20 915) | plus gros domaine (~3 800 lignes) ; 19 290-19 600 et 19 698 sont à réaffecter au vendeur |
| 50b | **Boutique — vendeur** | 20 916 – 22 147 | CRÉNEAUX (20 916), COACH IA (20 918), LIVRAISON GROUPÉE (20 919), APPEL VOCAL (20 920), MODÈLES (20 940), LIEN DE PAIEMENT (20 957), RÉCEMMENT VUS (20 958), TRADUCTION DM (20 959, **messagerie égarée**), QUARTIER (20 989), `addSellerProduct` (21 243), ABSENCE (21 333), VITRINE (21 334), MÉTÉO (21 423), `renderSellerDashboard` (21 463), NOTATIONS (21 557-21 636), KYC/PIN/TOTP (21 637-21 796, **sécurité de compte égarée**), BADGE VÉRIFIÉ (21 797), ANALYSE DU CODE / AGENT IA TECHNIQUE (21 883-22 147, **back-office égaré**) | |
| 46 | **Divers créateur / apprentissage** | 22 148 – 23 540 | BROUILLONS VIDÉO (22 148), AFFILIATION (22 149), PARCOURS D'APPRENTISSAGE (22 150, éducation), SOUHAITS/TROC (22 380-22 539, boutique), NIVEAUX CRÉATEUR (22 540), ASSISTANT (22 551), AGENDA (22 580), OBJECTIF DE CONTENU (22 654), REÇU/FACTURE (22 837, boutique), REMBOURSEMENTS (23 017, boutique), SON D'ALERTE (23 046, admin), SUPPRESSION DE COMPTE (23 178, admin), `changeUsername` (~23 500, compte) | fourre-tout : à répartir |
| 70 | **Lives, monétisation des lives, publicité, fonds créateur** | 23 541 – 26 242 | LIVE (23 541), PREMIUM (23 543), BADGE À L'UNITÉ (23 691), BUSINESS (23 696), BOOST (23 825), MONÉTISATION (23 901), FIL DES LIVES (24 138), SONDAGE LIVE (24 390), BATTLES (24 589), INVITÉS (24 707), CHAT LIVE (24 725), DEMANDE DE PAROLE (25 061), SPECTATEURS (25 183), VENTE FLASH (25 306), CADEAUX (25 426), DON DIRECT (25 443), CAGNOTTES (25 456), PUBLICITÉ (25 752-25 786), FONDS CRÉATEUR (25 787), MODÉRATION DES LIVES (26 173) | 23 543-23 900 (premium, badge, business, boost) est de la **monétisation**, pas du live |
| 50c | **Boutique — catalogue, commandes, livraison, promo, enchères** | 26 243 – 27 689 | SHOP (26 243), COMMANDES & COMMISSION (26 250), MODÉRATION MÉDIAS GCV (26 284, transverse), ROUTAGE IA (26 430, transverse), YANGO (26 431), `openOrderScreen` (26 638), NÉGOCIATION (26 756), CODES PROMO (26 845), JE RECHERCHE (26 968), ENCHÈRES (26 983), `submitOrder` (27 168), `renderShop` (27 424), RÉSERVATION DE SERVICE (27 523-27 613), MESSAGE GROUPÉ/SEGMENTÉ (27 614-27 689, messagerie) | 26 284-26 430 (`moderateImageWithCloudVision`, `callAIProvider`, `getContentEmbedding`) sont des **utilitaires transverses** à sortir dans le socle |
| 80 | **Messagerie, groupes, support** | 27 690 – 28 793 | MESSAGES (27 690), SUPPORT & LITIGES (27 961), RECHERCHE BACK-OFFICE (28 048, admin), ASTREINTE / A-B / KANBAN / ÉQUIPE TECHNIQUE (28 079-28 433, admin), RÉPONSES STANDARD (28 434), SLA (28 531), SATISFACTION (28 546), DISCUSSIONS DE GROUPE (28 608) | `sendThreadMessage` (28 716) ; 28 048-28 433 est du back-office |
| 90 | **Back-office** | 28 794 – 37 406 | ADMIN (28 794), MOT DE PASSE (28 811), `checkAdminPin` (29 816), AUTOMATISATION (29 139), … MODE MAINTENANCE (29 708), COMMISSION (30 688), PAIEMENTS (30 736), PARTENAIRES / ACTUALITÉ / DÉFIS (30 807-31 077), ANNUAIRE / ÉVÉNEMENTS / SONDAGES (31 078-31 637, **communauté, côté utilisateur**), SIGNALEMENTS (31 638), AUTO-ACCEPTATION (32 185-32 320), MODÉRATION GROUPÉE / JOURNAUX (32 820-32 911), FONDS CRÉATEUR perso / BLOQUÉS / BOUTIQUE VENDEUR / SUGGESTION IA (32 912-33 033, utilisateur), CALENDRIER ÉDITORIAL (33 034), **PENC** (33 134-33 236 et 33 405-33 475), SONDAGE PUBLICATION (33 237), RECHERCHE DANS CONVERSATION (33 312), SALLE DE RÉUNION (33 476), BASE DE CONNAISSANCES (33 951), UTILISATEURS (34 147), INSTITUTIONNEL (34 188), **SÉRIES PAYANTES** (34 189-34 772), CRÉATEUR DU MOIS (34 773), GROUPES COMMUNAUTAIRES (34 807), HASHTAGS (34 894), STRIKES (35 561), CONFIGURATION GLOBALE (35 773), ANNONCES (35 814), CGU (36 943), ADMINS RÉGIONAUX (36 973), REVERSEMENTS (37 254), MODÉRATEURS (37 332) | ~8 600 lignes ; contient au moins **six sous-domaines utilisateur** (communauté, Penc, séries, sondages, groupes, créateur du mois) à extraire |

### Utilitaires transverses à isoler dans le socle (phase 03)
`showToast`, `escapeHtml`, `readFileAsDataURL`, `compressImageDataUrl`, `sha256Hex`, `createNotification` (11 452), `callAIProvider*` (26 430-26 620), `moderateImageWithCloudVision` / `moderateVideoWithVideoIntelligence` (26 284-26 430), `getContentEmbedding` (26 567), `requireAccount`, `isEducationSubActive` (16 776), `go` (8 647).

## 3. Balisage : écrans par domaine (l. 236 – 6 892)

244 sections `id="screen-…"`. Les écrans ne sont **pas** regroupés par domaine dans le HTML ; la phase 03 peut les découper par plages contiguës approximatives puis déplacer les écrans isolés :

| Plage | Écrans (extraits) | Domaine dominant |
|---|---|---|
| 249 – 340 | onboarding, verify-transaction, pin-verify, totp-verify | auth |
| 341 – 470 | feed, discover, exam-prep, challenges, service-bookings, institutional-corner | fil / boutique / éducation |
| 481 – 970 | stitch-record, profile-visitors, watch-history, playlists, lives-feed, image/music library, cart, course-survey, feature-votes, wishlist, single-post, agenda, resource-library, order-receipt, invoice | mélange |
| 972 – 1 240 | profile-menu, my-qr-code, activity-*, creator-studio, partnerships, platform-identity-settings, admin-service-calendar, admin-media-library | profil / admin |
| 1 243 – 1 860 | sfx, work-group, course-*, ebooks, wisdom-capsules, smart-cut, finance-dashboard, disputes, zone-*, coin-*, rewarded-ad, exam, my-orders, polls, official-news, local-directory, community-events | mélange |
| 1 859 – 2 260 | camera-publish, **publish**, **shop**, my-shop-drawer, seller-leaderboard, **messages** | publication / boutique / messagerie |
| 2 261 – 2 600 | trainer-detail, user-detail (admin), story-compose, my-subscriptions, privacy, dg-config-menu, exceptions-registry, global-audit, theme-manager, missed-lives, my-sanctions, my-notes | admin / paramètres |
| 2 567 – 3 240 | course-search-assistant, my-learning, **education-hub**, become-trainer, education-courses, course-detail, trainer-dashboard, parent-*, report-card, quiz, certificate, **manage-course**, grade-*, contest | éducation (bloc quasi contigu) |
| 3 238 – 3 351 | group-*, live-invite, duo-record, schedule-calendar, sound-picker | messagerie / live / publication |
| 3 352 – 3 689 | **settings** (338 lignes) | paramètres |
| 3 690 – 4 100 | story-viewer, **notifications**, hashtag-page, **user-profile**, following/followers, favorites, watch-later, creator-vote, community-groups, team-leaderboard, learning-paths, nearby-sellers, comparator, sounds, collab-playlists, screen-time | mélange |
| 4 095 – 4 700 | voice-call, grouped-delivery, seller-ai-coach, auction, wanted-listings, negotiation, cagnottes, affiliate, video-drafts, region/country/live-activity/command-center/techteam/disputes-map/satisfaction/ai-tech-agent/dev-tasks/ab-testing/oncall/knowledge-base (admin), slideshow, audience-insights, meeting-*, **penc-***, editorial-calendar, seller-shop-view | boutique / admin / Penc |
| 4 711 – 5 100 | blocked-users, comments management, moderation-history, missed-content, live-chat-transcripts, penc-stats, fund-payouts, ai-confidence-queue, country-restriction, duplicate-accounts, decision-log, changelog, alerts, recurring-tasks, commission-history, admin-login-log, automation, series-* , live-battle | modération / admin / séries |
| 5 104 – 5 165 | **live-view** | live |
| 5 166 – 5 398 | **seller-dashboard** (196 lignes), **order** | boutique |
| 5 399 – 5 608 | support, share-friends, **comments**, **thread**, **profile**, payout-specialist | support / fil / messagerie / profil |
| 5 609 – 6 819 | admin-login, **admin** (~1 200 lignes) | back-office |
| 6 820 – 6 892 | barre d'onglets, boutons flottants, toast, overlays | socle |

## 4. Zones entremêlées — à traiter en priorité en phase 03

1. **12 730 – 15 271** : fil, boutique (panier, comparateur), éducation (sondage de cours), modération (mots interdits, catégories interdites) alternent. Découper par marqueur, pas par plage.
2. **19 290 – 19 740** : rappels et rapports mêlant éducation et vendeur.
3. **21 637 – 22 147** : KYC/PIN/2FA (sécurité de compte) et analyse du code (back-office) au milieu du vendeur.
4. **26 284 – 26 620** : utilitaires IA et modération média au milieu de la boutique — **à extraire vers le socle avant tout**, car la phase 06 les remplace par des appels serveur.
5. **28 794 – 37 406** (back-office) : six blocs utilisateur (communauté 31 078-31 637, Penc 33 134-33 475, sondage 33 237, séries 34 189-34 772, créateur du mois 34 773, groupes 34 807) à sortir.
6. `go()` (8 647-8 839) référence tous les écrans : à laisser dans un fichier « navigation » chargé avant les domaines, et alimenté plus tard par un registre d'écrans.

## 5. Ordre de concaténation proposé (`src/legacy/`)

```
00-head.html · 10-styles.css · 20-markup-auth.html · 21-markup-feed.html · … · 29-markup-admin.html · 29z-markup-tabbar.html
30-socle.js · 31-auth.js · 32-preferences.js · 33-navigation.js · 40-feed-publish.js · 41-search-notifications.js
42-stories-video.js · 43-feed-interactions.js · 44-discover.js · 45-profile.js · 46-creator-misc.js
50-shop-seller.js · 51-shop-catalog-orders.js · 60-education-admin.js · 61-education-core.js · 62-education-courses.js
70-live-monetisation.js · 80-messaging-support.js · 90-admin.js · 91-community-penc-series.js · 99-init.js
```
Contrainte : tant que les fichiers JS sont concaténés dans un seul `<script>` (phase 03), l'ordre ci-dessus n'a d'importance que pour les `const`/`let` globaux évalués au chargement ; les fonctions sont hissées. Le `check-inventaire` de la phase 03 devra vérifier que `dist/index.html` reste identique octet pour octet au prototype **avant** tout déplacement de bloc.
