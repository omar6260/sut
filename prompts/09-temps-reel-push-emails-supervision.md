# Phase 09 — Temps réel, notifications push, e-mails et supervision

## 1. Temps réel (cahier 3.5)
- À partir de `docs/inventaire/temps-reel.md`, remplace chaque `setInterval` de sondage par un écouteur `onSnapshot` via `src/platform/realtime.js` : `subscribe(requête, callback) → unsubscribe`.
- **Désabonnement obligatoire** à la fermeture de l'écran (sinon fuite mémoire et lectures facturées en continu). Test qui vérifie le nombre d'écouteurs actifs après navigation.
- Priorités : messagerie, notifications, chat de cours, document collaboratif, chat du Penc, commentaires en direct.

## 2. Notifications push (cahier 3.6)
- Web : Firebase Cloud Messaging + service worker. Android : plugin push de Capacitor (branché en phase 12, prépare l'abstraction dès maintenant).
- Jetons par appareil dans `users/{uid}/devices/{deviceId}`, nettoyage des jetons invalides.
- Envoi uniquement côté serveur, déclenché par événements : message reçu, rappel de conférence, validation d'inscription, commande, paiement validé, live d'un compte suivi.
- Respect des préférences de notification et du mode Ne pas déranger du guide (sections 9.3 et 11).

## 3. E-mails transactionnels (cahier 3.13)
- Resend via fonction serveur, gabarits HTML en français : bienvenue, confirmation de commande, reçu de paiement, rappel de renouvellement, alertes critiques pour les administrateurs.
- Uniquement pour les utilisateurs ayant fourni un e-mail (Google) ; lien de désinscription pour les e-mails non essentiels.

## 4. Supervision (cahier 3.10 et 3.14)
- Sentry côté client et fonctions (sans données personnelles dans les événements).
- Résumé quotidien IA exécuté par une fonction planifiée à 7 h (heure de Dakar), plus par cache à l'ouverture.
- Webhooks d'incidents critiques (e-mail et, si demandé, Slack) : pic de signalements, reversement en attente > 14 jours, tentatives d'accès admin refusées.
- UptimeRobot : documente la configuration à faire par Oumar dans `docs/exploitation.md`.

## Définition de « terminé »
Plus aucun `setInterval` de sondage de données (grep dans le rapport) ; notification reçue sur un navigateur de test application fermée ; e-mail reçu en environnement de test ; erreur de test visible dans Sentry.
