// Rôles du back-office en custom claims. Seul le super-admin attribue ; chaque changement est journalisé.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const ROLES = ['superadmin', 'dg', 'moderator', 'payouts', 'techteam'] as const;
type Role = (typeof ROLES)[number];

export const setRole = onCall({ region: 'europe-west1' }, async (req) => {
  if (!req.auth?.token?.superadmin) throw new HttpsError('permission-denied', 'Réservé au super-admin');
  const { username, role, country, domain, name } = req.data ?? {};
  if (role !== null && !ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rôle inconnu');
  const target = await getFirestore().doc(`usernames/${String(username).toLowerCase()}`).get();
  if (!target.exists) throw new HttpsError('not-found', 'Utilisateur inconnu');
  const uid = target.data()!.uid as string;
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  for (const r of ROLES) delete (claims as Record<string, unknown>)[r];
  delete (claims as Record<string, unknown>).country; delete (claims as Record<string, unknown>).domain; delete (claims as Record<string, unknown>).adminName;
  if (role) Object.assign(claims, { [role as Role]: true, country: country ?? 'all', domain: domain ?? 'general', adminName: name ?? username });
  await getAuth().setCustomUserClaims(uid, claims);
  await getAuth().revokeRefreshTokens(uid); // force le rafraîchissement du jeton
  await getFirestore().collection('kv_auditlog').add({
    owner: 'server', updatedAt: FieldValue.serverTimestamp(),
    data: { id: `audit_${Date.now()}`, actorName: req.auth.token.adminName ?? req.auth.uid, actorRole: 'Super-admin', action: role ? `Rôle ${role} attribué` : 'Rôle retiré', detail: `@${username}${country ? ' · ' + country : ''}${domain ? ' · ' + domain : ''}`, createdAt: new Date().toISOString(), server: true },
  });
  return { ok: true, claims };
});
