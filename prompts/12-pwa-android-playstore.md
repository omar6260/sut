# Phase 12 — PWA, application Android et publication Google Play

## Objectif
Suktum installable en PWA et publié sur Google Play **via le compte développeur de Gorgui**.

## Tâches
1. **Build de production** : minification, empreinte de fichiers pour le cache, CSP stricte compatible Google Sign-In, Firebase et Cloudflare Stream ; identifiant de déploiement discret (cahier 7.3) ; en-têtes de sécurité dans `firebase.json`.
2. **PWA** : manifeste (nom, icônes, couleur), service worker, écran d'installation.
3. **Android avec Capacitor** : projet `android/`, plugins caméra, fichiers, notifications push, partage, liens profonds (`suktum.app/p/...`). Vérifie la compatibilité de la connexion Google et de Jitsi dans la WebView.
4. **Environnements** : `suktum-dev` et `suktum-prod`, variables séparées, script `deploy:prod` qui demande une confirmation explicite.
5. **Google Play** : prépare pour Gorgui un dossier `store/` avec fiche (titre, descriptions courte et longue en français), captures d'écran générées par Playwright, politique de confidentialité (URL), questionnaire de classification du contenu, section « sécurité des données », déclaration relative aux mineurs. Build `.aab` signé : la clé de signature est générée et conservée par Oumar et Gorgui, **jamais commitée**.
6. **Test fermé** sur Google Play avec les testeurs requis avant la production.
7. **Documentation** : `docs/exploitation.md` (déploiement, secrets, sauvegardes, restauration, supervision, coûts mensuels) et `docs/guide-admin.md`.

## Définition de « terminé »
Application installée depuis le test fermé Google Play sur un vrai téléphone Android d'entrée de gamme ; parcours principaux validés ; Lighthouse PWA ≥ 90 ; revue `auditeur-securite` finale sur toute la base de code : OK.
