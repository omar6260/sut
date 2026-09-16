# Classification de sécurité des préfixes

Classes définies dans `docs/ARCHITECTURE-CIBLE.md`. En cas de doute, SERVEUR_SEUL.

- **SERVEUR_SEUL** : 36
- **ADMIN** : 19
- **PRIVE** : 15
- **PUBLIC_PROPRIETAIRE** : 15
- **PARTICIPANTS** : 10

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
