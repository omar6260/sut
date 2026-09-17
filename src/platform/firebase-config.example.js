// Copier en `firebase-config.local.js` (ignoré par git) et renseigner avec `npx firebase apps:sdkconfig WEB --project suktum-dev`.
// Le build (`scripts/build.mjs`) refuse de tourner sans ce fichier. Jamais de config Firebase dans le dépôt.
window.SUKTUM_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: 'suktum-dev.firebaseapp.com',
  projectId: 'suktum-dev',
  storageBucket: 'suktum-dev.firebasestorage.app',
  messagingSenderId: '',
  appId: '',
};
