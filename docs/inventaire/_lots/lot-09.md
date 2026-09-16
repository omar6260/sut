### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| recommendation | {target, author, text, createdAt} — clé `target__author` | true | 0 | 1 | 1 | 1 | l'auteur (autre utilisateur que le profil visé, mais propriétaire de son propre doc) | non | petit | non | 16052, 16064, 16072 |
| recurringreminder | {username, productId, productName, active, lastRemindedAt, createdAt} — clé `user__productId` | true | 3 | 2 | 1 | 0 | propriétaire (acheteur) | non | petit | non | 19492, 19500, 19538, 19546 |
| recurringtaskdone | booléen — clé `periodKey__taskId` | true | 2 | 0 | 0 | 0 | admin (poste de commandement, écran `admin-super-only` l.6810) ; écriture via variable `doneKey` l.29404 (non comptée) | non | petit | non | 29403, 29404, 29417, 29585 |
| refundrequest | {orderId, buyerUsername, sellerUsername, productName, total, reason, status, outcome(+resolvedAt, createdAt)} — clé `orderId` | true | 11 | 4 | 4 | 0 | acheteur (création l.23009/23037) puis admin (status/outcome l.23097-23123) | oui (admin réécrit le doc de l'acheteur) | petit | non | 23009, 23037, 23097, 23120 |
| report | {id, type, targetId, targetUser, reporterUser, reason, status, evidence/commentText/commentImageData} — clé `report_<ts>` | true | 7 | 14 | 9 | 0 | signaleur (utilisateur), système (filtre auto l.18857), admin (status), IA (tri auto l.32264) | oui (admin/IA réécrivent status du doc du signaleur) | moyen | oui (commentImageData l.31669, à vérifier taille) | 16205, 31669, 32264, 34113 |
| repost | {postId, repostedBy, createdAt} — clé `postId__user` | true | 1 | 1 | 2 | 0 | propriétaire (reposteur) | non | petit | non | 8856, 23375, 23377, 23385 |
| restrictedmode | booléen — clé `username` | true | 2 | 2 | 0 | 0 | système à l'inscription mineur (l.7853) et parent lié (l.20166) | oui (parent écrit le flag de l'élève) | petit | non | 7853, 20166, 20171, 13298 |
| rewatch | {postId, username, count, lastAt} — clé `postId__user` ; get/set via variable `key` l.12701-12705 (non comptés) | true | 0 | 0 | 1 | 0 | propriétaire (spectateur) | non | petit | non | 12701, 12705, 12708 |
| salesgoal | {amount, setAt} — clé `user__YYYY-MM` | true | 1 | 1 | 0 | 1 | propriétaire (vendeur) | non | petit | non | 19707, 19729, 19735 |
| sanctionappeal | {id, username, sanctionRef, sanctionType, reason, status, createdAt} — clé `user__appeal_<ts>` | true | 0 | 1 | 3 | 0 | utilisateur sanctionné (l.28274) puis admin (status via variable `appealKey` l.32661) | oui (admin réécrit le doc de l'utilisateur) | petit | non | 28274, 32642, 32661, 32673 |
| satisfactionsurvey | {targetId, surveyType, respondent, stars, comment, createdAt} — clé `type_target__user` | true | 0 | 1 | 1 | 0 | répondant (utilisateur) ; lecture admin globale | non | petit | non | 28574, 28585 |
| scheduledsystemnotif | {id, text, scheduledFor, scheduledBy, sent, createdAt} | true | 0 | 1 | 2 | 1 | admin (création/annulation) ; n'importe quel client à l'ouverture du fil marque `sent` (l.8675 → 35852) | oui (tout utilisateur réécrit `sent` sur le doc admin) | petit | non | 35829, 35838, 35858, 8675 |
| screentimetoday | {date, minutesUsed, reminderShownToday} — clé par date (pas par utilisateur) | false | 2 | 2 | 0 | 0 | propriétaire/appareil (local) ; setInterval 60 s l.7278 | non | petit | non | 7278, 8385, 8413, 8419 |
| searchhistory | tableau de chaînes (8 max) — clé `username` | true | 1 | 3 | 0 | 0 | propriétaire | non | petit | non | 11247, 11255, 11260, 11264 |
| sellercoachreport | {content, provider, generatedAt} — clé `username` | true | 1 | 1 | 0 | 0 | propriétaire (vendeur), contenu généré par IA depuis le navigateur | non | petit | non | 21159, 21161, 21171 |
| sellerinternalnote | {text, updatedBy, updatedAt} — clé `sellerUsername` | true | 4 | 1 | 0 | 4 | admin (l.23156) ; supprimé par l'utilisateur lui-même à l'auto-suppression (l.7993) et par l'admin | oui (note admin clé = vendeur ; le vendeur peut la lire/supprimer) | petit | non | 23156, 23159, 7983, 7993 |
| sellerrating | {sellerUsername, buyerUsername, stars, orderId, comment, shippingDays, sellerReply, createdAt} — clé `orderId` | true | 4 | 2 | 1 | 0 | acheteur (l.21621) puis vendeur (sellerReply l.32998) | oui (vendeur réécrit l'avis de l'acheteur) | petit | non | 21618, 21621, 32994, 32998 |
| series | {id, title, description, price, freeEpisodeCount, genre, cover, episodes[{id,title,data,coinPrice,releaseAt,sensitive,removed}], createdBy} | true | 13 | 4 | 1 | 1 | admin (création l.34203, épisodes l.34401/34415, retrait via signalement l.34106) | non | gros | oui (cover l.34201 + vidéo épisode `data` l.34400) | 34203, 34400, 34106, 34530 |
| seriesprogress | {lastEpisodeIndex, updatedAt} — clé `seriesId__user` ; set via variable `key` l.34620-34625 (non compté) | false | 2 | 0 | 0 | 0 | propriétaire (spectateur) | non | petit | non | 21595, 34537, 34620, 34625 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
| recommendation | PUBLIC_PROPRIETAIRE | L'auteur écrit son propre doc `target__author` (l.16064) et seul lui peut le retirer (l.16072) ; lu par tous sur le profil (l.16052). |
| recurringreminder | PRIVE | Uniquement lu/écrit par `currentUser` sur ses propres clés (l.19492, 19538) ; aucune lecture par un tiers. |
| recurringtaskdone | ADMIN | Checklist du poste de commandement réservé au super-admin (l.6810, 29404, 29585). |
| refundrequest | SERVEUR_SEUL | Litige financier : le statut exclut des reversements (l.21489) et des commissions (l.35034), résolu par l'admin avec override de réception (l.23103-23110). |
| report | ADMIN | Signalements lus/résolus par la modération (l.34113), tri IA (l.32264) et seuils live automatiques (l.32153) ; la création doit passer par Function pour fixer reporterUser. |
| repost | PUBLIC_PROPRIETAIRE | Le reposteur écrit son propre doc `postId__user` (l.23377) ; lu par tous pour le fil (l.8856). |
| restrictedmode | SERVEUR_SEUL | Flag Mode Familial/mineur posé par le système (l.7853) et par un parent sur un autre compte (l.20166) ; le contrôle du lien approuvé est côté client (l.20164). |
| rewatch | PRIVE | Signal personnel de re-visionnage lu seulement pour `currentUser` (l.12711) ; à vérifier : la liste globale l.12708 impose une requête par utilisateur. |
| salesgoal | PRIVE | Objectif personnel du vendeur, lu/écrit uniquement par lui (l.19707, 19729). |
| sanctionappeal | ADMIN | Recours examiné par l'admin (l.32642) ; l'acceptation lève la suspension (l.32665-32673) — doit être une Function. |
| satisfactionsurvey | SERVEUR_SEUL | Création à valider côté serveur (répondant = client de la commande/ticket, une seule réponse, l.28572) ; lecture agrégée admin seulement (l.28585). |
| scheduledsystemnotif | SERVEUR_SEUL | Diffusion à tous les utilisateurs déclenchée par n'importe quel client (l.35852-35868) — doit devenir une Function planifiée. |
| screentimetoday | PRIVE | Compteur local `shared=false` (l.8413), jamais lu par un tiers. |
| searchhistory | PRIVE | Historique personnel lu/écrit uniquement par `currentUser` (l.11247, 11255). |
| sellercoachreport | PRIVE | Rapport IA personnel du vendeur (l.21161, 21171) ; la génération IA (l.21159) doit toutefois passer par Function (clé API). |
| sellerinternalnote | ADMIN | Note interne de modération écrite par l'admin (l.23156) ; aujourd'hui lisible et supprimable par le vendeur (l.7983, 7993). |
| sellerrating | SERVEUR_SEUL | Éligibilité (acheteur + livré + unique) vérifiée côté client (l.21617-21619) et déclenche le badge vendeur recommandé (l.22084). |
| series | SERVEUR_SEUL | Catalogue payant écrit par l'admin (l.34203) mais lu par tous (l.34530) ; prix/coinPrice/freeEpisodeCount pilotent les déblocages (l.34490). |
| seriesprogress | PRIVE | Progression personnelle `shared=false` (l.34625), lue seulement par le spectateur (l.34537). |

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 23097-23102 | resolveRefundRequest | refundrequest | status, outcome, resolvedAt | admin réécrit la demande créée par l'acheteur | transaction serveur (Function admin, claim vérifié) |
| 23120-23123 | setRefundRequestStatus | refundrequest | status | admin réécrit la demande de l'acheteur | transaction serveur (Function admin) |
| 34114-34117 | resolveReport | report | status | admin ou IA (l.32264 via maybeAutoTriageReport) réécrit le signalement du signaleur | transaction serveur (Function de modération) |
| 32788, 32813 | warnLiveStreamer / cutReportedLive | report | status='approved' | admin réécrit le signalement du signaleur | transaction serveur (Function de modération) |
| 20166 | toggleRestrictedMode | restrictedmode | valeur booléenne | parent écrit le flag de l'élève lié | transaction serveur vérifiant `parentlink` approuvé |
| 32659-32662 | resolveSanctionAppeal | sanctionappeal | status | admin réécrit le recours de l'utilisateur, puis `user:` (l.32673) | transaction serveur (Function admin) |
| 35857-35858 | checkScheduledSystemNotifications | scheduledsystemnotif | sent=true | tout client ouvrant le fil réécrit le doc admin puis notifie tous les utilisateurs | Function planifiée (Cloud Scheduler) + transaction pour éviter les doubles envois |
| 32994-32998 | replyToSellerReview | sellerrating | sellerReply, sellerReplyAt | vendeur réécrit l'avis de l'acheteur | sous-collection `replies` ou Function (champ dédié, owner check) |
| 23156 | saveSellerInternalNote | sellerinternalnote | text, updatedBy | admin écrit un doc clé = nom du vendeur | collection ADMIN séparée, écriture Function |
| 7993 | deleteMyOwnAccount | sellerinternalnote | suppression | l'utilisateur supprime la note interne de l'admin le concernant | suppression uniquement par Function d'archivage |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 21488-21496 | renderSellerDashboard (à vérifier nom) | refundrequest | une demande `pending` exclut la commande des gains et reversements dus au vendeur | calcul de reversement manipulable en créant/supprimant un litige côté client |
| 35034, 35151 | renderFinanceDashboard / exportFinanceReport | refundrequest | un litige `resolved` retire la commission de la commande du chiffre plateforme | calcul financier admin |
| 23103-23110 | resolveRefundRequest | refundrequest | rejet d'un litige « jamais reçu » force `buyerConfirmedReceipt` et déclenche badge livraison vérifiée | modification de `order:` par l'admin, doit être atomique et auditée |
| 32153-32176 | checkLiveReportThreshold | report | N signaleurs distincts ⇒ avertissement / pause chat 30 min / coupure du live (seuils `settings:liveReport*`) | sanction automatique déclenchée par le client du signaleur ; seuils lisibles/modifiables côté client |
| 32264-32297 | maybeAutoTriageReport | report | l'IA décide suspend/dismiss et appelle resolveReport (suppression du post/produit) | appel IA avec clé API depuis le navigateur + sanction automatique |
| 32780-32808 | warnLiveStreamer | report | 2 avertissements ⇒ live restreint 7 j ; 3 ⇒ compte suspendu 7 j | sanction et rôle, réécriture de `user:` |
| 7852-7854 | onboarding (finalisation) | restrictedmode | compte mineur ⇒ Mode Familial activé d'office | règle âge/Mode Familial, `isMinorAccount` déclaré par le client |
| 20163-20169 | toggleRestrictedMode | restrictedmode | seul un parent avec `parentlink` approuvé peut basculer le Mode Familial d'un élève | contrôle d'autorisation uniquement côté client |
| 32659-32676 | resolveSanctionAppeal | sanctionappeal | recours accepté ⇒ `user.status='active'`, `suspendedUntil=null`, `liveRestrictedUntil=null` | levée de sanction = rôle/sanction, doit être une Function admin |
| 35852-35868 | checkScheduledSystemNotifications | scheduledsystemnotif | envoi d'une notification à tous les utilisateurs à l'heure programmée | diffusion massive déclenchée par n'importe quel client, risque de doublons |
| 21616-21630 | rateSellerForOrder | sellerrating | note possible uniquement par l'acheteur, commande livrée, une fois ; calcule `shippingDays` | conditions vérifiées côté client seulement |
| 22084-22100 | checkRecommendedSellerBadge | sellerrating | ≥5 avis, moyenne ≥4 et délai ≤5 j ⇒ badge `recommendedSeller` sur `user:` | attribution de statut vendeur (fidélité/confiance) calculée par le client |
| 21159-21161 | generateSellerCoachReport (à vérifier nom) | sellercoachreport | appel IA (`callAIProvider`) avec CA et notes du vendeur | clé API IA exposée dans le navigateur |
| 34490-34496 | isEpisodeUnlocked | series | épisode accessible si releaseAt passé et (série achetée, ou index < freeEpisodeCount, ou `episodeunlock:`) | contrôle d'accès payant reposant sur des clés `shared=false` écrites par le client |
| 34642-34650 | purchaseSeries | series | achat de la série enregistré au prix `s.price` sans aucun paiement vérifié | achat/paiement |
| 34662-34669 | unlockEpisodeWithCoins | series | débit de `coinbalance:` du `coinPrice` de l'épisode puis écriture `episodeunlock:` | pièces / solde modifié par le client (lecture → modification → réécriture) |
| 34541, 34590 | openSeriesDetail | series | épisode `sensitive` masqué si Mode Familial actif | règle âge/Mode Familial appliquée côté client |
| 29369-29404 | toggleRecurringTaskDone | recurringtaskdone | checklist opérationnelle du super-admin | données de back-office réservées au rôle admin |
