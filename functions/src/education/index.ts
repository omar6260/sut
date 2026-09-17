// Espace Éducation (phase 06) : abonnement/essai, inscriptions, accès financé, formateurs, cours, notes, quiz/examens,
// attestations, badges, parent/tuteur. Chaque fonction reproduit la logique du legacy (lignes citées : legacy/suktum-app.html)
// avec les mêmes messages ; les écritures sensibles ne se font plus que par ici.
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { Transaction } from 'firebase-admin/firestore';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { REGION, db, kvGet, kvSet, kvDelete, kvList, kvRef, encodeId, requireAuth, requireRole, requireUsername, audit, setting, nowIso, genId, Role } from '../lib/kv.js';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const EDU_ADMIN: Role[] = ['superadmin', 'dg', 'moderator'];
const opts = { region: REGION };
const optsAI = { region: REGION, secrets: [ANTHROPIC_API_KEY] };

/* ---------- Règles pures (testées unitairement dans functions/test/education.test.ts) ---------- */
export const DEFAULT_EDU_SUB_PRICE = 1000;            // l. 16665
export const EDU_SUB_DURATION_DAYS = 30;               // l. 16666
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // l. 16709
export const eduSubPrice = (v: unknown): number => (typeof v === 'number' ? v : DEFAULT_EDU_SUB_PRICE); // l. 16667-16670
export const eduSubExpiry = (now: number): string => new Date(now + EDU_SUB_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString(); // l. 17032
export function isTrialStillActive(user: { eduTrialStartedAt?: string } | null, now = Date.now()): boolean { // l. 16710-16713
  if (!user || !user.eduTrialStartedAt) return false;
  return now - new Date(user.eduTrialStartedAt).getTime() < TRIAL_DURATION_MS;
}
export function isEduSubActive(user: any, sub: any, now = Date.now()): boolean { // l. 16776-16783 (sans le bypass admin, purement client)
  if (user && user.stateFunded) return true;
  if (isTrialStillActive(user, now)) return true;
  if (!sub) return false;
  return new Date(sub.expiresAt).getTime() > now;
}
/** Décision d'inscription (l. 17603-17662). `leaves` = courseleave de cet élève pour ce cours. */
export function enrollmentDecision(me: any, sub: any, leaves: any[], now = Date.now()): { outcome: 'stateFunded' | 'trial' | 'reEnrollment' | 'pending'; priorPaidLeave: any | null } {
  if (me && me.stateFunded) return { outcome: 'stateFunded', priorPaidLeave: null };
  if (isTrialStillActive(me, now) && !sub) return { outcome: 'trial', priorPaidLeave: null };
  let priorPaidLeave: any = null;
  for (const l of leaves) if (l && l.wasPaid && (!priorPaidLeave || new Date(l.leftAt) > new Date(priorPaidLeave.leftAt))) priorPaidLeave = l;
  if (priorPaidLeave) return { outcome: 'reEnrollment', priorPaidLeave };
  return { outcome: 'pending', priorPaidLeave: null };
}
/** wasPaid / pricePaid conservés au départ d'un cours (l. 17394-17401). */
export const leaveFlags = (enrollment: any) => { const wasPaid = !enrollment.stateFunded && !enrollment.trialEnrollment; return { wasPaid, pricePaid: wasPaid ? enrollment.price : null }; };
/** Statut initial d'un cours (l. 17993-17998) : publication immédiate seulement pour un compte `isAdminTrainer` porteur d'un rôle d'équipe. */
export const initialCourseStatus = (me: any, callerIsAdmin: boolean): 'active' | 'pending_review' => (!!(me && me.isAdminTrainer) && callerIsAdmin ? 'active' : 'pending_review');
/** Gestionnaire d'un cours (l. 18206-18209) : formateur, co-formateur, ou remplaçant dont la délégation court encore. */
export function canManageCourse(c: any, username: string, now = Date.now()): boolean {
  if (!c) return false;
  const isCoTrainer = Array.isArray(c.coTrainers) && c.coTrainers.includes(username);
  const isActiveSubstitute = c.substituteTrainer === username && !!c.substituteEndDate && new Date(c.substituteEndDate).getTime() >= now;
  return c.trainerUsername === username || isCoTrainer || isActiveSubstitute;
}
/** Moyenne (l. 20670-20677), taux de présence (l. 20679-20686) et conditions manquantes (l. 20688-20697) d'une attestation. */
export function certificateEligibility(course: any, grades: number[], trainerSessions: any[], student: string): { average: string | null; attendanceRate: number | null; missingReasons: string[] } {
  const average = grades.length > 0 ? (grades.reduce((s, g) => s + g, 0) / grades.length).toFixed(1) : null;
  const attendedCount = trainerSessions.filter((s) => Array.isArray(s.attendees) && s.attendees.includes(student)).length;
  const attendanceRate = trainerSessions.length > 0 ? Math.round((attendedCount / trainerSessions.length) * 100) : null;
  const missingReasons: string[] = [];
  if (course.certMinAverage !== null && course.certMinAverage !== undefined) {
    if (average === null || parseFloat(average) < course.certMinAverage) missingReasons.push('une moyenne d’au moins ' + course.certMinAverage + '/20 (moyenne actuelle : ' + (average || 'aucune note') + ')');
  }
  if (course.certMinAttendance !== null && course.certMinAttendance !== undefined) {
    if (attendanceRate === null || attendanceRate < course.certMinAttendance) missingReasons.push('un taux de présence d’au moins ' + course.certMinAttendance + '% (taux actuel : ' + (attendanceRate !== null ? attendanceRate + '%' : 'aucune session tenue') + ')');
  }
  return { average, attendanceRate, missingReasons };
}
/** Code d'attestation SG-XXXXXXXX (l. 20579-20580). */
export const certificateCode = (courseId: string, student: string, now: number): string => 'SG-' + createHash('sha256').update(courseId + '__' + student + '__' + now).digest('hex').slice(0, 8).toUpperCase();
/** Correction QCM d'un examen complet (l. 18276-18283) : bonnes réponses / nombre de QCM. */
export function scoreQcm(correctIndexes: (number | null)[], answers: { type: string; selectedIndex?: number | null }[]): { qcmAutoScore: number; qcmCount: number } {
  let qcmAutoScore = 0, qcmCount = 0;
  correctIndexes.forEach((ci, i) => { if (ci !== null && ci !== undefined) { qcmCount++; if (answers[i] && answers[i].selectedIndex === ci) qcmAutoScore++; } });
  return { qcmAutoScore, qcmCount };
}
/** Code d'activation SUKTUM-XXXXXXXX (l. 16819-16824), alphabet sans caractères ambigus. */
export function generateSingleActivationCode(rand: (max: number) => number = randomInt): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[rand(chars.length)];
  return 'SUKTUM-' + code;
}
/** Catégorie de préférence d'une notification (l. 11412-11430, sous-ensemble utilisé ici). */
const NOTIF_CATEGORY: Record<string, string> = { follow: 'follows', new_lesson: 'education', student_left_course: 'education', student_reenrolled: 'education', institutional_announcement: 'education', enrolled_via_institutional_import: 'education' };
export const notificationCategory = (type: string) => NOTIF_CATEGORY[type] || 'other';
export const gradeSchema = z.number().min(0, 'Entrez une note valide entre 0 et 20').max(20, 'Entrez une note valide entre 0 et 20');
export const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
export const fcfa = (n: number) => n.toLocaleString('fr-FR');

