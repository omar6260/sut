# Tests de caractérisation du prototype

Ces tests figent **ce que fait le prototype aujourd'hui** (`legacy/suktum-app.html`), imperfections comprises.
Ils ne corrigent rien : un comportement douteux est noté dans `docs/journal/a-traiter.md`, pas modifié.

## Lancer

```bash
npm run test:e2e                         # tout, mobile (Pixel 7) + desktop, ~1 min
npx playwright test publication          # un seul parcours
npx playwright test --project=mobile     # un seul profil
npx playwright test --ui                 # mode interactif
npx playwright show-trace test-results/<dossier>/trace.zip   # rejouer un échec
```

`npm run build` puis `npm run serve` sont lancés automatiquement (Playwright `webServer`) : les tests chargent
`dist/index.html`, qui est une copie octet pour octet du prototype tant que `src/legacy/` est vide.

## Comment le prototype tourne hors de Claude

Le prototype attend `window.storage` (fourni par l'environnement Claude) et appelle des API tierces. `tests/support/` fournit :

| Fichier | Rôle |
|---|---|
| `memory-storage.js` | `window.storage` en mémoire, avec les formes de retour exactes du legacy (`{key, value, shared}`, `{keys, prefix, shared}`, `null`). Un espace **partagé** commun à tous les appareils d'un test ; un espace **privé** par appareil. Branché via `page.exposeBinding` + `addInitScript`, donc présent avant le premier script de la page. |
| `network-mocks.js` | Scripts tiers (Jitsi, FFmpeg.wasm, Google Identity, polices) remplacés par des stubs ; API IA (Anthropic, Gemini, Vision, Video Intelligence), Nominatim, OpenWeather, Yango simulées ; **tout autre appel externe est coupé** et signalé dans la sortie. |
| `fixtures.js` | Fixture `suktum` : `openDevice(id)` (un contexte navigateur = un téléphone), `signUp(page, nom)`, `reload(page)`, `dismissTour(page)`, `lastToast(page)`, `errors` (tous les `pageerror`), `storage` (lecture/écriture directe pour préparer ou vérifier un état). |
| `fixtures-media.js` | Un PNG 2×2 valide pour les envois de fichiers. |

Chaque test part d'un stockage vide. Les tests sont indépendants et parallélisables.

## Ce que chaque parcours garantit

| Fichier | Garantie |
|---|---|
| `console.spec` | Le prototype se charge sans aucune erreur JavaScript et affiche l'écran d'accueil ; le stockage simulé respecte l'interface attendue. |
| `inscription.spec` | Création de compte (langue, pays, majorité) → fil ; la session survit au rechargement ; nom vide refusé ; deux appareils ont des sessions privées isolées. |
| `publication.spec` | A publie une photo avec légende et `#hashtag` ; B la voit dans « Récent » ; B aime (compteur, `likes[]`) et commente ; A reçoit les deux notifications. Publier sans fichier est refusé. |
| `messagerie.spec` | A trouve B par la recherche, ouvre son profil, lui écrit ; B voit la conversation et le message, répond ; notification chez B. Liste vide sans conversation. |
| `boutique.spec` | A publie un produit (nom, prix, catégorie, stock) ; B le voit, commande 2 unités (nom, téléphone, adresse) ; commande `pending`, stock décrémenté, commission + net = total ; visible dans « Mes commandes » (B) et le tableau de bord vendeur « En attente » (A). Produit sans prix refusé. |
| `education.spec` | L'entrée dans l'Espace Éducation démarre l'essai gratuit de 7 jours ; le formateur crée un cours (`pending_review`) puis une leçon ; l'élève trouve le cours, s'inscrit gratuitement pendant l'essai (`enrollment` approuvée, `trialEnrollment`), voit la leçon. |
| `backoffice.spec` | 5 taps sur l'avatar ouvrent la connexion admin (4 ne font rien) ; première visite = création d'un mot de passe blindé (faible refusé) ; connexion avec le bon mot de passe, refus du mauvais ; vue d'ensemble avec compteurs cohérents. |

## Écarts assumés (à connaître avant de modifier un test)

- **Langue** : `signUp` choisit explicitement « Français ». Sans ce choix, le pays Sénégal bascule l'interface en wolof (comportement du prototype, à confirmer avec Gorgui).
- **Superpositions sur Pixel 7** : deux boutons sont recouverts par des éléments fixes (lien « CRÉER » de l'écran caméra, bouton « aimer » du fil). Les tests passent par la vignette galerie et déclenchent le clic sur le bouton (`dispatchEvent('click')`). Défauts notés dans `a-traiter.md`.
- **État préparé hors interface** (`education.spec`) : le statut formateur (`user.isTrainer`) et l'activation du cours (`course.status = 'active'`) sont des actions d'administration écrites directement dans le stockage ; `backoffice.spec` couvre la connexion admin, pas ces écrans.
- **Réponses IA** : les API renvoient un texte fixe non JSON ; le prototype retombe alors sur son comportement « non signalé » (leçon acceptée, média non bloqué). C'est le chemin nominal sans clé configurée.
- **Sécurité caractérisée, pas cautionnée** : `backoffice.spec` vérifie que le hash SHA-256 du mot de passe admin est écrit dans `settings:adminpin_hash` (lisible par tout client). Ce test **doit changer** en phase 06 quand l'authentification passera côté serveur.
