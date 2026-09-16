### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| penctopicvote | {id, title, authorUsername, votes[], createdAt} | true | 1 | 2 | 1 | 0 | auteur du thème (création) + tout utilisateur (vote) | oui (votes[] du thème d'un autre) | petit | non | 14528, 14534, 14540, 14546 |
| pinnedcontacts | tableau de usernames épinglés (clé = currentUser) | true | 2 | 1 | 0 | 0 | propriétaire uniquement | non | petit | non | 27706, 27724, 27727 |
| platformexpense | {id, category, amount, description, addedBy, createdAt} | true | 0 | 1 | 3 | 0 | admin (back-office finance) | non | petit | non | 35053, 35128, 35138, 35170 |
| playlist | {id, ownerUsername, name, postIds[], createdAt} | true | 3 | 2 | 1 | 1 | propriétaire (contrôle ownerUsername 12763, 12797) | non | petit | non | 12734, 12744, 12763, 12801 |
| poll | {id, userId, question, options[], votes{idx:[users]}, createdAt, expiresAt} | true | 1 | 2 | 1 | 0 | auteur (création) + tout utilisateur (vote) | oui (votes{} du sondage d'un autre) | petit | non | 31149, 31159, 31200, 31208 |
| post | {id, userId, type, data(base64), caption, likes[], comments[], views…} + ~40 champs (audioData, images[], customThumbnail, poll, suspended, mediaFlagged, blockedCountries, coCreatorStatus…) | true | 63 | 43 | 7 | 8 | propriétaire (création 10582-10603) + tout utilisateur (like/commentaire/vue/réaction) + admin (suspension, sensible, pays, IA) + système (releaseScheduledPosts 8888, renommage 23491) | oui (likes/comments/views/reactions/watchLaterBy/favoritedBy/poll.votes/coCreatorStatus/suggestedReplyText d'un autre) | gros | oui (data vidéo/image, audioData, images[], beforeImage/afterImage, customThumbnail, comments[].imageData) | 8842, 10603, 14297, 14954 |
| postnotifypref | {notifyAll} (clé = follower__auteur) | false | 3 | 1 | 0 | 1 | propriétaire (le follower) | non (mais lecture croisée : l'auteur lit la pref privée de chaque follower 13780) | petit | non | 13593, 13639, 13771, 13780 |
| premiumpayment | {id, username, country, amount, createdAt} | true | 0 | 1 | 1 | 0 | admin (approvePremiumRequest) ou l'abonné lui-même si auto-acceptation (23570→23603) | non | petit | non | 23603, 23952 |
| premiumpurchase | {username, price, country, purchasedAt} (clé = username__ts) | true | 0 | 1 | 4 | 0 | admin (approvePremiumRequest) ou l'abonné lui-même si auto-acceptation | non | petit | non | 16547, 16592, 23601, 35038 |
| premiumrequest | {id, username, country, price, status, createdAt} | true | 1 | 2 | 1 | 1 | l'abonné (création 23567) + admin (status approved 23607, delete 23614) | oui (admin réécrit la demande de l'utilisateur ; auto-acceptation exécutée par le client de l'abonné) | petit | non | 23567, 23583, 23607, 23614 |
| product | {id, name, price, image(base64), sellerUsername, country, stock, variants, isAuction, auctionCurrentBid, auctionHighestBidder, serviceSlots, affiliateCommissionPercent, mediaFlagged, priceHistory…} | true | 38 | 12 | 2 | 4 | vendeur (16400, 21288, 22439, 22462) + acheteur (enchère 27009, stock 27279, créneau 27573) + admin (31624, 32393, 32401, 34122) | oui (enchérisseur, acheteur et réservataire réécrivent le produit du vendeur) | gros | oui (image via readFileAsDataURL non compressée 16398, 31622) | 16400, 21288, 27009, 27279 |
| profilevisit | {visitor, profileOwner, visitedAt} (clé = owner__visitor) | true | 0 | 1 | 1 | 0 | le visiteur (écrit dans l'espace clé du profil visité) | oui (visiteur crée un doc dans l'espace d'un autre, création simple sans relecture) | petit | non | 16017, 16040 |
| promocode | {sellerUsername, code, discountType, discountValue, active, expiresAt, createdAt} (clé = seller__CODE) | true | 8 | 4 | 1 | 0 | vendeur propriétaire (clé currentUser) ; acheteur lit seulement (26955, 27220) | non | petit | non | 26871, 26898, 26937, 27220 |
| pronunciationchallenge | {id, courseId, term, createdAt} (clé = courseId__id) | true | 0 | 1 | 1 | 1 | formateur gérant le cours (currentManagedCourseId, pas de contrôle de propriété explicite lu) | non | petit | non | 36471, 36479, 36497 |
| quickreplies | tableau de chaînes (clé = currentUser) | true | 1 | 2 | 0 | 0 | vendeur propriétaire | non | petit | non | 20871, 20879, 20887 |
| quickscroll | {postId, count, lastAt} (clé = postId__user) | false | 0 | 0 | 1 | 0 | propriétaire (signal de scroll rapide) | non | petit | non | 10771, 10774, 10778 |
| quiz | {id, courseId, title, question, options[], correctIndex, createdAt} | true | 0 | 1 | 1 | 0 | formateur (currentManagedCourseId) | non | petit | non | 18574, 18584, 18617 |
| quizsubmission | {quizId, courseId, studentUsername, selectedIndex, correct, createdAt} (clé = quizId__user) | true | 2 | 1 | 0 | 0 | l'élève (calcule lui-même `correct` 18629) | non | petit | non | 17443, 18607, 18632 |
| recentlyviewed | {productId, viewedAt} (clé = user__productId) | true | 0 | 1 | 3 | 0 | propriétaire (à l'ouverture d'une fiche 26642) ; admin liste tout (35073) | non | petit | non | 21023, 26057, 26642, 35073 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
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

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 14540 | voteForPencTopic | penctopicvote | votes[] | tout utilisateur réécrit le thème d'un autre | sous-collection votes/{uid} + increment(voteCount) |
| 31208 | voteOnPoll | poll | votes{idx:[users]} | tout utilisateur réécrit le sondage d'un autre | sous-collection votes/{uid} + increment(counts.idx) |
| 14297 | toggleLike | post | likes[], dislikes[] | tout utilisateur réécrit la publication d'un autre | sous-collection likes/{uid} + increment(likeCount) |
| 13840 | toggleDislike | post | dislikes[], likes[] | tout utilisateur réécrit la publication d'un autre | sous-collection reactions/{uid} + increment() |
| 14275 | selectReaction | post | reactions{emoji:[users]} | tout utilisateur réécrit la publication d'un autre | sous-collection reactions/{uid} + increment(reactionCounts.emoji) |
| 14954 | addComment | post | comments[] (avec imageData base64, status pending) | tout utilisateur réécrit la publication d'un autre | sous-collection comments/{id} + increment(commentCount) ; images en Storage |
| 14745 | toggleCommentLike | post | comments[i].likes/dislikes | tout utilisateur réécrit la publication d'un autre | sous-collection comments/{id}/likes/{uid} + increment() |
| 14764 | toggleCommentDislike | post | comments[i].dislikes/likes | idem | idem |
| 13263 | recordPostView | post | views, viewedBy[] | tout lecteur réécrit la publication | Function/increment(views) ; viewedBy en sous-collection |
| 10768 | recordQualifiedView | post | qualifiedViews | tout lecteur réécrit la publication | increment(qualifiedViews) |
| 13851 | toggleWatchLater | post | watchLaterBy[] | tout utilisateur réécrit la publication d'un autre | liste PRIVE de l'utilisateur (watchlater:{uid}) au lieu du post |
| 13878 | toggleFavorite | post | favoritedBy[] | tout utilisateur réécrit la publication d'un autre | liste PRIVE de l'utilisateur + increment(favoriteCount) |
| 33263 | voteOnPostPoll | post | poll.votes{user:idx} | tout utilisateur réécrit la publication d'un autre | sous-collection pollVotes/{uid} + increment() |
| 15084 | acceptCoCreatorInvite | post | coCreatorStatus | le co-créateur invité réécrit le post de l'auteur | transaction serveur (vérifie coCreatorUsername == uid) |
| 15093 | declineCoCreatorInvite | post | coCreatorStatus | idem | idem |
| 9245 | generateDuetToOrderSuggestion | post | suggestedReplyText | le navigateur du spectateur (duo) réécrit le post du vendeur avec un texte Gemini | Function serveur (appel Gemini côté serveur, clé non exposée) |
| 8888 | releaseScheduledPosts | post | status scheduled→published | n'importe quel client publie les posts programmés de tous | Function planifiée (cron) |
| 23491 | renommage utilisateur | post | userId, likes, dislikes, favoritedBy, comments[].user | un utilisateur réécrit tous les posts de la plateforme | Function serveur en batch, ou identité par uid immuable |
| 30628 | adminToggleSensitive | post | sensitive | admin réécrit le post d'un utilisateur | Function ADMIN (claim vérifié) |
| 30637 | adminToggleSuspendPost | post | suspended | admin | Function ADMIN |
| 9617 | pollVideoAIAnalysis | post | suspended | navigateur admin (résultat IA) | Function serveur |
| 32488 | dismiss flag | post | mediaFlagged | admin | Function ADMIN |
| 32563 | duplicate review | post | duplicateReviewed | admin | Function ADMIN |
| 32873 | saveCountryRestrictions | post | blockedCountries | admin | Function ADMIN |
| 32908 | dismissAiConfidenceFlag | post | mediaFlagged / suspended | admin | Function ADMIN |
| 30996 | awardChallengeReward | post | challengeRewardAwarded | admin/organisateur | Function serveur |
| 31658 | suppression commentaire signalé | post | comments[] splice, pinnedCommentIndex | admin | Function ADMIN sur sous-collection comments |
| 23607 | approvePremiumRequest | premiumrequest | status | admin (ou client de l'abonné en auto-acceptation 23570) réécrit la demande | transaction serveur |
| 27009 | placeBid | product | auctionCurrentBid, auctionHighestBidder | l'enchérisseur réécrit le produit du vendeur | transaction serveur (contrôle minBid, fin d'enchère) |
| 27023 | proceedToAuctionCheckout | product | auctionSettled | le gagnant réécrit le produit du vendeur | transaction serveur |
| 27279 | submitOrder | product | stock (décrément) | l'acheteur réécrit le produit du vendeur | transaction serveur / increment(-qty) avec contrôle stock>=qty |
| 27573 | bookServiceSlot | product | serviceSlots[] | le client réécrit le produit du prestataire | transaction serveur (sous-collection slots/{iso}) |
| 22439 | restockProduct | product | stock | pas de contrôle sellerUsername (à vérifier, écran vendeur) | règle owner == uid |
| 32393 | approveFlaggedProduct | product | mediaFlagged | admin | Function ADMIN |
| 16040 | recordProfileVisit | profilevisit | document entier (create) | le visiteur crée un doc dans l'espace du profil visité | sous-collection users/{owner}/visits/{visitor}, règle create-only visitor == uid |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 23566 | subscribeToPremium | premiumrequest | prix lu dans settings:premium_price et copié dans la demande (23567) | le client peut soumettre un prix falsifié ; le prix doit être fixé serveur |
| 23570 | subscribeToPremium → approvePremiumRequest | premiumrequest / premiumpurchase / premiumpayment | si settings:autoApprovePremium (32213) est true, le navigateur de l'abonné crée lui-même subscription:, premiumpurchase: et premiumpayment: (23593-23607) sans paiement vérifié | activation d'abonnement et journal de paiement = SERVEUR_SEUL, idempotent, après webhook de paiement |
| 23583 | approvePremiumRequest | premiumrequest | prolonge subscription de 30 j à partir de l'expiration existante (23586-23588) | calcul de durée d'abonnement, doit être transactionnel serveur |
| 23614 | rejectPremiumRequest | premiumrequest | suppression de la demande par l'admin | rôle ADMIN à vérifier par claim |
| 35128 | addPlatformExpense | platformexpense | saisie de dépenses par l'admin, journalisée via logAdminAction | comptabilité plateforme : rôle ADMIN vérifié serveur |
| 35053 | renderFinanceDashboard / exportFinanceReport | platformexpense, premiumpurchase, recentlyviewed | agrège commissions, revenus Premium/Édu/Séries/Pièces/Pub, dépenses, DAU/MAU, entonnoir | lecture de toutes les collections financières par le client ; agrégation en Function ADMIN |
| 27220 | submitOrder | promocode | remise promo appliquée (pourcentage ou montant plafonné au sous-total) puis commission (27232-27234) et points fidélité (27270-27275) | montant, commission, reversement et fidélité doivent être recalculés serveur, sinon commande à prix arbitraire |
| 26955 | applyPromoCode | promocode | validité (active, expiresAt) contrôlée côté client | contrôle serveur au moment de la commande |
| 27009 | placeBid | product | mise >= auctionCurrentBid+1, interdiction au vendeur, enchère non terminée | enchères : transaction serveur pour éviter écrasement et mises invalides |
| 27023 | proceedToAuctionCheckout | product | seul auctionHighestBidder règle l'enchère, prix = auctionCurrentBid | prix de commande dérivé d'un champ client-modifiable |
| 27279 | submitOrder | product | décrément du stock et notification stock_out | double vente possible en concurrence (dernier écrit gagnant) |
| 21288 | publish seller product | product | affiliateCommissionPercent, isAuction, isMysteryBox, guaranteeDays, mediaFlagged (Cloud Vision côté client) | taux de commission affilié et modération IA fixés par le client |
| 31624 | admin add product | product | produit sans sellerUsername créé par l'admin | rôle ADMIN par claim |
| 18574 | createCourseQuiz | quiz | correctIndex stocké dans le doc lu par les élèves (18617) | fuite de la bonne réponse ; corriger serveur |
| 18629 | submitQuizAnswer | quizsubmission | l'élève écrit lui-même correct=true/false | résultat pédagogique falsifiable ; Function de correction |
| 18604 | openCourseQuiz | quiz | accès conditionné à requireEducationSubscription() | abonnement Éducation vérifié client seulement |
| 8867 | fetchPosts | post | filtre client des posts suspended, mediaFlagged, scheduled, blockedCountries, comptes en pause, postPrivacy (private/friends) | règles Firestore/Function doivent imposer ces filtres, sinon contenu modéré/privé lisible |
| 10590 | publish | post | sensitive (contenu sensible, lié au Mode Familial à vérifier), downloadable, postPrivacy, poll, coCreator | drapeaux de visibilité/âge posés par le client ; modération serveur |
| 30637 | adminToggleSuspendPost / adminDeletePost (30619) | post | suspension et suppression de publications | sanctions : Function ADMIN avec claim + auditlog |
| 9617 | pollVideoAIAnalysis | post | suspension automatique si Video Intelligence détecte pornographie LIKELY (clé API dans settings) | clé API exposée ; modération IA côté serveur |
| 32873 | saveCountryRestrictions | post | blocage géographique par pays | restriction réglementaire : Function ADMIN |
| 30996 | awardChallengeReward | post | attribution de récompense de défi (challengeRewardAwarded) | récompense = valeur ; transaction serveur idempotente |
| 14930 | canUserCommentOnPost | post | commentRestriction (following/followers) + filterAllComments → status pending | règle d'accès aux commentaires à imposer serveur |
| 8888 | releaseScheduledPosts | post | passage scheduled→published exécuté par n'importe quel client | cron serveur |
| 13780 | notifyFollowersOfNewPost | postnotifypref | fan-out de notifications selon la pref privée de chaque follower (lue avec shared=false par l'auteur) | lecture d'une donnée privée d'autrui ; fan-out en Function |
| 16017 | recordProfileVisit | profilevisit | opt-out réciproque via settings:privateProfileBrowsing (shared=false) et isGenuineOwnerSession | réciprocité vérifiée uniquement client ; Function pour respecter l'opt-out |
| 23491 | renommage utilisateur | post | réécriture de userId/likes/comments sur tous les posts | identité par username mutable (C4) ; passer à un uid immuable |
| 35073 | renderFinanceDashboard | recentlyviewed | entonnoir de conversion vue→achat sur toutes les vues | analytics agrégée en Function ADMIN, pas de lecture globale client |
