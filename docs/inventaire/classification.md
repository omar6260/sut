# Classification de sécurité des préfixes

Classes définies dans `docs/ARCHITECTURE-CIBLE.md`. En cas de doute, SERVEUR_SEUL.

- **SERVEUR_SEUL** : 73
- **PRIVE** : 39
- **ADMIN** : 38
- **PUBLIC_PROPRIETAIRE** : 30
- **PARTICIPANTS** : 23

Lecture : « PUBLIC_PROPRIETAIRE » ou « PARTICIPANTS » signifie que les **lectures** et les écritures du propriétaire passent par les règles Firestore ; dans presque tous les cas, un ou plusieurs **champs** de ces documents (statut, prix, compteurs) restent SERVEUR_SEUL — voir la justification et `logique-sensible.md`.

| Préfixe | Classe | Justification |
|---|---|---|
| abconversion | SERVEUR_SEUL | Écrit par le client pour lui-même (28163) mais agrège des métriques admin (28190) falsifiables ; doute → serveur |
| abexposure | SERVEUR_SEUL | Même motif : le client s'auto-déclare exposé (28153), le back-office calcule les taux dessus (28195-28198) |
| abtestdef | ADMIN | Créé/supprimé uniquement depuis le back-office (28170, 28178) ; configuration d'expériences |
| accountarchive | ADMIN | Archive de preuve contenant KYC, téléphone, e-mail (23204-23208) ; lue seulement par l'admin (35377) ; aujourd'hui shared=true donc lisible par tous |
| accountdeletionrequest | ADMIN | La demande (23173) déclenche une suppression complète de compte par l'admin (23202-23218) ; le statut doit être posé par une Function |
| activationbatch | ADMIN | Contient tous les codes en clair (16860) et n'est lu que par le back-office (16873, 16884) ; shared=true actuel expose les codes |
| activationcode | SERVEUR_SEUL | L'activation est une lecture→modif→réécriture par l'utilisateur d'un document admin (16950-16956) puis octroi `stateFunded` (16958) ; doit être atomique côté serveur |
| activitylog | PRIVE | Journal personnel écrit/lu/masqué/vidé uniquement par le propriétaire (11397, 11434, 11443) ; actuellement shared=true (fuite) |
| ad | SERVEUR_SEUL | `spent`/`impressions`/`status` modifiés par tout spectateur (26105-26113) et sommés comme revenu plateforme (35050-35052) ; validation admin (25920) |
| adclickattribution | PRIVE | Clé = currentUser, shared=false, seul le propriétaire lit/écrit/supprime (11275, 11282, 11294) |
| adminloginlog | ADMIN | Journal des connexions d'équipe (28923) ; lecture « propriétaire seul » n'est gardée que par une variable client (29754) |
| adseenby | PRIVE | Clé `<adId>__<user>`, shared=false, lecture/écriture par le seul spectateur (26089, 26119) |
| affiliatepartnership | SERVEUR_SEUL | Le créateur fige lui-même `commissionPercent` (22250) qui sert ensuite au calcul des reversements ; falsifiable côté client |
| affiliatesale | SERVEUR_SEUL | Montants de commission et frais plateforme calculés et écrits par l'acheteur (27253-27263) ; c'est un reversement |
| aitechreport | ADMIN | Rapport interne équipe technique écrit et lu dans le back-office (21983, 22002) |
| auctionbid | SERVEUR_SEUL | Validation mise ≥ courant+1 et fin d'enchère faites côté client (27005-27007) ; l'historique doit être écrit par la transaction serveur |
| auditlog | SERVEUR_SEUL | Classé ainsi dans ARCHITECTURE-CIBLE ; chaîne de hachage et rôle de l'acteur calculés côté client (28932-28940), écrit aussi depuis des sessions utilisateur (16961, 18337) |
| autoblockedcomment | ADMIN | File de modération d'images bloquées (15158) traitée par l'admin (32454-32463) ; image base64 potentiellement sensible |
| badge | SERVEUR_SEUL | Écrit par le formateur (18330) : vérifier « formateur du cours » via `course:` + notification + auditlog (18335-18337) → Function ; doute → serveur |
| badgepayment | ADMIN | Journal financier écrit uniquement par l'admin l.23796, consommé par le tableau de bord revenus l.31535 ; création via Functions. |
| badgerequest | SERVEUR_SEUL | Le prix est fixé côté client l.23772 et l'approbation (status + user.verifiedBadge) est posée par le client admin l.23792-23798 ; transitions d'état via Functions. |
| banappeal | ADMIN | Écrit avant authentification par un compte banni avec pour clé le nom saisi l.7405 (usurpable), résolu par l'admin l.33757 ; création par Function, lecture/résolution rôle admin. |
| battle | PARTICIPANTS | Écritures limitées à streamerA/B (contrôles l.24625, 24634, 24690) ; mais le vainqueur est calculé depuis gift: côté client l.24685-24689 → transitions accept/end en Functions (en doute : SERVEUR_SEUL). |
| blockevent | SERVEUR_SEUL | Événement de sécurité append-only l.16250 alimentant la détection de pic de blocages l.32099-32110 ; ne doit être ni lisible ni falsifiable par les utilisateurs. |
| boost | SERVEUR_SEUL | Écrit uniquement par l'admin après paiement l.23854, lu par tous pour trier le fil l.13324 ; jamais écrit par le propriétaire du post. |
| boostpayment | ADMIN | Journal de paiement écrit par l'admin l.23856, agrégé dans les revenus l.31536. |
| boostrequest | SERVEUR_SEUL | Prix et durée calculés côté client l.23832-23839 depuis settings:boost_price ; approbation admin l.23850-23858 côté client. |
| bundlediscount | PUBLIC_PROPRIETAIRE | Écrit par le vendeur pour lui-même l.26851, lu par les acheteurs au checkout l.14696 ; l'application de la remise l.14701-14708 doit toutefois être recalculée serveur. |
| buyerrating | SERVEUR_SEUL | Le vendeur note un autre utilisateur l.21564 après contrôle client de sellerUsername/delivered l.21560 ; conditionne le badge reliableBuyer l.21578. |
| cagnotte | PUBLIC_PROPRIETAIRE | Seul le créateur écrit (création l.25464, clôture avec vérif creator l.25551) ; lecture par tous l.25485. |
| cagnottecontribution | SERVEUR_SEUL | Contribution en FCFA l.25543 sans paiement vérifié, total sommé côté client l.25489 ; doit passer par une Function de paiement. |
| cart | PRIVE | Clé = currentUser l.14641 et aucun autre lecteur ; le shared=true du prototype est une erreur (à vérifier). |
| certcodelookup | SERVEUR_SEUL | Code de certificat auto-délivré côté client l.20575 après contrôle client des seuils de moyenne/présence l.20689-20697 ; l'émission doit être serveur. |
| certverification | SERVEUR_SEUL | Attestation officielle créée côté client l.20577 ; lecture publique par code l.20591 acceptable mais création Functions uniquement (sinon falsifiable). |
| challenge | SERVEUR_SEUL | Créé par admin l.30896 (currentAdminName) ou formateur l.36543 ; récompense attribuée l.30990 ; rôles vérifiés uniquement côté client (isGenuineOwnerSession l.30972). |
| codeanalysisreport | ADMIN | Rapport interne back-office l.21937, lu au chargement de l'admin l.30548 ; expose des motifs à risque du code source. |
| coinadjustment | ADMIN | Journal d'ajustement manuel de solde écrit par l'admin l.35214, lu dans le tableau de bord revenus l.34223. |
| coinbalance | SERVEUR_SEUL | Solde lu, incrémenté et réécrit par le navigateur l.7235-7236, 34654-34655, 35468-35471 (C2 du diagnostic) ; toutes les mutations en transaction Functions. |
| coinpurchase | SERVEUR_SEUL | Justificatif financier créé après crédit du solde sans aucune preuve de paiement (34655-34656) ; doit être émis par la Function de paiement ; lecture propriétaire + admin. |
| coinwithdrawal | SERVEUR_SEUL | Débite `coinbalance:` côté client avant la demande (35483) et l'admin passe `status='paid'` depuis le navigateur (35521) ; contient un numéro de téléphone listé à tous (35503). |
| collabplaylist | PUBLIC_PROPRIETAIRE | Lu par tous (12825), écrit une seule fois par `creator` (12810), aucune réécriture. |
| collabplaylistitem | PUBLIC_PROPRIETAIRE | Doc possédé par `addedBy` (12951) ; règle de suppression étendue au `creator` de la playlist parente (12944-12948) via `get()` ou sous-collection `collabplaylist/{id}/items`. |
| commentdraft | PRIVE | Brouillon lu/écrit/supprimé uniquement par `currentUser` en `shared=false` (15100-15111). |
| commissionhistory | ADMIN | Journal d'audit des changements de taux de commission écrit avec `currentAdminName` (30676) et lu uniquement au back-office (29742). |
| communityevent | PUBLIC_PROPRIETAIRE | Lu par tous (31136), créé par `organizer` (31125) ; `participants[]` doit sortir en sous-collection car réécrit par tout inscrit (31252). |
| communitygroup | PUBLIC_PROPRIETAIRE | Lu par tous (34809), créé par `createdBy` (34821) ; `members[]` doit sortir en sous-collection (34867). |
| communitypost | PUBLIC_PROPRIETAIRE | Auteur = `userId` (34876) ; lecture ouverte à tout compte (34885) ; la condition « membre » (34872) devient une règle avec `get()` sur le groupe. |
| conferenceattendance | SERVEUR_SEUL | Donnée dérivée (24325) qui alimente le taux de présence conditionnant l'attestation (20679-20686) ; doit être calculée par une Function à la fin du live. |
| contentembedding | SERVEUR_SEUL | Vecteur produit par un appel Gemini avec la clé `settings:geminiApiKey` lue dans le navigateur (26568-26571) ; écriture par des élèves (17690) ; calcul à déplacer en Function. |
| contest | PUBLIC_PROPRIETAIRE | Propriétaire = formateur du cours (courseId, 19968) ; lecture par les élèves (20044, gardée par abonnement côté client) ; clôture 20032 par le formateur. |
| contestentry | PARTICIPANTS | Écrit par l'élève (20079) et par le formateur pour `score` (20018) ; lu par tous les participants une fois clos (20054) ; le champ `score` doit être restreint au formateur. |
| course | PUBLIC_PROPRIETAIRE | Catalogue lu par tous (17316) et écrit par `trainerUsername`/co-formateurs (17995, 18209) ; MAIS `status` (15426, 15438, 17994) et `price` doivent être réservés aux Functions. |
| coursechat | PARTICIPANTS | Accès limité aux inscrits approuvés + formateur (17581-17585, 18209) ; à convertir en sous-collection de messages, médias vers Storage (18965, 19003). |
| coursechatnotifypref | PRIVE | Clé par utilisateur en `shared=false` (17397) ; la lecture des prefs d'autrui à 18813 doit se faire dans la Function de notification. |
| coursefaq | PUBLIC_PROPRIETAIRE | Écrit par le gestionnaire du cours (18647, 18656 via currentManagedCourseId gardé par 18209), lu par tous les visiteurs du cours (18639). |
| coursegoal | PRIVE | Clé `<courseId>__<currentUser>` lue et écrite uniquement par son propriétaire (20609, 20634, 20649) malgré `shared=true`. |
| coursegroupchat | PARTICIPANTS | Réservé aux élèves approuvés, formateur exclu (18747-18749) ; sous-collection de messages, médias vers Storage (18924). |
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
| ebook | ADMIN | Seul le propriétaire publie/supprime (garde client `isGenuineOwnerSession` l.36762/36797) ; lecture par tous ; le PDF base64 (l.36771) doit aller dans Storage, pas Firestore. |
| ebookpurchase | SERVEUR_SEUL | L'acheteur enregistre lui-même un achat payant sans aucune vérification de paiement (l.36783) — le déverrouillage l.36747 doit être produit par une Function. |
| editorialentry | PARTICIPANTS | Écriture par le propriétaire ou les membres listés dans `editorialteam:owner` (hasEditorialCalendarAccess l.33042-33045, vérifié l.33073/33086). |
| editorialteam | PUBLIC_PROPRIETAIRE | Seul le propriétaire écrit sa liste (l.33055/33064) ; lecture nécessaire par tout membre potentiel (l.33043) et parcours de tous les utilisateurs l.33127. |
| edupurchase | SERVEUR_SEUL | Journal de revenus utilisé pour la comptabilité plateforme (l.35041-35043, 35158) ; créé sur validation d'un paiement (l.17034). |
| edustreak | PRIVE | Compteur personnel lu/écrit uniquement par le propriétaire (l.19345-19356) ; gamification sans enjeu financier. |
| edusubpayment | SERVEUR_SEUL | Ligne de revenu d'abonnement sommée dans le tableau de bord admin (l.30120-30122) ; ne doit être créée que par une Function de paiement (l.17036). |
| edusubrequest | SERVEUR_SEUL | Le statut `approved` déclenche la création de l'abonnement (l.17030-17038) et l'auto-approbation s'exécute dans le navigateur du demandeur (l.17011). |
| edusubscription | SERVEUR_SEUL | Contrôle d'accès payant (isEducationSubActive l.16781-16783) et `expiresAt` écrit côté client (l.17033) ; seul `cancelled` (l.16737) pourrait rester au propriétaire via Function. |
| enrollment | SERVEUR_SEUL | `status`/`price` conditionnent l'accès aux cours payants et le chiffre d'affaires (l.15453-15457, 30109, 30119) ; création `approved` côté client l.17619/17629/17645. |
| episodereleasenotified | SERVEUR_SEUL | Drapeau global écrit par le premier client qui ouvre le feed (l.34518) ; doit devenir une Function planifiée qui envoie les notifications d'épisodes. |
| episodeunlock | SERVEUR_SEUL | Débit de pièces et création du déverrouillage entièrement côté client (l.34662-34664) ; transaction serveur sur `coinbalance:`. |
| examresult | PARTICIPANTS | Écrit par le formateur du cours pour un élève inscrit (l.20108), lu par l'élève et les classements (l.18080, 19314) ; la règle doit vérifier `course.trainerUsername == uid` (à vérifier faisable). |
| exceptionregistry | ADMIN | Registre d'audit des passe-droits admin (l.37088) avec revue par le DG (l.37141-37144) ; export l.37150. |
| exercise | PARTICIPANTS | Formateur propriétaire du cours écrit (l.17763), élèves inscrits lisent (l.36691) ; le champ `correction` est livré aux élèves avec la consigne (à vérifier s'il est affiché avant échéance). |
| failedaccessattempt | SERVEUR_SEUL | Compteur anti-brute-force du mot de passe admin écrit par le client anonyme (l.29979) et déclenchant `settings:criticalAlertUnauthorizedAccess` (l.29988) — contournable. |
| favoriteassignments | PRIVE | Préférence personnelle de rangement, propriétaire seul (l.13943, 13952). |
| favoritefolders | PRIVE | Liste de dossiers personnels, propriétaire seul (l.13914, 13922). |
| featurevote | PUBLIC_PROPRIETAIRE | Proposition publique de l'auteur (l.14421) ; les votes (l.14564) doivent sortir du doc vers une sous-collection. |
| followersnapshot | PRIVE | shared=false, écrit et lu uniquement par le propriétaire pour sa tendance d'abonnés (22710, 22714, 22720). |
| followsource | SERVEUR_SEUL | Doc d'analytics créateur écrit par l'abonné (13587) et supprimé par admin/propriétaire (7969) ; à produire côté serveur lors du follow pour éviter un doc écrit par un tiers dans l'espace du créateur. |
| fullexam | SERVEUR_SEUL | Contient `correctIndex` des QCM (18378) et l'élève lit l'examen complet pour le passer (18506) : les corrigés doivent rester serveur (ou sous-document séparé), écriture formateur seulement. |
| fullexamsubmission | SERVEUR_SEUL | Élève crée (18539) puis formateur note (18431 : status/totalScore) ; la note alimente moyennes, classement et certificats (18086, 19320) — dépôt et notation par fonction. |
| gift | SERVEUR_SEUL | Flux financier FCFA avec commission calculée client (25428, 25563–25567) et aucun débit de solde ; explicitement SERVEUR_SEUL dans ARCHITECTURE-CIBLE. |
| group | PARTICIPANTS | Lecture/écriture par les membres listés (`members.includes(currentUser)` 28613) ; départ d'un membre modifie `members` (28710) → sous-collection ou arrayRemove. |
| groupmsg | PARTICIPANTS | Chat de groupe lu/écrit par les membres (28668, 28688) ; à transformer en sous-collection de messages plutôt qu'un tableau unique. |
| importantalert | ADMIN | Alerte back-office (« grosse commande ») lue et marquée `seen` par l'admin (29642–29645) mais créée depuis la session de l'acheteur (29596) → création par Function, lecture par claim. |
| internalchangelog | ADMIN | Journal interne du back-office, auteur `currentAdminName` (33938), supprimable (33947) ; aucune vérification de rôle côté stockage. |
| knowledgebase | ADMIN | Procédures internes du back-office (33957) ; suppression « super-admin » gardée uniquement par une classe CSS (33990). |
| learningpath | PUBLIC_PROPRIETAIRE | Lu par tous les connectés (22166), créé par le formateur (`trainerUsername: currentUser`, 22184) avec condition trainerVerified vérifiée côté client (22153, à vérifier par règle). |
| lesson | SERVEUR_SEUL | Contenu payant (accès conditionné à enrollment/edusubscription/trial, 17420–17429, et `freePreview`) avec pièces jointes base64 jusqu'à 5 Mo (19797) et modération admin `aiFlagged` (15474) → Storage + Functions. |
| lessontemplate | PRIVE | Clé `lessontemplate:<currentUser>__` lue et écrite uniquement par le propriétaire (19740, 19750) ; shared=true inutile. |
| live | SERVEUR_SEUL | Statut d'approbation admin (26204), auto-approbation par `settings:autoApproveLives` (32186), billetterie `ticketPrice` (24504), vente flash prix (25322), sanctions automatiques (32162–32173) et votes/likes de spectateurs (24449, 14085) sur un même doc. |
| liveauthrequest | ADMIN | Demande d'exception au seuil 1000 abonnés ; approbation admin écrit `status` et pose `liveAuthorizedOverride` sur le user (8501–8506). |
| livechatmsg | PARTICIPANTS | Messages de chat d'un live, écrits par tout spectateur (24881) avec règles abonnés-only/mots interdits/quarantaine évaluées client (24870–24879) ; lecture par les spectateurs du live. |
| livechattranscript | SERVEUR_SEUL | Archive produite à la fin du live (24311) ; lecture restreinte streamer+abonnés vérifiée côté client seulement (25229–25232) et scan risque admin (31339) → génération par Function. |
| livedoc | PARTICIPANTS | Document en direct d'un cours écrit par le formateur (18251) et lu par les élèves inscrits (19088, sondage 4 s ligne 17583). |
| livehistory | PUBLIC_PROPRIETAIRE | Historique de live écrit par le streamer à la fin (24318), lu par tous pour « lives manqués » (28228) ; contient viewerCount calculé client (à vérifier / idéalement produit par Function). |
| liveinvite | PARTICIPANTS | Doc partagé entre streamer/co-modérateurs (25256, 25178) et invité (24500) ; lu par tous pour le roster (24712) — modèle sous-collection `lives/{id}/invites` avec règle streamer-ou-invité. |
| livenotifypref | PRIVE | Préférence personnelle écrite avec shared=false (13753) ; la lecture croisée par le streamer (13761, 24075) doit passer par une Function ou un flag public sur l'abonnement. |
| livespeakrequest | PARTICIPANTS | Créée par le spectateur (25079), supprimée par les modérateurs du live (25162, 25169) ; sous-collection du live avec accès demandeur + modérateurs. |
| liveviewer | PARTICIPANTS | Heartbeat propre au spectateur (25188) mais supprimé par un modérateur au kick (24851) et purgé par le streamer (24316) ; sous-collection du live, présence idéalement via Realtime Database/TTL. |
| loginevent | SERVEUR_SEUL | Journal d'audit des connexions (7208) exploité par l'admin (28957) ; doit être écrit par une Function d'auth pour ne pas être falsifiable. |
| loyaltypoints | SERVEUR_SEUL | Solde à valeur monétaire (5 FCFA/point, 26713) lu-incrémenté-réécrit côté client (7866, 27270, 27275) : n'importe qui peut se créditer. |
| meetinghistory | ADMIN | Écrit et lu uniquement sous isGenuineOwnerSession (33511, 33667) ; données internes de l'équipe. |
| negotiation | SERVEUR_SEUL | Le prix accepté (26798) est directement appliqué comme prix unitaire de la commande (27198-27201) : la validation d'offre et le statut doivent être transactionnels serveur. |
| note | PRIVE | Notes personnelles en stockage privé (28216, 28283), aucun lecteur tiers. |
| notif | SERVEUR_SEUL | Créée par un autre utilisateur au nom du destinataire (11459) puis modifiée par lui (11751) ; la création via Function évite le spam/usurpation, le destinataire garde read/pinned/delete sur `users/{uid}/notifs`. |
| notinterested | PRIVE | Liste personnelle en stockage privé (10788, 10793). |
| officialnews | ADMIN | Publication et suppression réservées au back-office (30876, 31029), lecture publique (31020). |
| oncall | ADMIN | Planning d'astreinte assigné par un admin (28392) et lu uniquement au back-office (28402). |
| order | SERVEUR_SEUL | Commission, netAmount, remise fidélité et prix négocié calculés côté client (27227-27245) ; statut, reversement (35455) et override admin (23109) écrits par trois rôles différents. |
| parentlink | SERVEUR_SEUL | Lien qui déverrouille le Mode Familial (20163-20167) et la vue des notes de l'élève (20224) ; créé par l'élève dans l'espace de clé du parent (20210) — approbation à faire par Function. |
| parentlinkrequest | SERVEUR_SEUL | Demande créée par le parent (20147) et approuvée/refusée par l'élève (20207, 20217) ; approbation à valider serveur car elle génère le parentlink (contrôle parental, mineurs). |
| partnership | ADMIN | Contrats créateurs avec rémunération, écrits et lus sous isGenuineOwnerSession (35982, 36001, 36016). |
| penc | PARTICIPANTS | Salon audio public : tout participant réécrit participants[]/chatMessages[] (33226, 33308), hôte gère kicked/coHosts (33345, 33375), admin force la clôture (33426) — sous-collections participants/messages + Function pour la clôture forcée. |
| pencreport | ADMIN | Signalement créé par un utilisateur (33356) mais lu/résolu uniquement par l'admin (33434, 33461) ; création via Function, lecture par claim admin. |
| penctopicvote | PUBLIC_PROPRIETAIRE | Thème lisible par tous (14546), créé par son auteur (14528) ; les votes (14540) sortent en sous-collection votes/{uid}. |
| pinnedcontacts | PRIVE | Clé = currentUser, lue et écrite seulement par lui (27706, 27727) ; aucune raison d'être partagée. |
| platformexpense | ADMIN | Dépenses financières saisies au back-office (35128) et agrégées dans le tableau de bord finance (35053). |
| playlist | PUBLIC_PROPRIETAIRE | Écriture gardée par ownerUsername === currentUser (12763, 12797) ; lecture par username (12734) donc potentiellement publique (à vérifier). |
| poll | PUBLIC_PROPRIETAIRE | Sondage créé par userId (31149), lisible par tous (31159) ; votes (31208) en sous-collection votes/{uid} avec compteur. |
| post | PUBLIC_PROPRIETAIRE | Document du créateur (10603) lisible par tous (8842) ; likes/commentaires/vues en sous-collections ; champs de modération (suspended 30637, mediaFlagged 32908, blockedCountries 32873) réservés aux Functions ADMIN. |
| postnotifypref | PRIVE | shared=false, clé follower__auteur (13771) ; la lecture par l'auteur pour le fan-out (13780) doit passer par une Function. |
| premiumpayment | SERVEUR_SEUL | Journal de paiement (23603) écrit pendant l'approbation d'un abonnement, qui peut s'exécuter dans le navigateur de l'abonné (23570). |
| premiumpurchase | SERVEUR_SEUL | Revenu comptabilisé dans le dashboard finance (35038) ; écriture 23601 déclenchable par le client de l'abonné via auto-acceptation. |
| premiumrequest | SERVEUR_SEUL | Le prix est fixé côté client depuis settings (23566) et l'approbation/écriture de subscription se fait dans le navigateur (23583-23607). |
| product | PUBLIC_PROPRIETAIRE | Fiche du vendeur lisible par tous (26245), écrite par sellerUsername (20908) ; enchères 27009, stock 27279, créneaux 27573 et modération 32393 réservés aux Functions. |
| profilevisit | PARTICIPANTS | Créé par le visiteur (16017) et lu uniquement par le propriétaire du profil (16040) : deux membres nommés dans la clé. |
| promocode | PUBLIC_PROPRIETAIRE | Vendeur seul écrit (clé currentUser 26871) ; acheteur lit pour valider (26955) ; la remise doit être recalculée serveur (27220). |
| pronunciationchallenge | PUBLIC_PROPRIETAIRE | Créé par le gestionnaire du cours (36471), lu dans la fiche cours par tout visiteur (17439) ; propriété = formateur du cours (à vérifier). |
| quickreplies | PRIVE | Modèles de réponses du vendeur, clé currentUser (20871, 20879), jamais lus par autrui. |
| quickscroll | PRIVE | shared=false, clé postId__currentUser (10771) ; signal de pertinence personnel. |
| quiz | SERVEUR_SEUL | correctIndex est stocké dans le document lisible par les élèves (18574, 18617) : la bonne réponse doit être isolée côté serveur. |
| quizsubmission | SERVEUR_SEUL | L'élève calcule et écrit lui-même `correct` (18629-18632) ; la correction doit être une Function. |
| recentlyviewed | PRIVE | Historique personnel (26642, 21023) ; l'agrégat admin de l'entonnoir (35073) doit devenir une Function d'analytics. |
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
| subscription | SERVEUR_SEUL | Droit Premium payant : expiresAt et prix écrits côté client (23595) et auto-approbation depuis le navigateur de l'abonné (23570) ; seule une Function doit activer/prolonger ; l'utilisateur ne doit pouvoir toucher que `cancelled` via Function. |
| supplierpartnership | ADMIN | CRUD réservé au propriétaire de la plateforme par simple flag client `isGenuineOwnerSession` (35929) ; contacts commerciaux = données internes. |
| suspensionappeal | ADMIN | Créé par un compte suspendu avant connexion (7430) puis résolu par l'admin qui réactive le compte (33783) ; la création doit passer par une Function (utilisateur non authentifié + anti-spam), la lecture/résolution par rôle admin. |
| systemerror | SERVEUR_SEUL | Écrit par tout client via handlers globaux (7056) et lu/effacé uniquement au back-office (7180, 7200) ; journal technique, création via Function (rate-limit), lecture ADMIN. |
| systemupdatelog | ADMIN | Journal d'envoi de notifications globales, écrit par l'admin (35885) et par la tâche planifiée exécutée dans un client quelconque (35867) — à déplacer en Function planifiée. |
| teachingimage | PRIVE | Bibliothèque personnelle du formateur, listée par préfixe `<currentUser>__` (10074) et jamais lue par un tiers ; contenu base64 → Storage (C5). |
| teamrecognition | ADMIN | Écrit/supprimé avec `currentAdminName` depuis le back-office (29192, 29199) ; usage interne équipe. |
| threadreadreceipt | PARTICIPANTS | Écrit par le lecteur (15029), lu par le partenaire du fil (27883) ; les deux membres du `dm:` sont les seuls lecteurs légitimes. |
| ticket | SERVEUR_SEUL | Billets de live payants avec commission calculée côté client (25389-25393) et statut `approved` qui ouvre l'accès (24507) ; tickets support modifiés par l'admin (28482) — séparer en deux collections, écritures via Function. |
| ticketpayment | SERVEUR_SEUL | Journal de revenus/commissions (25397) agrégé dans le tableau de bord financier (31537) ; doit être créé exclusivement par la Function d'approbation. |
| topicpreferences | PRIVE | Préférences de fil, `shared=false`, lues/écrites uniquement avec `currentUser` (13031-13052). |
| trainerrating | PUBLIC_PROPRIETAIRE | Note publique d'un élève (clé `<formateur>__<élève>`, 18308), lue par tous pour la moyenne (18269) ; règle : `studentUsername == uid`, un doc par élève ; vérifier inscription au cours côté serveur (à vérifier). |
| trainerrequest | SERVEUR_SEUL | Candidature avec numéro de paiement, photo et diplôme (16501) ; approbation attribue le rôle formateur (15399) et l'auto-validation IA tourne dans le navigateur du candidat (32307) — approbation/rôle via Function uniquement. |
| trainersnapshot | SERVEUR_SEUL | Snapshots quotidiens de tous les formateurs écrits par le premier client formateur du jour (15497) ; c'est une tâche planifiée serveur (Function cron), lecture propriétaire/admin. |
| trendvote | SERVEUR_SEUL | Tableau `votes` partagé réécrit par chaque votant (14487) ; élection publique avec risque de bourrage/écrasement — sous-collection de votes ou Function transactionnelle. |
| user | SERVEUR_SEUL | Doc mêlant profil public, PII (googleEmail 7850, trainerPaymentNumber 15399), rôles (isTrainer 15399) et sanctions (status 32140, 35661) écrits par le client ; doit être éclaté : profil public (propriétaire), champs privés (PRIVE), rôles/sanctions/compteurs (Functions). |
| userstrike | ADMIN | Sanctions formelles écrites depuis le back-office (35652) avec escalade suspension/ban automatique (35661, 35670) ; lecture par l'admin (35563) et notification à l'utilisateur. |
| videoanalysis | SERVEUR_SEUL | Appels à l'API Video Intelligence avec clé stockée en settings (9536, 9589) faits depuis le navigateur ; résultat suspend automatiquement le post (9617) — à exécuter en Function avec la clé côté serveur. |
| videocompletion | PUBLIC_PROPRIETAIRE | Un doc par spectateur (`<postId>__<viewer>`, 12644) écrit uniquement par lui ; agrégé en lecture par le créateur (12655) — règle `username == uid` ; agrégats par Function à terme (C1). |
| videodraft | PRIVE | Brouillon personnel écrit et lu avec shared=false par currentUser seul (l. 22284, 22310) ; vidéo base64 → Storage en phase 07 (C5). |
| videosubtitles | SERVEUR_SEUL | Cache de génération IA écrit par n'importe quel spectateur avec la clé Gemini lue côté client (l. 8046, 8066) ; la génération et l'écriture doivent passer par une Function. |
| vocabnotebook | PRIVE | Carnet strictement personnel, clé `vocabnotebook:<currentUser>` (l. 20482, 20509) bien que shared=true dans le prototype. |
| voicecalllog | PARTICIPANTS | Journal lisible uniquement par caller/callee (filtre client l. 21063) ; l'appelant crée le doc (l. 20936) ; à défaut de règle sur `caller`/`callee`, Function. |
| wantedlisting | PUBLIC_PROPRIETAIRE | Annonce lue par tous les connectés du pays (l. 27070-27072), écrite/clôturée uniquement par `author` (l. 26975, 27105). |
| wantedresponse | PUBLIC_PROPRIETAIRE | Réponse écrite par son auteur sur sa propre clé (l. 27096-27097), affichée à tous sur le détail de l'annonce (l. 27126-27129). |
| watchhistory | PRIVE | Historique personnel shared=false (l. 13265, 15881), effacé par le propriétaire (l. 15893). |
| watchposition | PRIVE | Position de lecture personnelle shared=false (l. 12578, 12590, 12594). |
| wisdomcapsule | SERVEUR_SEUL | Contenu éditorial écrit/supprimé seulement par le propriétaire admin (`isGenuineOwnerSession` l. 36822, 36836), lu par tous (l. 36809) ; écriture via Function + Storage pour l'audio. |
| wishlist | PRIVE | Liste personnelle écrite par currentUser (l. 22400) mais visibilité conditionnelle `wishlistVisible` (l. 16131) et balayage global `safeList('wishlist:')` par le vendeur (l. 22422) → exposition et notifications « retour en stock » via Function. |
| workgroup | PARTICIPANTS | Créé par le formateur du cours (l. 36574, garde l. 18209), lu par les élèves listés dans `members` (l. 36590). |
| workgroupchat | PARTICIPANTS | Fil écrit par tout membre du groupe (l. 36626) et lu par eux (l. 36611) ; devient une sous-collection `messages` par groupe. |
| zonecampaign | SERVEUR_SEUL | Campagne locale publiée par le propriétaire admin (garde écran l. 8734, action journalisée l. 36897), lue par tous (l. 36919) ; écriture par Function avec claim admin. |