/* ---------- Plomberie ---------- */
function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues[0]?.message || 'Paramètres invalides');
  return r.data;
}
const username = z.string().min(1, 'Nom d’utilisateur requis').max(60);
const id = z.string().min(1).max(200).regex(/^[^/]+$/, 'Identifiant invalide');
const key = (prefix: string) => z.string().regex(new RegExp('^' + prefix + ':[^/]+$'), 'Clé invalide');
const adminOf = (req: CallableRequest) => requireRole(req, EDU_ADMIN);
const roleLabel = (a: { role: Role; country: string }) => a.role === 'superadmin' ? 'Propriétaire' : a.role === 'dg' ? 'DG — ' + a.country : a.role === 'moderator' ? 'Modérateur' : a.role === 'payouts' ? 'Spécialiste reversements' : 'Équipe technique'; // l. 28933
const hasAdminClaim = (req: CallableRequest) => { const t = (req.auth?.token ?? {}) as Record<string, unknown>; return ['superadmin', 'dg', 'moderator', 'payouts', 'techteam'].some((r) => t[r] === true); };
const isTrainerAccount = (req: CallableRequest, u: any) => !!(u && u.isTrainer) || (req.auth?.token as Record<string, unknown> | undefined)?.trainer === true;

/** Contexte d'une transaction : lectures mémorisées d'abord, puis écritures (Firestore exige cet ordre) ; `touched` pour le client. */
class Ctx {
  touched: string[] = [];
  private cache = new Map<string, any>();
  private writing = false;
  constructor(public tx: Transaction) {}
  async get<T = any>(k: string): Promise<T | null> {
    if (this.writing) throw new Error('lecture après écriture dans la transaction : ' + k);
    if (!this.cache.has(k)) this.cache.set(k, await kvGet<T>(k, this.tx));
    return this.cache.get(k);
  }
  set(k: string, data: unknown, ownerIfNew?: string) { this.writing = true; kvSet(k, data, this.tx, ownerIfNew); this.cache.set(k, data); this.touched.push(k); }
  del(k: string) { this.writing = true; kvDelete(k, this.tx); this.cache.set(k, null); this.touched.push(k); }
  /** createNotification l. 11452-11461 : pas à soi-même, destinataire existant, préférence de catégorie respectée. Le destinataire doit avoir été lu (get) avant la phase d'écriture. */
  notify(toUser: string, type: string, fromUser: string, postId: string | null, text: string) {
    if (toUser === fromUser) return;
    const target = this.cache.get('user:' + toUser);
    if (!target) return;
    const category = notificationCategory(type);
    if (target.notificationPreferences && target.notificationPreferences[category] === false) return;
    const nid = genId('notif');
    this.set('notif:' + nid, { id: nid, toUser, type, fromUser, postId: postId || null, text: text || '', read: false, createdAt: nowIso() }, 'server');
  }
  /** createFollowRelationship l. 12967-12980 (les deux profils doivent avoir été lus). */
  follow(followerUsername: string, followedUsername: string) {
    if (followerUsername === followedUsername) return;
    const target = this.cache.get('user:' + followedUsername), follower = this.cache.get('user:' + followerUsername);
    if (!target || !follower) return;
    if (!target.followers) target.followers = [];
    if (!follower.following) follower.following = [];
    if (target.followers.includes(followerUsername)) return;
    target.followers.push(followerUsername);
    follower.following.push(followedUsername);
    this.set('user:' + followedUsername, target);
    this.set('user:' + followerUsername, follower);
    this.notify(followedUsername, 'follow', followerUsername, null, '');
  }
}
const run = <T>(fn: (c: Ctx) => Promise<T>) => db().runTransaction(async (tx) => fn(new Ctx(tx)));
type Out = { ok: true; touched: string[]; [k: string]: any };
const result = (c: Ctx, extra: Record<string, unknown> = {}): Out => ({ ok: true, touched: [...new Set(c.touched)], ...extra });
/** Requête sur une collection kv par champs de `data` (évite de lister puis relire chaque document). */
async function kvQuery(prefix: string, where: [string, any][]): Promise<{ key: string; data: any }[]> {
  let q: FirebaseFirestore.Query = db().collection('kv_' + prefix);
  for (const [f, v] of where) q = q.where('data.' + f, '==', v);
  const snap = await q.get();
  return snap.docs.map((d) => ({ key: prefix + ':' + d.id.replace(/%5F/g, '_').replace(/%2E/g, '.').replace(/%2F/g, '/').replace(/%25/g, '%'), data: d.data().data }));
}
async function readAll(keys: string[]): Promise<any[]> { return Promise.all(keys.map((k) => kvGet(k))); }
/** Clé privée (shared=false) d'un utilisateur : users/{uid}/private/{clé encodée}. */
const privateRef = (uid: string, k: string) => db().doc(`users/${uid}/private/${encodeId(k)}`);
async function uidOf(name: string): Promise<string | null> { const s = await db().doc(`usernames/${name.toLowerCase()}`).get(); return s.exists ? (s.data()!.uid as string) : null; }
async function setTrainerClaim(name: string, trainer: boolean) {
  const uid = await uidOf(name);
  if (!uid) return;
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  if (trainer) claims.trainer = true; else delete claims.trainer;
  await getAuth().setCustomUserClaims(uid, claims);
}

/* ==================== ABONNEMENT ÉDUCATION & ESSAI ==================== */

/** ensureTrialStarted l. 16769-16775 : pose eduTrialStartedAt une seule fois, jamais réinitialisé. */
export const startTrial = onCall(opts, async (req) => {
  const d = parse(z.object({ username }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const u = await c.get('user:' + d.username);
    if (!u || u.eduTrialStartedAt) return result(c, { started: false });
    u.eduTrialStartedAt = nowIso();
    c.set('user:' + d.username, u);
    return result(c, { started: true, eduTrialStartedAt: u.eduTrialStartedAt });
  });
});

/** Approbation d'une demande d'abonnement (approveEduSubRequest l. 17028-17040) : abonnement 30 j + achat + paiement + demande approuvée. */
function approveEduSubInTx(c: Ctx, reqId: string, r: any, now: number) {
  const startedAt = new Date(now).toISOString();
  c.set('edusubscription:' + r.username, { username: r.username, price: r.price, country: r.country, startedAt, expiresAt: eduSubExpiry(now), cancelled: false }, 'server');
  c.set('edupurchase:' + r.username + '__' + now, { username: r.username, price: r.price, country: r.country, purchasedAt: startedAt }, 'server');
  const paymentId = 'edusubpay_' + now;
  c.set('edusubpayment:' + paymentId, { id: paymentId, username: r.username, country: r.country, amount: r.price, createdAt: startedAt }, 'server');
  r.status = 'approved';
  c.set('edusubrequest:' + reqId, r);
  c.notify(r.username, 'edusub_approved', 'Suktum', null, '');
}

/** subscribeToEducationSpace l. 17004-17018 : demande au prix courant ; auto-approbation `settings:autoApproveEduSub` évaluée ici. */
export const subscribeEducation = onCall(opts, async (req) => {
  const d = parse(z.object({ username }), req.data);
  await requireUsername(req, d.username);
  const out = await run(async (c) => {
    const price = eduSubPrice(await c.get('settings:education_sub_price'));
    const auto = (await c.get('settings:autoApproveEduSub')) === true;
    const me = await c.get('user:' + d.username);
    const now = Date.now();
    const reqId = 'edusubreq_' + now;
    const r = { id: reqId, username: d.username, country: me?.country ?? null, price, status: 'pending', createdAt: new Date(now).toISOString() };
    c.set('edusubrequest:' + reqId, r, 'server');
    if (auto) approveEduSubInTx(c, reqId, r, now);
    return result(c, { requestId: reqId, price, autoApproved: auto });
  });
  if (out.autoApproved) {
    await audit(d.username, 'Système (auto-approbation)', 'Abonnement Espace Éducation validé', '@' + d.username + ' — ' + fcfa(out.price as number) + ' FCFA');
    await audit(d.username, 'Système (auto-approbation)', 'Abonnement Espace Éducation approuvé automatiquement', '@' + d.username + ' — ' + fcfa(out.price as number) + ' FCFA');
  }
  return out;
});

