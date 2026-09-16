# Phase 07 — Médias et vidéo (cahier 3.2)

## Objectif
Plus aucun média en base64 dans Firestore. Vidéos longues (1 à 3 minutes et plus) lues en streaming, rapidement, sur un réseau mobile sénégalais.

## Architecture imposée
- Photos, notes vocales, PDF, pièces jointes : **Firebase Storage**, upload direct depuis le client, chemins par propriétaire (`media/{uid}/...`), règles Storage (type MIME, taille).
- Vidéos du fil, des cours et des stories : **Cloudflare Stream** — upload direct par URL à usage unique (Direct Creator Upload) générée par une fonction ; transcodage, HLS et CDN inclus ; miniature automatique ; webhook de fin de traitement.
- Firestore ne conserve que les références : `{ kind, storagePath | streamUid, thumbnailUrl, duration, status }`.

Vérifie la documentation officielle de Cloudflare Stream et de Firebase Storage avant d'implémenter, et cite les URL dans `decisions.md`.

## Tâches
1. `cartographe` : tous les sites qui produisent ou lisent des data URL (`readFileAsDataURL`, `draft.dataUrl`, `stitchOriginalPost`, notes vocales, PDF, avatars, bannières, produits, filtres FFmpeg, filigrane).
2. `src/platform/media.js` : `uploadImage`, `uploadVideo`, `uploadAudio`, `uploadDocument`, avec progression et reprise ; compression des photos côté client (≤ 1 600 px, WebP) avant envoi.
3. Lecteur vidéo : `hls.js` pour Android et desktop, HLS natif sur iOS ; le mode économie de données charge la vidéo au moment de la lecture (guide 2.3) ; chapitres et vitesse de lecture conservés.
4. Filtres et filigrane : applique la décision prise en phase 03 (test C6). Si FFmpeg côté client reste, épingle la version et héberge-la toi-même (plus d'unpkg).
5. Détection de republication par empreinte : calcul serveur au webhook de fin d'upload.
6. Relève les limites de taille selon le cahier : vidéos du fil jusqu'à 3 minutes, limites par type imposées **côté serveur** (règles Storage et fonction de création d'URL).
7. Script de migration pour les éventuelles données existantes (décision D2).

## Tests
Upload photo, vidéo 2 minutes, note vocale, PDF ; lecture sur profil mobile avec réseau 3G simulé (Playwright) ; refus d'un fichier trop gros ou d'un type interdit.

## Définition de « terminé »
Aucune chaîne `data:` persistée (test qui scanne l'émulateur) ; revue sécurité OK ; coût estimé Cloudflare et Storage pour 1 000 et 10 000 utilisateurs dans `decisions.md`.
