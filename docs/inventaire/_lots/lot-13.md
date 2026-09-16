### PREFIXES
| préfixe | structure | shared | get | set | list | delete | qui écrit | écriture croisée | taille | médias base64 | lignes clés |
|---|---|---|---|---|---|---|---|---|---|---|---|
| adcoinwatches | nombre (pubs récompensées vues aujourd'hui) — clé `adcoinwatches:<user>__<date>` | false | - | - | - | - | propriétaire (startRewardedAd) | non | petit | non | 34674, 34700 |
| anniversarysent | drapeau anti-doublon — clé `<user>__<année>` | true | - | - | - | - | tout client (rappel exécuté par le navigateur) | non | petit | non | 19416 |
| coursesurvey | {courseId, studentUsername, stars, comment, createdAt} — clé `<courseId>__<student>` | true | - | - | - | - | élève (création) ; lu par formateur/admin | non | petit | non | 14406, 14412, 20654 |
| dailycontent | cache « contenu du jour » par pays — clé `<pays>__<date>` | true | - | - | - | - | premier client du jour (écriture système côté client) | oui (drapeau/cache global écrit par n'importe quel client) | petit | non | 15902 |
| healthcheck | {ping} — clé `healthcheck:<ts>` ; appels directs `window.storage.set/get/delete` | true | - | - | - | - | admin (outil de diagnostic) | non | petit | non | 7071, 7075, 7081, 37186 |
| latereminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 20419 |
| monthlysellerreport | rapport mensuel vendeur (cache) — clé `<user>__<mois>` | true | - | - | - | - | propriétaire (vendeur) | non | petit | non | 19389 |
| receiptreminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19512 |
| renewalreminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19556, 19569 |
| schedulereminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19592 |
| sellerinactivereminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19374 |
| servicereminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19433 |
| serviceslotsreminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 27554 |
| shippingreminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19527 |
| trialexpiryreminder | drapeau anti-doublon | true | - | - | - | - | tout client | non | petit | non | 19483 |
| weathercheck | cache météo vendeur — clé `<user>__<date>` | true | - | - | - | - | propriétaire (vendeur) | non | petit | non | 21433 |

### CLASSIFICATION
| préfixe | classe | justification (une ligne, avec au moins un numéro de ligne) |
|---|---|---|
| adcoinwatches | SERVEUR_SEUL | Plafond quotidien de pièces gagnées par publicité (l. 34674-34700) : compteur financier écrit en privé par le client, donc contournable. |
| anniversarysent | SERVEUR_SEUL | Rappel « système » exécuté par le navigateur (l. 19416) → fonction planifiée. |
| coursesurvey | PARTICIPANTS | Enquête d'un élève sur un cours (l. 14406), lue par le formateur du cours et l'admin (l. 20654). |
| dailycontent | SERVEUR_SEUL | Cache global écrit par le premier client (l. 15902) → cron serveur. |
| healthcheck | ADMIN | Outil de diagnostic du back-office (l. 7071-7081) ; collection technique avec TTL. |
| latereminder | SERVEUR_SEUL | Idem anniversarysent (l. 20419). |
| monthlysellerreport | PRIVE | Cache personnel du vendeur (l. 19389). |
| receiptreminder | SERVEUR_SEUL | Idem (l. 19512). |
| renewalreminder | SERVEUR_SEUL | Idem (l. 19556). |
| schedulereminder | SERVEUR_SEUL | Idem (l. 19592). |
| sellerinactivereminder | SERVEUR_SEUL | Idem (l. 19374). |
| servicereminder | SERVEUR_SEUL | Idem (l. 19433). |
| serviceslotsreminder | SERVEUR_SEUL | Idem (l. 27554). |
| shippingreminder | SERVEUR_SEUL | Idem (l. 19527). |
| trialexpiryreminder | SERVEUR_SEUL | Idem (l. 19483). |
| weathercheck | PRIVE | Cache personnel du vendeur (l. 21433). |

### ECRITURES_CROISEES
| ligne | fonction | préfixe | champ modifié | qui modifie quoi | solution proposée (sous-collection / increment() / transaction serveur) |
|---|---|---|---|---|---|
| 15902 | (contenu du jour) | dailycontent | cache global | premier client du jour écrit pour tous | Function planifiée |

### LOGIQUE_SENSIBLE
| ligne | fonction | préfixe | règle métier résumée | pourquoi côté serveur |
|---|---|---|---|---|
| 34674-34700 | startRewardedAd | adcoinwatches | limite `settings:adcoindailylimit` de pubs récompensées par jour | plafond de pièces contournable (privé, client) |
