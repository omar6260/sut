### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| coursegroupchatnotifypref | clé `<user>__<courseId>` ; { notifyAll } | false | 3 | 1 | 0 | 1 | propriétaire (élève) | non (mais lecture croisée : l'expéditeur lit la pref privée des autres élèves l.18780) | petit | non | 17396, 18772, 18774, 18780 |
| courseleave | clé `<courseId>__<user>__<ts>` ; { id, courseId, studentUsername, courseTitle, trainerUsername, wasPaid, pricePaid, reason, leftAt } | true | 0 | 1 | 2 | 0 | propriétaire (élève qui quitte) | non | petit | non | 17399, 17638, 17641, 20430 |
| coursenotes | clé `<courseId>` ; { content, lastEditedBy, lastEditedAt } | true | 2 | 1 | 0 | 0 | tout élève approuvé du cours (formateur exclu) | oui (n'importe quel élève réécrit le doc entier, dernier écrit gagnant) | moyen | non | 18681, 18690, 18698, 18675 |
| coursenotesversion | clé `<courseId>__<ts>` ; { courseId, content, editedBy, editedAt } | true | 0 | 1 | 1 | 0 | tout élève approuvé (snapshot de la version précédente) | non (création seule, jamais modifié) | moyen | non | 18693, 18724, 18734 |
| coursepodcast | clé `<courseId>__<ts>` ; { courseId, title, data(dataUrl audio), createdAt } | true | 0 | 1 | 1 | 0 | propriétaire (formateur du cours géré) | non | gros | oui (audio ≤ 5 Mo, l.19612) | 19603, 19618, 19625 |
| coursesearchlog | clé `search_<ts>` ; { id, username, question, wasFound, bestScore, createdAt } | true | 0 | 1 | 1 | 0 | élève (auteur de la recherche) ; lu par l'admin | non | petit | non | 17740, 32621, 32623 |
| coursevideo | clé `<courseId>__<ts>` ; { id, courseId, title, data(dataUrl vidéo), seriesName, episodeNumber, mediaFlagged, chapters[], altAudioData, altAudioLabel, createdAt } | true | 1 | 1 | 5 | 0 | propriétaire (formateur) ; aussi RMW par le formateur (chapitres l.19853, piste audio l.36416) | non | gros | oui (vidéo ≤ 10 Mo + 2e vidéo altAudioData) | 19155, 19650, 19853, 36416 |
| creatorfundpayout | clé `<monthKey>__<user>` ; { username, monthKey, views, amount, status, disputeStatus, disputeReason, disputeAdminNote, createdAt } | true | 0 | 1 | 3 | 0 | admin (distribution l.25852, résolution l.33817) ET créateur bénéficiaire (contestation l.33858) | oui (le créateur modifie le doc de reversement créé par l'admin, RMW l.33854-33858) | petit | non | 25852, 33795, 33817, 33858 |
| creatorvote | clé `<monthKey>__<nominee>` ; { username, monthKey, votes[], createdAt } | true | 2 | 2 | 1 | 0 | n'importe quel utilisateur connecté (nomination et vote) | oui (chaque votant réécrit le tableau votes[] du doc, l.14460-14466) | petit | non | 14452, 14454, 14466, 14513 |
| customtheme | clé `<user>__theme_<ts>` ; { name, coral, gold, lagoon, createdAt } | false | 4 | 3 | 1 | 1 | propriétaire | non | petit | non | 8224, 8274, 8295, 8333 |
| dailysummarycache | clé `<YYYY-MM-DD>` ; { text, provider, createdAt } | true | 1 | 1 | 0 | 0 | admin (back-office) | non | petit | non | 31460, 31480, 31477 |
| decisionlog | clé `decision_<ts>` ; { id, title, reason, author(currentAdminName), createdAt, archivedAt, archivedBy } | true | 1 | 2 | 1 | 0 | admin (création) ; super-admin (archivage, RMW) | non (admin ↔ admin) | petit | non | 32828, 32837, 32842, 33907 |
| deliverycircle | clé `<ville>__<user>` ; { username, city, joinedAt } | true | 1 | 1 | 1 | 1 | propriétaire (membre) | non | petit | non | 21080, 21087, 21104, 21109 |
| descriptiontemplate | clé `<user>__desctemplate_<ts>` ; { id, name, text, createdAt } | true | 1 | 1 | 1 | 0 | propriétaire (vendeur) | non | petit | non | 20947, 20954, 21053 |
| devicelink | clé `<deviceId>` ; { deviceId, accounts[] } | true | 2 | 1 | 2 | 0 | tout compte qui se connecte sur l'appareil (RMW du tableau accounts) ; lu par l'admin | oui (chaque nouveau compte réécrit le doc appareil partagé entre comptes, l.7899-7901) | petit | non | 7512, 7899, 7901, 33877 |
| devtask | clé `devtask_<ts>` ; { id, title, status, assignee, createdBy, reportedBy, isBugReport, fullDescription, screenshot(dataUrl), createdAt } | true | 2 | 3 | 3 | 1 | admin/équipe technique (kanban l.28087, statut l.28096, suppression l.28110) ET utilisateur (signalement de bug l.27976) | oui (l'admin modifie le statut du signalement créé par l'utilisateur, RMW l.28096-28099) | moyen | oui (capture compressée 900px, l.27974) | 27976, 28087, 28099, 28110 |
| dm | clé `<userA>__<userB>` (trié) ; valeur = tableau de messages { from, text, ts, type(photo/voice/shared_post), mediaData, postData, reactions{} } | true | 0 | 6 | 6 | 0 | les deux participants (RMW du tableau entier à chaque envoi/réaction) ; renommage réécrit les fils l.23510 ; admin liste tout l.28969/30485 | oui (chaque participant réécrit le tableau complet du fil, l.28721-28724, 27935-27946) | gros | oui (photo/vocal ≤ 2 Mo par message, l.28741/28766 ; postData de publications partagées l.15226) | 15224, 23510, 27935, 28724 |
| dndsettings | clé `<user>` ; { enabled, start, end } | true | 2 | 1 | 0 | 0 | propriétaire | non | petit | non | 11519, 11534, 11539 |
| draftcaption | clé `<user>` ; { text, savedAt, isTextOnly } | false | 1 | 1 | 0 | 2 | propriétaire | non | petit | non | 10410, 10412, 10453, 10475 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
| coursegroupchatnotifypref | PRIVE | Préférence personnelle écrite shared=false par son propriétaire (l.18774) ; la lecture croisée de fan-out l.18780 doit passer par une Function de notification. |
| courseleave | SERVEUR_SEUL | wasPaid/pricePaid calculés côté client (l.17394-17401) déclenchent une réinscription gratuite sans paiement (l.17638-17650) ; consulté par le formateur (l.20430). |
| coursenotes | PARTICIPANTS | Accès réservé aux élèves inscrits approuvés, formateur exclu (l.18675-18678) ; tous les membres lisent et écrivent le même doc (l.18698). |
| coursenotesversion | PARTICIPANTS | Historique des notes, créé par tout élève approuvé (l.18693) et lu par les mêmes (l.18724) ; création seule, jamais de modification. |
| coursepodcast | PUBLIC_PROPRIETAIRE | Seul le formateur du cours géré écrit (l.19618) ; contenu de cours lu par les inscrits ; audio base64 → Storage (l.19612). |
| coursesearchlog | ADMIN | Journal des questions des élèves lu uniquement au back-office (l.32621) ; création par l'élève (l.17740) à faire via Function ou règle create-only. |
| coursevideo | PUBLIC_PROPRIETAIRE | Écrit et modifié uniquement par le formateur propriétaire (l.19650, 19853, 36416) ; mediaFlagged fixé côté client (l.19652) doit être posé par le serveur ; vidéo base64 → Storage/Stream. |
| creatorfundpayout | SERVEUR_SEUL | Reversements en FCFA calculés et créés côté client (l.25852) et modifiés par le bénéficiaire (l.33856-33858) : montant, statut et contestation doivent être posés par Functions. |
| creatorvote | SERVEUR_SEUL | Élection « créateur du mois » : le tableau votes[] est réécrit par tout votant (l.14460-14466), un vote par utilisateur non garanti ; sous-collection votes/{uid} + comptage serveur. |
| customtheme | PRIVE | Clé préfixée par currentUser et shared=false partout (l.8274, 8295, 8333) ; seule utilisation : thème personnel. |
| dailysummarycache | ADMIN | Résumé de l'état de la plateforme généré par l'IA au back-office (l.31480) et lu seulement par l'admin (l.31460). |
| decisionlog | ADMIN | Journal de décisions signé currentAdminName (l.32833), archivage réservé au super-admin via classe CSS admin-super-only (l.33907) : rôle à vérifier par claim. |
| deliverycircle | PUBLIC_PROPRIETAIRE | Chaque membre écrit/supprime uniquement son propre doc (clé ville__currentUser, l.21080, 21087) ; la liste est lue par les autres membres (l.21104). |
| descriptiontemplate | PRIVE | Modèle de description propre au vendeur (clé préfixée currentUser, l.20947) ; écrit en shared=true à tort, aucun autre lecteur (l.21053). |
| devicelink | SERVEUR_SEUL | Sert à l'identité et au contournement de bannissement (l.7512-7518) et à la détection de doublons admin (l.33877) ; modifiable par tout compte (l.7899-7901) → C4. |
| devtask | ADMIN | Kanban de l'équipe technique (l.28087, 28096, 28110) ; les signalements de bug utilisateur (l.27976) sont créés via Function avec quota serveur ; capture base64 → Storage. |
| dm | PARTICIPANTS | Fil privé entre deux utilisateurs nommés dans la clé (l.27730) ; lu/écrit par les deux parties seulement (l.28721) ; les listes admin (l.28969, 30485) passent par Function. |
| dndsettings | PRIVE | Réglage Ne pas déranger propre à l'utilisateur (clé currentUser, l.11534), lu uniquement par lui (l.11519) ; shared=true à corriger en privé. |
| draftcaption | PRIVE | Brouillon de légende écrit/lu/supprimé shared=false par le propriétaire uniquement (l.10410, 10453, 10475). |

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 18698 | saveCourseSharedNotes | coursenotes | content, lastEditedBy, lastEditedAt | tout élève approuvé réécrit le doc partagé du cours (dernier écrit gagnant, l.18690 lecture → 18698 réécriture) | transaction serveur avec numéro de version optimiste (ou sous-collection de contributions) ; l'historique coursenotesversion reste en création seule |
| 14466 | voteForCreatorOfMonth | creatorvote | votes[] | tout votant ajoute/retire son nom dans le tableau du doc de nomination (l.14460 lecture → 14466 réécriture) | sous-collection creatorvote/{id}/votes/{uid} + compteur increment() côté Function |
| 14454 | nominateCreatorOfMonth | creatorvote | doc entier (création) | n'importe quel utilisateur crée le doc de nomination d'un autre utilisateur | création via Function (une nomination par mois par nominé, vérification serveur) |
| 33858 | submitPayoutDispute | creatorfundpayout | disputeStatus, disputeReason, disputeCreatedAt | le créateur bénéficiaire modifie le doc de reversement créé par l'admin (l.33854 lecture → 33858 réécriture) | sous-collection creatorfundpayout/{id}/disputes ou Function serveur qui ne touche que les champs de contestation |
| 33817 | resolveFundDispute | creatorfundpayout | disputeStatus, disputeAdminNote | l'admin modifie le doc de reversement (contesté par le créateur) | transaction serveur (Function admin) |
| 7901 | recordDeviceAccountLink | devicelink | accounts[] | chaque compte qui se connecte sur l'appareil réécrit le doc partagé entre tous les comptes de l'appareil (l.7899 lecture → 7901 réécriture) | Function serveur à la connexion avec arrayUnion ; jamais écrit par le client |
| 28099 | moveDevTask | devtask | status | l'admin/équipe technique modifie le signalement de bug créé par un utilisateur (l.28096 lecture → 28099 réécriture) | transaction serveur (Function admin) ne modifiant que status |
| 28724 | sendThreadMessage (et sendThreadPhoto l.28741, vocal l.28766, sendPostToFriend l.15230) | dm | tableau de messages entier | chaque participant lit tout le fil et le réécrit avec son message ajouté (l.28722 lecture → 28724 réécriture) ; deux envois simultanés s'écrasent | sous-collection dm/{thread}/messages/{msgId} (un doc par message, création seule) |
| 27946 | toggleMessageReaction | dm | reactions{} d'un message | un participant réécrit le fil entier pour modifier les réactions d'un message de l'autre (l.27936 lecture → 27946 réécriture) | sous-collection messages/{id}/reactions/{uid} ou arrayUnion/arrayRemove sur le doc message |
| 23510 | changeUsername (renommage) | dm | clé du fil et champ from de chaque message | l'utilisateur renommé réécrit tous les fils de ses correspondants sous une nouvelle clé et supprime l'ancienne (l.23502-23511) | transaction serveur (Function de renommage) ou identifiant stable (uid) au lieu du nom dans la clé |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 17394-17401 | leaveCourseAsStudent | courseleave | wasPaid = !stateFunded && !trialEnrollment ; pricePaid conservé lors du départ | Ces champs décident d'une réinscription gratuite : le client ne doit pas les fixer (achats) |
| 17638-17650 | (inscription au cours, appelant de priorLeaveKeys) | courseleave | Si un courseleave avec wasPaid=true existe, réinscription 'approved' sans nouveau paiement | Contournement du paiement : un client peut forger un courseleave wasPaid=true (achats, auto-acceptation) |
| 18780 | notifyCourseGroupChatMembers | coursegroupchatnotifypref | L'expéditeur lit la préférence privée de chaque autre élève pour décider de le notifier | Lecture croisée d'une clé privée d'autrui : fan-out de notifications à faire en Function |
| 18675-18678 | openCourseSharedNotes | coursenotes | Accès réservé aux élèves 'approved', formateur exclu | Contrôle d'accès uniquement côté client ; à refléter dans les règles PARTICIPANTS |
| 19650-19652 | addCourseVideo | coursevideo | mediaFlagged posé selon la modération Video Intelligence appelée depuis le navigateur ; l.17436 masque les vidéos flaggées aux élèves | Modération contournable (flag client) ; clé API cloud exposée (à vérifier) ; la Function doit poser le flag |
| 25802-25836 | computeCreatorFundDistribution | creatorfundpayout | Montant = vues/1000 × taux × multiplicateur qualité (0,5–1,5 selon rétention), plafonné au budget | Calcul de reversement financier fait dans le navigateur à partir de settings: et post: (reversements, commissions) |
| 25852 | confirmCreatorFundDistribution | creatorfundpayout | L'admin crée un payout status 'pending' par créateur et notifie le montant | Création de créances financières par un client dont le rôle admin n'est pas vérifié par claim (reversements, rôles) |
| 33856-33858 | submitPayoutDispute | creatorfundpayout | Un créateur ne peut contester qu'une fois (si !disputeStatus) | Garde-fou côté client seulement ; contestation d'un montant financier (reversements) |
| 33815-33817 | resolveFundDispute | creatorfundpayout | L'admin marque la contestation 'resolved' avec note | Action de back-office sur un doc financier (ADMIN, rôles) |
| 14454, 14466 | nominateCreatorOfMonth / voteForCreatorOfMonth | creatorvote | Une nomination par nominé par mois ; un vote par utilisateur (toggle) | Intégrité d'un scrutin : sans serveur, votes multiples et bourrage possibles (à vérifier si une récompense en découle) |
| 7512-7518 | checkDeviceHasBannedAccount | devicelink | Si un compte lié à l'appareil est banni, le login est bloqué | Sanction/anti-contournement fondée sur une clé modifiable par le client (sanctions, identité C4) |
| 7899-7901 | recordDeviceAccountLink | devicelink | Ajoute chaque compte connecté à la liste de l'appareil (MAX_ACCOUNTS_PER_DEVICE = 3 l.7889) | Identité et limite de comptes par appareil : doit être posée par le serveur à l'authentification |
| 33877-33885 | renderDuplicateAccounts | devicelink | Admin détecte les comptes multiples par appareil et par numéro de paiement | Données d'identité et de paiement lues par un client « admin » non vérifié par claim (ADMIN) |
| 27967-27970 | (signalement de bug) | devtask | Quota de 5 signalements par utilisateur et par 24 h | Limite calculée côté client, contournable (anti-spam) |
| 28096-28102 | moveDevTask | devtask | Passage à 'done' d'un bug notifie son auteur | Action réservée à l'équipe technique/admin (rôles) |
| 32828-32833 | addDecisionLogEntry | decisionlog | Entrée signée author = currentAdminName | Le nom d'admin vient d'une variable client ; rôle à vérifier par claim (rôles) |
| 33907 | renderDecisionLog | decisionlog | Bouton d'archivage réservé au super-admin via classe CSS admin-super-only | Restriction purement visuelle ; deleteDecisionLogEntry l.32837 est appelable par tout client (rôles) |
| 31470-31480 | regenerateDailySummary | dailysummarycache | Résumé IA de la plateforme (comptes, signalements, reversements en attente) généré depuis le navigateur | Appel IA avec clé côté client (secrets) et données de gouvernance ; à générer en Function admin |
| 32621-32636 | renderCourseSearchGaps | coursesearchlog | L'admin agrège les questions d'élèves sans réponse | Données personnelles d'élèves : lecture réservée au back-office (ADMIN) |
| 21104-21114 | renderGroupedDelivery | deliverycircle | Tout membre du cercle voit les commandes non livrées (order:) des vendeurs membres | Expose des commandes (SERVEUR_SEUL) à des tiers ; filtrage à faire en Function |
| 28969-28972, 30485-30487 | (journal d'activité admin, statistiques) | dm | L'admin liste et lit tous les fils privés pour compter les messages | Confidentialité des DM : agrégation à faire côté serveur, jamais par lecture client des fils |
| 31925-31926 | fileHarassmentReportWithEvidence | dm | Les 5 derniers messages du fil sont joints comme preuve au signalement | Preuve fournie par le client (falsifiable) ; extraction serveur des messages réels (sanctions) |
| 28720 | sendThreadMessage | dm | Envoi bloqué si blocage dans un sens ou l'autre (isBlockedEitherWay) | Règle de blocage contournable côté client ; à vérifier en règle/Function |
