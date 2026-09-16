# Écritures croisées — un utilisateur modifie une donnée qui appartient à un autre

59 sites, triés par ligne. Chacun est un motif lecture → modification → réécriture complète (dernier écrit gagnant) ou une création sous le document d'autrui. Solutions : sous-collection (un document par contributeur), `increment()` pour les compteurs, transaction serveur (Cloud Function) pour tout ce qui a une valeur.

| Ligne | Fonction | Préfixe | Champ modifié | Qui modifie quoi | Solution proposée |
|---|---|---|---|---|---|
| 7405 | logInAsExistingUser | banappeal | doc entier | visiteur non authentifié écrit banappeal:<nom saisi> | Function createBanAppeal liée à l'identité de l'appareil (devicelink) |
| 7901 | recordDeviceAccountLink | devicelink | accounts[] | chaque compte qui se connecte sur l'appareil réécrit le doc partagé entre tous les comptes de l'appareil (l.7899 lecture → 7901 réécriture) | Function serveur à la connexion avec arrayUnion ; jamais écrit par le client |
| 11272 | trackAdClickAndDiscover | ad | clicks | tout utilisateur qui clique modifie la campagne de l'annonceur/admin | increment() via Function (ou sous-collection `adevents`) |
| 11292 | recordAdConversionIfAttributed | ad | conversions | l'acheteur modifie la campagne (fenêtre 1 h, 11284-11285) | increment() via Function côté commande |
| 12948 | toggleVideoInCollabPlaylist | collabplaylistitem | (suppression du doc) | créateur de la playlist supprime un item ajouté par un autre utilisateur | sous-collection `collabplaylist/{id}/items/{postId}` ; règle delete si `addedBy == uid` ou `parent.creator == uid` |
| 14454 | nominateCreatorOfMonth | creatorvote | doc entier (création) | n'importe quel utilisateur crée le doc de nomination d'un autre utilisateur | création via Function (une nomination par mois par nominé, vérification serveur) |
| 14466 | voteForCreatorOfMonth | creatorvote | votes[] | tout votant ajoute/retire son nom dans le tableau du doc de nomination (l.14460 lecture → 14466 réécriture) | sous-collection creatorvote/{id}/votes/{uid} + compteur increment() côté Function |
| 14558-14564 | voteForFeature | featurevote | votes[] | tout utilisateur réécrit le doc de l'auteur (lecture→push/splice→réécriture, dernier écrit gagnant) | sous-collection `featurevotes/{id}/votes/{uid}` + `voteCount` via increment() |
| 15426 | approveCourse | course | status | admin réécrit le cours du formateur | transaction serveur (Function admin) |
| 15438 | suspendCourse | course | status | admin réécrit le cours du formateur | transaction serveur (Function admin) |
| 15453-15457 | approveEnrollment | enrollment | status | admin (client) lit puis réécrit le doc d'inscription de l'élève | transaction serveur (Function `approveEnrollment`) |
| 16247 | toggleBlockUser | user (hors lot) | followers, following | le bloqueur réécrit user:<bloqué> pour rompre les abonnements | sous-collection followers + Function |
| 16836-16841 | importInstitutionalCsv (à vérifier nom exact) | enrollment | doc entier + user.stateFunded | admin crée une inscription `approved` au nom d'un autre utilisateur | Function d'import côté serveur |
| 16956 | redeemActivationCode | activationcode | redeemed, redeemedBy, redeemedAt | un utilisateur réécrit un document créé par l'admin (course-condition : deux usages simultanés) | transaction serveur |
| 16958 | redeemActivationCode | user: (hors lot) | stateFunded | l'utilisateur s'octroie lui-même l'accès financé après activation | transaction serveur (même Function) |
| 17030-17038 | approveEduSubRequest | edusubrequest / edusubscription | status ; doc abonnement entier | admin (ou le demandeur lui-même si auto-approbation l.17011) réécrit la demande et crée l'abonnement d'autrui | transaction serveur unique (demande → abonnement → paiement → achat) |
| 17690 | gatherEnrolledCourseContent | contentembedding | (doc entier, cache manquant) | un élève inscrit écrit l'embedding d'une leçon du formateur | transaction serveur (Function déclenchée à la création de leçon/exercice ; élève en lecture seule) |
| 18647 | addCourseFaqItem | coursefaq | tableau FAQ (push/splice) | co-formateur/remplaçant réécrit la FAQ du formateur | sous-collection `faq/{id}` ou règle multi-auteurs sur le cours |
| 18698 | saveCourseSharedNotes | coursenotes | content, lastEditedBy, lastEditedAt | tout élève approuvé réécrit le doc partagé du cours (dernier écrit gagnant, l.18690 lecture → 18698 réécriture) | transaction serveur avec numéro de version optimiste (ou sous-collection de contributions) ; l'historique coursenotesversion reste en création seule |
| 18799 | sendCourseGroupChatMessage | coursegroupchat | tableau messages (append) | chaque élève réécrit tout le chat | sous-collection `messages/{id}` ; médias vers Storage |
| 18849 | sendCourseChatMessage | coursechat | tableau messages (append) | chaque participant réécrit tout le chat (dernier écrit gagnant) | sous-collection `messages/{id}` ; médias vers Storage |
| 19072 | deleteCourseChatMessage | coursechat | tableau messages (splice par index) | formateur supprime le message d'un élève, risque d'index décalé sous concurrence | sous-collection `messages/{id}` avec delete par id ; règle formateur |
| 19179 | renderSubstituteCard | course | substituteTrainer, substituteEndDate | tout gestionnaire ouvrant la carte purge le remplaçant expiré (réécriture complète) | Function planifiée ou règle d'update limitée aux champs de remplacement pour `coTrainers`/`substituteTrainer` |
| 19203 | assignSubstitute | course | substituteTrainer, substituteEndDate | formateur (ou co-formateur/remplaçant via 18209) réécrit le doc entier | règle : `trainerUsername == uid` ou membre de `coTrainers` ; champs de délégation via Function |
| 19277 | saveCourseSchedule | course | scheduleDay, scheduleTime | co-formateur/remplaçant réécrit le doc du formateur | règle d'update multi-auteurs (get() sur coTrainers/substituteTrainer) ; sous-document `settings` |
| 20018 | submitContestScore | contestentry | score | formateur réécrit le doc de participation de l'élève | règle d'update limitée au champ `score` pour le formateur du cours, ou Function `gradeContestEntry` |
| 20854 | approveStudentRemoval | enrollment | suppression | admin supprime l'inscription d'un élève à la demande du formateur | Function serveur |
| 21578 | checkReliableBuyerBadge | user (hors lot) | reliableBuyer | le vendeur réécrit user:<acheteur> | trigger Function onCreate buyerrating |
| 23218 | processAccountDeletion | accountdeletionrequest | status, completedAt | l'admin réécrit la demande de l'utilisateur | Function admin |
| 23225 | rejectAccountDeletionRequest | accountdeletionrequest | status | l'admin réécrit la demande de l'utilisateur | Function admin |
| 23510 | changeUsername (renommage) | dm | clé du fil et champ from de chaque message | l'utilisateur renommé réécrit tous les fils de ses correspondants sous une nouvelle clé et supprime l'ancienne (l.23502-23511) | transaction serveur (Function de renommage) ou identifiant stable (uid) au lieu du nom dans la clé |
| 23792 | approveBadgeRequest | user (hors lot) | verifiedBadge | admin réécrit user:<demandeur> | même transaction serveur |
| 23798 | approveBadgeRequest | badgerequest | status | admin réécrit la demande créée par l'utilisateur l.23775 | transaction serveur (approveBadge : status + user.verifiedBadge + badgepayment atomiquement) |
| 23858 | approveBoostRequest | boostrequest | status | admin réécrit la demande de l'utilisateur | transaction serveur (status + boost + boostpayment) |
| 24625 | acceptBattle | battle | status, startedAt | streamerB modifie le doc créé par streamerA | transaction serveur ou règle PARTICIPANTS limitée au champ status |
| 24634 | declineBattle | battle | status | streamerB modifie le doc de streamerA | idem |
| 24690 | endBattle | battle | status, endedAt, winner | l'un des deux streamers calcule le vainqueur depuis gift: et réécrit | transaction serveur (winner calculé côté Functions) |
| 25543 | contributeToCagnotte | cagnottecontribution | nouveau doc sous la cagnotte d'un autre | contributeur écrit cagnotteId__contribId | sous-collection cagnottes/{id}/contributions + increment() du total via Function de paiement |
| 26007 | activateScheduledAdsIfDue | ad | status | n'importe quel client passe `scheduled` → `active` | Function planifiée |
| 26113 | recordAdImpression | ad | impressions, spent, status | tout spectateur du fil incrémente `spent += cpm/1000` et peut passer la campagne en `paused` | transaction serveur (budget) |
| 26129 | toggleAdLike | ad | likes[] | tout utilisateur réécrit la campagne entière pour ajouter/retirer son nom | sous-collection `likes/<uid>` |
| 27009 | placeBid | product: (hors lot) | auctionCurrentBid, auctionHighestBidder | l'enchérisseur réécrit le produit du vendeur | transaction serveur |
| 27946 | toggleMessageReaction | dm | reactions{} d'un message | un participant réécrit le fil entier pour modifier les réactions d'un message de l'autre (l.27936 lecture → 27946 réécriture) | sous-collection messages/{id}/reactions/{uid} ou arrayUnion/arrayRemove sur le doc message |
| 28099 | moveDevTask | devtask | status | l'admin/équipe technique modifie le signalement de bug créé par un utilisateur (l.28096 lecture → 28099 réécriture) | transaction serveur (Function admin) ne modifiant que status |
| 28724 | sendThreadMessage (et sendThreadPhoto l.28741, vocal l.28766, sendPostToFriend l.15230) | dm | tableau de messages entier | chaque participant lit tout le fil et le réécrit avec son message ajouté (l.28722 lecture → 28724 réécriture) ; deux envois simultanés s'écrasent | sous-collection dm/{thread}/messages/{msgId} (un doc par message, création seule) |
| 30915 | endChallenge | challenge | status | admin bascule le statut sans vérifier createdBy (défi possiblement créé par un formateur l.36543) | Function avec vérification de rôle |
| 31252 | toggleEventParticipation | communityevent | participants[] | tout utilisateur inscrit/désinscrit en réécrivant le doc de l'organisateur | sous-collection `participants/{uid}` + `participantCount` via increment() |
| 32108 | checkBlockSpikeThreshold | user (hors lot) | blockSpikeAlertedAt, blockSpikeCount | le bloqueur réécrit user:<bloqué> | trigger Function onCreate blockevent |
| 32456 | approveBlockedComment | post: (hors lot, via addComment) | comments | l'admin ajoute un commentaire (image) sur la publication d'un autre utilisateur | sous-collection `comments` |
| 33076 / 33088 | addEditorialEntry / removeEditorialEntry | editorialentry | doc entier (création/suppression) | membre d'équipe crée ou supprime des entrées sous le calendrier du propriétaire | sous-collection `editorialcalendars/{owner}/entries` avec règle « uid ∈ team » |
| 33757 | resolveBanAppeal | banappeal | status, lifted | admin réécrit l'appel de l'utilisateur banni | transaction serveur (résolution + réactivation user + notification) |
| 33817 | resolveFundDispute | creatorfundpayout | disputeStatus, disputeAdminNote | l'admin modifie le doc de reversement (contesté par le créateur) | transaction serveur (Function admin) |
| 33858 | submitPayoutDispute | creatorfundpayout | disputeStatus, disputeReason, disputeCreatedAt | le créateur bénéficiaire modifie le doc de reversement créé par l'admin (l.33854 lecture → 33858 réécriture) | sous-collection creatorfundpayout/{id}/disputes ou Function serveur qui ne touche que les champs de contestation |
| 34516-34518 | checkNewlyReleasedEpisodes | episodereleasenotified | drapeau global | n'importe quel visiteur du feed écrit un drapeau partagé (course entre clients) | Function planifiée (cron) côté serveur |
| 34867 | toggleCommunityGroupMembership | communitygroup | members[] | tout utilisateur rejoint/quitte en réécrivant le doc du créateur | sous-collection `members/{uid}` + `memberCount` via increment() |
| 35213 | adjustUserCoinBalance | coinbalance | valeur entière | admin lit→calcule→réécrit coinbalance:<autre utilisateur> | transaction serveur + increment() + journal coinadjustment |
| 35521 | markCoinWithdrawalPaid | coinwithdrawal | status, paidAt, paidBy | admin réécrit la demande de retrait d'un utilisateur | transaction serveur (Function admin `markWithdrawalPaid`, claim vérifié) |
| 36558 | closeCourseChallenge | challenge | status | formateur clôt un défi sans vérifier createdBy/courseId | règle owner==createdBy ou Function |
| 36638 | saveCertificateConditions | course | certMinAverage, certMinAttendance | co-formateur/remplaçant réécrit le doc du formateur | idem ; ces seuils étant liés à la certification, passer par Function |