export const approveEduSub = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ id }), req.data);
  const out = await run(async (c) => {
    const r = await c.get('edusubrequest:' + d.id);
    if (!r) return result(c, { found: false });
    await c.get('user:' + r.username);
    approveEduSubInTx(c, d.id, r, Date.now());
    return result(c, { found: true, username: r.username, price: r.price });
  });
  if (out.found) await audit(a.name, roleLabel(a), 'Abonnement Espace Éducation validé', '@' + out.username + ' — ' + fcfa(out.price as number) + ' FCFA');
  return out;
});
/** rejectEduSubRequest l. 17044-17048 : la demande est supprimée. */
export const rejectEduSub = onCall(opts, async (req) => {
  adminOf(req);
  const d = parse(z.object({ id }), req.data);
  await kvRef('edusubrequest:' + d.id).delete();
  return { ok: true, touched: ['edusubrequest:' + d.id] };
});
/** cancelEduSubscription / reactivateEduSubscription l. 16733-16752 : bascule `cancelled` sur son propre abonnement. */
const setRenewal = (cancelled: boolean) => onCall(opts, async (req) => {
  const d = parse(z.object({ username }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const sub = await c.get('edusubscription:' + d.username);
    if (!sub) return result(c, { found: false });
    sub.cancelled = cancelled;
    c.set('edusubscription:' + d.username, sub);
    return result(c, { found: true, expiresAt: sub.expiresAt });
  });
});
export const cancelEduSub = setRenewal(true);
export const reactivateEduSub = setRenewal(false);

/* ==================== ACCÈS FINANCÉ PAR L'ÉTAT ==================== */

/** submitStateFundedRequest l. 16793-16803. */
export const requestStateFunded = onCall(opts, async (req) => {
  const d = parse(z.object({ username, reason: z.string().trim().min(1, 'Précisez le programme ou l’organisme').max(2000) }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const me = await c.get('user:' + d.username);
    const rid = 'statereq_' + Date.now();
    c.set('staterequest:' + rid, { id: rid, username: d.username, country: me?.country ?? null, reason: d.reason, status: 'pending', createdAt: nowIso() }, 'server');
    return result(c, { requestId: rid });
  });
});
/** approveStateFundedRequest l. 16984-16994. */
export const approveStateFunded = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ id }), req.data);
  const out = await run(async (c) => {
    const r = await c.get('staterequest:' + d.id);
    if (!r) return result(c, { found: false });
    const u = await c.get('user:' + r.username);
    if (u) { u.stateFunded = true; c.set('user:' + r.username, u); }
    r.status = 'approved';
    c.set('staterequest:' + d.id, r);
    c.notify(r.username, 'state_funded_approved', 'Suktum', null, '');
    return result(c, { found: true, username: r.username, reason: r.reason });
  });
  if (out.found) await audit(a.name, roleLabel(a), 'Demande d’accès financé par l’État approuvée', '@' + out.username + ' — ' + out.reason);
  return out;
});
/** rejectStateFundedRequest l. 16996-17002. */
export const rejectStateFunded = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ id }), req.data);
  const out = await run(async (c) => {
    const r = await c.get('staterequest:' + d.id);
    if (r) { r.status = 'rejected'; c.set('staterequest:' + d.id, r); }
    return result(c, { username: r ? r.username : null });
  });
  await audit(a.name, roleLabel(a), 'Demande d’accès financé par l’État refusée', out.username ? '@' + out.username : d.id);
  return out;
});
/** grantStateFundedAccess l. 16963-16975 / revokeStateFundedAccess l. 16976-16983. */
const setStateFunded = (funded: boolean) => onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ username }), req.data);
  const out = await run(async (c) => {
    const u = await c.get('user:' + d.username);
    if (!u) return result(c, { found: false });
    u.stateFunded = funded;
    c.set('user:' + d.username, u);
    if (funded) c.notify(d.username, 'state_funded_approved', 'Suktum', null, '');
    return result(c, { found: true });
  });
  if (out.found) await audit(a.name, roleLabel(a), funded ? 'Accès Espace Éducation financé par l’État accordé' : 'Accès Espace Éducation financé par l’État retiré', '@' + d.username);
  return out;
});
export const grantStateFunded = setStateFunded(true);
export const revokeStateFunded = setStateFunded(false);

/** redeemActivationCode l. 16946-16961 : usage unique, atomique ; accorde `stateFunded`. */
export const redeemActivationCode = onCall(opts, async (req) => {
  const d = parse(z.object({ username, code: z.string().trim().min(1, 'Saisissez un code').max(40) }), req.data);
  await requireUsername(req, d.username);
  const code = d.code.toUpperCase();
  const out = await run(async (c) => {
    const record = await c.get('activationcode:' + code);
    if (!record) throw new HttpsError('not-found', 'Code invalide');
    if (record.redeemed) throw new HttpsError('failed-precondition', 'Ce code a déjà été utilisé le ' + dateFr(record.redeemedAt));
    const u = await c.get('user:' + d.username);
    record.redeemed = true; record.redeemedBy = d.username; record.redeemedAt = nowIso();
    c.set('activationcode:' + code, record);
    if (u) { u.stateFunded = true; c.set('user:' + d.username, u); }
    return result(c, { label: record.label });
  });
  await audit(d.username, 'Utilisateur', 'Code d’activation utilisé', '@' + d.username + ' — ' + out.label);
  return out;
});
/** generateActivationCodes l. 16853-16866 : lot de 1 à 200 codes. */
export const generateActivationCodes = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ count: z.number().int().min(1, 'Renseignez un nombre de codes valide').max(200), label: z.string().trim().max(120).optional() }), req.data);
  const label = d.label || 'Cohorte sans nom';
  const batchId = 'batch_' + Date.now();
  const codes: string[] = [];
  while (codes.length < d.count) { const code = generateSingleActivationCode(); if (!codes.includes(code)) codes.push(code); }
  const batch = db().batch();
  const stamp = { owner: 'server', updatedAt: new Date() };
  batch.set(kvRef('activationbatch:' + batchId), { ...stamp, data: { id: batchId, label, codes, createdAt: nowIso(), createdBy: a.name } });
  for (const code of codes) batch.set(kvRef('activationcode:' + code), { ...stamp, data: { code, batchId, label, redeemed: false, redeemedBy: null, redeemedAt: null } });
  await batch.commit();
  await audit(a.name, roleLabel(a), 'Codes d’activation institutionnels générés', label + ' — ' + d.count + ' code(s)');
  return { ok: true, touched: ['activationbatch:' + batchId, ...codes.map((c) => 'activationcode:' + c)], batchId, count: d.count };
});
/** importStudentListCSV l. 16834-16841 (le CSV est lu côté client, la liste des noms arrive ici) : `stateFunded` + inscription d'office. */
export const importStudents = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ courseId: id, usernames: z.array(z.string().trim().min(1).max(60)).min(1, 'Choisissez un fichier CSV').max(200) }), req.data);
  const out = await run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!course) throw new HttpsError('not-found', 'Cours introuvable');
    const users = new Map<string, any>();
    for (const n of d.usernames) users.set(n, await c.get('user:' + n));
    const existing = new Map<string, any>();
    for (const n of d.usernames) if (users.get(n)) existing.set(n, await c.get('enrollment:' + d.courseId + '__' + n));
    let enrolledCount = 0; const notFound: string[] = [];
    for (const n of d.usernames) {
      const u = users.get(n);
      if (!u) { notFound.push(n); continue; }
      u.stateFunded = true;
      c.set('user:' + n, u);
      if (!existing.get(n)) c.set('enrollment:' + d.courseId + '__' + n, { courseId: d.courseId, studentUsername: n, trainerUsername: course.trainerUsername, price: course.price, country: u.country || null, status: 'approved', stateFundedImport: true, createdAt: nowIso() }, 'server');
      c.notify(n, 'enrolled_via_institutional_import', a.name, d.courseId, course.title);
      enrolledCount++;
    }
    return result(c, { enrolledCount, notFound, title: course.title });
  });
  await audit(a.name, roleLabel(a), 'Import de liste institutionnelle', out.title + ' — ' + out.enrolledCount + ' compte(s)');
  return out;
});

