### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| badgepayment | {id, username, country, amount, createdAt} | true | 0 | 1 | 1 | 0 | admin (approveBadgeRequest) | non | petit | non | 23796, 23819, 31535 |
| badgerequest | {id, username, country, price, status, createdAt} | true | 1 | 2 | 1 | 1 | propriétaire (création) puis admin (status, delete) | oui (admin réécrit la demande de l'utilisateur, status→approved) | petit | non | 23775, 23789, 23798, 23802 |
| banappeal | {username, text, status, createdAt, lifted} | true | 2 | 2 | 3 | 0 | compte banni non authentifié (clé = nom saisi à la connexion) puis admin (résolution) | oui (admin réécrit status/lifted du doc utilisateur) | petit | non | 7400, 7405, 33741, 33757 |
| battle | {id, streamerA, streamerB, liveIdA, liveIdB, status, startedAt, endedAt, winner} | true | 6 | 4 | 0 | 0 | streamerA crée ; streamerB accepte/refuse ; l'un des deux termine | oui (streamerB modifie le doc créé par streamerA ; endBattle par l'un ou l'autre) | petit | non | 24618, 24627, 24636, 24692 |
| blockevent | {blockedUser, blockerUser, createdAt} | true | 0 | 1 | 1 | 0 | le bloqueur (clé préfixée par le nom du bloqué + timestamp) | non (append-only ; mais déclenche réécriture de user:<bloqué> l.32108) | petit | non | 16250, 32099, 32108 |
| boost | {postId, username, expiresAt} | true | 1 | 1 | 1 | 0 | admin (approveBoostRequest) | non | petit | non | 13324, 23854, 23887 |
| boostpayment | {id, username, country, amount, createdAt} | true | 0 | 1 | 1 | 0 | admin (approveBoostRequest) | non | petit | non | 23856, 23881, 31536 |
| boostrequest | {id, postId, username, country, price, durationHours, status, createdAt} | true | 1 | 2 | 1 | 1 | propriétaire (création) puis admin (status, delete) | oui (admin réécrit la demande de l'utilisateur) | petit | non | 23837, 23850, 23858, 23864 |
| bundlediscount | {minItems, percent, updatedAt} | true | 2 | 1 | 0 | 0 | vendeur propriétaire (clé = currentUser) | non | petit | non | 14696, 26851, 26858 |
| buyerrating | {buyerUsername, sellerUsername, stars, orderId, createdAt} | true | 2 | 1 | 1 | 0 | vendeur (clé = orderId), note un autre utilisateur | non (création unique ; mais déclenche réécriture de user:<acheteur> l.21578) | petit | non | 21530, 21562, 21564, 21573 |
| cagnotte | {id, creator, title, description, goal, country, status, createdAt} | true | 3 | 2 | 1 | 0 | créateur (création et clôture, vérif creator l.25551) | non | petit | non | 25464, 25485, 25540, 25555 |
| cagnottecontribution | {contributor, amount, createdAt} | true | 0 | 1 | 1 | 0 | contributeur (autre utilisateur que le créateur) ; clé cagnotteId__contribId | non (append-only ; total sommé côté client l.25489) | petit | non | 25476, 25489, 25543 |
| cart | tableau [{productId, quantity}] | true | 4 | 3 | 0 | 0 | propriétaire (clé = currentUser) | non | petit | non | 14641, 14645, 14684, 14721 |
| certcodelookup | chaîne "SG-XXXXXXXX" (code de vérification) | true | 3 | 0 | 0 | 0 | élève (auto-délivrance côté client via ensureCertificateVerificationCode l.20575, set via variable existingKey non comptée) | non | petit | non | 17169, 20571, 20575, 22205 |
| certverification | {code, studentUsername, courseId, courseTitle, trainerUsername, average, issuedAt} | true | 1 | 1 | 0 | 0 | élève (auto-délivrance côté client après contrôle client des seuils l.20689-20697) | non | petit | non | 20577, 20591, 20701 |
| challenge | {id, title, hashtag, description, reward, courseId, createdBy, status, createdAt} | true | 5 | 4 | 2 | 0 | admin (createChallenge, endChallenge) ou formateur (createCourseChallenge, closeCourseChallenge) | oui (endChallenge l.30915 et closeCourseChallenge l.36558 ne vérifient pas createdBy) | petit | non | 30896, 30918, 36543, 36562 |
| codeanalysisreport | {totalLines, totalFunctions, duplicates, longest, riskyResults, dependenciesFound, todoCount, generatedAt} | true | 2 | 1 | 0 | 0 | admin (runCodeRobustnessAnalysis l.21884), clé unique "latest" | non | moyen (listes de fonctions/motifs, à vérifier) | non | 21937, 21965, 30548 |
| coinadjustment | {username, amount, reason, adjustedBy, createdAt} | true | 0 | 1 | 1 | 0 | admin (adjustUserCoinBalance) | non (append-only) | petit | non | 34223, 35214 |
| coinbalance | nombre entier (solde de pièces) | false | 9 | 6 | 0 | 0 | propriétaire (récompense quotidienne, achat pack, dépense, pub récompensée, retrait) et admin (ajustement) | oui (admin l.35211-35213 lit→calcule→réécrit coinbalance:<autre utilisateur> ; accès effectif en shared=false à vérifier) | petit | non | 7236, 34655, 34663, 35213 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
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

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 23798 | approveBadgeRequest | badgerequest | status | admin réécrit la demande créée par l'utilisateur l.23775 | transaction serveur (approveBadge : status + user.verifiedBadge + badgepayment atomiquement) |
| 23792 | approveBadgeRequest | user (hors lot) | verifiedBadge | admin réécrit user:<demandeur> | même transaction serveur |
| 7405 | logInAsExistingUser | banappeal | doc entier | visiteur non authentifié écrit banappeal:<nom saisi> | Function createBanAppeal liée à l'identité de l'appareil (devicelink) |
| 33757 | resolveBanAppeal | banappeal | status, lifted | admin réécrit l'appel de l'utilisateur banni | transaction serveur (résolution + réactivation user + notification) |
| 24625 | acceptBattle | battle | status, startedAt | streamerB modifie le doc créé par streamerA | transaction serveur ou règle PARTICIPANTS limitée au champ status |
| 24634 | declineBattle | battle | status | streamerB modifie le doc de streamerA | idem |
| 24690 | endBattle | battle | status, endedAt, winner | l'un des deux streamers calcule le vainqueur depuis gift: et réécrit | transaction serveur (winner calculé côté Functions) |
| 32108 | checkBlockSpikeThreshold | user (hors lot) | blockSpikeAlertedAt, blockSpikeCount | le bloqueur réécrit user:<bloqué> | trigger Function onCreate blockevent |
| 16247 | toggleBlockUser | user (hors lot) | followers, following | le bloqueur réécrit user:<bloqué> pour rompre les abonnements | sous-collection followers + Function |
| 21578 | checkReliableBuyerBadge | user (hors lot) | reliableBuyer | le vendeur réécrit user:<acheteur> | trigger Function onCreate buyerrating |
| 23858 | approveBoostRequest | boostrequest | status | admin réécrit la demande de l'utilisateur | transaction serveur (status + boost + boostpayment) |
| 25543 | contributeToCagnotte | cagnottecontribution | nouveau doc sous la cagnotte d'un autre | contributeur écrit cagnotteId__contribId | sous-collection cagnottes/{id}/contributions + increment() du total via Function de paiement |
| 35213 | adjustUserCoinBalance | coinbalance | valeur entière | admin lit→calcule→réécrit coinbalance:<autre utilisateur> | transaction serveur + increment() + journal coinadjustment |
| 30915 | endChallenge | challenge | status | admin bascule le statut sans vérifier createdBy (défi possiblement créé par un formateur l.36543) | Function avec vérification de rôle |
| 36558 | closeCourseChallenge | challenge | status | formateur clôt un défi sans vérifier createdBy/courseId | règle owner==createdBy ou Function |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 23772 | requestVerifiedBadge | badgerequest | Prix du badge lu depuis settings:badge_price et inscrit dans la demande par le client | Le montant facturé ne doit pas être choisi par le navigateur |
| 23789-23798 | approveBadgeRequest | badgerequest, badgepayment | Admin marque « paiement reçu », active verifiedBadge et journalise le paiement | Validation de paiement et attribution d'un statut = rôle admin vérifié par claim + atomicité |
| 23802 | rejectBadgeRequest | badgerequest | Suppression pure de la demande (pas de trace) | Audit : refus doit être journalisé, suppression réservée aux Functions |
| 7400-7405 | logInAsExistingUser | banappeal | Un compte banni peut déposer une contestation avant toute authentification | Sanctions/appels = flux modération ; identité non prouvée côté client (C4) |
| 33741-33757 | resolveBanAppeal | banappeal | Admin lève ou maintient un bannissement, réactive user.status | Levée de sanction = décision admin vérifiée par claim |
| 24676-24685 | sendBattleGift | battle (via gift:) | Don 500 FCFA avec commission getGiftCommissionRate() calculée côté client | Calcul financier et commission doivent être serveur |
| 24685-24690 | endBattle | battle | Vainqueur = somme des dons par camp calculée côté client | Résultat financier/compétitif falsifiable par un participant |
| 32099-32110 | checkBlockSpikeThreshold | blockevent | Seuil de bloqueurs distincts en 24h → alerte + blockSpikeAlertedAt sur le compte visé | Détection anti-harcèlement = logique de sanction, non manipulable |
| 23832-23839 | requestBoostPost | boostrequest | Prix 24h/3j/7j depuis settings:boost_price* choisi et inscrit par le client | Tarification = serveur |
| 23850-23858 | approveBoostRequest | boost, boostpayment | Admin active le boost (expiresAt calculé client) et journalise le paiement | Validation paiement + mise en avant payante = Functions |
| 13324-13334 | renderFeed (tri) | boost | Les posts boostés non expirés sont placés en tête du fil | Priorisation payante doit reposer sur des données non écrivables par le client |
| 26846-26851 | saveBundleDiscount | bundlediscount | Vendeur définit une remise 1-90% dès N articles | Bornes de promo à revalider serveur |
| 14696-14708 | submitCartCheckout | bundlediscount, cart | Remise sur lot, commission getCommissionRate(), netAmount calculés côté client puis écrits dans order: | Prix, commission et reversement = calculs financiers serveur (C2) |
| 21558-21568 | rateBuyerForOrder | buyerrating | Seul le vendeur d'une commande livrée peut noter, une seule fois | Contrôle d'unicité et de rôle non fiable côté client |
| 21571-21580 | checkReliableBuyerBadge | buyerrating | ≥5 notes et moyenne ≥4 → badge reliableBuyer sur le compte | Attribution de badge de confiance = serveur |
| 25543 | contributeToCagnotte | cagnottecontribution | Contribution en FCFA enregistrée sans paiement vérifié | Flux financier : paiement et increment() du total côté Functions |
| 25551-25555 | closeCagnotte | cagnotte | Seul le créateur clôt la cagnotte | OK côté règles (owner) mais clôture d'une collecte de fonds à journaliser |
| 20689-20701 | renderCourseCertificate (à vérifier nom) | certcodelookup, certverification | Seuils certMinAverage / certMinAttendance vérifiés client, puis code SG- généré et attestation écrite | Émission de diplôme/attestation officielle doit être serveur |
| 20583-20585 | ensureCertificateVerificationCode | certverification | Pose user.isAlumnus lors de la première émission | Statut de compte = serveur |
| 30896 | createChallenge | challenge | Création de défi réservée à l'admin (createdBy = currentAdminName) | Rôle admin vérifié uniquement côté client |
| 30972-30998 | awardChallengeReward | challenge (via post:) | isGenuineOwnerSession autorise l'attribution d'une récompense (post.challengeRewardAwarded) | Attribution de récompense = rôle super-admin par claim |
| 36543-36551 | createCourseChallenge | challenge | Formateur crée un défi de cours et notifie tous les élèves approuvés | Rôle formateur et fan-out de notifications = serveur |
| 21937 | runCodeRobustnessAnalysis | codeanalysisreport | Rapport d'analyse du code source stocké en clé partagée « latest » | Expose les motifs à risque de l'app ; lecture réservée admin |
| 35205-35214 | adjustUserCoinBalance | coinadjustment, coinbalance | Admin ajuste le solde d'un utilisateur (min 0) avec motif obligatoire | Crédit manuel de monnaie virtuelle = Function admin + journal immuable |
| 7233-7236 | (récompense de connexion, à vérifier nom) | coinbalance | +settings:dailycoinreward pièces à chaque nouveau jour de connexion | Auto-crédit client (C2) ; à faire en Function avec anti-rejeu |
| 34650-34656 | purchaseCoinPack | coinbalance | Pièces créditées immédiatement sans paiement vérifié ; coinpurchase journalisé | Achat de pièces = webhook de paiement + transaction serveur |
| 34660-34664 | unlockEpisodeWithCoins | coinbalance | Débit du solde et écriture episodeunlock | Dépense de monnaie virtuelle = transaction serveur |
| 34682-34700 | startRewardedAd | coinbalance | Limite quotidienne adcoindailylimit et crédit adcoinreward après minuterie client | Compteur et récompense manipulables ; serveur avec preuve de visionnage |
| 35468-35473 | requestCoinWithdrawal | coinbalance | Débit immédiat du solde puis demande de retrait (coinwithdrawal) | Reversement d'argent réel = transaction serveur + validation admin |
