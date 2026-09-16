# Temps réel simulé — les 20 `setInterval` du prototype

Source : `grep -n "setInterval(" legacy/suktum-app.html` (20 occurrences). Deux familles :
**sondage de données** (à remplacer par des écouteurs Firestore `onSnapshot` en phase 09) et
**minuteries d'interface** (compte à rebours, timers locaux : à conserver, elles ne lisent pas le stockage).

## A. Sondages de données → écouteurs temps réel

| Ligne | Période | Déclencheur | Ce qui est sondé | Remplacement proposé |
|---|---|---|---|---|
| 7275 | 60 s | `initIdentity` (permanent) | `checkAndSendLiveReminders` : lives programmés à rappeler | Fonction planifiée côté serveur (Cloud Scheduler) + notification push ; rien côté client |
| 7301 | 45 s | `initIdentity` (permanent) | `updatePresenceHeartbeat` : écrit `user.lastActiveAt` | Présence Firebase (Realtime Database `.info/connected`) ou écriture `lastActiveAt` throttlée ; ne plus réécrire le document `user:` entier |
| 8821 | 5 s | écran `live-activity-feed` | `renderLiveActivityFeed` : liste des lives actifs | `onSnapshot` sur la requête `lives where status == 'live'` |
| 13674 | 1 s | fil | `updateCountdowns` : comptes à rebours des lives programmés | Minuterie pure (pas de lecture stockage) — **conserver** mais calculer depuis les données déjà chargées |
| 17583 | 4 s | détail de cours (élève) | `refreshLiveDocView` : document collaboratif `livedoc:` | `onSnapshot` sur le document `livedoc` |
| 17585 | 4 s | détail de cours (élève) | `renderStudentCourseChat` : chat de cours `coursechat:` | `onSnapshot` sur la sous-collection de messages |
| 18232 | 4 s | gestion de cours (formateur) | `renderManageCourseChat` | idem 17585 |
| 18756 | 4 s | chat de groupe de cours | `renderCourseGroupChat` : `coursegroupchat:` | `onSnapshot` |
| 24382 | 30 s | fil | `updateFeedCountdowns` : comptes à rebours dans les cartes du fil | Minuterie pure — conserver |
| 24574 | (à lire) | vue d'un live | vérifie `live:<id>` existe encore, compteur de spectateurs, sondages du live | `onSnapshot` sur le document `live` (fin de live, sondages) ; compteur de spectateurs via `increment()` + présence |
| 24652 | 4 s | battle en live | `renderBattleScore` : `battle:` | `onSnapshot` sur le document `battle` |
| 30217 | 30 s | session admin | `verifyCurrentAdminSessionStillValid` : relit les listes de rôles pour révoquer une session | Custom claims + `onIdTokenChanged` ; révocation par `revokeRefreshTokens` côté serveur |
| 33235 | 4 s | salon Penc | `renderPencRoomParticipants` : `penc:` participants | `onSnapshot` sur le document `penc` ou sa sous-collection `participants` |
| 33555 | (à lire) | salle d'attente de réunion d'équipe | `settings:teammeetingstate.active` | `onSnapshot` sur le document de réglage |

## B. Minuteries d'interface (pas de stockage sondé) — à conserver telles quelles

| Ligne | Période | Rôle |
|---|---|---|
| 7274 | 5 min | `applyAutoDarkModeIfEnabled` : bascule thème sombre selon l'heure (lit une préférence privée, pas un sondage réseau) |
| 7278 | 60 s | `trackScreenTimeTick` : temps d'écran du jour (`screentimetoday:` privé) — conserver, écriture locale |
| 9772 | 1 s | compte à rebours du retardateur caméra |
| 12525 | 1 s | compte à rebours de lecture automatique (5 s) |
| 25343 | 1 s | minuterie d'une vente flash en live (affichage) |
| 34694 | 1 s | minuterie de publicité récompensée — **attention** : à l'échéance, crédite `coinbalance:` côté client (l. 34698-34699, `shared=false`). Voir `logique-sensible.md` |

## Points d'attention
- Les sondages 17583/17585/18232/18756/33235 relisent des documents entiers toutes les 4 s : sur Firestore, c'est 15 lectures/minute/écran ouvert **par utilisateur**, soit ~900 lectures/heure/utilisateur — inacceptable en coût (phase 08/09).
- `go()` (l. 8647-8665) coupe la plupart des intervalles au changement d'écran ; `7274`, `7275`, `7278`, `7301` restent permanents.
- `24574` mélange trois responsabilités (fin de live, spectateurs, sondages) : à séparer lors de la migration.
