# Écritures croisées — un utilisateur modifie une donnée qui appartient à un autre

170 sites, triés par ligne. Chacun est un motif lecture → modification → réécriture complète (dernier écrit gagnant) ou une création sous le document d'autrui. Solutions : sous-collection (un document par contributeur), `increment()` pour les compteurs, transaction serveur (Cloud Function) pour tout ce qui a une valeur.

| Ligne | Fonction | Préfixe | Champ modifié | Qui modifie quoi | Solution proposée |
|---|---|---|---|---|---|
| 7405 | logInAsExistingUser | banappeal | doc entier | visiteur non authentifié écrit banappeal:<nom saisi> | Function createBanAppeal liée à l'identité de l'appareil (devicelink) |
| 7862 | inscription (onboarding) | user: | referralCount | le nouvel inscrit réécrit le doc du parrain (+ `loyaltypoints:` 7867) | increment() via Function d'inscription |
| 7862 | createAccount (onboarding parrainage) | user | `referralCount` du parrain | nouveau compte incrémente le compteur d'un autre utilisateur (+ `loyaltypoints:` l. 7866) | `increment()` dans une Function d'inscription |
| 7866 | finishOnboarding (à vérifier le nom exact) | loyaltypoints | valeur numérique (points du parrain) | le nouvel inscrit lit → additionne → réécrit le solde du parrain | Function d'inscription : `increment(rewardPoints)` en transaction serveur |
| 7901 | recordDeviceAccountLink | devicelink | accounts[] | chaque compte qui se connecte sur l'appareil réécrit le doc partagé entre tous les comptes de l'appareil (l.7899 lecture → 7901 réécriture) | Function serveur à la connexion avec arrayUnion ; jamais écrit par le client |
| 7993 | deleteMyOwnAccount | sellerinternalnote | suppression | l'utilisateur supprime la note interne de l'admin le concernant | suppression uniquement par Function d'archivage |
| 8066 | generateVideoSubtitles | videosubtitles | création du cache par un spectateur quelconque | pas de propriétaire ; premier spectateur écrit le doc lié au post d'un autre | Function de génération, écriture serveur seule |
| 8505 / 8506 | approveLiveAuthRequest | liveauthrequest (+ user) | status ; user.liveAuthorizedOverride | admin réécrit la demande et le profil du demandeur | Function admin unique (transaction serveur) |
| 8888 | releaseScheduledPosts | post | status scheduled→published | n'importe quel client publie les posts programmés de tous | Function planifiée (cron) |
| 9245 | generateDuetToOrderSuggestion | post | suggestedReplyText | le navigateur du spectateur (duo) réécrit le post du vendeur avec un texte Gemini | Function serveur (appel Gemini côté serveur, clé non exposée) |
| 9614 | checkVideoAnalysisResult | videoanalysis: (+ post:) | status, flagged ; post.suspended | admin réécrit l'analyse puis suspend le post de l'auteur (9617) | Function serveur |
| 9617 | pollVideoAIAnalysis | post | suspended | navigateur admin (résultat IA) | Function serveur |
| 10768 | recordQualifiedView | post | qualifiedViews | tout lecteur réécrit la publication | increment(qualifiedViews) |
| 11272 | trackAdClickAndDiscover | ad | clicks | tout utilisateur qui clique modifie la campagne de l'annonceur/admin | increment() via Function (ou sous-collection `adevents`) |
| 11292 | recordAdConversionIfAttributed | ad | conversions | l'acheteur modifie la campagne (fenêtre 1 h, 11284-11285) | increment() via Function côté commande |
| 11459 | createNotification | notif | doc entier (création) | fromUser crée une notification pour toUser | Function ou sous-collection `users/{toUid}/notifs` en écriture serveur uniquement |
| 12948 | toggleVideoInCollabPlaylist | collabplaylistitem | (suppression du doc) | créateur de la playlist supprime un item ajouté par un autre utilisateur | sous-collection `collabplaylist/{id}/items/{postId}` ; règle delete si `addedBy == uid` ou `parent.creator == uid` |
| 13263 | recordPostView | post | views, viewedBy[] | tout lecteur réécrit la publication | Function/increment(views) ; viewedBy en sous-collection |
| 13534 | createFollowRelationship | user: | followers[] | un utilisateur réécrit le doc entier de l'utilisateur suivi | sous-collection `followers/<uid>` + `followerCount` increment() |
| 13534 | createFollowRelationship / toggleFollow (l. 13598) | user | `followers[]` du suivi | un utilisateur ajoute/retire son nom dans le doc `user:` d'un autre | sous-collection `users/{uid}/followers` + compteur `increment()` via Function |
| 13535 | createFollowRelationship / toggleFollow (l. 13599) | user | `following[]` du suiveur | propriétaire, mais couplé à l'écriture précédente (deux docs non atomiques) | même Function transactionnelle que ci-dessus |
| 13587 | toggleFollow | followsource | document entier (création/suppression) | l'abonné crée `followsource:<créateur>__<moi>` dans l'espace du créateur | transaction serveur du follow qui écrit le doc de source ; ou sous-collection `users/{créateur}/followsources/{follower}` |
| 13598 | toggleFollow | user: | followers[] | l'utilisateur réécrit le doc entier de la cible (follow/unfollow) | sous-collection `followers/<uid>` + increment() |
| 13701 / 17298 | checkAndSendLiveReminders / checkConferenceReminders | live | reminderSent | n'importe quel navigateur connecté (setInterval 60 s, 7275) réécrit les lives programmés d'autrui | Cloud Scheduler + Function ; supprimer le sondage client |
| 13840 | toggleDislike | post | dislikes[], likes[] | tout utilisateur réécrit la publication d'un autre | sous-collection reactions/{uid} + increment() |
| 13851 | toggleWatchLater | post | watchLaterBy[] | tout utilisateur réécrit la publication d'un autre | liste PRIVE de l'utilisateur (watchlater:{uid}) au lieu du post |
| 13878 | toggleFavorite | post | favoritedBy[] | tout utilisateur réécrit la publication d'un autre | liste PRIVE de l'utilisateur + increment(favoriteCount) |
| 14085 | flushLiveTapLikes | live | liveLikes | spectateur relit/réécrit le compteur du streamer | `increment()` ou sous-collection de likes |
| 14275 | selectReaction | post | reactions{emoji:[users]} | tout utilisateur réécrit la publication d'un autre | sous-collection reactions/{uid} + increment(reactionCounts.emoji) |
| 14297 | toggleLike | post | likes[], dislikes[] | tout utilisateur réécrit la publication d'un autre | sous-collection likes/{uid} + increment(likeCount) |
| 14454 | nominateCreatorOfMonth | creatorvote | doc entier (création) | n'importe quel utilisateur crée le doc de nomination d'un autre utilisateur | création via Function (une nomination par mois par nominé, vérification serveur) |
| 14466 | voteForCreatorOfMonth | creatorvote | votes[] | tout votant ajoute/retire son nom dans le tableau du doc de nomination (l.14460 lecture → 14466 réécriture) | sous-collection creatorvote/{id}/votes/{uid} + compteur increment() côté Function |
| 14487 | voteForWeeklyTrend | trendvote: | votes[] | chaque votant lit → push/splice → réécrit le tableau partagé ; dernier écrivant gagne | sous-collection `votes/<uid>` + compteur increment() |
| 14540 | voteForPencTopic | penctopicvote | votes[] | tout utilisateur réécrit le thème d'un autre | sous-collection votes/{uid} + increment(voteCount) |
| 14558-14564 | voteForFeature | featurevote | votes[] | tout utilisateur réécrit le doc de l'auteur (lecture→push/splice→réécriture, dernier écrit gagnant) | sous-collection `featurevotes/{id}/votes/{uid}` + `voteCount` via increment() |
| 14745 | toggleCommentLike | post | comments[i].likes/dislikes | tout utilisateur réécrit la publication d'un autre | sous-collection comments/{id}/likes/{uid} + increment() |
| 14764 | toggleCommentDislike | post | comments[i].dislikes/likes | idem | idem |
| 14954 | addComment | post | comments[] (avec imageData base64, status pending) | tout utilisateur réécrit la publication d'un autre | sous-collection comments/{id} + increment(commentCount) ; images en Storage |
| 15084 | acceptCoCreatorInvite | post | coCreatorStatus | le co-créateur invité réécrit le post de l'auteur | transaction serveur (vérifie coCreatorUsername == uid) |
| 15093 | declineCoCreatorInvite | post | coCreatorStatus | idem | idem |
| 15401 / 15399 | approveTrainerRequest | trainerrequest: / user: | status ; user.isTrainer, trainerPaymentNumber, trainerSubject | admin (ou IA dans le navigateur du candidat, 32307) réécrit la candidature et attribue le rôle sur le doc utilisateur | transaction serveur + custom claim `trainer` |
| 15426 | approveCourse | course | status | admin réécrit le cours du formateur | transaction serveur (Function admin) |
| 15438 | suspendCourse | course | status | admin réécrit le cours du formateur | transaction serveur (Function admin) |
| 15453-15457 | approveEnrollment | enrollment | status | admin (client) lit puis réécrit le doc d'inscription de l'élève | transaction serveur (Function `approveEnrollment`) |
| 15474 | approveFlaggedLesson | lesson | aiFlagged | admin réécrit la leçon du formateur | Function admin de modération (`update` ciblé sur `aiFlagged`) |
| 15497 | recordTrainerSnapshotsIfNeeded | trainersnapshot: | doc entier | tout client formateur écrit les snapshots quotidiens de tous les formateurs | Function planifiée (cron) |
| 16040 | recordProfileVisit | profilevisit | document entier (create) | le visiteur crée un doc dans l'espace du profil visité | sous-collection users/{owner}/visits/{visitor}, règle create-only visitor == uid |
| 16247 | toggleBlockUser | user (hors lot) | followers, following | le bloqueur réécrit user:<bloqué> pour rompre les abonnements | sous-collection followers + Function |
| 16247 | blocage de profil (fonction englobante, à vérifier) | user: | followers[], following[] | le bloqueur réécrit le doc de l'utilisateur bloqué pour rompre les abonnements | Function de blocage transactionnelle |
| 16247 | toggleBlockUser | user | `followers[]`, `following[]` de la personne bloquée | le bloqueur retire les abonnements mutuels dans le doc de l'autre | Function `blockUser` (transaction) + `blocked` en sous-collection privée du bloqueur |
| 16836-16841 | importInstitutionalCsv (à vérifier nom exact) | enrollment | doc entier + user.stateFunded | admin crée une inscription `approved` au nom d'un autre utilisateur | Function d'import côté serveur |
| 16956 | redeemActivationCode | activationcode | redeemed, redeemedBy, redeemedAt | un utilisateur réécrit un document créé par l'admin (course-condition : deux usages simultanés) | transaction serveur |
| 16958 | redeemActivationCode | user: (hors lot) | stateFunded | l'utilisateur s'octroie lui-même l'accès financé après activation | transaction serveur (même Function) |
| 17030-17038 | approveEduSubRequest | edusubrequest / edusubscription | status ; doc abonnement entier | admin (ou le demandeur lui-même si auto-approbation l.17011) réécrit la demande et crée l'abonnement d'autrui | transaction serveur unique (demande → abonnement → paiement → achat) |
| 17690 | gatherEnrolledCourseContent | contentembedding | (doc entier, cache manquant) | un élève inscrit écrit l'embedding d'une leçon du formateur | transaction serveur (Function déclenchée à la création de leçon/exercice ; élève en lecture seule) |
| 18431 | submitFullExamGrade | fullexamsubmission | status, totalScore, gradedAt | le formateur relit et réécrit la copie déposée par l'élève | Function `gradeSubmission` (transaction serveur) vérifiant que l'appelant est le formateur du cours |
| 18647 | addCourseFaqItem | coursefaq | tableau FAQ (push/splice) | co-formateur/remplaçant réécrit la FAQ du formateur | sous-collection `faq/{id}` ou règle multi-auteurs sur le cours |
| 18698 | saveCourseSharedNotes | coursenotes | content, lastEditedBy, lastEditedAt | tout élève approuvé réécrit le doc partagé du cours (dernier écrit gagnant, l.18690 lecture → 18698 réécriture) | transaction serveur avec numéro de version optimiste (ou sous-collection de contributions) ; l'historique coursenotesversion reste en création seule |
| 18799 | sendCourseGroupChatMessage | coursegroupchat | tableau messages (append) | chaque élève réécrit tout le chat | sous-collection `messages/{id}` ; médias vers Storage |
| 18849 | sendCourseChatMessage | coursechat | tableau messages (append) | chaque participant réécrit tout le chat (dernier écrit gagnant) | sous-collection `messages/{id}` ; médias vers Storage |
| 19072 | deleteCourseChatMessage | coursechat | tableau messages (splice par index) | formateur supprime le message d'un élève, risque d'index décalé sous concurrence | sous-collection `messages/{id}` avec delete par id ; règle formateur |
| 19179 | renderSubstituteCard | course | substituteTrainer, substituteEndDate | tout gestionnaire ouvrant la carte purge le remplaçant expiré (réécriture complète) | Function planifiée ou règle d'update limitée aux champs de remplacement pour `coTrainers`/`substituteTrainer` |
| 19203 | assignSubstitute | course | substituteTrainer, substituteEndDate | formateur (ou co-formateur/remplaçant via 18209) réécrit le doc entier | règle : `trainerUsername == uid` ou membre de `coTrainers` ; champs de délégation via Function |
| 19277 | saveCourseSchedule | course | scheduleDay, scheduleTime | co-formateur/remplaçant réécrit le doc du formateur | règle d'update multi-auteurs (get() sur coTrainers/substituteTrainer) ; sous-document `settings` |
| 20018 | submitContestScore | contestentry | score | formateur réécrit le doc de participation de l'élève | règle d'update limitée au champ `score` pour le formateur du cours, ou Function `gradeContestEntry` |
| 20166 | toggleRestrictedMode | restrictedmode | valeur booléenne | parent écrit le flag de l'élève lié | transaction serveur vérifiant `parentlink` approuvé |
| 20207 / 20217 | approveParentLink / rejectParentLink | parentlinkrequest | status | l'élève réécrit la demande créée par le parent | Function transactionnelle (student == uid, status pending) |
| 20210 | approveParentLink | parentlink | doc entier (création) | l'élève crée le lien sous la clé du parent | Function `approveParentLink` écrivant `parentLinks/{parent}_{student}` |
| 20583 | émission de certificat (fonction englobante, à vérifier) | user: | isAlumnus | formateur réécrit le doc de l'élève | Function |
| 20854 | approveStudentRemoval | enrollment | suppression | admin supprime l'inscription d'un élève à la demande du formateur | Function serveur |
| 21578 | checkReliableBuyerBadge | user (hors lot) | reliableBuyer | le vendeur réécrit user:<acheteur> | trigger Function onCreate buyerrating |
| 21587 / 22095 | badges acheteur fiable / vendeur recommandé | user: | reliableBuyer, recommendedSeller | un autre utilisateur (noteur) réécrit le doc du vendeur/acheteur | Function (calcul serveur des badges) |
| 21587 | evaluateReliableBuyerBadge | user | `reliableBuyer` de l'acheteur | le vendeur qui note déclenche l'écriture dans le doc de l'acheteur | Function déclenchée sur `ratings` |
| 22077, 22095, 22984, 24748 | checkActiveMemberBadge / checkRecommendedSellerBadge / checkVerifiedDeliveryBadge / trackEarlyActivity | user | badges et compteurs d'un autre utilisateur | logique « système » exécutée par le navigateur d'un tiers | Functions planifiées ou déclenchées (increment/transaction) |
| 22362 | setOrderShipmentStage | order | shipmentStage, deliveredAt | vendeur modifie la commande créée par l'acheteur | Function `updateShipment` (vérifie seller == uid) |
| 22439 | restockProduct | product | stock | pas de contrôle sellerUsername (à vérifier, écran vendeur) | règle owner == uid |
| 22954 | sellerCancelOrder | order | status, cancelledAt, cancelledBy, cancellationReason | vendeur annule la commande de l'acheteur | Function transactionnelle avec contrôle de shipmentStage |
| 23097-23102 | resolveRefundRequest | refundrequest | status, outcome, resolvedAt | admin réécrit la demande créée par l'acheteur | transaction serveur (Function admin, claim vérifié) |
| 23109 | resolveRefundRequest (à vérifier le nom exact) | order | buyerConfirmedReceipt, buyerConfirmedByAdminOverride | admin réécrit le doc de l'acheteur | Function admin (claim) |
| 23120-23123 | setRefundRequestStatus | refundrequest | status | admin réécrit la demande de l'acheteur | transaction serveur (Function admin) |
| 23156 | saveSellerInternalNote | sellerinternalnote | text, updatedBy | admin écrit un doc clé = nom du vendeur | collection ADMIN séparée, écriture Function |
| 23218 | processAccountDeletion | accountdeletionrequest | status, completedAt | l'admin réécrit la demande de l'utilisateur | Function admin |
| 23225 | rejectAccountDeletionRequest | accountdeletionrequest | status | l'admin réécrit la demande de l'utilisateur | Function admin |
| 23491 | renommage utilisateur | post | userId, likes, dislikes, favoritedBy, comments[].user | un utilisateur réécrit tous les posts de la plateforme | Function serveur en batch, ou identité par uid immuable |
| 23499 | changeUsername | user | `followers[]`/`following[]` de TOUS les utilisateurs | l'utilisateur renommé réécrit chaque doc `user:` contenant son ancien nom | identité par uid immuable ; username en champ modifiable (plus de renommage en cascade) |
| 23510 | changeUsername (renommage) | dm | clé du fil et champ from de chaque message | l'utilisateur renommé réécrit tous les fils de ses correspondants sous une nouvelle clé et supprime l'ancienne (l.23502-23511) | transaction serveur (Function de renommage) ou identifiant stable (uid) au lieu du nom dans la clé |
| 23595 | approvePremiumRequest | subscription: | expiresAt, price, startedAt, cancelled | admin (ou auto-approbation exécutée dans le navigateur de l'abonné, 23570) réécrit le doc d'abonnement de l'utilisateur | transaction serveur (Function d'activation Premium, idempotente sur l'id de la demande) |
| 23607 | approvePremiumRequest | premiumrequest | status | admin (ou client de l'abonné en auto-acceptation 23570) réécrit la demande | transaction serveur |
| 23792 | approveBadgeRequest | user (hors lot) | verifiedBadge | admin réécrit user:<demandeur> | même transaction serveur |
| 23798 | approveBadgeRequest | badgerequest | status | admin réécrit la demande créée par l'utilisateur l.23775 | transaction serveur (approveBadge : status + user.verifiedBadge + badgepayment atomiquement) |
| 23858 | approveBoostRequest | boostrequest | status | admin réécrit la demande de l'utilisateur | transaction serveur (status + boost + boostpayment) |
| 24316-24337 | confirmEndMyLive | liveviewer | suppression en masse | streamer purge tous les heartbeats | Function de fin de live |
| 24332 | confirmEndMyLive | livespeakrequest | suppression en masse | streamer purge toutes les demandes | Function de fin de live |
| 24334 | confirmEndMyLive | liveinvite | suppression en masse | streamer purge toutes les invitations | Function de fin de live (nettoyage batch) |
| 24449 | voteLivePoll | live | currentPoll.options[i].votes | spectateur pousse son nom dans le doc du streamer (collision dernier écrit gagnant) | sous-collection `lives/{id}/pollVotes/{uid}` + agrégation |
| 24500 | openLiveView | liveinvite | joinedAt | l'invité réécrit le doc créé par le streamer | même sous-collection ; règle : l'invité ne peut modifier que `joinedAt` |
| 24625 | acceptBattle | battle | status, startedAt | streamerB modifie le doc créé par streamerA | transaction serveur ou règle PARTICIPANTS limitée au champ status |
| 24634 | declineBattle | battle | status | streamerB modifie le doc de streamerA | idem |
| 24690 | endBattle | battle | status, endedAt, winner | l'un des deux streamers calcule le vainqueur depuis gift: et réécrit | transaction serveur (winner calculé côté Functions) |
| 24748 | trackEarlyActivity | user: | earlyActivityCount | compteur incrémenté par lecture → réécriture | increment() |
| 24811 / 24835 / 24849 | toggleLiveChatPin / toggleMuteLiveUser / kickUserFromLive | live | pinnedChatKey, mutedUsers, bannedUsers | modérateur de chat désigné (chatModerators) réécrit le doc du streamer | Function de modération vérifiant `chatModerators` ; ou champs dans sous-doc `lives/{id}/moderation` |
| 24851 | kickUserFromLive | liveviewer | suppression | modérateur de chat supprime le heartbeat d'un spectateur | sous-collection `lives/{id}/viewers/{uid}` ou Realtime DB présence ; delete par modérateurs |
| 25162 | acceptLiveSpeakRequest | livespeakrequest | suppression | modérateur supprime la demande d'un spectateur | sous-collection `lives/{id}/speakRequests/{uid}` ; delete par modérateurs |
| 25169 | declineLiveSpeakRequest | livespeakrequest | suppression | modérateur supprime la demande d'un spectateur | idem |
| 25178 | removeLiveGuest | liveinvite | suppression | modérateur du live supprime l'invitation d'un autre utilisateur | sous-collection avec delete autorisé au streamer/co-modérateurs |
| 25205 | renderLiveViewerCount | live | peakViewers | streamer (propriétaire) mais compteur calculé client à partir de `liveviewer:` | `increment()`/agrégation serveur des heartbeats |
| 25256 | inviteLiveGuest | liveinvite | doc entier (création) | streamer/co-modérateur crée `liveinvite:<live>__<invité>` au nom de l'invité | sous-collection `lives/{id}/invites/{uid}` : création par streamer/co-modérateurs, lecture par tous |
| 25394 | approveTicketRequest | ticket: | status, commissionRate, commissionAmount, netAmount | admin réécrit le billet de l'acheteur et calcule la commission côté client | transaction serveur (Function calculant la commission et créant `ticketpayment:` atomiquement) |
| 25543 | contributeToCagnotte | cagnottecontribution | nouveau doc sous la cagnotte d'un autre | contributeur écrit cagnotteId__contribId | sous-collection cagnottes/{id}/contributions + increment() du total via Function de paiement |
| 26007 | activateScheduledAdsIfDue | ad | status | n'importe quel client passe `scheduled` → `active` | Function planifiée |
| 26113 | recordAdImpression | ad | impressions, spent, status | tout spectateur du fil incrémente `spent += cpm/1000` et peut passer la campagne en `paused` | transaction serveur (budget) |
| 26129 | toggleAdLike | ad | likes[] | tout utilisateur réécrit la campagne entière pour ajouter/retirer son nom | sous-collection `likes/<uid>` |
| 26204 / 26215 | approveLive / rejectLive | live | status / suppression | admin change le statut du live d'un utilisateur | Function admin (claim `role`) — transaction serveur |
| 26497 | requestYangoDelivery (à vérifier le nom exact) | order | yangoRequestId | vendeur/admin écrit l'id Yango dans la commande | Function serveur (l'appel Yango porte une clé API) |
| 26786 | submitNegotiationOffer | negotiation | offers[], status | acheteur ou vendeur pousse une offre dans le doc commun | sous-collection `negotiations/{id}/offers` + transaction serveur pour status |
| 26798 / 26804 | respondToNegotiation | negotiation | status | vendeur (ou acheteur) accepte/refuse l'offre de l'autre | Function `respondToNegotiation` transactionnelle (vérifie dernière offre) |
| 27009 | placeBid | product: (hors lot) | auctionCurrentBid, auctionHighestBidder | l'enchérisseur réécrit le produit du vendeur | transaction serveur |
| 27009 | placeBid | product | auctionCurrentBid, auctionHighestBidder | l'enchérisseur réécrit le produit du vendeur | transaction serveur (contrôle minBid, fin d'enchère) |
| 27023 | proceedToAuctionCheckout | product | auctionSettled | le gagnant réécrit le produit du vendeur | transaction serveur |
| 27279 | submitOrder | product | stock (décrément) | l'acheteur réécrit le produit du vendeur | transaction serveur / increment(-qty) avec contrôle stock>=qty |
| 27573 | bookServiceSlot | product | serviceSlots[] | le client réécrit le produit du prestataire | transaction serveur (sous-collection slots/{iso}) |
| 27946 | toggleMessageReaction | dm | reactions{} d'un message | un participant réécrit le fil entier pour modifier les réactions d'un message de l'autre (l.27936 lecture → 27946 réécriture) | sous-collection messages/{id}/reactions/{uid} ou arrayUnion/arrayRemove sur le doc message |
| 28099 | moveDevTask | devtask | status | l'admin/équipe technique modifie le signalement de bug créé par un utilisateur (l.28096 lecture → 28099 réécriture) | transaction serveur (Function admin) ne modifiant que status |
| 28482 / 28492 / 28603 | sendTicketReply / assignTicketTo / resolveTicket | ticket: | response, respondedBy, assignedTo, status, resolvedAt | admin réécrit le ticket support de l'utilisateur | sous-collection `replies` + champs admin écrits par Function |
| 28688 | sendGroupMessage | groupmsg | tableau messages entier | chaque membre relit tout le tableau et le réécrit (écrasement concurrent) | sous-collection `groups/{id}/messages` (un doc par message) |
| 28710 | leaveGroupChat | group | members | un membre réécrit `members[]` du groupe créé par un autre | `arrayRemove` / sous-collection `groups/{id}/members` |
| 28724 | sendThreadMessage (et sendThreadPhoto l.28741, vocal l.28766, sendPostToFriend l.15230) | dm | tableau de messages entier | chaque participant lit tout le fil et le réécrit avec son message ajouté (l.28722 lecture → 28724 réécriture) ; deux envois simultanés s'écrasent | sous-collection dm/{thread}/messages/{msgId} (un doc par message, création seule) |
| 29645 | markAlertSeen | importantalert | seen | admin réécrit un doc créé depuis la session de l'acheteur (29596) | création par Function au moment de la commande ; mise à jour `seen` par Function admin |
| 30628 | adminToggleSensitive | post | sensitive | admin réécrit le post d'un utilisateur | Function ADMIN (claim vérifié) |
| 30637 | adminToggleSuspendPost | post | suspended | admin | Function ADMIN |
| 30915 | endChallenge | challenge | status | admin bascule le statut sans vérifier createdBy (défi possiblement créé par un formateur l.36543) | Function avec vérification de rôle |
| 30996 | awardChallengeReward | post | challengeRewardAwarded | admin/organisateur | Function serveur |
| 31208 | voteOnPoll | poll | votes{idx:[users]} | tout utilisateur réécrit le sondage d'un autre | sous-collection votes/{uid} + increment(counts.idx) |
| 31252 | toggleEventParticipation | communityevent | participants[] | tout utilisateur inscrit/désinscrit en réécrivant le doc de l'organisateur | sous-collection `participants/{uid}` + `participantCount` via increment() |
| 31608 | markOrderFulfilled | order | status | admin marque la commande traitée | Function admin |
| 31658 | suppression commentaire signalé | post | comments[] splice, pinnedCommentIndex | admin | Function ADMIN sur sous-collection comments |
| 32108 | checkBlockSpikeThreshold | user (hors lot) | blockSpikeAlertedAt, blockSpikeCount | le bloqueur réécrit user:<bloqué> | trigger Function onCreate blockevent |
| 32140 / 35661 / 35670 | preventivelySuspendFromBlockSpike / issueStrike | user: | status, suspendedUntil, suspensionHistory | admin réécrit le doc entier de l'utilisateur sanctionné | Function admin + sous-collection `sanctions` |
| 32168 / 32173 / 32162 | checkLiveReportThreshold | live | chatCooldownUntil, autoWarnedAt, suppression | le navigateur du signaleur applique une sanction sur le live d'un autre | Function déclenchée sur création de signalement (transaction serveur) |
| 32393 | approveFlaggedProduct | product | mediaFlagged | admin | Function ADMIN |
| 32456 | approveBlockedComment | post: (hors lot, via addComment) | comments | l'admin ajoute un commentaire (image) sur la publication d'un autre utilisateur | sous-collection `comments` |
| 32488 | dismiss flag | post | mediaFlagged | admin | Function ADMIN |
| 32516 | removePostAudio (modération) | user | `audioRemovedCount` du créateur | admin incrémente un compteur dans le doc d'un autre | `increment()` via Function admin |
| 32563 | duplicate review | post | duplicateReviewed | admin | Function ADMIN |
| 32659-32662 | resolveSanctionAppeal | sanctionappeal | status | admin réécrit le recours de l'utilisateur, puis `user:` (l.32673) | transaction serveur (Function admin) |
| 32788, 32813 | warnLiveStreamer / cutReportedLive | report | status='approved' | admin réécrit le signalement du signaleur | transaction serveur (Function de modération) |
| 32873 | saveCountryRestrictions | post | blockedCountries | admin | Function ADMIN |
| 32908 | dismissAiConfidenceFlag | post | mediaFlagged / suspended | admin | Function ADMIN |
| 32994-32998 | replyToSellerReview | sellerrating | sellerReply, sellerReplyAt | vendeur réécrit l'avis de l'acheteur | sous-collection `replies` ou Function (champ dédié, owner check) |
| 33076 / 33088 | addEditorialEntry / removeEditorialEntry | editorialentry | doc entier (création/suppression) | membre d'équipe crée ou supprime des entrées sous le calendrier du propriétaire | sous-collection `editorialcalendars/{owner}/entries` avec règle « uid ∈ team » |
| 33226 | openPencRoom | penc | participants[], everJoined[] | tout participant réécrit le doc de l'hôte | sous-collection `pencs/{id}/participants/{uid}` + `arrayUnion` |
| 33263 | voteOnPostPoll | post | poll.votes{user:idx} | tout utilisateur réécrit la publication d'un autre | sous-collection pollVotes/{uid} + increment() |
| 33308 | sendPencChatMessage | penc | chatMessages[] | tout participant ajoute un message dans le doc de l'hôte | sous-collection `pencs/{id}/messages` |
| 33387 | leavePencRoom | penc | participants[] | tout participant retire son nom du doc de l'hôte | suppression de son doc dans la sous-collection participants |
| 33426 | forceClosePencAdmin | penc | active | admin réécrit le doc de l'hôte | Function admin |
| 33461 | resolvePencReport | pencreport | status | admin réécrit le signalement d'un utilisateur | Function admin (claim) |
| 33757 | resolveBanAppeal | banappeal | status, lifted | admin réécrit l'appel de l'utilisateur banni | transaction serveur (résolution + réactivation user + notification) |
| 33786 | resolveSuspensionAppeal | suspensionappeal: | status, reactivated | admin réécrit la contestation de l'utilisateur après lecture | transaction serveur (Function admin) |
| 33817 | resolveFundDispute | creatorfundpayout | disputeStatus, disputeAdminNote | l'admin modifie le doc de reversement (contesté par le créateur) | transaction serveur (Function admin) |
| 33858 | submitPayoutDispute | creatorfundpayout | disputeStatus, disputeReason, disputeCreatedAt | le créateur bénéficiaire modifie le doc de reversement créé par l'admin (l.33854 lecture → 33858 réécriture) | sous-collection creatorfundpayout/{id}/disputes ou Function serveur qui ne touche que les champs de contestation |
| 34114-34117 | resolveReport | report | status | admin ou IA (l.32264 via maybeAutoTriageReport) réécrit le signalement du signaleur | transaction serveur (Function de modération) |
| 34516-34518 | checkNewlyReleasedEpisodes | episodereleasenotified | drapeau global | n'importe quel visiteur du feed écrit un drapeau partagé (course entre clients) | Function planifiée (cron) côté serveur |
| 34867 | toggleCommunityGroupMembership | communitygroup | members[] | tout utilisateur rejoint/quitte en réécrivant le doc du créateur | sous-collection `members/{uid}` + `memberCount` via increment() |
| 35213 | adjustUserCoinBalance | coinbalance | valeur entière | admin lit→calcule→réécrit coinbalance:<autre utilisateur> | transaction serveur + increment() + journal coinadjustment |
| 35455 | markOrderPaidOut | order | payoutStatus, paidOutAt, paidOutBy | admin/spécialiste reversement réécrit la commande | Function admin avec journal de reversement |
| 35521 | markCoinWithdrawalPaid | coinwithdrawal | status, paidAt, paidBy | admin réécrit la demande de retrait d'un utilisateur | transaction serveur (Function admin `markWithdrawalPaid`, claim vérifié) |
| 35857-35858 | checkScheduledSystemNotifications | scheduledsystemnotif | sent=true | tout client ouvrant le fil réécrit le doc admin puis notifie tous les utilisateurs | Function planifiée (Cloud Scheduler) + transaction pour éviter les doubles envois |
| 36558 | closeCourseChallenge | challenge | status | formateur clôt un défi sans vérifier createdBy/courseId | règle owner==createdBy ou Function |
| 36626 | sendWorkGroupChatMessage | workgroupchat | tableau entier de messages | chaque membre du groupe relit puis réécrit tout le fil ; deux membres simultanés s'écrasent | sous-collection `workgroups/{id}/messages` (un doc par message, règle `from == uid` et membre du groupe) |
| 36638 | saveCertificateConditions | course | certMinAverage, certMinAttendance | co-formateur/remplaçant réécrit le doc du formateur | idem ; ces seuils étant liés à la certification, passer par Function |
