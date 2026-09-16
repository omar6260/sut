# Phase 11 — Modération automatisée, sécurité avancée et fonctionnalités restantes

Cette phase regroupe plusieurs chantiers indépendants. **Traite-les un par un, chacun dans sa propre branche et sa propre session**, dans l'ordre ci-dessous. Pour chacun : plan de l'`architecte` validé par Oumar → implémentation → tests → revue.

## A. Modération (cahier 3.7)
Images : Vision SafeSearch à l'upload. Vidéos : Video Intelligence (contenu explicite) au webhook de fin de traitement. Texte : Gemini avec seuils stricts, file de relecture avant publication si score élevé. Mode Familial : filtrage renforcé côté serveur. Tout est asynchrone et n'empêche pas l'upload ; le contenu reste « en vérification » jusqu'au verdict.

## B. Sécurité avancée
RBAC granulaire (rôles personnalisés avec permissions vérifiées serveur), 2FA sur actions critiques, validation quatre yeux, bannissement par empreinte d'appareil et IP (côté serveur, avec ses limites documentées), journal d'audit en stockage à écriture unique (export planifié vers un bucket avec rétention verrouillée), politique d'archivage configurable, filtrage des journaux par IP.

## C. Recherche et Éducation
Base vectorielle (extension vectorielle de Firestore ou alternative justifiée), indexation du contenu des PDF (Document AI) et transcription des vidéos de cours (Speech-to-Text), visualiseur de leçon avec lien direct vers le passage ou l'horodatage.

## D. Vidéo et lives
Infrastructure de lives maîtrisée (Jitsi auto-hébergé ou service géré : l'`architecte` compare coût et qualité pour le Sénégal), sous-titrage des lives, mode Picture-in-Picture pour les Duos, Beat Sync (Web Audio API), effets de réalité augmentée (MediaPipe Face Mesh + WebGL), Content ID via un service tiers (ACRCloud ou équivalent — licence à la charge de Gorgui).

## E. Traduction complète de l'interface
Extraction automatisée de toutes les chaînes françaises vers les dictionnaires `fr`, `en`, `wo` via `t(clé)` et `data-i18n`, par domaine (un commit par domaine). Traductions wolof : générées puis **marquées « à relire »** pour validation par un locuteur.

## F. Mode hors-ligne
Service worker : cache de l'interface et des derniers contenus consultés, file d'envoi pour messages et publications rédigés hors connexion.

## Règle commune
Si un chantier dépasse 5 jours de travail estimés par l'`architecte`, le signaler à Oumar avant de commencer : le planning contractuel est de 5 semaines pour l'ensemble de cette phase.
