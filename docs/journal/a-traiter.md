# À traiter — problèmes repérés hors du périmètre de la phase en cours

Règle : on note ici, on ne corrige pas. Une ligne par point, la phase qui devrait s'en charger, et où on l'a vu.

| Date | Repéré en | Problème | Où | Phase proposée |
|---|---|---|---|---|
| 2026-09-16 | Phase 00 | `docs/source/` est vide : le cahier des charges et le guide d'utilisation (.docx) n'ont pas encore été déposés. Les sources de vérité n° 1 et 2 manquent aux agents. | `docs/source/README.md` | Avant phase 01 (Oumar) |
| 2026-09-16 | Phase 00 | `npm run emulators` et `npm run test:rules` supposent un `firebase.json` et un `.firebaserc` qui n'existent pas encore. | `package.json` | Phase 04 |
| 2026-09-16 | Phase 00 | `npm --prefix functions test` (revue de phase) échoue tant que `functions/package.json` n'existe pas. | `functions/` | Phase 06 |
| 2026-09-16 | Phase 00 | Le prototype charge des scripts tiers non épinglés (Jitsi `meet.jit.si`, FFmpeg.wasm via unpkg, Google Identity Services). Les tests de caractérisation devront les bloquer ou les simuler (`page.route`) pour rester rapides et déterministes. | `legacy/suktum-app.html` l. 1–43, 234–235 | Phase 01 (tests) puis 03 (C6/C7) |
| 2026-09-16 | Phase 01 | Écran caméra (`#screen-camera-publish`) : la ligne « PUBLIER / CRÉER » est recouverte par la barre d'onglets `#tabbar` sur un viewport Pixel 7 (Playwright : « `<nav id="tabbar">` intercepts pointer events »). Le lien « CRÉER » est intouchable ; seule la vignette galerie mène à l'import. | `legacy/suktum-app.html` l. 1896–1897 | Phase 03 (CSS) — décision produit à confirmer |
| 2026-09-16 | Phase 01 | Le pays « Sénégal » bascule automatiquement l'interface en wolof (`getLikelyLanguageForCountry`), sauf choix manuel. Le guide d'utilisation est en français : à confirmer avec Gorgui que c'est voulu. | `legacy/suktum-app.html` `getLikelyLanguageForCountry` | Décision produit |
| 2026-09-16 | Phase 01 | Fil : la colonne d'actions d'une publication (12 boutons : aimer, ne pas aimer, réaction, commenter, enregistrer, envoyer, WhatsApp, ami, pas intéressé, repartager, citer, signaler) déborde au-dessus du viewport Pixel 7 ; le bouton « aimer » est recouvert par la cloche `#global-notif-btn` et le bouton boutique. Intouchable au doigt. | `legacy/suktum-app.html` rendu `.feed-actions` ~l. 13417 | Phase 03 (CSS) — décision produit à confirmer |