/* ==================== INSCRIPTIONS ==================== */

/** approveEnrollment l. 15453-15461 : approuvée + abonnement automatique au formateur + notification. */
function approveEnrollmentInTx(c: Ctx, enrollmentKey: string, e: any) {
  e.status = 'approved';
  c.set(enrollmentKey, e);
  c.follow(e.studentUsername, e.trainerUsername);
  c.notify(e.studentUsername, 'course_approved', 'Suktum', e.courseId, 'votre inscription');
}

/** enrollInCourse l. 17603-17662 : financé / essai / réinscription après départ payé / en attente (+ auto-approbation serveur). */
export const enroll = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id }), req.data);
  await requireUsername(req, d.username);
  const leaves = await readAll(await kvList('courseleave:' + d.courseId + '__' + d.username + '__'));
  const out = await run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!course) throw new HttpsError('not-found', 'Cours introuvable');
    const readOnlyDomains = (await c.get<string[]>('settings:readOnlyDomains')) || [];
    if (readOnlyDomains.includes('education')) throw new HttpsError('unavailable', 'Le département Éducation est temporairement en lecture seule — réessayez plus tard');
    const me = (await c.get('user:' + d.username)) || { username: d.username, createdAt: nowIso() };
    const sub = await c.get('edusubscription:' + d.username);
    const autoApprove = (await c.get('settings:autoApproveEnrollment')) === true;
    if (course.trainerUsername) await c.get('user:' + course.trainerUsername);
    const enrollmentKey = 'enrollment:' + d.courseId + '__' + d.username;
    const existing = await c.get(enrollmentKey);
    if (existing && existing.status === 'approved') throw new HttpsError('already-exists', 'Vous êtes déjà inscrit(e) à ce cours');
    const now = Date.now();
    if (!me.isStudent) {
      me.isStudent = true; me.studentSince = new Date(now).toISOString();
      if (course.schoolLevel) { me.studentLevel = course.schoolLevel; me.studentType = course.schoolLevel === 'Supérieur' ? 'Étudiant' : 'Élève'; }
      c.set('user:' + d.username, me, 'server');
    }
    const decision = enrollmentDecision(me, sub, leaves, now);
    const base = { courseId: d.courseId, studentUsername: d.username, trainerUsername: course.trainerUsername, country: me.country ?? null, createdAt: new Date(now).toISOString() };
    if (decision.outcome === 'stateFunded') {
      c.set(enrollmentKey, { ...base, price: course.price, status: 'approved', stateFunded: true }, 'server');
      c.follow(d.username, course.trainerUsername);
      return result(c, { outcome: 'stateFunded' });
    }
    if (decision.outcome === 'trial') {
      c.set(enrollmentKey, { ...base, price: course.price, status: 'approved', trialEnrollment: true }, 'server');
      c.follow(d.username, course.trainerUsername);
      return result(c, { outcome: 'trial' });
    }
    if (decision.outcome === 'reEnrollment') {
      c.set(enrollmentKey, { ...base, price: decision.priorPaidLeave.pricePaid, status: 'approved', reEnrollment: true }, 'server');
      c.follow(d.username, course.trainerUsername);
      if (course.trainerUsername) c.notify(course.trainerUsername, 'student_reenrolled', d.username, d.courseId, course.title);
      return result(c, { outcome: 'reEnrollment' });
    }
    const e = { ...base, price: course.price, status: 'pending' };
    c.set(enrollmentKey, e, 'server');
    if (autoApprove) { approveEnrollmentInTx(c, enrollmentKey, e); return result(c, { outcome: 'autoApproved', title: course.title, price: course.price }); }
    return result(c, { outcome: 'pending', title: course.title, price: course.price });
  });
  if (out.outcome === 'autoApproved') {
    await audit(d.username, 'Système (auto-approbation)', 'Inscription au cours validée', '@' + d.username + ' — ' + fcfa(out.price as number) + ' FCFA');
    await audit(d.username, 'Système (auto-approbation)', 'Inscription au cours approuvée automatiquement', '@' + d.username + ' — ' + out.title);
  }
  return out;
});

export const approveEnrollment = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ enrollmentKey: key('enrollment') }), req.data);
  const out = await run(async (c) => {
    const e = await c.get(d.enrollmentKey);
    if (!e) return result(c, { found: false });
    await c.get('user:' + e.studentUsername); await c.get('user:' + e.trainerUsername);
    approveEnrollmentInTx(c, d.enrollmentKey, e);
    return result(c, { found: true, studentUsername: e.studentUsername, price: e.price });
  });
  if (out.found) await audit(a.name, roleLabel(a), 'Inscription au cours validée', '@' + out.studentUsername + ' — ' + fcfa(Number(out.price) || 0) + ' FCFA');
  return out;
});
/** rejectEnrollment l. 15463-15467. */
export const rejectEnrollment = onCall(opts, async (req) => {
  adminOf(req);
  const d = parse(z.object({ enrollmentKey: key('enrollment') }), req.data);
  await kvRef(d.enrollmentKey).delete();
  return { ok: true, touched: [d.enrollmentKey] };
});

/** leaveCourseAsStudent l. 17385-17406 : suppression de l'inscription, préférences privées, trace `courseleave` avec wasPaid/pricePaid serveur. */
export const leaveCourse = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, reason: z.string().trim().max(1000).nullable().optional() }), req.data);
  const uid = await requireUsername(req, d.username);
  const out = await run(async (c) => {
    const enrollment = await c.get('enrollment:' + d.courseId + '__' + d.username);
    if (!enrollment || enrollment.status !== 'approved') return result(c, { left: false });
    const course = await c.get('course:' + d.courseId);
    if (course && course.trainerUsername) await c.get('user:' + course.trainerUsername);
    const { wasPaid, pricePaid } = leaveFlags(enrollment);
    c.del('enrollment:' + d.courseId + '__' + d.username);
    const leaveId = d.courseId + '__' + d.username + '__' + Date.now();
    c.set('courseleave:' + leaveId, { id: leaveId, courseId: d.courseId, studentUsername: d.username, courseTitle: course ? course.title : d.courseId, trainerUsername: course ? course.trainerUsername : null, wasPaid, pricePaid, reason: d.reason && d.reason.trim() ? d.reason.trim() : null, leftAt: nowIso() }, 'server');
    if (course && course.trainerUsername) c.notify(course.trainerUsername, 'student_left_course', d.username, d.courseId, course.title);
    return result(c, { left: true });
  });
  if (out.left) {
    await privateRef(uid, 'coursegroupchatnotifypref:' + d.username + '__' + d.courseId).delete().catch(() => {});
    await privateRef(uid, 'coursechatnotifypref:' + d.username + '__' + d.courseId).delete().catch(() => {});
  }
  return out;
});

