### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ebook | {id, title, description, price, data (PDF dataUrl ≤ 5 Mo), createdAt} | true | 2 | 1 | 1 | 1 | propriétaire de la plateforme (garde client `isGenuineOwnerSession`) | non | gros | oui (PDF base64, MAX_EBOOK_SIZE = 5 Mo l.36324) | 36739, 36772, 36788, 36800 |
| ebookpurchase | {ebookId, username, price, purchasedAt} — clé `ebookId__username` | true | 1 | 1 | 0 | 0 | l'acheteur lui-même (currentUser) | non | petit | non | 36747, 36781, 36783 |
| editorialentry | {id, title, date, notes, addedBy, createdAt} — clé `owner__entryId` | true | 0 | 1 | 1 | 1 | propriétaire du calendrier OU membre de son `editorialteam` | oui (un membre crée/supprime des entrées dans l'espace du propriétaire ; création/suppression, pas lecture→modif→réécriture) | petit | non | 33076, 33088, 33108 |
| editorialteam | tableau de usernames `[u1, u2, …]` — clé = owner | true | 5 | 2 | 0 | 0 | propriétaire du calendrier (currentUser) | non | petit | non | 33043, 33055, 33064, 33127 |
| edupurchase | {username, price, country, purchasedAt} — clé `username__ts` | true | 0 | 1 | 2 | 0 | admin (approveEduSubRequest) ou l'utilisateur lui-même via auto-approbation (l.17011) | non | petit | non | 17034, 35041, 35158 |
| edustreak | {count, lastDate} — clé = username | true | 2 | 1 | 0 | 0 | propriétaire (lecture→modif→réécriture de son propre doc) | non | petit | non | 19345, 19356, 19361 |
| edusubpayment | {id, username, country, amount, createdAt} | true | 0 | 1 | 1 | 0 | admin (approveEduSubRequest) ou utilisateur via auto-approbation | non | petit | non | 17036, 30120 |
| edusubrequest | {id, username, country, price, status(pending/approved), createdAt} | true | 1 | 2 | 1 | 1 | création : utilisateur ; passage à approved (RMW) : admin ou l'utilisateur lui-même si `settings:autoApproveEduSub` ; suppression : admin | oui (admin RMW `status` sur le doc de l'utilisateur, l.17030→17038) | petit | non | 17007, 17023, 17033, 17046 |
| edusubscription | {username, price, country, startedAt, expiresAt, cancelled} — clé = username | true | 11 | 3 | 1 | 0 | admin (création à l'approbation) ; propriétaire (RMW `cancelled` l.16737/16746) ; utilisateur lui-même en auto-approbation (l.17011→17033) | oui (admin écrit/écrase le doc de l'abonné, l.17033) | petit | non | 16737, 16781, 17033, 30112 |
| enrollment | {courseId, studentUsername, trainerUsername, price, country, status(pending/approved), completedLessons[], markedCompleted (+ flags stateFunded/trialEnrollment/reEnrollment/stateFundedImport)} — clé `courseId__student` | true | 8 | 5 | 29 | 2 | élève (création, RMW completedLessons/markedCompleted) ; admin (RMW status l.15453, delete l.15466/20854, création pour autrui via import CSV l.16838) ; formateur : lecture seule | oui (admin RMW `status` sur doc de l'élève ; admin crée doc d'un autre utilisateur) | petit | non | 15453, 16838, 17193, 17592, 17656 |
| episodereleasenotified | valeur brute `true` — clé `seriesId__index` | true | 1 | 1 | 0 | 1 | n'importe quel utilisateur connecté à l'ouverture du feed (checkNewlyReleasedEpisodes, appelé l.8675) ; admin supprime | oui (drapeau global écrit par le premier visiteur venu, création non RMW ; course entre visiteurs simultanés) | petit | non | 8675, 34342, 34516, 34518 |
| episodeunlock | {unlockedAt, coinPrice} — clé `seriesId__index__username` | false | 1 | 1 | 0 | 0 | propriétaire, après débit client de `coinbalance:` | non | petit | non | 34494, 34662, 34664 |
| examresult | {courseId, studentUsername, examTitle, score(0-20), comment, createdAt} — clé `courseId__student__ts` | true | 0 | 1 | 4 | 0 | formateur du cours (currentManagedCourseId, côté client) pour un élève | non (création de doc par le formateur, jamais RMW ; doc « appartient » à l'élève mais est émis par le formateur) | petit | non | 18080, 20087, 20108, 20121 |
| exceptionregistry | {id, actorName, actorRole, utcTimestamp, exceptionType, targetId, justification, status(pending/validated/flagged)} | true | 0 | 1 | 2 | 0 | admin/DG/modérateur (création) ; DG (RMW status l.37141-37144 via clé générique) | non | petit | non | 37088, 37117, 37144, 37150 |
| exercise | {id, courseId, title, question, correction, deadline, createdAt, validatedForSearch} — clé `courseId__ts` | true | 0 | 1 | 3 | 0 | formateur du cours (création l.17763, RMW validatedForSearch l.17802-17806) ; admin RMW validatedForSearch l.32612 | non (formateur propriétaire du cours ; admin modifie un champ — à vérifier) | petit | non | 17749, 17763, 17806, 32596 |
| failedaccessattempt | {createdAt} — clé `failedaccess_ts` | true | 0 | 1 | 1 | 0 | n'importe quel client anonyme sur mot de passe admin erroné (logFailedAdminAccessAttempt) | non | petit | non | 29975, 29979, 29980, 29988 |
| favoriteassignments | map `{postId: folderName}` — clé = username | true | 3 | 2 | 0 | 0 | propriétaire (RMW de son propre doc) | non | petit | non | 13888, 13925, 13943, 13952 |
| favoritefolders | tableau de noms de dossiers `[…]` — clé = username | true | 2 | 2 | 0 | 0 | propriétaire | non | petit | non | 13887, 13905, 13914, 13922 |
| featurevote | {id, title, desc, authorUsername, votes[] (usernames), createdAt} | true | 1 | 2 | 1 | 0 | auteur (création) ; n'importe quel utilisateur (RMW du tableau `votes`) | oui (tout votant réécrit le doc de l'auteur, l.14558→14564) | petit | non | 14421, 14432, 14558, 14564 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
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

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 14558-14564 | voteForFeature | featurevote | votes[] | tout utilisateur réécrit le doc de l'auteur (lecture→push/splice→réécriture, dernier écrit gagnant) | sous-collection `featurevotes/{id}/votes/{uid}` + `voteCount` via increment() |
| 33076 / 33088 | addEditorialEntry / removeEditorialEntry | editorialentry | doc entier (création/suppression) | membre d'équipe crée ou supprime des entrées sous le calendrier du propriétaire | sous-collection `editorialcalendars/{owner}/entries` avec règle « uid ∈ team » |
| 15453-15457 | approveEnrollment | enrollment | status | admin (client) lit puis réécrit le doc d'inscription de l'élève | transaction serveur (Function `approveEnrollment`) |
| 16836-16841 | importInstitutionalCsv (à vérifier nom exact) | enrollment | doc entier + user.stateFunded | admin crée une inscription `approved` au nom d'un autre utilisateur | Function d'import côté serveur |
| 20854 | approveStudentRemoval | enrollment | suppression | admin supprime l'inscription d'un élève à la demande du formateur | Function serveur |
| 17030-17038 | approveEduSubRequest | edusubrequest / edusubscription | status ; doc abonnement entier | admin (ou le demandeur lui-même si auto-approbation l.17011) réécrit la demande et crée l'abonnement d'autrui | transaction serveur unique (demande → abonnement → paiement → achat) |
| 34516-34518 | checkNewlyReleasedEpisodes | episodereleasenotified | drapeau global | n'importe quel visiteur du feed écrit un drapeau partagé (course entre clients) | Function planifiée (cron) côté serveur |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 36783 | unlockEbook | ebookpurchase | « Achat enregistré » écrit par l'acheteur avec `price` copié du guide, sans paiement | n'importe qui se débloque gratuitement un guide payant |
| 36762 / 36797 | addEbook / deleteEbook | ebook | garde `isGenuineOwnerSession` (variable JS l.28917) pour publier/supprimer | rôle propriétaire vérifiable seulement par claim ; PDF base64 > 1 Mio impossible en Firestore |
| 17004-17012 | subscribeToEducationSpace | edusubrequest | si `settings:autoApproveEduSub` = true (l.32203), le client du demandeur exécute lui-même approveEduSubRequest | auto-acceptation d'un abonnement payant exécutée par le bénéficiaire |
| 17030-17036 | approveEduSubRequest | edusubscription / edupurchase / edusubpayment | calcule `expiresAt = now + 30 j` (EDU_SUB_DURATION_DAYS l.16666), crée abonnement + achat + paiement | date d'expiration et revenus fixés par le navigateur ; 4 écritures non atomiques |
| 16733-16746 | cancelEduSubscription / reactivateEduSubscription | edusubscription | bascule `cancelled` ; « renouvellement » n'existe pas dans le code (à vérifier) | logique d'abonnement récurrent à porter côté serveur |
| 16776-16783 | isEducationSubActive | edusubscription | accès Éducation = adminEducationBypass ‖ user.stateFunded ‖ essai 7 j (TRIAL_DURATION_MS l.16709) ‖ abonnement non expiré | contrôle d'accès payant entièrement client |
| 17619 / 17629 / 17645 | enrollInCourse | enrollment | crée directement une inscription `approved` si stateFunded, essai actif, ou réinscription après départ payé (courseleave) | l'élève s'auto-accepte dans un cours payant ; flags falsifiables |
| 17656-17662 | enrollInCourse | enrollment | inscription `pending` puis approveEnrollment côté client si `settings:autoApproveEnrollment` (l.32223) | auto-acceptation d'un achat exécutée par l'acheteur |
| 15453-15461 | approveEnrollment | enrollment | passage à `approved`, abonnement automatique au formateur, log admin avec `price` | rôle admin non vérifié serveur ; revenu cours = somme des `price` des approved (l.30119) |
| 16834-16841 | import CSV institutionnel | enrollment / user | met `stateFunded = true` et inscrit d'office des comptes tiers | attribution d'un statut financé par l'État (gratuité totale) |
| 35041-35043 / 35158 | tableau financier plateforme | edupurchase | somme `price` ; filtre sur `p.createdAt` alors que le doc n'a que `purchasedAt` (l.17034) — bug probable (à vérifier isWithinFinancePeriod(undefined)) | calculs de revenus doivent être agrégés serveur |
| 30120-30122 | loadEducationOverview | edusubpayment | somme `amount` en « Revenu abonnements », visible seulement si `adminScope === 'all' && !isModerator` (client) | rôle et agrégat financier côté client |
| 34661-34664 | unlockEpisodeWithCoins | episodeunlock | vérifie solde, écrit `coinbalance - coinPrice` puis crée le déverrouillage (shared=false) | pièces : n'importe qui peut sauter le débit ; besoin d'une transaction |
| 34493-34495 | isEpisodeUnlocked | episodeunlock | accès épisode = releaseAt passé ‖ série achetée ‖ index < gratuits ‖ doc unlock présent | gate de contenu payant |
| 20108 | recordExamResult | examresult | note 0-20 saisie par « le formateur » identifié par `currentManagedCourseId` (client) | notes alimentent moyennes/classements (l.18080, 19314) et certificats (à vérifier) |
| 37085-37096 | logPrivilegeException | exceptionregistry | rôle déduit de variables JS (isPayoutSpecialist, isModerator, isGenuineOwnerSession, adminScope) ; justification ≥ 30 car. | journal d'audit de passe-droits (2FA, débannissement) doit être inviolable |
| 37141-37144 | resolveExceptionEntry | exceptionregistry | DG valide/signale une exception | rôle DG côté client |
| 29977-29990 | logFailedAdminAccessAttempt | failedaccessattempt | ≥ 5 échecs/h → écrit `settings:criticalAlertUnauthorizedAccess` | anti-brute-force PIN admin contournable par un client qui n'appelle pas la fonction |
| 17763 | addExerciseToCourse | exercise | stocke `correction` (corrigé) dans le même doc que la consigne, lu par les élèves inscrits | fuite du corrigé si affiché ; à séparer (à vérifier rendu côté élève) |
| 17802-17806 / 32612 | toggleExerciseSearchValidation / validation admin | exercise | `validatedForSearch` pilote l'indexation IA (contentembedding l.17766) | décision de modération/rôle formateur-admin |
| 33049-33058 | addEditorialTeamMember | editorialteam | vérifie existence du compte via `user:` puis ajoute ; notification `editorial_team_invite` sans acceptation | invitation auto-acceptée par le propriétaire pour autrui (accès en écriture accordé sans consentement) |
| 34509-34523 | checkNewlyReleasedEpisodes | episodereleasenotified | à chaque ouverture du feed, tout client parcourt toutes les séries et envoie les notifications aux abonnés | sondage client global (coût lectures) + doublons de notifications entre clients |
