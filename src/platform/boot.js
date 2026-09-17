// Amorçage plateforme (phase 04) : Firebase, émulateurs en local, auth anonyme provisoire, window.storage.
// Chargé AVANT le premier script legacy. Les appels storage attendent `ready` (auth initialisée).
(function () {
  // Tests de caractérisation « mémoire » : un window.storage est injecté avant tout script → la plateforme ne s'initialise pas.
  if (window.__SUKTUM_STORAGE_INJECTED) return;
  const PLATFORM = (window.SuktumPlatform = window.SuktumPlatform || {});
  const fb = window.firebase;
  const cfg = window.SUKTUM_FIREBASE_CONFIG;
  const app = fb.initializeApp(cfg);
  const auth = fb.auth();
  const db = fb.firestore();
  const params = new URLSearchParams(location.search);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) && !params.has('cloud');
  if (local) {
    auth.useEmulator('http://localhost:9099', { disableWarnings: true });
    db.useEmulator('localhost', 8080);
    if (fb.storage) fb.storage().useEmulator('localhost', 9199);
  }
  PLATFORM.env = { local, projectId: cfg.projectId };

  let uid = null;
  const ready = new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      try {
        if (!user) user = (await auth.signInAnonymously()).user; // phase 05 : vraie authentification
        uid = user.uid;
        unsub();
        resolve(uid);
      } catch (e) { reject(e); }
    });
  });

  PLATFORM.auth = auth;
  PLATFORM.db = db;
  PLATFORM.ready = ready;
  PLATFORM.getUid = () => uid;
  window.storage = PLATFORM.createStorageAdapter({ db, getUid: () => uid, ready, FieldValue: fb.firestore.FieldValue });
  ready.catch((e) => console.error('[SuktumPlatform] authentification impossible :', e));
})();