/** requestStudentRemoval l. 20834-20842 (formateur) ; approveStudentRemoval l. 20851-20858 / rejet l. 20859-20865 (admin). */
export const requestStudentRemoval = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, studentUsername: username, reason: z.string().trim().min(1).max(1000) }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
    const rid = 'studentremoval_' + Date.now();
    c.set('studentremoval:' + rid, { id: rid, courseId: d.courseId, studentUsername: d.studentUsername, requestedBy: d.username, reason: d.reason, status: 'pending', createdAt: nowIso() }, 'server');
    return result(c, { requestId: rid });
  });
});
export const approveStudentRemoval = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ storageKey: key('studentremoval') }), req.data);
  const out = await run(async (c) => {
    const r = await c.get(d.storageKey);
    if (!r) return result(c, { found: false });
    c.del('enrollment:' + r.courseId + '__' + r.studentUsername);
    r.status = 'approved';
    c.set(d.storageKey, r);
    return result(c, { found: true, r });
  });
  if (out.found) { const r = out.r as any; await audit(a.name, roleLabel(a), 'Retrait d’élève approuvé', '@' + r.studentUsername + ' — demandé par @' + r.requestedBy + ' (' + r.reason + ')'); }
  return { ok: true, touched: out.touched };
});
export const rejectStudentRemoval = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ storageKey: key('studentremoval') }), req.data);
  const out = await run(async (c) => {
    const r = await c.get(d.storageKey);
    if (r) { r.status = 'rejected'; c.set(d.storageKey, r); }
    return result(c, { studentUsername: r ? r.studentUsername : null });
  });
  await audit(a.name, roleLabel(a), 'Retrait d’élève refusé', out.studentUsername ? '@' + out.studentUsername : d.storageKey);
  return { ok: true, touched: out.touched };
});

/* ==================== FORMATEURS ==================== */

/** approveTrainerRequest l. 15397-15408 : `isTrainer` + numéro de paiement + matière sur le profil, claim `trainer`, notification. */
async function approveTrainerCore(reqId: string, actorName: string, actorRole: string, auditAction: string, auditSuffix = '') {
  const out = await run(async (c) => {
    const r = await c.get('trainerrequest:' + reqId);
    if (!r) return result(c, { found: false });
    const u = await c.get('user:' + r.username);
    if (u) { u.isTrainer = true; u.trainerPaymentNumber = r.paymentNumber || ''; u.trainerSubject = r.subject; u.trainerSince = nowIso(); c.set('user:' + r.username, u); }
    r.status = 'approved';
    c.set('trainerrequest:' + reqId, r);
    c.notify(r.username, 'trainer_approved', 'Suktum', null, r.subject);
    return result(c, { found: true, username: r.username, subject: r.subject });
  });
  if (out.found) {
    await setTrainerClaim(out.username as string, true);
    await audit(actorName, actorRole, auditAction, '@' + out.username + ' — ' + (auditSuffix || out.subject));
  }
  return out;
}
export const approveTrainer = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ id }), req.data);
  return approveTrainerCore(d.id, a.name, roleLabel(a), 'Candidature formateur validée');
});
/** rejectTrainerRequest l. 15410-15416. */
export const rejectTrainer = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ id }), req.data);
  const out = await run(async (c) => {
    const r = await c.get('trainerrequest:' + d.id);
    if (r) { r.status = 'rejected'; c.set('trainerrequest:' + d.id, r); }
    return result(c, { username: r ? r.username : null });
  });
  await audit(a.name, roleLabel(a), 'Candidature formateur refusée', out.username ? '@' + out.username : d.id);
  return out;
});
/** excludeTrainer l. 15715-15725 : retire `isTrainer` et le claim. */
export const excludeTrainer = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ username }), req.data);
  const out = await run(async (c) => {
    const t = await c.get('user:' + d.username);
    if (!t) return result(c, { found: false });
    t.isTrainer = false;
    c.set('user:' + d.username, t);
    return result(c, { found: true });
  });
  if (out.found) { await setTrainerClaim(d.username, false); await audit(a.name, roleLabel(a), 'Formateur exclu de l’Espace Éducation', '@' + d.username); }
  return out;
});
/** maybeAutoValidateTrainer l. 32306-32320, exécuté côté serveur après la candidature : si `settings:autoValidateTrainers`, l'IA décide ;
 *  sans clé (émulateur) ou en cas d'erreur, la candidature reste en attente (comportement « IA indisponible » du legacy). */
export const applyTrainer = onCall(optsAI, async (req) => {
  const d = parse(z.object({ username, requestId: id }), req.data);
  await requireUsername(req, d.username);
  const r = await kvGet('trainerrequest:' + d.requestId);
  if (!r || r.username !== d.username) throw new HttpsError('not-found', 'Candidature introuvable');
  if (r.status !== 'pending' || (await setting('autoValidateTrainers', false)) !== true) return { ok: true, touched: [], autoValidated: false };
  try {
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new Error('IA indisponible');
    const prompt = "Tu aides à examiner une candidature de formateur pour une plateforme d'éducation en ligne. Voici la candidature :\n\n" +
      'MATIÈRE : ' + r.subject + '\nPRÉSENTATION : ' + r.bio +
      "\n\nCette candidature semble-t-elle sérieuse, cohérente et rédigée par quelqu'un ayant une vraie compétence dans cette matière (pas un texte vide, absurde, ou hors-sujet) ? Réponds UNIQUEMENT en JSON strict : {\"decision\": \"approve\" ou \"hold\", \"reasoning\": \"<1 phrase en français>\"}. En cas de doute, réponds \"hold\".";
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 150, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = (await res.json()) as any;
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if (parsed.decision !== 'approve') return { ok: true, touched: [], autoValidated: false };
    const out = await approveTrainerCore(d.requestId, 'IA', 'Système (validation automatique)', 'Candidature formateur validée automatiquement par l’IA', String(parsed.reasoning || ''));
    return { ...out, autoValidated: true };
  } catch { return { ok: true, touched: [], autoValidated: false }; }
});

/* ==================== COURS ==================== */

