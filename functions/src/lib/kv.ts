// Accès aux documents « kv_<prefixe> » écrits par l'adaptateur client : { data, owner, updatedAt }.
// Toute fonction métier lit/écrit via ces helpers, en transaction quand une valeur dépend d'une lecture.
import { getFirestore, FieldValue, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';

export const REGION = 'europe-west1';
export const db = () => getFirestore();

export function encodeId(id: string): string {
  let s = id.replace(/%/g, '%25').replace(/\//g, '%2F');
  if (s === '') s = '%00'; else if (s === '.') s = '%2E'; else if (s === '..') s = '%2E%2E'; else if (/^__.*__$/.test(s)) s = '%5F' + s.slice(1);
  return s;
}
export function decodeId(docId: string): string {
  if (docId === '%00') return '';
  return docId.replace(/%5F/g, '_').replace(/%2E/g, '.').replace(/%2F/g, '/').replace(/%25/g, '%');
}
/** Référence du document legacy `prefixe:id` (espace partagé). */
export function kvRef(key: string): DocumentReference {
  const i = key.indexOf(':');
  if (i <= 0) throw new HttpsError('invalid-argument', `clé invalide ${key}`);
  return db().collection(`kv_${key.slice(0, i)}`).doc(encodeId(key.slice(i + 1)));
}
export async function kvGet<T = any>(key: string, tx?: Transaction): Promise<T | null> {
  const snap = tx ? await tx.get(kvRef(key)) : await kvRef(key).get();
  return snap.exists ? (snap.data()!.data as T) : null;
}
/** Écrit `data` sans toucher `owner` (conservé), sauf `ownerIfNew` fourni pour une création (uid du propriétaire ou 'server'). */
export function kvSet(key: string, data: unknown, tx?: Transaction, ownerIfNew?: string): void {
  const ref = kvRef(key);
  const doc: Record<string, unknown> = { data, updatedAt: FieldValue.serverTimestamp() };
  if (ownerIfNew) doc.owner = ownerIfNew;
  if (tx) tx.set(ref, doc, { merge: true }); else void ref.set(doc, { merge: true });
}
export function kvDelete(key: string, tx?: Transaction): void { tx ? tx.delete(kvRef(key)) : void kvRef(key).delete(); }
/** Liste les clés `prefixe:...` (optionnellement `prefixe:idPrefix...`). */
export async function kvList(prefix: string): Promise<string[]> {
  const i = prefix.indexOf(':');
  const coll = prefix.slice(0, i), idPrefix = prefix.slice(i + 1);
  let q: FirebaseFirestore.Query = db().collection(`kv_${coll}`);
  if (idPrefix) { const enc = encodeId(idPrefix); q = q.where('__name__', '>=', enc).where('__name__', '<', enc + ''); }
  const snap = await q.get();
  return snap.docs.map((d) => `${coll}:${decodeId(d.id)}`);
}

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise');
  return req.auth.uid;
}
export type Role = 'superadmin' | 'dg' | 'moderator' | 'payouts' | 'techteam';
/** Exige un des rôles (claims). Renvoie { uid, role, country, domain, name }. */
export function requireRole(req: CallableRequest, roles: Role[]) {
  const uid = requireAuth(req);
  const t = (req.auth!.token ?? {}) as Record<string, unknown>;
  const role = (['superadmin', 'dg', 'moderator', 'payouts', 'techteam'] as Role[]).find((r) => t[r] === true);
  if (!role || !roles.includes(role)) throw new HttpsError('permission-denied', 'Accès réservé à l’équipe Suktum');
  return { uid, role, country: (t.country as string) ?? 'all', domain: (t.domain as string) ?? 'general', name: (t.adminName as string) ?? 'Administrateur' };
}
/** Nom(s) d'utilisateur du compte appelant ; vérifie que `username` lui appartient. */
export async function requireUsername(req: CallableRequest, username: string): Promise<string> {
  const uid = requireAuth(req);
  if (typeof username !== 'string' || !username) throw new HttpsError('invalid-argument', 'Nom d’utilisateur requis');
  const snap = await db().doc(`usernames/${username.toLowerCase()}`).get();
  if (!snap.exists || snap.data()!.uid !== uid) throw new HttpsError('permission-denied', 'Ce compte ne vous appartient pas');
  return uid;
}
export async function audit(actorName: string, actorRole: string, action: string, detail: string): Promise<void> {
  await db().collection('kv_auditlog').add({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, actorName, actorRole, action, detail, createdAt: new Date().toISOString(), server: true } });
}
/** Réglage plateforme `settings:<clé>` avec valeur par défaut (même sémantique que le legacy). */
export async function setting<T>(key: string, def: T, tx?: Transaction): Promise<T> {
  const v = await kvGet<T>(`settings:${key}`, tx);
  return v === null || v === undefined ? def : v;
}
export const nowIso = () => new Date().toISOString();
export const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
