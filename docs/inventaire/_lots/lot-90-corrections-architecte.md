### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
| lesson | PARTICIPANTS | [architecte §1a] Contenu de cours chargé par `openCourseDetail` (l. 17411-17440) derrière abonnement + inscription approuvée (l. 17412, 17418) : règle unique « staff du cours ou inscrit » (+ `freePreview`) ; pièces jointes → Storage ; `aiFlagged` par Function. |
| coursevideo | PARTICIPANTS | [architecte §1a] Même garde que `lesson` (l. 17411-17440) ; contenu payant, pas PUBLIC ; vidéo → Storage/Stream, `mediaFlagged` par Function. |
| coursepodcast | PARTICIPANTS | [architecte §1a] Même garde (l. 17411-17440) ; audio → Storage. |
| exercise | PARTICIPANTS | [architecte §1a] Même garde ; `correction` (l. 17763) isolée dans un sous-document serveur `answers`. |
| quiz | PARTICIPANTS | [architecte §1a] Même garde ; `correctIndex` (l. 18574) isolé dans `answers` côté serveur, correction par Function. |
| fullexam | PARTICIPANTS | [architecte §1a] Même garde ; `questions[].correctIndex` (l. 18378) isolé dans `answers` côté serveur. |
| coursefaq | PARTICIPANTS | [architecte §1a] Même garde (l. 17411-17440) ; écriture staff du cours (l. 18647). |
| contest | PARTICIPANTS | [architecte §1a] Même garde ; écriture staff (l. 19968). |
| pronunciationchallenge | PARTICIPANTS | [architecte §1a] Même garde ; écriture staff (l. 36471). |
| contestentry | SERVEUR_SEUL | [architecte §1b] `score` posé par le formateur (l. 20018) alimente classements : écriture par Function `gradeContestEntry`, lecture élève + staff. |
| examresult | SERVEUR_SEUL | [architecte §1b] Note /20 (l. 20108) alimentant moyennes, classements (l. 18080, 19314) et attestation (l. 20689-20697) : Function. |
| liveauthrequest | SERVEUR_SEUL | [architecte §1c] Le demandeur relit sa demande (l. 8444) : lecture `username == uid` ou claim admin, transitions par Function (ADMIN masquerait l'écran utilisateur). |
| accountdeletionrequest | SERVEUR_SEUL | [architecte §1c] Relue par le demandeur (l. 23169) ; création et transitions par Function. |
| banappeal | SERVEUR_SEUL | [architecte §1c] Relue par le compte banni avant connexion (l. 7400) ; création par Function liée à l'appareil. |
| suspensionappeal | SERVEUR_SEUL | [architecte §1c] Relue par l'utilisateur (l. 7425) ; idem. |
| sanctionappeal | SERVEUR_SEUL | [architecte §1c] Écran `my-sanctions` (l. 28253) relu par l'utilisateur ; idem. |
| devtask | SERVEUR_SEUL | [architecte §1c] `fetchMyBugReports` (l. 27986) : l'utilisateur relit ses signalements ; kanban admin par claim ; capture → Storage. |
| ebook | SERVEUR_SEUL | [architecte §1d] Listé/lu par tout utilisateur (l. 36739, 36788) : lecture publique, écriture Function propriétaire ; PDF → Storage. |
| officialnews | SERVEUR_SEUL | [architecte §1d] Lu par tous (l. 31020) : lecture publique, écriture Function admin. |
| penc | PUBLIC_PROPRIETAIRE | [architecte §1e] Salons listés publiquement (l. 33180, 33409, 33706), n'importe qui rejoint (l. 33226) : hôte propriétaire + sous-collections `participants/{uid}`, `messages/{id}` ; kick/clôture par Function. |
| livechatmsg | PUBLIC_PROPRIETAIRE | [architecte §1f] Chat lu par tout spectateur (l. 24727) : auteur = spectateur, lecture par tous ; suppression par Function `moderateLive`. |
| liveviewer | PUBLIC_PROPRIETAIRE | [architecte §1f] Compteur lu par tous (l. 25196) ; heartbeat écrit par le spectateur ; kick/purge par Function. |
| liveinvite | PUBLIC_PROPRIETAIRE | [architecte §1f] Roster d'invités visible par tous (l. 24712) ; création/suppression par streamer via Function. |
| livespeakrequest | PUBLIC_PROPRIETAIRE | [architecte §1f] Même motif (l. 25079) ; traitement par modérateurs via Function. |
| battle | SERVEUR_SEUL | [architecte §1g] Vainqueur = somme des `gift:` calculée côté client (l. 24685-24690) : transitions accept/decline/end par Function. |
| livehistory | SERVEUR_SEUL | [architecte §1h] Écrit par `confirmEndMyLive` avec `viewerCount` dérivé (l. 24318) : produit par la Function `endLive`, lecture publique. |
| trainerrating | SERVEUR_SEUL | [architecte §1i] Éligibilité vérifiée client (l. 18308-18320) : création par Function vérifiant l'inscription ; lecture publique. |
| seriesrating | SERVEUR_SEUL | [architecte §1i] Éligibilité vérifiée client (l. 21596) : création par Function vérifiant achat/visionnage. |
| storywatchtime | PARTICIPANTS | [architecte §1j] Le spectateur écrit, seul l'auteur lit (l. 12106, 12114) : viewer + owner nommés dans le doc. |
| videocompletion | PARTICIPANTS | [architecte §1j] Idem (l. 12644, 12655) ; agrégat par Function (liste globale l. 12655). |

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