/** createCourse l. 17984-18003 : statut initial fixé ici (`isAdminTrainer` n'est honoré que pour un compte d'équipe). */
export const createCourse = onCall(opts, async (req) => {
  const d = parse(z.object({
    username, title: z.string().trim().min(1, 'Renseignez au moins un titre et un prix valide').max(200), description: z.string().trim().max(5000).default(''),
    price: z.number().int('Renseignez au moins un titre et un prix valide').positive('Renseignez au moins un titre et un prix valide'),
    schoolLevel: z.string().max(60).nullable().optional(), schoolClass: z.string().max(60).nullable().optional(), examTarget: z.string().max(60).nullable().optional(),
  }), req.data);
  await requireUsername(req, d.username);
  const callerIsAdmin = hasAdminClaim(req);
  const out = await run(async (c) => {
    const me = await c.get('user:' + d.username);
    if (!isTrainerAccount(req, me)) throw new HttpsError('permission-denied', 'Réservé aux formateurs validés');
    const status = initialCourseStatus(me, callerIsAdmin);
    const cid = 'course_' + Date.now();
    c.set('course:' + cid, { id: cid, trainerUsername: d.username, title: d.title, description: d.description, price: d.price, country: me?.country ?? null, schoolLevel: d.schoolLevel || null, schoolClass: d.schoolClass || null, examTarget: d.examTarget || null, status, createdAt: nowIso() }, 'server');
    return result(c, { courseId: cid, status, followers: status === 'active' ? ((me && me.followers) || []) : [] });
  });
  if (out.status === 'active') await notifyFollowersOfNewCourse(d.username, out.followers as string[], out.courseId as string, d.title);
  return { ok: true, touched: out.touched, courseId: out.courseId, status: out.status };
});
/** notifyFollowersOfNewCourse l. 15417-15424 (hors transaction : un lot par abonné). */
async function notifyFollowersOfNewCourse(trainerUsername: string, followers: string[], courseId: string, title: string) {
  for (const f of followers.slice(0, 500)) await run(async (c) => { await c.get('user:' + f); c.notify(f, 'new_course', trainerUsername, courseId, title); });
}
/** approveCourse l. 15426-15437 / suspendCourse l. 15438-15447 / deleteCourseCompletely l. 15448-15452 (+ cascade leçons/inscriptions). */
export const reviewCourse = onCall(opts, async (req) => {
  const a = adminOf(req);
  const d = parse(z.object({ courseId: id, action: z.enum(['approve', 'toggleSuspend', 'delete']) }), req.data);
  const out = await run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!course) return result(c, { found: false });
    const trainer = await c.get('user:' + course.trainerUsername);
    if (d.action === 'approve') {
      course.status = 'active';
      c.set('course:' + d.courseId, course);
      c.notify(course.trainerUsername, 'course_approved', 'Suktum', d.courseId, course.title);
      return result(c, { found: true, status: 'active', title: course.title, trainerUsername: course.trainerUsername, followers: (trainer && trainer.followers) || [] });
    }
    if (d.action === 'toggleSuspend') {
      course.status = course.status === 'suspended' ? 'active' : 'suspended';
      c.set('course:' + d.courseId, course);
      return result(c, { found: true, status: course.status, title: course.title, trainerUsername: course.trainerUsername });
    }
    c.del('course:' + d.courseId);
    return result(c, { found: true, status: 'deleted', title: course.title, trainerUsername: course.trainerUsername });
  });
  if (!out.found) return out;
  const detail = out.title + ' (@' + out.trainerUsername + ')';
  if (d.action === 'approve') { await notifyFollowersOfNewCourse(out.trainerUsername as string, out.followers as string[], d.courseId, out.title as string); await audit(a.name, roleLabel(a), 'Cours validé', detail); }
  else if (d.action === 'toggleSuspend') await audit(a.name, roleLabel(a), out.status === 'suspended' ? 'Cours suspendu' : 'Cours réactivé', detail);
  else {
    const cascade = [...(await kvList('lesson:' + d.courseId + '__')), ...(await kvList('enrollment:' + d.courseId + '__'))];
    for (let i = 0; i < cascade.length; i += 400) { const b = db().batch(); for (const k of cascade.slice(i, i + 400)) b.delete(kvRef(k)); await b.commit(); }
    out.touched = [...(out.touched as string[]), ...cascade];
    await audit(a.name, roleLabel(a), 'Cours supprimé définitivement', detail);
  }
  return { ok: true, touched: out.touched, status: out.status };
});
/** assignSubstitute l. 19199-19213 / removeSubstitute l. 19214-19221 : seul un gestionnaire, remplaçant = formateur validé, date future. */
export const setSubstitute = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, substitute: username.nullable(), endDate: z.string().nullable().optional() }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
    if (d.substitute) {
      if (!d.endDate) throw new HttpsError('invalid-argument', 'Renseignez le nom d’utilisateur et la date de fin');
      if (new Date(d.endDate).getTime() < Date.now()) throw new HttpsError('invalid-argument', 'La date de fin doit être dans le futur');
      const target = await c.get('user:' + d.substitute);
      if (!target || !target.isTrainer) throw new HttpsError('failed-precondition', 'Ce nom d’utilisateur ne correspond à aucun formateur validé');
      course.substituteTrainer = d.substitute; course.substituteEndDate = new Date(d.endDate).toISOString();
      c.set('course:' + d.courseId, course);
      c.notify(d.substitute, 'substitute_assigned', d.username, d.courseId, course.title);
    } else { course.substituteTrainer = null; course.substituteEndDate = null; c.set('course:' + d.courseId, course); }
    return result(c);
  });
});
/** addCoTrainer l. 19238-19252 / removeCoTrainer l. 19253-19259 : seul le formateur principal. */
export const setCoTrainer = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, coTrainer: username, action: z.enum(['add', 'remove']) }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!course || course.trainerUsername !== d.username) throw new HttpsError('permission-denied', 'Seul le formateur principal peut gérer le co-enseignement');
    if (d.action === 'add') {
      if (d.coTrainer === d.username) throw new HttpsError('invalid-argument', 'Vous êtes déjà le formateur principal');
      const target = await c.get('user:' + d.coTrainer);
      if (!target || !target.isTrainer) throw new HttpsError('failed-precondition', 'Ce compte doit être un formateur déjà validé');
      if (!course.coTrainers) course.coTrainers = [];
      if (course.coTrainers.includes(d.coTrainer)) throw new HttpsError('already-exists', 'Déjà co-formateur de ce cours');
      course.coTrainers.push(d.coTrainer);
      c.set('course:' + d.courseId, course);
      c.notify(d.coTrainer, 'cotrainer_added', d.username, d.courseId, course.title);
    } else { course.coTrainers = (course.coTrainers || []).filter((u: string) => u !== d.coTrainer); c.set('course:' + d.courseId, course); }
    return result(c);
  });
});
/** saveCertificateConditions l. 36632-36638 : seuils bornés 0-20 / 0-100. */
export const setCertificateConditions = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, certMinAverage: z.number().nullable(), certMinAttendance: z.number().nullable() }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
    course.certMinAverage = d.certMinAverage === null ? null : Math.max(0, Math.min(20, d.certMinAverage));
    course.certMinAttendance = d.certMinAttendance === null ? null : Math.max(0, Math.min(100, Math.trunc(d.certMinAttendance)));
    c.set('course:' + d.courseId, course);
    return result(c, { certMinAverage: course.certMinAverage, certMinAttendance: course.certMinAttendance });
  });
});

/* ==================== NOTES ==================== */

/** submitGrade l. 17887-17909 : note 0-20 ; une note validée ne change qu'avec un motif conservé dans l'historique. */
export const gradeSubmission = onCall(opts, async (req) => {
  const d = parse(z.object({ username, storageKey: key('submission'), score: gradeSchema, feedback: z.string().trim().max(5000).default(''), justification: z.string().trim().max(1000).nullable().optional() }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const s = await c.get(d.storageKey);
    if (!s) return result(c, { found: false });
    const course = await c.get('course:' + s.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Réservé au formateur de ce cours');
    await c.get('user:' + s.studentUsername);
    if (s.status === 'graded' && s.score !== d.score) {
      if (!d.justification) throw new HttpsError('failed-precondition', 'Correction annulée — la note validée reste inchangée');
      if (!s.gradeCorrectionHistory) s.gradeCorrectionHistory = [];
      s.gradeCorrectionHistory.push({ previousScore: s.score, newScore: d.score, justification: d.justification, correctedBy: d.username, correctedAt: nowIso() });
    }
    s.score = d.score; s.feedback = d.feedback; s.status = 'graded'; s.gradedAt = nowIso();
    c.set(d.storageKey, s);
    c.notify(s.studentUsername, 'exercise_graded', d.username, s.exerciseId, String(d.score));
    return result(c, { found: true });
  });
});
/** submitFullExamGrade l. 18426-18431. */
export const gradeExam = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, examId: id, student: username, score: gradeSchema }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const sub = await c.get('fullexamsubmission:' + d.examId + '__' + d.student);
    if (!sub) return result(c, { found: false });
    const exam = await c.get('fullexam:' + d.courseId + '__' + d.examId);
    if (!exam) throw new HttpsError('not-found', 'Examen introuvable');
    const course = await c.get('course:' + exam.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Réservé au formateur de ce cours');
    await c.get('user:' + d.student);
    sub.status = 'graded'; sub.totalScore = d.score; sub.gradedAt = nowIso();
    c.set('fullexamsubmission:' + d.examId + '__' + d.student, sub);
    c.notify(d.student, 'exam_graded', d.username, d.examId, String(d.score));
    return result(c, { found: true });
  });
});
/** submitContestScore l. 20014-20018. */
export const gradeContest = onCall(opts, async (req) => {
  const d = parse(z.object({ username, storageKey: key('contestentry'), score: gradeSchema }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const e = await c.get(d.storageKey);
    if (!e) return result(c, { found: false });
    const course = await c.get('course:' + e.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Réservé au formateur de ce cours');
    e.score = d.score;
    c.set(d.storageKey, e);
    return result(c, { found: true });
  });
});
/** recordExamResult l. 20101-20115. */
export const recordExamResult = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, studentUsername: username, examTitle: z.string().trim().min(1).max(200), score: gradeSchema, comment: z.string().trim().max(2000).default('') }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Réservé au formateur de ce cours');
    const enrollment = await c.get('enrollment:' + d.courseId + '__' + d.studentUsername);
    if (!enrollment || enrollment.status !== 'approved') throw new HttpsError('failed-precondition', 'Cet élève n’est pas inscrit à ce cours');
    await c.get('user:' + d.studentUsername);
    const ts = Date.now();
    c.set('examresult:' + d.courseId + '__' + d.studentUsername + '__' + ts, { courseId: d.courseId, studentUsername: d.studentUsername, examTitle: d.examTitle, score: d.score, comment: d.comment, createdAt: new Date(ts).toISOString() }, 'server');
    c.notify(d.studentUsername, 'exam_result', d.username, d.courseId, d.examTitle + '|' + d.score);
    return result(c);
  });
});

