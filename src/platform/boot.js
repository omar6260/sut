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
  // Identifiant d'appareil (navigateur) : l'espace privé est PAR APPAREIL, comme `shared=false` dans le prototype.
  // Sans lui, deux appareils reliés au même compte Google partageraient `settings:username` et contourneraient le PIN.
  let deviceId = null;
  try { deviceId = localStorage.getItem('suktum_device'); if (!deviceId) { deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('suktum_device', deviceId); } }
  catch { deviceId = 'dev_session_' + Math.random().toString(36).slice(2, 10); }
  PLATFORM.deviceId = deviceId;

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
  window.storage = PLATFORM.createStorageAdapter({ db, getUid: () => uid, deviceId, ready, FieldValue: fb.firestore.FieldValue });
  ready.catch((e) => console.error('[SuktumPlatform] authentification impossible :', e));
})();
