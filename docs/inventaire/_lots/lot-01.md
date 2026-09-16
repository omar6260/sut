### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| abconversion | `{testName, username, variant, createdAt}` — clé `abconversion:<test>__<user>` | true | 0 | 1 | 1 | 0 | l'utilisateur lui-même (recordABConversion, clé = currentUser) ; admin lit la liste | non | petit | non | 28158, 28163, 28190 |
| abexposure | `{testName, username, variant, createdAt}` — clé `abexposure:<test>__<user>` | true | 0 | 0 | 1 | 0 | l'utilisateur lui-même (getABTestVariant écrit via variable `exposureKey`, non compté) ; admin liste | non | petit | non | 28151, 28153, 28189 |
| abtestdef | `{name, variantA, variantB, createdAt}` — clé `abtestdef:<name>` | true | 0 | 1 | 1 | 1 | admin (back-office, createABTest / deleteABTest) | non | petit | non | 28170, 28178, 28185 |
| accountarchive | `{username, kycStatus, kycFullName, kycVerifiedAt, phone, country, googleEmail, internalNote, archivedAt, archivedBy}` — clé `accountarchive:<user>` | true | 1 | 3 | 0 | 0 | propriétaire (auto-suppression 7984) et admin (23204, 35755) ; admin lit (35377) | non | petit | non | 7984, 23204, 35377, 35755 |
| accountdeletionrequest | `{username, reason, status(pending/completed/rejected), createdAt, completedAt}` — clé `accountdeletionrequest:<user>` | true | 3 | 3 | 1 | 0 | propriétaire crée (23173) ; admin change `status` par lecture→modif→réécriture (23218, 23225) | non (modif par l'admin, pas par un autre utilisateur — voir ECRITURES_CROISEES) | petit | non | 23169, 23173, 23180, 23218 |
| activationbatch | `{id, label, codes[], createdAt, createdBy}` — clé `activationbatch:batch_<ts>` | true | 1 | 1 | 1 | 0 | admin (generateActivationCodes) ; admin lit/télécharge | non | petit (≤200 codes, 16854) | non | 16860, 16873, 16884 |
| activationcode | `{code, batchId, label, redeemed, redeemedBy, redeemedAt}` — clé `activationcode:<CODE>` | true | 1 | 2 | 0 | 0 | admin crée (16862) ; N'IMPORTE QUEL utilisateur réécrit le document admin lors de l'activation (16950→16956) | oui (utilisateur modifie doc admin : redeemed/redeemedBy/redeemedAt) | petit | non | 16862, 16950, 16956, 16958 |
| activitylog | `{username, category, description, createdAt, hidden}` — clé `activitylog:<user>__<ts>_<rand>` | true | 0 | 0 | 2 | 0 | système pour le compte du propriétaire (logUserActivity 11449, appels 9112/23426/27249 avec currentUser) ; propriétaire masque (11434) / supprime (11443) | non | petit | non | 11397, 11434, 11443, 11449 |
| ad | `{id, advertiserName, mediaData(base64), budget, cpm, spent, impressions, status, createdBy, clicks, conversions, likes[]}` — clé `ad:ad_<ts>` | true | 10 | 13 | 3 | 1 | admin (25770, 25923, 25931, 25998, 26017, 26026, 26041, 26045) ; annonceur utilisateur (25893, pending_review) ; TOUT spectateur (11272 clicks, 11292 conversions, 26113 impressions/spent/status, 26129 likes) ; n'importe quel client (26007 activation programmée) | oui (compteurs et likes modifiés par des tiers) | gros (mediaData jusqu'à 3,5 Mo, 25764/25889 ; MAX_FILE_SIZE 6953) | oui | 25770, 25893, 26105, 26113 |
| adclickattribution | `{adId, clickedAt}` — clé `adclickattribution:<user>` | false | 1 | 1 | 0 | 2 | propriétaire uniquement (11275 écrit, 11282 lit, 11286/11294 supprime) | non | petit | non | 11275, 11282, 11286, 11294 |
| adseenby | `{count, lastShownAt}` — clé `adseenby:<adId>__<user>` | false | 1 | 0 | 0 | 0 | propriétaire (lecture 26089 ; écriture 26119 via variable `seenKey`, non comptée) | non | petit | non | 26089, 26115, 26119 |
| adminloginlog | `{id, name, role, scope, createdAt}` — clé `adminloginlog:adminlogin_<ts>_<rand>` | true | 0 | 1 | 2 | 0 | session admin (logAdminLogin 28921, rôle/scope pris dans des variables client) ; lu par équipe (29063) et « propriétaire » (29758, garde client isGenuineOwnerSession) | non | petit | non | 28923, 29063, 29754, 29758 |
| affiliatepartnership | `{productId, creatorUsername, sellerUsername, commissionPercent, createdAt}` — clé `affiliatepartnership:<productId>__<creator>` | true | 0 | 1 | 1 | 0 | le créateur (acceptAffiliatePartnership, clé = currentUser) ; snapshot de `product.affiliateCommissionPercent` | non | petit | non | 22222, 22246, 22250 |
| affiliatesale | `{orderId, productId, creatorUsername, sellerUsername, grossCommissionAmount, platformFeePercent, platformFeeAmount, commissionAmount}` — clé `affiliatesale:order_<ts>` | true | 0 | 1 | 1 | 0 | l'ACHETEUR (tiers) crée le document au moment de la commande (27258) ; créateur lit (22273) | non (création par un tiers, pas de modification) | petit | non | 27253, 27258, 22273 |
| aitechreport | `{content, provider, generatedAt, generatedBy}` — clé unique `aitechreport:latest` | true | 1 | 1 | 0 | 0 | équipe technique / admin (21983) | non | petit | non | 21983, 22002 |
| auctionbid | `{bidder, amount, createdAt}` — clé `auctionbid:<productId>__<ts>` | true | 0 | 1 | 1 | 0 | l'enchérisseur (placeBid 27010, append) ; modifie aussi `product:` du vendeur (27007-27009) | non pour ce préfixe (append-only) ; oui sur `product:` voisin | petit | non | 26986, 27005, 27009, 27010 |
| auditlog | `{id, actorName, actorRole, action, detail, createdAt, previousHash, entryHash}` — clé `auditlog:audit_<ts>_<rand>` | true | 0 | 2 | 6 | 0 | logAdminAction (28932) depuis sessions admin MAIS aussi depuis sessions utilisateur (16961 activation, 18337 formateur) ; système à l'inscription (7837) ; + `settings:lastAuditLogHash` (28940) | non (append-only) | petit (collection volumineuse) | non | 7837, 28939, 28940, 28943 |
| autoblockedcomment | `{username, postId, imageData(base64), reason, createdAt}` — clé `autoblockedcomment:<ts>` | true | 1 | 1 | 4 | 2 | le commentateur bloqué (système, 15158) ; admin approuve (32454→addComment) / supprime (32457, 32463) ; balayage à la suppression de compte (7994, 23214, 35765) | non | moyen (image de commentaire ; borne de taille à vérifier) | oui | 15158, 32428, 32454, 32457 |
| badge | `{courseId, trainerUsername, studentUsername, badgeName, message, createdAt}` — clé `badge:<courseId>__<student>__<ts>` | true | 0 | 1 | 3 | 0 | le formateur du cours (18330) ; lu par formateur (18349), élève (18340), admin (15730) | non (nouveau document, l'élève n'est pas modifié) | petit | non | 15730, 18330, 18340, 18349 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
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
| adseenby | PRIVE | Clé `<adId>__<user>`, shared=false, lecture/écriture par le seul spectateur (26089, 26119) |
| adminloginlog | ADMIN | Journal des connexions d'équipe (28923) ; lecture « propriétaire seul » n'est gardée que par une variable client (29754) |
| affiliatepartnership | SERVEUR_SEUL | Le créateur fige lui-même `commissionPercent` (22250) qui sert ensuite au calcul des reversements ; falsifiable côté client |
| affiliatesale | SERVEUR_SEUL | Montants de commission et frais plateforme calculés et écrits par l'acheteur (27253-27263) ; c'est un reversement |
| aitechreport | ADMIN | Rapport interne équipe technique écrit et lu dans le back-office (21983, 22002) |
| auctionbid | SERVEUR_SEUL | Validation mise ≥ courant+1 et fin d'enchère faites côté client (27005-27007) ; l'historique doit être écrit par la transaction serveur |
| auditlog | SERVEUR_SEUL | Classé ainsi dans ARCHITECTURE-CIBLE ; chaîne de hachage et rôle de l'acteur calculés côté client (28932-28940), écrit aussi depuis des sessions utilisateur (16961, 18337) |
| autoblockedcomment | ADMIN | File de modération d'images bloquées (15158) traitée par l'admin (32454-32463) ; image base64 potentiellement sensible |
| badge | SERVEUR_SEUL | Écrit par le formateur (18330) : vérifier « formateur du cours » via `course:` + notification + auditlog (18335-18337) → Function ; doute → serveur |

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 11272 | trackAdClickAndDiscover | ad | clicks | tout utilisateur qui clique modifie la campagne de l'annonceur/admin | increment() via Function (ou sous-collection `adevents`) |
| 11292 | recordAdConversionIfAttributed | ad | conversions | l'acheteur modifie la campagne (fenêtre 1 h, 11284-11285) | increment() via Function côté commande |
| 26113 | recordAdImpression | ad | impressions, spent, status | tout spectateur du fil incrémente `spent += cpm/1000` et peut passer la campagne en `paused` | transaction serveur (budget) |
| 26129 | toggleAdLike | ad | likes[] | tout utilisateur réécrit la campagne entière pour ajouter/retirer son nom | sous-collection `likes/<uid>` |
| 26007 | activateScheduledAdsIfDue | ad | status | n'importe quel client passe `scheduled` → `active` | Function planifiée |
| 16956 | redeemActivationCode | activationcode | redeemed, redeemedBy, redeemedAt | un utilisateur réécrit un document créé par l'admin (course-condition : deux usages simultanés) | transaction serveur |
| 16958 | redeemActivationCode | user: (hors lot) | stateFunded | l'utilisateur s'octroie lui-même l'accès financé après activation | transaction serveur (même Function) |
| 27009 | placeBid | product: (hors lot) | auctionCurrentBid, auctionHighestBidder | l'enchérisseur réécrit le produit du vendeur | transaction serveur |
| 23218 | processAccountDeletion | accountdeletionrequest | status, completedAt | l'admin réécrit la demande de l'utilisateur | Function admin |
| 23225 | rejectAccountDeletionRequest | accountdeletionrequest | status | l'admin réécrit la demande de l'utilisateur | Function admin |
| 32456 | approveBlockedComment | post: (hors lot, via addComment) | comments | l'admin ajoute un commentaire (image) sur la publication d'un autre utilisateur | sous-collection `comments` |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 16946-16961 | redeemActivationCode | activationcode | Code à usage unique ; s'il est valide → `user.stateFunded = true` (accès Éducation financé par l'État) puis logAdminAction depuis la session utilisateur | Octroi d'un droit payé par un tiers ; unicité non atomique ; codes lisibles par safeGet shared |
| 16853-16862 | generateActivationCodes | activationbatch / activationcode | Génération de 1 à 200 codes stockés en clair, shared=true | Secrets exposés à tout client ; doit être ADMIN/Function |
| 26105-26113 | recordAdImpression | ad | `spent += cpm/1000` par impression, pause automatique si `spent ≥ budget`, notification annonceur | Calcul financier (facturation publicitaire) fait par le spectateur |
| 35050-35052 | (bilan financier admin) | ad | `adRevenue = Σ ad.spent` intégré au revenu total plateforme | Un compteur client-modifiable devient un chiffre comptable |
| 25886-25896 | submitSelfServeAd | ad | Annonce utilisateur en `pending_review`, CPM tiré de `settings:selfServeCpm` (25862) | Tarif et statut de modération doivent être posés par le serveur |
| 25920-25931 | approveSelfServeAd / rejectSelfServeAd | ad | Validation/refus admin + notification + auditlog | Rôle admin vérifié côté client uniquement |
| 26073 | pickAdForFeed | ad | Les abonnés Premium (`isUserPremium`) ne voient pas de publicité ; éligibilité par pays | Abonnement — dépend d'un statut premium qui doit être fiable |
| 11280-11294 | recordAdConversionIfAttributed | ad / adclickattribution | Attribution de conversion si commande < 1 h après clic | Métrique facturable calculée sur données locales |
| 27253-27263 | (placeOrder, bloc affiliation) | affiliatesale | Commission créateur = total × `affiliateCommissionPercent`, frais plateforme = `settings:affiliatePlatformFeePercent` (26630), net reversé au créateur | Commissions et reversements calculés et écrits par l'acheteur |
| 22246-22253 | acceptAffiliatePartnership | affiliatepartnership | Auto-acceptation du partenariat par le créateur sans validation du vendeur ; `commissionPercent` figé côté client | Auto-acceptation + montant de commission falsifiable |
| 27000-27014 | placeBid | auctionbid / product: | Mise ≥ enchère courante + 1, refus si enchère terminée ou si vendeur = enchérisseur ; notification du surenchéri | Enchères : validation et écriture concurrentes doivent être transactionnelles |
| 27019-27024 | proceedToAuctionCheckout | product: (hors lot) | Seul `auctionHighestBidder` peut régler ; `auctionSettled = true` posé par le client | Le gagnant est vérifié côté client |
| 28932-28940 | logAdminAction | auditlog + settings:lastAuditLogHash | Rôle acteur déduit de variables client (isPayoutSpecialist, isModerator, adminScope) ; chaîne SHA-256 `previousHash → entryHash` | Intégrité du journal nulle si le client calcule le hachage et écrit le chaînage |
| 28942-28954 | verifyAuditLogChainIntegrity | auditlog | Recalcul de la chaîne ; entrées sans hash ignorées | Un attaquant peut écrire des entrées sans `entryHash` pour passer sous le radar |
| 7834-7841 | (onboarding) | auditlog | Refus de création de compte si l'appareil est lié à un compte banni ; entrée auditlog « système » écrite par le navigateur | Sanction (contournement de bannissement) décidée et journalisée côté client |
| 28921-28925 | logAdminLogin | adminloginlog | Journalise nom/rôle/scope de la session admin depuis variables globales | Rôles : la source de vérité doit être les custom claims |
| 29754-29757 | renderAdminLoginLog | adminloginlog | « Réservé au propriétaire » gardé par `isGenuineOwnerSession` (28914) | Garde purement client ; données lisibles via storage shared |
| 23202-23220 | processAccountDeletion | accountarchive / accountdeletionrequest | Droit à l'oubli : archive KYC/téléphone/e-mail puis suppression user/posts/notes/commentaires bloqués | Suppression multi-collections + conservation de PII = Function admin idempotente |
| 7976-7997 | deleteMyOwnAccount | accountarchive | L'utilisateur lit `sellerinternalnote:<soi>` (note interne admin, 7983) et la recopie dans son archive | Fuite d'une note interne admin vers le client ; suppression en cascade côté client |
| 15155-15160 | submitComment | autoblockedcomment | Image de commentaire modérée par `moderateImageWithCloudVision` (clé API côté client, à vérifier) ; si signalée → enregistrement avec l'image | Modération automatique et clé API tierce ne doivent pas tourner dans le navigateur |
| 32453-32458 | approveBlockedComment | autoblockedcomment / post: | Faux positif : l'admin republie l'image comme commentaire et supprime le blocage | Décision de modération = ADMIN/Function |
| 18325-18337 | awardStudentBadge | badge | Formateur décerne un badge à un élève inscrit (`enrollment` approuvée, 18320) + notification + logAdminAction depuis session formateur | Vérification « formateur de ce cours » et journal audit à faire serveur |
| 28148-28156 | getABTestVariant | abexposure | Répartition 50/50 par hachage déterministe `test__user` ; non branchée (commentaire 4465) | Faible risque ; à vérifier si branché plus tard |