/* ==================== QUIZ & EXAMENS (bonnes réponses dans course_answers/, jamais lisibles) ==================== */

const answersRef = (kind: 'quiz' | 'fullexam', id: string) => db().doc(`course_answers/${kind}__${encodeId(id)}`);

/** createCourseQuiz l. 18565-18580 : le doc `quiz:` ne contient plus `correctIndex` (stocké dans course_answers). */
export const createQuiz = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, title: z.string().trim().min(1).max(200), question: z.string().trim().min(1).max(2000), options: z.array(z.string().trim().min(1).max(500)).min(2, 'Renseignez le titre, la question, et au moins 2 options').max(4), correctIndex: z.number().int().min(0) }), req.data);
  await requireUsername(req, d.username);
  if (d.correctIndex >= d.options.length) throw new HttpsError('invalid-argument', 'La bonne réponse doit correspondre à une option renseignée');
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
    const ts = Date.now();
    const qid = 'quiz_' + d.courseId + '__' + ts;
    c.set('quiz:' + d.courseId + '__' + ts, { id: qid, courseId: d.courseId, title: d.title, question: d.question, options: d.options, createdAt: new Date(ts).toISOString() }, 'server');
    c.tx.set(answersRef('quiz', qid), { courseId: d.courseId, correctIndex: d.correctIndex, createdAt: new Date(ts).toISOString() });
    return result(c, { quizId: qid });
  });
});
/** submitQuizAnswer l. 18625-18634 : correction serveur ; l'élève doit avoir accès (inscription approuvée ou abonnement actif). */
export const answerQuiz = onCall(opts, async (req) => {
  const d = parse(z.object({ username, quizId: id, courseId: id, selectedIndex: z.number().int().min(0).max(3) }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const answers = (await c.tx.get(answersRef('quiz', d.quizId))).data();
    if (!answers) throw new HttpsError('not-found', 'Quiz introuvable');
    const me = await c.get('user:' + d.username);
    const sub = await c.get('edusubscription:' + d.username);
    if (!isEduSubActive(me, sub)) throw new HttpsError('permission-denied', 'Votre abonnement Espace Éducation a expiré ou n’a pas encore été activé');
    const correct = d.selectedIndex === answers.correctIndex;
    // `correctIndex` est révélé dans la copie une fois répondu (affichage l. 18611-18618), jamais dans le doc `quiz:`.
    c.set('quizsubmission:' + d.quizId + '__' + d.username, { quizId: d.quizId, courseId: d.courseId, studentUsername: d.username, selectedIndex: d.selectedIndex, correct, correctIndex: answers.correctIndex, createdAt: nowIso() }, 'server');
    return result(c, { correct, correctIndex: answers.correctIndex });
  });
});
/** Bonnes réponses d'un cours pour ses gestionnaires seulement (affichages formateur l. 18595-18598 et l. 18276-18283). */
export const courseAnswers = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id }), req.data);
  await requireUsername(req, d.username);
  const course = await kvGet('course:' + d.courseId);
  if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
  const snap = await db().collection('course_answers').where('courseId', '==', d.courseId).get();
  const quiz: Record<string, number> = {}, fullexam: Record<string, (number | null)[]> = {};
  for (const doc of snap.docs) {
    const [kind, ...rest] = doc.id.split('__');
    const key = rest.join('__').replace(/%5F/g, '_').replace(/%2E/g, '.').replace(/%2F/g, '/').replace(/%25/g, '%');
    if (kind === 'quiz') quiz[key] = doc.data().correctIndex; else if (kind === 'fullexam') fullexam[key] = doc.data().correctIndexes;
  }
  return { ok: true, touched: [], quiz, fullexam };
});
/** publishFullExam l. 18370-18385 : `questions[].correctIndex` retiré du doc public. */
export const publishFullExam = onCall(opts, async (req) => {
  const q = z.discriminatedUnion('type', [
    z.object({ type: z.literal('qcm'), question: z.string().trim().min(1).max(2000), options: z.array(z.string().trim().min(1).max(500)).min(2, 'Renseignez au moins 2 options pour un QCM').max(4), correctIndex: z.number().int().min(0) }),
    z.object({ type: z.literal('open'), question: z.string().trim().min(1).max(2000) }),
  ]);
  const d = parse(z.object({ username, courseId: id, title: z.string().trim().min(1, 'Donnez un titre à l’examen').max(200), description: z.string().trim().max(5000).default(''), questions: z.array(q).min(1, 'Ajoutez au moins une question').max(100) }), req.data);
  await requireUsername(req, d.username);
  for (const qq of d.questions) if (qq.type === 'qcm' && qq.correctIndex >= qq.options.length) throw new HttpsError('invalid-argument', 'La bonne réponse choisie n’a pas de texte renseigné');
  return run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Cours introuvable');
    const eid = 'fullexam_' + Date.now();
    const questions = d.questions.map((qq) => (qq.type === 'qcm' ? { type: 'qcm', question: qq.question, options: qq.options } : { type: 'open', question: qq.question }));
    c.set('fullexam:' + d.courseId + '__' + eid, { id: eid, courseId: d.courseId, title: d.title, description: d.description, questions, createdAt: nowIso() }, 'server');
    c.tx.set(answersRef('fullexam', eid), { courseId: d.courseId, correctIndexes: d.questions.map((qq) => (qq.type === 'qcm' ? qq.correctIndex : null)), createdAt: nowIso() });
    return result(c, { examId: eid });
  });
});
/** submitFullExam l. 18519-18545 : copie de l'élève + pré-correction QCM serveur (`qcmAutoScore`/`qcmCount`, l. 18276-18283). */
export const takeFullExam = onCall(opts, async (req) => {
  const a = z.discriminatedUnion('type', [
    z.object({ type: z.literal('qcm'), selectedIndex: z.number().int().min(0).max(3).nullable() }),
    z.object({ type: z.literal('open'), text: z.string().trim().max(20000) }),
  ]);
  const d = parse(z.object({ username, examId: id, courseId: id, answers: z.array(a).min(1).max(100) }), req.data);
  await requireUsername(req, d.username);
  if (d.answers.some((x) => (x.type === 'qcm' && x.selectedIndex === null) || (x.type === 'open' && !x.text))) throw new HttpsError('invalid-argument', 'Répondez à toutes les questions avant d’envoyer');
  return run(async (c) => {
    const exam = await c.get('fullexam:' + d.courseId + '__' + d.examId);
    if (!exam) throw new HttpsError('not-found', 'Examen introuvable');
    const enrollment = await c.get('enrollment:' + d.courseId + '__' + d.username);
    if (!enrollment || enrollment.status !== 'approved') throw new HttpsError('permission-denied', 'Vous n’êtes pas inscrit(e) à ce cours');
    const existing = await c.get('fullexamsubmission:' + d.examId + '__' + d.username);
    if (existing) throw new HttpsError('already-exists', 'Copie déjà envoyée');
    const answers = (await c.tx.get(answersRef('fullexam', d.examId))).data();
    const { qcmAutoScore, qcmCount } = answers ? scoreQcm(answers.correctIndexes, d.answers as any) : { qcmAutoScore: 0, qcmCount: 0 };
    c.set('fullexamsubmission:' + d.examId + '__' + d.username, { examId: d.examId, courseId: d.courseId, studentUsername: d.username, answers: d.answers, status: 'submitted', totalScore: null, qcmAutoScore, qcmCount, createdAt: nowIso() }, 'server');
    return result(c);
  });
});

