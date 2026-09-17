// Fonctions d'authentification (phase 05). Région europe-west1. Toutes les écritures sensibles passent ici.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { hashSecret, verifySecret, generateTotpSecret, verifyTotp, checkAttempts, USERNAME_RE, AGE_BRACKETS } from '../lib/security.js';

const REGION = 'europe-west1';
const MAX_USERNAMES_PER_ACCOUNT = 3;
const db = () => getFirestore();
const requireUid = (auth: { uid: string } | undefined): string => { if (!auth) throw new HttpsError('unauthenticated', 'Connexion requise'); return auth.uid; };

/** Réserve un nom d'utilisateur pour le compte appelant (atomique). Pose le claim familyMode selon la tranche d'âge (D3). */
export const registerUsername = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const { username, ageBracket } = req.data ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) throw new HttpsError('invalid-argument', 'Nom d’utilisateur invalide');
  if (!AGE_BRACKETS.has(ageBracket)) throw new HttpsError('invalid-argument', 'Indiquez votre tranche d’âge (13–17 ou 18+)');
  const ref = db().doc(`usernames/${username.toLowerCase()}`);
  const status = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data()!.uid === uid ? 'mine' : 'taken';
    const mine = await tx.get(db().collection('usernames').where('uid', '==', uid));
    if (mine.size >= MAX_USERNAMES_PER_ACCOUNT) throw new HttpsError('resource-exhausted', `Maximum ${MAX_USERNAMES_PER_ACCOUNT} comptes par appareil`);
    tx.set(ref, { uid, username, ageBracket, createdAt: FieldValue.serverTimestamp() });
    return 'created';
  });
  if (status === 'created') {
    const user = await getAuth().getUser(uid);
    await getAuth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), familyMode: ageBracket === '13-17' });
  }
  return { status, username };
});

/** Noms d'utilisateur du compte appelant (après « Continuer avec Google » sur un nouvel appareil). */
export const myUsernames = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const snap = await db().collection('usernames').where('uid', '==', uid).get();
  const secrets = await db().doc(`auth_secrets/${uid}`).get();
  const s = secrets.data() ?? {};
  return { usernames: snap.docs.map((d) => d.data().username), requiresPin: !!s.pinHash, requiresTotp: !!s.totpSecret };
});

async function guardAttempts(uid: string, kind: string) {
  const ref = db().doc(`auth_attempts/${uid}_${kind}`);
  const snap = await ref.get();
  const { recent, remaining } = checkAttempts((snap.data()?.at as number[]) ?? [], Date.now());
  if (remaining === 0) throw new HttpsError('resource-exhausted', 'Trop de tentatives — réessayez dans 15 minutes');
  return { record: (ok: boolean) => ref.set({ at: ok ? [] : [...recent, Date.now()] }) };
}

export const setPin = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const { pin } = req.data ?? {};
  if (pin === null) { await db().doc(`auth_secrets/${uid}`).set({ pinHash: FieldValue.delete() }, { merge: true }); return { ok: true }; }
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) throw new HttpsError('invalid-argument', 'Le code doit comporter 4 à 6 chiffres');
  await db().doc(`auth_secrets/${uid}`).set({ pinHash: hashSecret(pin) }, { merge: true });
  return { ok: true };
});

export const verifyPin = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const { record } = await guardAttempts(uid, 'pin');
  const stored = (await db().doc(`auth_secrets/${uid}`).get()).data()?.pinHash;
  const ok = typeof stored === 'string' && typeof req.data?.pin === 'string' && verifySecret(req.data.pin, stored);
  await record(ok);
  if (!ok) throw new HttpsError('permission-denied', 'Code incorrect');
  return { ok: true };
});

export const setupTotp = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const secret = generateTotpSecret();
  await db().doc(`auth_secrets/${uid}`).set({ totpPending: secret }, { merge: true });
  return { secret, otpauth: `otpauth://totp/Suktum:${uid}?secret=${secret}&issuer=Suktum` };
});

export const confirmTotp = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const ref = db().doc(`auth_secrets/${uid}`);
  const pending = (await ref.get()).data()?.totpPending;
  if (typeof pending !== 'string' || !verifyTotp(pending, String(req.data?.code ?? ''))) throw new HttpsError('permission-denied', 'Code incorrect');
  await ref.set({ totpSecret: pending, totpPending: FieldValue.delete() }, { merge: true });
  return { ok: true };
});

export const verifyTotpCode = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  const { record } = await guardAttempts(uid, 'totp');
  const secret = (await db().doc(`auth_secrets/${uid}`).get()).data()?.totpSecret;
  const ok = typeof secret === 'string' && verifyTotp(secret, String(req.data?.code ?? ''));
  await record(ok);
  if (!ok) throw new HttpsError('permission-denied', 'Code incorrect');
  return { ok: true };
});

export const disableTotp = onCall({ region: REGION }, async (req) => {
  const uid = requireUid(req.auth);
  await db().doc(`auth_secrets/${uid}`).set({ totpSecret: FieldValue.delete(), totpPending: FieldValue.delete() }, { merge: true });
  return { ok: true };
});
