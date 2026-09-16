### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| liveinvite | {liveId, username, invitedBy, createdAt, joinedAt} — clé `liveinvite:<liveId>__<username>` | true | 5 | 2 | 3 | 1 | streamer/co-modérateur (crée 25256, supprime 25178, purge 24334) et invité (ajoute joinedAt 24500) | oui (streamer crée un doc au nom de l'invité ; l'invité le réécrit ; le modérateur le supprime) | petit | non | 24500, 25068, 25178, 25256 |
| livenotifypref | {notifyAll} — clé `livenotifypref:<moi>__<streamer>` | false | 4 | 1 | 0 | 0 | propriétaire (abonné, 13753) ; lu par le streamer pour ses abonnés (13761, 24075) | non (lecture croisée seulement, incohérente avec shared=false — à vérifier) | petit | non | 13743, 13753, 13761, 24075 |
| livespeakrequest | {liveId, username, createdAt} — clé `livespeakrequest:<liveId>__<username>` | true | 1 | 1 | 2 | 2 | spectateur crée (25079) ; streamer/co-modérateur supprime (25162, 25169) ; purge à la fin du live (24332) | oui (le modérateur supprime le doc d'un autre utilisateur) | petit | non | 25079, 25090, 25162, 25169 |
| liveviewer | {lastSeenAt} — clé `liveviewer:<liveId>__<username>` | true | 0 | 1 | 3 | 2 | spectateur (heartbeat 25188, suppression 25241) ; modérateur de chat supprime lors d'un kick (24851) ; streamer purge à la fin (24316) | oui (kick 24851 : un modérateur supprime le heartbeat d'un autre) | petit | non | 24316, 24851, 25188, 25194 |
| loginevent | {username, createdAt} — clé `loginevent:<username>__loginevent_<ts>` | true | 0 | 1 | 2 | 0 | système à la connexion de l'utilisateur lui-même (7208) ; admin liste tout (28957) ; l'admin voit ses propres sessions (29096) | non | petit | non | 7208, 28957, 29096 |
| loyaltypoints | nombre entier (points) — clé `loyaltypoints:<username>` | true | 1 | 3 | 0 | 0 | nouvel inscrit crédite le parrain (7866) ; acheteur débite/crédite son propre solde (27270, 27275) | oui (7866 : le filleul lit → additionne → réécrit les points du parrain) | petit | non | 7866, 26731, 27270, 27275 |
| meetinghistory | {id, startedAt, endedAt, participants[], agendaSnapshot[]} | true | 1 | 1 | 1 | 0 | propriétaire de la plateforme (isGenuineOwnerSession, 33511-33516) | non | petit | non | 33516, 33668, 33682 |
| negotiation | {id, productId, sellerUsername, buyerUsername, offers[{by,amount,createdAt}], status, createdAt} — clé `negotiation:<productId>__<buyer>` | true | 6 | 4 | 1 | 0 | acheteur crée (26770) ; acheteur ou vendeur ajoute une offre (26786) ; vendeur/acheteur accepte ou refuse (26798, 26804) | oui (vendeur et acheteur réécrivent tous deux le même doc : offers[] et status) | petit | non | 26770, 26786, 26798, 27198 |
| note | {text, color, pinned, trashed, createdAt} — clé `note:<username>__<ts>` | false | 0 | 0 | 1 | 0 | propriétaire (28216-28217, 28317, 28326, 28333) | non | petit | non | 28216, 28283, 28317 |
| notif | {id, toUser, type, fromUser, postId, text, read, createdAt, pinned} | true | 3 | 5 | 1 | 1 | émetteur (fromUser, autre utilisateur ou « Suktum ») crée (11459) ; destinataire modifie read/pinned et supprime (11561, 11751, 11774, 11781, 11786) | oui (un utilisateur crée un doc destiné à un autre ; le destinataire le réécrit) | petit | non | 11459, 11508, 11751, 11786 |
| notinterested | tableau d'ids de publications — clé `notinterested:<username>` | false | 1 | 1 | 0 | 0 | propriétaire (10793) | non | petit | non | 10788, 10793 |
| officialnews | {id, title, content, author, createdAt} | true | 0 | 1 | 1 | 1 | admin (currentAdminName, 30876 ; suppression 31029) ; lu par tous (31020) | non | petit | non | 30876, 31020, 31029 |
| oncall | {weekKey, member, assignedBy, createdAt} — clé `oncall:<semaineISO>` | true | 1 | 1 | 1 | 0 | admin (currentAdminName, 28392) | non | petit | non | 28392, 28402, 28410 |
| order | {id, productId, productName, unitPrice, quantity, total, buyerUsername, sellerUsername, commissionRate, commissionAmount, netAmount, status, shipmentStage, payoutStatus, …} (30+ champs) | true | 18 | 10 | 6 | 0 | acheteur crée (14712, 27238) et annule/confirme réception (22968, 22997) ; vendeur change shipmentStage/annule (22362, 22954) ; admin marque traitée / reversée / override réception (31608, 35455, 23109) ; Yango (26497) | oui (acheteur, vendeur et admin réécrivent tous le même doc) | petit | non | 27238, 22362, 23109, 35455 |
| parentlink | {parentUsername, studentUsername, approved, createdAt} — clé `parentlink:<parent>__<élève>` | true | 3 | 1 | 1 | 0 | l'élève crée le doc à l'approbation (20210) ; lu par le parent (20141, 20163, 20224) | oui (l'élève écrit un doc dans l'espace de clé du parent) | petit | non | 20141, 20184, 20210, 20224 |
| parentlinkrequest | {id, parentUsername, studentUsername, status, createdAt} | true | 0 | 1 | 1 | 0 | parent crée (20147) ; élève passe status à approved/rejected (20207, 20217 via storageKey) | oui (l'élève lit → modifie status → réécrit la demande du parent) | petit | non | 20147, 20156, 20207, 20217 |
| partnership | {id, creatorUsername, objective, deliverables, compensation, status, createdAt} | true | 1 | 2 | 1 | 0 | propriétaire de la plateforme (isGenuineOwnerSession, 35982, 36001) | non | petit | non | 35989, 36002, 36008, 36016 |
| penc | {id, title, category, host, participants[], coHosts[], kicked[], everJoined[], chatMessages[{user,text,ts}], active, scheduledFor, createdAt} | true | 10 | 9 | 3 | 0 | hôte (33151, 33173, 33345, 33375, 33401) ; tout participant (rejoindre 33226, chat 33308, quitter 33387) ; admin clôture de force (33426) | oui (chaque participant réécrit participants[]/chatMessages[] du doc de l'hôte ; sondage 4 s 33235) | moyen | non | 33151, 33226, 33308, 33426 |
| pencreport | {id, pencId, pencTitle, host, reportedBy, reason, createdAt, status} | true | 1 | 2 | 3 | 0 | signaleur crée (33356) ; admin résout (33461) ; lu par l'admin (7134, 29613, 33434) | oui (l'admin réécrit status du signalement d'un utilisateur) | petit | non | 33356, 33434, 33461 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
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

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 25256 | inviteLiveGuest | liveinvite | doc entier (création) | streamer/co-modérateur crée `liveinvite:<live>__<invité>` au nom de l'invité | sous-collection `lives/{id}/invites/{uid}` : création par streamer/co-modérateurs, lecture par tous |
| 24500 | openLiveView | liveinvite | joinedAt | l'invité réécrit le doc créé par le streamer | même sous-collection ; règle : l'invité ne peut modifier que `joinedAt` |
| 25178 | removeLiveGuest | liveinvite | suppression | modérateur du live supprime l'invitation d'un autre utilisateur | sous-collection avec delete autorisé au streamer/co-modérateurs |
| 24334 | confirmEndMyLive | liveinvite | suppression en masse | streamer purge toutes les invitations | Function de fin de live (nettoyage batch) |
| 25162 | acceptLiveSpeakRequest | livespeakrequest | suppression | modérateur supprime la demande d'un spectateur | sous-collection `lives/{id}/speakRequests/{uid}` ; delete par modérateurs |
| 25169 | declineLiveSpeakRequest | livespeakrequest | suppression | modérateur supprime la demande d'un spectateur | idem |
| 24332 | confirmEndMyLive | livespeakrequest | suppression en masse | streamer purge toutes les demandes | Function de fin de live |
| 24851 | kickUserFromLive | liveviewer | suppression | modérateur de chat supprime le heartbeat d'un spectateur | sous-collection `lives/{id}/viewers/{uid}` ou Realtime DB présence ; delete par modérateurs |
| 24316-24337 | confirmEndMyLive | liveviewer | suppression en masse | streamer purge tous les heartbeats | Function de fin de live |
| 7866 | finishOnboarding (à vérifier le nom exact) | loyaltypoints | valeur numérique (points du parrain) | le nouvel inscrit lit → additionne → réécrit le solde du parrain | Function d'inscription : `increment(rewardPoints)` en transaction serveur |
| 26786 | submitNegotiationOffer | negotiation | offers[], status | acheteur ou vendeur pousse une offre dans le doc commun | sous-collection `negotiations/{id}/offers` + transaction serveur pour status |
| 26798 / 26804 | respondToNegotiation | negotiation | status | vendeur (ou acheteur) accepte/refuse l'offre de l'autre | Function `respondToNegotiation` transactionnelle (vérifie dernière offre) |
| 11459 | createNotification | notif | doc entier (création) | fromUser crée une notification pour toUser | Function ou sous-collection `users/{toUid}/notifs` en écriture serveur uniquement |
| 22362 | setOrderShipmentStage | order | shipmentStage, deliveredAt | vendeur modifie la commande créée par l'acheteur | Function `updateShipment` (vérifie seller == uid) |
| 22954 | sellerCancelOrder | order | status, cancelledAt, cancelledBy, cancellationReason | vendeur annule la commande de l'acheteur | Function transactionnelle avec contrôle de shipmentStage |
| 23109 | resolveRefundRequest (à vérifier le nom exact) | order | buyerConfirmedReceipt, buyerConfirmedByAdminOverride | admin réécrit le doc de l'acheteur | Function admin (claim) |
| 26497 | requestYangoDelivery (à vérifier le nom exact) | order | yangoRequestId | vendeur/admin écrit l'id Yango dans la commande | Function serveur (l'appel Yango porte une clé API) |
| 31608 | markOrderFulfilled | order | status | admin marque la commande traitée | Function admin |
| 35455 | markOrderPaidOut | order | payoutStatus, paidOutAt, paidOutBy | admin/spécialiste reversement réécrit la commande | Function admin avec journal de reversement |
| 20210 | approveParentLink | parentlink | doc entier (création) | l'élève crée le lien sous la clé du parent | Function `approveParentLink` écrivant `parentLinks/{parent}_{student}` |
| 20207 / 20217 | approveParentLink / rejectParentLink | parentlinkrequest | status | l'élève réécrit la demande créée par le parent | Function transactionnelle (student == uid, status pending) |
| 33226 | openPencRoom | penc | participants[], everJoined[] | tout participant réécrit le doc de l'hôte | sous-collection `pencs/{id}/participants/{uid}` + `arrayUnion` |
| 33308 | sendPencChatMessage | penc | chatMessages[] | tout participant ajoute un message dans le doc de l'hôte | sous-collection `pencs/{id}/messages` |
| 33387 | leavePencRoom | penc | participants[] | tout participant retire son nom du doc de l'hôte | suppression de son doc dans la sous-collection participants |
| 33426 | forceClosePencAdmin | penc | active | admin réécrit le doc de l'hôte | Function admin |
| 33461 | resolvePencReport | pencreport | status | admin réécrit le signalement d'un utilisateur | Function admin (claim) |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 7866 | finishOnboarding (à vérifier) | loyaltypoints | Parrainage : le parrain reçoit `settings:referralRewardPoints` (défaut 10, 26716) à chaque inscription avec son code | Points = argent (5 FCFA/point) ; un client peut créditer n'importe quel compte |
| 26749-26754, 27230 | computeLoyaltyDiscount | loyaltypoints | Remise = points × 5 FCFA, pointsUsed = ceil(discount/5), appliquée au total de la commande | Calcul financier déterminant le total payé |
| 27270, 27275 | placeOrder (à vérifier) | loyaltypoints | Débit des points utilisés puis crédit de floor(total/100) points gagnés (lecture → réécriture, non atomique) | Solde manipulable ; double crédit si concurrence |
| 27227-27245 | placeOrder (à vérifier) | order | Total = prix (normal/flash/négocié/enchère) − promo − fidélité ; commission = total × `settings:commission_rate` ; netAmount = total − commission | Commission et reversement calculés par le client : falsifiables |
| 27198-27203 | placeOrder (à vérifier) | negotiation | Le prix négocié accepté remplace le prix catalogue si status === 'accepted' et montant identique | Prix de vente dérivé d'un doc modifiable par l'acheteur lui-même |
| 27212-27216 | placeOrder (à vérifier) | order | Enchère : prix = auctionCurrentBid si l'utilisateur est auctionHighestBidder et l'enchère est close | Vérification d'enchère côté client |
| 27221-27228 | placeOrder (à vérifier) | order | Code promo `promocode:<seller>__<code>` : remise % ou montant fixe, si active | Remise appliquée sans validation serveur |
| 14707-14718 | checkoutCart (à vérifier) | order | Remise sur lot par vendeur (bundleDiscountsBySeller) puis commission | Idem : calcul financier client |
| 27249-27262 | placeOrder (à vérifier) | order | Commission d'affiliation : brut = total × affiliateCommissionPercent, frais plateforme, net créateur → `affiliatesale:` | Commissions/reversements calculés et écrits par l'acheteur |
| 26798 | respondToNegotiation | negotiation | Acceptation d'offre : aucune vérification que l'acteur est bien le vendeur (seul `otherParty` est déduit) | L'acheteur peut auto-accepter sa propre offre (à vérifier : pas de garde sur currentUser) |
| 22362, 22954, 22968 | setOrderShipmentStage / sellerCancelOrder / cancelMyOrder | order | Transitions de statut : annulation impossible après expédition ; livraison déclenche enquête satisfaction | Machine à états commande ; la garde n'est qu'une condition JS |
| 22997, 23012-23016 | confirmOrderReceipt / checkVerifiedDeliveryBadge | order | Badge « livraison vérifiée » si ≥ 5 commandes et ≥ 80 % de réceptions confirmées | Réputation vendeur calculée et écrite par un client |
| 35455 | markOrderPaidOut | order | Reversement au vendeur marqué payé (payoutStatus, paidOutBy) | Opération financière ; doit être journalisée et réservée à un rôle vérifié |
| 31608 | markOrderFulfilled | order | Admin marque une commande traitée (entre dans le chiffre d'affaires commission 35033, 35148) | Statut alimentant le tableau de bord financier |
| 26479-26498 | requestYangoDelivery (à vérifier) | order | Appel API Yango avec clé `Bearer apiKey` depuis le navigateur | Secret API exposé côté client (C2) |
| 25140-25143, 25159 | countActiveLiveGuests / acceptLiveSpeakRequest | liveinvite | Limite d'invités simultanés (`maxGuests`, défaut 4) | Quota à faire respecter serveur (course entre modérateurs) |
| 25115-25119 | isLiveModerator | liveinvite / livespeakrequest | Rôle co-modérateur = présence dans `live.coModerators` | Rôle stocké dans un doc réécrit côté client |
| 24851 | kickUserFromLive | liveviewer | Sanction : bannissement du live (bannedUsers) + suppression du heartbeat | Sanction appliquée côté client |
| 20163-20167 | toggleRestrictedMode | parentlink | Le parent lié active `restrictedmode:<élève>` (Mode Familial) | Protection des mineurs : le lien et le mode doivent être validés serveur |
| 20207-20213 | approveParentLink | parentlinkrequest / parentlink | L'élève auto-approuve la demande et crée le lien | Ouvre l'accès à ses cours/notes/badges à un tiers (20224 et suite) |
| 33345-33348 | kickFromPenc | penc | Exclusion d'un participant (kicked[]) par l'hôte, vérifiée à chaque poll de 4 s (33275) | Sanction/rôle hôte non vérifiés serveur |
| 33375 | invitePencCoHost | penc | Attribution du rôle co-animateur | Rôle écrit côté client |
| 33426 | forceClosePencAdmin | penc | Clôture forcée si `currentAdminPasswordHash` présent (variable JS) | Vérification admin uniquement locale |
| 33461 | resolvePencReport | pencreport | Résolution d'un signalement, garde `currentAdminPasswordHash` (33453, 33456) | Modération : doit exiger un claim admin |
| 33137-33138 | createPenc | penc | Création bloquée si `settings:pencCreationAllowed === false` | Réglage plateforme lisible/écrivable côté client (33467) |
| 28392 | assignOnCallWeek | oncall | Assignation d'astreinte par `currentAdminName` | Rôle admin non vérifié serveur |
| 30876 | publishOfficialNews | officialnews | Publication au nom de « Suktum » par `currentAdminName` | Contenu officiel : usurpation possible sans claim admin |
| 7208 | logUserLoginEvent | loginevent | Journal des connexions alimentant le flux d'activité admin (28957) | Journal falsifiable/supprimable côté client |
| 11453-11457 | createNotification | notif | Respecte `notificationPreferences[category]` du destinataire avant création | Préférence évaluée par l'émetteur, pas par le destinataire |
| 13761, 24075 | notifyFollowersOfNewLive / notifyFollowersOfScheduledLive | livenotifypref | Le streamer notifie chaque abonné sauf opt-out `notifyAll === false` (lecture d'un doc privé d'autrui, shared=false) | Fan-out vers N abonnés depuis le navigateur ; à faire par Function |