/* ==================== ATTESTATIONS ==================== */

/** openCourseCertificate l. 20653-20701 : moyenne, présence, seuils du cours ; émission du code SG- et `user.isAlumnus` (ensureCertificateVerificationCode l. 20575-20592). */
export const issueCertificate = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id }), req.data);
  await requireUsername(req, d.username);
  const course = await kvGet('course:' + d.courseId);
  const enrollment = await kvGet('enrollment:' + d.courseId + '__' + d.username);
  if (!course || !enrollment || enrollment.status !== 'approved') return { ok: true, touched: [], available: false };
  const exercises = await readAll(await kvList('exercise:' + d.courseId + '__'));
  const grades: number[] = [];
  for (const ex of exercises) { if (!ex) continue; const sub = await kvGet('submission:' + ex.id + '__' + d.username); if (sub && sub.status === 'graded') grades.push(sub.score); }
  for (const r of await readAll(await kvList('examresult:' + d.courseId + '__' + d.username + '__'))) if (r) grades.push(r.score);
  const trainerSessions = (await kvQuery('conferenceattendance', [['trainerUsername', course.trainerUsername]])).map((x) => x.data);
  const { average, attendanceRate, missingReasons } = certificateEligibility(course, grades, trainerSessions, d.username);
  if (missingReasons.length > 0) return { ok: true, touched: [], available: false, missingReasons, average, attendanceRate };
  const out = await run(async (c) => {
    const lookupKey = 'certcodelookup:' + d.courseId + '__' + d.username;
    const existing = await c.get<string>(lookupKey);
    const student = await c.get('user:' + d.username);
    if (existing) return result(c, { code: existing });
    const code = certificateCode(d.courseId, d.username, Date.now());
    c.set(lookupKey, code, 'server');
    c.set('certverification:' + code, { code, studentUsername: d.username, courseId: d.courseId, courseTitle: course.title, trainerUsername: course.trainerUsername, average, issuedAt: nowIso() }, 'server');
    if (student && !student.isAlumnus) { student.isAlumnus = true; c.set('user:' + d.username, student); }
    return result(c, { code });
  });
  return { ...out, available: true, average, attendanceRate, courseTitle: course.title, trainerUsername: course.trainerUsername };
});

/* ==================== BADGES ==================== */

/** awardStudentBadge l. 18325-18337 : formateur du cours, élève inscrit approuvé, notification + journal. */
export const awardBadge = onCall(opts, async (req) => {
  const d = parse(z.object({ username, courseId: id, studentUsername: username, badgeName: z.string().trim().min(1, 'Choisissez un élève et un badge').max(100), message: z.string().trim().max(1000).default('') }), req.data);
  await requireUsername(req, d.username);
  const out = await run(async (c) => {
    const course = await c.get('course:' + d.courseId);
    if (!canManageCourse(course, d.username)) throw new HttpsError('permission-denied', 'Réservé au formateur de ce cours');
    const enrollment = await c.get('enrollment:' + d.courseId + '__' + d.studentUsername);
    if (!enrollment || enrollment.status !== 'approved') throw new HttpsError('failed-precondition', 'Cet élève n’est pas inscrit à ce cours');
    await c.get('user:' + d.studentUsername);
    const ts = Date.now();
    c.set('badge:' + d.courseId + '__' + d.studentUsername + '__' + ts, { courseId: d.courseId, trainerUsername: d.username, studentUsername: d.studentUsername, badgeName: d.badgeName, message: d.message, createdAt: new Date(ts).toISOString() }, 'server');
    c.notify(d.studentUsername, 'badge_awarded', d.username, null, d.badgeName);
    return result(c);
  });
  await audit(d.username, 'Formateur', 'Badge décerné', '@' + d.username + ' → @' + d.studentUsername + ' : ' + d.badgeName);
  return out;
});

/* ==================== PARENT / TUTEUR ==================== */

/** requestParentLink l. 20140-20155. */
export const requestParentLink = onCall(opts, async (req) => {
  const d = parse(z.object({ username, studentUsername: username }), req.data);
  await requireUsername(req, d.username);
  if (d.studentUsername === d.username) throw new HttpsError('invalid-argument', 'Vous ne pouvez pas vous suivre vous-même');
  const pending = await kvQuery('parentlinkrequest', [['parentUsername', d.username], ['studentUsername', d.studentUsername], ['status', 'pending']]);
  return run(async (c) => {
    const student = await c.get('user:' + d.studentUsername);
    if (!student) throw new HttpsError('not-found', 'Ce compte n’existe pas');
    if (await c.get('parentlink:' + d.username + '__' + d.studentUsername)) throw new HttpsError('already-exists', 'Déjà lié à cet élève');
    if (pending.length > 0) throw new HttpsError('already-exists', 'Une demande est déjà en attente pour cet élève');
    const rid = 'parentreq_' + Date.now();
    c.set('parentlinkrequest:' + rid, { id: rid, parentUsername: d.username, studentUsername: d.studentUsername, status: 'pending', createdAt: nowIso() }, 'server');
    c.notify(d.studentUsername, 'parent_link_request', d.username, rid, '');
    return result(c, { requestId: rid });
  });
});
/** approveParentLink l. 20204-20214 / rejectParentLink l. 20215-20220 : seul l'élève visé répond. */
export const respondParentLink = onCall(opts, async (req) => {
  const d = parse(z.object({ username, storageKey: key('parentlinkrequest'), approve: z.boolean() }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const r = await c.get(d.storageKey);
    if (!r) return result(c, { found: false });
    if (r.studentUsername !== d.username) throw new HttpsError('permission-denied', 'Cette demande ne vous concerne pas');
    await c.get('user:' + r.parentUsername);
    r.status = d.approve ? 'approved' : 'rejected';
    c.set(d.storageKey, r);
    if (d.approve) {
      c.set('parentlink:' + r.parentUsername + '__' + r.studentUsername, { parentUsername: r.parentUsername, studentUsername: r.studentUsername, approved: true, createdAt: nowIso() }, 'server');
      c.notify(r.parentUsername, 'parent_link_approved', d.username, null, '');
    }
    return result(c, { found: true });
  });
});
/** toggleRestrictedMode l. 20163-20169 : seul un parent au lien approuvé. */
export const toggleRestrictedMode = onCall(opts, async (req) => {
  const d = parse(z.object({ username, studentUsername: username, enabled: z.boolean() }), req.data);
  await requireUsername(req, d.username);
  return run(async (c) => {
    const link = await c.get('parentlink:' + d.username + '__' + d.studentUsername);
    if (!link || !link.approved) throw new HttpsError('permission-denied', 'Lien parent-enfant non approuvé');
    await c.get('user:' + d.studentUsername);
    c.set('restrictedmode:' + d.studentUsername, d.enabled, 'server');
    c.notify(d.studentUsername, 'restricted_mode_changed', d.username, null, d.enabled ? 'activé' : 'désactivé');
    return result(c, { enabled: d.enabled });
  });
});
