# À traiter — problèmes repérés hors du périmètre de la phase en cours

Règle : on note ici, on ne corrige pas. Une ligne par point, la phase qui devrait s'en charger, et où on l'a vu.

| Date | Repéré en | Problème | Où | Phase proposée |
|---|---|---|---|---|
| 2026-09-16 | Phase 00 | `docs/source/` est vide : le cahier des charges et le guide d'utilisation (.docx) n'ont pas encore été déposés. Les sources de vérité n° 1 et 2 manquent aux agents. | `docs/source/README.md` | Avant phase 01 (Oumar) |
| 2026-09-16 | Phase 00 | `npm run emulators` et `npm run test:rules` supposent un `firebase.json` et un `.firebaserc` qui n'existent pas encore. | `package.json` | Phase 04 |
| 2026-09-16 | Phase 00 | `npm --prefix functions test` (revue de phase) échoue tant que `functions/package.json` n'existe pas. | `functions/` | Phase 06 |
| 2026-09-16 | Phase 00 | Le prototype charge des scripts tiers non épinglés (Jitsi `meet.jit.si`, FFmpeg.wasm via unpkg, Google Identity Services). Les tests de caractérisation devront les bloquer ou les simuler (`page.route`) pour rester rapides et déterministes. | `legacy/suktum-app.html` l. 1–43, 234–235 | Phase 01 (tests) puis 03 (C6/C7) |
