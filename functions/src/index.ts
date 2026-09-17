import { initializeApp } from 'firebase-admin/app';
initializeApp();
export { registerUsername, myUsernames, setPin, verifyPin, setupTotp, confirmTotp, verifyTotpCode, disableTotp } from './auth/index.js';
export { setRole } from './auth/roles.js';
