// Domaine social (phase 06) : toutes les écritures croisées (un utilisateur modifie le document d'un autre) passent ici,
// en transaction sur le document legacy (forme `post:`, `user:`, `notif:`… inchangée ; sous-collections en phase 08).
// Chaque callable : zod → requireUsername(currentUser) → transaction → { ok, touched, … }.
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION, db, kvGet, kvSet, kvRef, kvDelete, encodeId, requireAuth, requireUsername, requireRole, audit, setting, nowIso, genId } from '../lib/kv.js';
import * as L from './logic.js';

const username = z.string().min(1).max(60);
const id = z.string().min(1).max(200);
const base = { currentUser: username };
type Req = CallableRequest;

// ---------- Helpers ----------
async function uidOf(name: string): Promise<string | null> {
  const snap = await db().doc(`usernames/${name.toLowerCase()}`).get();
  return snap.exists ? (snap.data()!.uid as string) : null;
}
/** Écriture hors transaction, attendue (kvSet sans tx n'attend pas). */
async function putServer(key: string, data: unknown): Promise<void> {
  await kvRef(key).set({ data, owner: 'server', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
/** Préférence privée d'un utilisateur (users/{uid}/private/<clé encodée>) — lue par l'Admin SDK, jamais par un autre client. */
async function privatePref(name: string, key: string): Promise<any> {
  const uid = await uidOf(name);
  if (!uid) return null;
  const snap = await db().collection(`users/${uid}/private`).doc(encodeId(key)).get();
  return snap.exists ? snap.data()!.data : null;
}
/** createNotification l. 11452-11459 : respecte notificationPreferences du destinataire, forme notif: identique. Renvoie la clé ou null. */
async function sendNotification(toUser: string, type: string, fromUser: string, postId?: string | null, text?: string | null): Promise<string | null> {
  if (toUser === fromUser) return null;
  const target = await kvGet<L.User>('user:' + toUser);
  if (!L.notificationAllowed(toUser, fromUser, type, target)) return null;
  const nid = genId('notif');
  await putServer('notif:' + nid, L.buildNotification(nid, toUser, type, fromUser, postId, text, nowIso()));
  return 'notif:' + nid;
}
/** notifyMentions l. 11463-11476 : candidats `@nom` vérifiés par existence du compte (insensible à la casse via usernames/). */
async function notifyMentions(text: string, fromUser: string, postId: string): Promise<string[]> {
  const touched: string[] = [];
  const seen = new Set<string>();
  for (const cand of L.mentionCandidates(text)) {
    let canonical: string | null = null;
    if (await kvGet('user:' + cand)) canonical = cand;
    else { const snap = await db().doc(`usernames/${cand.toLowerCase()}`).get(); if (snap.exists) canonical = snap.data()!.username as string; }
    if (!canonical || seen.has(canonical) || !L.mentionMatches(text, canonical)) continue;
    seen.add(canonical);
    const k = await sendNotification(canonical, 'mention', fromUser, postId, text);
    if (k) touched.push(k);
  }
  return touched;
}
async function getPost(postId: string, tx: Transaction): Promise<L.Post> {
  const p = await kvGet<L.Post>('post:' + postId, tx);
  if (!p) throw new HttpsError('not-found', 'Publication introuvable.');
  return p;
}
const ok = (touched: string[], extra: Record<string, unknown> = {}) => ({ ok: true, touched, ...extra });

// ---------- Publications : like / dislike / réaction ----------
const postSchema = z.object({ ...base, postId: id });

/** toggleLike l. 14283-14303 (+ checkActiveMemberBadge l. 22067). */
export const toggleLike = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId } = postSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const liked = L.applyToggleLike(p, currentUser);
    kvSet('post:' + postId, p, tx);
    return { liked, author: p.userId };
  });
  const touched = ['post:' + postId];
  if (r.liked) { const k = await sendNotification(r.author, 'like', currentUser, postId); if (k) touched.push(k); }
  touched.push(...await checkActiveMemberBadge(r.author));
  return ok(touched, { liked: r.liked });
});
/** toggleDislike l. 13830-13840. */
export const toggleDislike = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId } = postSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const disliked = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const d = L.applyToggleDislike(p, currentUser);
    kvSet('post:' + postId, p, tx);
    return d;
  });
  return ok(['post:' + postId], { disliked });
});
/** selectReaction l. 14264-14275. */
export const setReaction = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, emoji } = postSchema.extend({ emoji: z.enum(L.QUICK_REACTION_EMOJIS as [string, ...string[]]) }).parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const set = L.applyReaction(p, currentUser, emoji);
    kvSet('post:' + postId, p, tx);
    return { set, author: p.userId };
  });
  const touched = ['post:' + postId];
  if (r.set) { const k = await sendNotification(r.author, 'reaction', currentUser, postId, emoji); if (k) touched.push(k); }
  return ok(touched, { set: r.set });
});
/** checkActiveMemberBadge l. 22067-22083 : ≥ 10 publications et ≥ 100 likes reçus (badge par palier, écrit serveur). */
async function checkActiveMemberBadge(author: string): Promise<string[]> {
  const snap = await db().collection('kv_post').where('data.userId', '==', author).get();
  const published = snap.docs.map((d) => d.data().data as L.Post).filter((p) => p.status === 'published');
  if (published.length < L.ACTIVE_MEMBER_MIN_POSTS) return [];
  const change = await db().runTransaction(async (tx) => {
    const u = await kvGet<L.User>('user:' + author, tx);
    if (!u) return null;
    const c = L.activeMemberBadgeChange(u, published);
    if (c) kvSet('user:' + author, u, tx);
    return c;
  });
  if (!change) return [];
  const touched = ['user:' + author];
  if (change === 'granted') { const k = await sendNotification(author, 'active_member_badge', 'Suktum', null, null); if (k) touched.push(k); }
  return touched;
}

// ---------- Favoris / à regarder plus tard (forme legacy conservée : tableaux dans le post) ----------
/** toggleFavorite l. 13874-13884. */
export const toggleFavorite = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId } = postSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const added = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (!p.favoritedBy) p.favoritedBy = [];
    const a = L.toggleIn(p.favoritedBy, currentUser);
    kvSet('post:' + postId, p, tx);
    return a;
  });
  return ok(['post:' + postId], { added });
});
/** toggleWatchLater l. 13847-13858. */
export const toggleWatchLater = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId } = postSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const added = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (!p.watchLaterBy) p.watchLaterBy = [];
    const a = L.toggleIn(p.watchLaterBy, currentUser);
    kvSet('post:' + postId, p, tx);
    return a;
  });
  return ok(['post:' + postId], { added });
});

// ---------- Vues ----------
/** recordPostView l. 13260-13263 (views, viewedBy) et recordQualifiedView l. 10767 (qualifiedViews). Visiteur sans nom : compte la vue seulement. */
export const recordView = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, qualified } = z.object({ currentUser: username.nullable().optional(), postId: id, qualified: z.boolean().optional() }).parse(req.data);
  const viewer = currentUser ? (await requireUsername(req, currentUser), currentUser) : (requireAuth(req), null);
  await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    L.applyView(p, viewer, !!qualified);
    kvSet('post:' + postId, p, tx);
  });
  return ok(['post:' + postId]);
});

// ---------- Commentaires ----------
const commentText = z.string().max(2000);
/** addComment l. 14945-14954 + canUserCommentOnPost l. 14930 + filtre de mots l. 15170-15179. Renvoie { allowed, reason?, pending } comme le legacy. */
export const addComment = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, text, replyToIndex, imageData, sticker } = postSchema.extend({
    text: commentText.default(''), replyToIndex: z.number().int().min(0).nullable().optional(),
    imageData: z.string().max(2_000_000).nullable().optional(), sticker: z.string().max(16).nullable().optional(),
  }).parse(req.data);
  await requireUsername(req, currentUser);
  if (!text && !imageData && !sticker) throw new HttpsError('invalid-argument', 'Commentaire vide');
  const platformWords = (await setting<string[]>('forbiddenWords', [])) || [];
  const r = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const owner = await kvGet<L.User>('user:' + p.userId, tx);
    const me = currentUser === p.userId ? owner : await kvGet<L.User>('user:' + currentUser, tx);
    const check = L.canComment(p, currentUser, owner, L.blockedEitherWay(me, owner, currentUser, p.userId));
    if (!check.allowed) return { allowed: false as const, reason: check.reason! };
    const bad = L.commentWordFilter(text, platformWords, (owner && owner.myBlockedCommentWords) || []);
    if (bad) return { allowed: false as const, reason: bad };
    const { pending } = L.appendComment(p, currentUser, text, replyToIndex ?? null, imageData ?? null, sticker ?? null, nowIso());
    kvSet('post:' + postId, p, tx);
    const replyTo = replyToIndex !== undefined && replyToIndex !== null && p.comments![replyToIndex] ? p.comments![replyToIndex].user : null;
    return { allowed: true as const, pending, author: p.userId, replyTo };
  });
  if (!r.allowed) return ok([], { allowed: false, reason: r.reason });
  const touched = ['post:' + postId];
  if (!r.pending) {
    // l. 14950-14953 : réponse → auteur du commentaire parent, sinon auteur de la publication ; puis mentions.
    const k = r.replyTo && r.replyTo !== currentUser
      ? await sendNotification(r.replyTo, 'commentreply', currentUser, postId)
      : await sendNotification(r.author, 'comment', currentUser, postId);
    if (k) touched.push(k);
    touched.push(...await notifyMentions(text, currentUser, postId));
  }
  return ok(touched, { allowed: true, pending: r.pending });
});
const commentRef = postSchema.extend({ index: z.number().int().min(0) });
/** deleteOwnComment l. 14822-14830 (auteur du commentaire) et rejectPendingComment l. 14812-14818 (auteur de la publication, commentaire en attente). */
export const deleteComment = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, index } = commentRef.parse(req.data);
  await requireUsername(req, currentUser);
  await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const c = p.comments && p.comments[index];
    if (!c) throw new HttpsError('not-found', 'Commentaire introuvable');
    const own = c.user === currentUser, ownerReject = p.userId === currentUser && c.status === 'pending';
    if (!own && !ownerReject) throw new HttpsError('permission-denied', 'Vous ne pouvez pas supprimer ce commentaire');
    L.spliceComment(p, index);
    kvSet('post:' + postId, p, tx);
  });
  return ok(['post:' + postId]);
});
/** approvePendingComment l. 14797-14810 (auteur de la publication) + notifications différées. */
export const approveComment = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, index } = commentRef.parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (p.userId !== currentUser) throw new HttpsError('permission-denied', 'Réservé à l’auteur de la publication');
    const c = p.comments && p.comments[index];
    if (!c || c.status !== 'pending') throw new HttpsError('failed-precondition', 'Ce commentaire n’est pas en attente');
    c.status = 'approved';
    kvSet('post:' + postId, p, tx);
    const parent = c.replyToIndex !== undefined && c.replyToIndex !== null ? p.comments![c.replyToIndex] : null;
    return { c, parentUser: parent && parent.user !== c.user ? parent.user : null };
  });
  const touched = ['post:' + postId];
  const excerpt = (r.c.text || '').slice(0, 60);
  const k = r.parentUser ? await sendNotification(r.parentUser, 'commentreply', r.c.user, postId, excerpt) : await sendNotification(currentUser, 'comment', r.c.user, postId, excerpt);
  if (k) touched.push(k);
  touched.push(...await notifyMentions(r.c.text || '', r.c.user, postId));
  return ok(touched);
});
/** togglePinComment l. 14770-14775 (auteur de la publication). */
export const pinComment = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, index } = commentRef.parse(req.data);
  await requireUsername(req, currentUser);
  const pinned = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (p.userId !== currentUser) throw new HttpsError('permission-denied', 'Réservé à l’auteur de la publication');
    p.pinnedCommentIndex = p.pinnedCommentIndex === index ? null : index;
    kvSet('post:' + postId, p, tx);
    return p.pinnedCommentIndex === index;
  });
  return ok(['post:' + postId], { pinned });
});
/** saveEditComment l. 14842-14852 (auteur du commentaire). */
export const editComment = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, index, text } = commentRef.extend({ text: commentText.min(1) }).parse(req.data);
  await requireUsername(req, currentUser);
  await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const c = p.comments && p.comments[index];
    if (!c || c.user !== currentUser) throw new HttpsError('permission-denied', 'Vous ne pouvez pas modifier ce commentaire');
    c.text = text; c.edited = true;
    kvSet('post:' + postId, p, tx);
  });
  return ok(['post:' + postId]);
});
async function commentVote(req: Req, kind: 'like' | 'dislike') {
  const { currentUser, postId, index } = commentRef.parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    const c = p.comments && p.comments[index];
    if (!c) throw new HttpsError('not-found', 'Commentaire introuvable');
    const now = L.applyCommentVote(c, currentUser, kind);
    kvSet('post:' + postId, p, tx);
    return { now, commenter: c.user };
  });
  const touched = ['post:' + postId];
  if (kind === 'like' && r.now && r.commenter !== currentUser) { const k = await sendNotification(r.commenter, 'commentlike', currentUser, postId); if (k) touched.push(k); }
  return ok(touched, { [kind === 'like' ? 'liked' : 'disliked']: r.now });
}
/** toggleCommentLike l. 14730-14746. */
export const toggleCommentLike = onCall({ region: REGION }, (req: Req) => commentVote(req, 'like'));
/** toggleCommentDislike l. 14749-14765. */
export const toggleCommentDislike = onCall({ region: REGION }, (req: Req) => commentVote(req, 'dislike'));

// ---------- Sondage sur publication, co-création ----------
/** voteOnPostPoll l. 33259-33266. */
export const votePostPoll = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, optionIndex } = postSchema.extend({ optionIndex: z.number().int().min(0).max(1) }).parse(req.data);
  await requireUsername(req, currentUser);
  const status = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (!p.poll) throw new HttpsError('failed-precondition', 'Cette publication n’a pas de sondage');
    const s = L.applyPostPollVote(p, currentUser, optionIndex);
    if (s === 'voted') kvSet('post:' + postId, p, tx);
    return s;
  });
  return ok(status === 'voted' ? ['post:' + postId] : [], { status });
});
/** acceptCoCreatorInvite / declineCoCreatorInvite l. 15080-15095. */
export const respondCoCreator = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, postId, accept } = postSchema.extend({ accept: z.boolean() }).parse(req.data);
  await requireUsername(req, currentUser);
  const author = await db().runTransaction(async (tx) => {
    const p = await getPost(postId, tx);
    if (p.coCreatorUsername !== currentUser) throw new HttpsError('permission-denied', 'Cette invitation ne vous est pas destinée');
    p.coCreatorStatus = accept ? 'accepted' : 'declined';
    kvSet('post:' + postId, p, tx);
    return p.userId;
  });
  const touched = ['post:' + postId];
  if (accept) { const k = await sendNotification(author, 'co_creator_accepted', currentUser, postId, null); if (k) touched.push(k); }
  return ok(touched, { status: accept ? 'accepted' : 'declined' });
});

// ---------- Abonnements, blocage, parrainage, activité précoce ----------
/** toggleFollow l. 13579-13603 ; `ensure` = createFollowRelationship l. 13529-13537 (ne retire jamais). Palier 1M l. 13539. */
export const toggleFollow = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, target, sourcePostId, ensure } = z.object({ ...base, target: username, sourcePostId: id.nullable().optional(), ensure: z.boolean().optional() }).parse(req.data);
  await requireUsername(req, currentUser);
  if (target === currentUser) throw new HttpsError('invalid-argument', 'Vous ne pouvez pas vous abonner à vous-même');
  const now = nowIso();
  const r = await db().runTransaction(async (tx) => {
    const t = await kvGet<L.User>('user:' + target, tx);
    const me = await kvGet<L.User>('user:' + currentUser, tx);
    if (!t || !me) throw new HttpsError('not-found', 'Compte introuvable');
    const res = L.applyFollow(t, me, currentUser, target, !!ensure);
    if (!res.changed) return { ...res, million: false, touched: [] as string[] };
    const touched = ['user:' + target, 'user:' + currentUser];
    const million = res.following && L.reachesMillion(t, now);
    kvSet('user:' + target, t, tx);
    kvSet('user:' + currentUser, me, tx);
    if (res.following) {
      if (sourcePostId) { kvSet('followsource:' + target + '__' + currentUser, { sourcePostId, followedAt: now }, tx, 'server'); touched.push('followsource:' + target + '__' + currentUser); }
    } else {
      kvDelete('followsource:' + target + '__' + currentUser, tx);
      kvDelete('sharedfeed:' + [currentUser, target].sort().join('__'), tx); // l. 13593-13594 (threadKeyFor)
      touched.push('followsource:' + target + '__' + currentUser, 'sharedfeed:' + [currentUser, target].sort().join('__'));
    }
    return { ...res, million, touched };
  });
  const touched = [...r.touched];
  if (r.changed && r.following) {
    const k = await sendNotification(target, 'follow', currentUser); if (k) touched.push(k);
    if (r.million) {
      const m = await sendNotification(target, 'milestone_1m', 'Suktum', null, null); if (m) touched.push(m);
      await audit('Suktum (système)', 'system', '🏆 Nouveau membre du club 1 million d’abonnés', '@' + target);
    }
  }
  return ok(touched, { following: r.following });
});
/** toggleBlockUser l. 16240-16265 : blocage/déblocage, rupture des abonnements, `blockevent:` (le pic de blocages est traité par le domaine modération). */
export const blockUser = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, target } = z.object({ ...base, target: username }).parse(req.data);
  await requireUsername(req, currentUser);
  if (target === currentUser) throw new HttpsError('invalid-argument', 'Vous ne pouvez pas vous bloquer vous-même');
  const now = nowIso();
  const r = await db().runTransaction(async (tx) => {
    const me = (await kvGet<L.User>('user:' + currentUser, tx)) || { username: currentUser, createdAt: now };
    const them = await kvGet<L.User>('user:' + target, tx);
    const blocked = L.applyBlock(me, them, currentUser, target);
    const touched = ['user:' + currentUser];
    kvSet('user:' + currentUser, me, tx, (await uidOf(currentUser)) || undefined);
    if (blocked) {
      if (them) { kvSet('user:' + target, them, tx); touched.push('user:' + target); }
      kvDelete('sharedfeed:' + [currentUser, target].sort().join('__'), tx);
      const ek = 'blockevent:' + target + '__' + Date.now();
      kvSet(ek, { blockedUser: target, blockerUser: currentUser, createdAt: now }, tx, 'server');
      touched.push('sharedfeed:' + [currentUser, target].sort().join('__'), ek);
    }
    return { blocked, touched };
  });
  return ok(r.touched, { blocked: r.blocked });
});
/** Parrainage l. 7862-7867 : referralCount du parrain, points de fidélité (settings:referralRewardPoints, défaut 10), notification `referral`. */
export const applyReferral = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, referralCode } = z.object({ ...base, referralCode: username }).parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const me = await kvGet<L.User>('user:' + currentUser, tx);
    const referrer = await kvGet<L.User>('user:' + referralCode, tx);
    const err = L.referralCheck(me, referrer, currentUser, referralCode, Date.now());
    if (err) throw new HttpsError('failed-precondition', err);
    const points = L.referralPoints(await kvGet('settings:referralRewardPoints', tx));
    const current = Number((await kvGet<number>('loyaltypoints:' + referralCode, tx)) || 0);
    referrer!.referralCount = (referrer!.referralCount || 0) + 1;
    me!.referredBy = referralCode; me!.referralAppliedAt = nowIso();
    kvSet('user:' + referralCode, referrer, tx);
    kvSet('user:' + currentUser, me, tx);
    const touched = ['user:' + referralCode, 'user:' + currentUser];
    if (points > 0) { kvSet('loyaltypoints:' + referralCode, current + points, tx, 'server'); touched.push('loyaltypoints:' + referralCode); }
    return { points, touched };
  });
  const k = await sendNotification(referralCode, 'referral', currentUser, null, String(r.points));
  if (k) r.touched.push(k);
  return ok(r.touched, { points: r.points });
});
/** trackEarlyActivity l. 24742-24749 (compte appelant uniquement). */
export const trackEarlyActivity = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser } = z.object(base).parse(req.data);
  await requireUsername(req, currentUser);
  const counted = await db().runTransaction(async (tx) => {
    const u = await kvGet<L.User>('user:' + currentUser, tx);
    if (!u) return false;
    const c = L.applyEarlyActivity(u, Date.now());
    if (c) kvSet('user:' + currentUser, u, tx);
    return c;
  });
  return ok(counted ? ['user:' + currentUser] : [], { counted });
});

// ---------- Notifications ----------
/** createNotification l. 11452-11459 exposée au client : fromUser = compte appelant (ou rôle équipe pour les envois « Suktum »). */
export const notify = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, toUser, type, fromUser, postId, text } = z.object({ ...base, toUser: username, type: z.string().min(1).max(60), fromUser: username.optional(), postId: id.nullable().optional(), text: z.string().max(2000).nullable().optional() }).parse(req.data);
  await requireUsername(req, currentUser);
  const from = fromUser || currentUser;
  if (from !== currentUser) requireRole(req, ['superadmin', 'dg', 'moderator', 'payouts', 'techteam']);
  const k = await sendNotification(toUser, type, from, postId, text);
  return ok(k ? [k] : [], { sent: !!k });
});
/** notifyFollowersOfNewPost l. 13780-13788, notifyFollowersOfNewLive l. 13761-13768, notifyFollowersOfScheduledLive l. 24075 :
 *  fan-out serveur qui lit la préférence privée de chaque abonné (postnotifypref / livenotifypref). */
async function fanOutToFollowers(author: string, kind: 'post' | 'live' | 'live_scheduled', targetId: string): Promise<string[]> {
  const a = await kvGet<L.User>('user:' + author);
  if (!a || !a.followers || a.followers.length === 0) return [];
  const prefPrefix = kind === 'post' ? 'postnotifypref:' : 'livenotifypref:';
  const type = kind === 'post' ? 'new_post' : kind === 'live' ? 'live_start' : 'live_scheduled';
  const touched: string[] = [];
  for (const follower of a.followers) {
    const pref = await privatePref(follower, prefPrefix + follower + '__' + author);
    const notifyAll = !pref || pref.notifyAll !== false;
    if (!notifyAll) continue;
    const k = await sendNotification(follower, type, author, targetId, null);
    if (k) touched.push(k);
  }
  return touched;
}
export const notifyFollowers = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, kind, id: targetId } = z.object({ ...base, kind: z.enum(['post', 'live', 'live_scheduled']), id }).parse(req.data);
  await requireUsername(req, currentUser);
  const touched: string[] = [];
  let author: string;
  if (kind === 'post') {
    const p = await kvGet<L.Post>('post:' + targetId);
    if (!p) throw new HttpsError('not-found', 'Publication introuvable.');
    if (p.userId !== currentUser) throw new HttpsError('permission-denied', 'Cette publication ne vous appartient pas');
    author = p.userId;
    // l. 13781 : l'activité précoce de l'auteur est comptée à chaque publication.
    const counted = await db().runTransaction(async (tx) => { const u = await kvGet<L.User>('user:' + author, tx); if (!u) return false; const c = L.applyEarlyActivity(u, Date.now()); if (c) kvSet('user:' + author, u, tx); return c; });
    if (counted) touched.push('user:' + author);
  } else {
    const l = await kvGet<{ username: string }>('live:' + targetId);
    if (!l) throw new HttpsError('not-found', 'Live introuvable');
    if (l.username !== currentUser) requireRole(req, ['superadmin', 'dg', 'moderator']); // validation d'un live par l'équipe (l. 25022)
    author = l.username;
  }
  touched.push(...await fanOutToFollowers(author, kind, targetId));
  return ok(touched, { notified: touched.filter((k) => k.startsWith('notif:')).length });
});

// ---------- Stories ----------
/** showCurrentStory l. 11990-11994 : viewedBy. */
export const markStoryViewed = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, storyId } = z.object({ ...base, storyId: id }).parse(req.data);
  await requireUsername(req, currentUser);
  const changed = await db().runTransaction(async (tx) => {
    const s = await kvGet<{ viewedBy?: string[] }>('story:' + storyId, tx);
    if (!s) return false;
    if (!s.viewedBy) s.viewedBy = [];
    if (s.viewedBy.includes(currentUser)) return false;
    s.viewedBy.push(currentUser);
    kvSet('story:' + storyId, s, tx);
    return true;
  });
  return ok(changed ? ['story:' + storyId] : []);
});
/** markStoryQuestionAnswered l. 12077-12083 (destinataire seul). */
export const answerStoryQuestion = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, questionId } = z.object({ ...base, questionId: id }).parse(req.data);
  await requireUsername(req, currentUser);
  await db().runTransaction(async (tx) => {
    const q = await kvGet<{ toUser: string; answered?: boolean }>('storyquestion:' + questionId, tx);
    if (!q) throw new HttpsError('not-found', 'Question introuvable');
    if (q.toUser !== currentUser) throw new HttpsError('permission-denied', 'Cette question ne vous est pas destinée');
    q.answered = true;
    kvSet('storyquestion:' + questionId, q, tx);
  });
  return ok(['storyquestion:' + questionId]);
});

// ---------- Scrutins : fonctionnalités, créateur du mois, trend de la semaine, thèmes Penc, sondages communautaires ----------
const VOTE_PREFIX: Record<string, string> = { feature: 'featurevote', creator: 'creatorvote', trend: 'trendvote', penctopic: 'penctopicvote', poll: 'poll' };
/** voteForFeature l. 14556-14565, voteForCreatorOfMonth l. 14458-14467, voteForWeeklyTrend l. 14479-14488, voteForPencTopic l. 14532-14541, voteOnPoll l. 31196-31209. */
export const vote = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, kind, id: voteId, optionIndex } = z.object({ ...base, kind: z.enum(['feature', 'creator', 'trend', 'penctopic', 'poll']), id, optionIndex: z.number().int().min(0).optional() }).parse(req.data);
  await requireUsername(req, currentUser);
  const prefix = VOTE_PREFIX[kind];
  const key = prefix + ':' + voteId.replace(new RegExp('^' + prefix + ':'), ''); // le legacy passe parfois la clé complète (l. 14468 id: k)
  const r = await db().runTransaction(async (tx) => {
    const doc = await kvGet<any>(key, tx);
    if (!doc) throw new HttpsError('not-found', 'Scrutin introuvable');
    if (kind === 'poll') {
      if (optionIndex === undefined) throw new HttpsError('invalid-argument', 'Option manquante');
      const s = L.applyCommunityPollVote(doc, currentUser, optionIndex);
      if (s === 'voted') kvSet(key, doc, tx);
      return { status: s };
    }
    const voted = L.applyListVote(doc, currentUser);
    kvSet(key, doc, tx);
    return { status: voted ? 'voted' : 'removed' };
  });
  return ok(r.status === 'voted' || r.status === 'removed' ? [key] : [], { status: r.status });
});
/** nominateCreatorOfMonth l. 14444-14456 et nominateSoundForWeeklyTrend l. 14470-14478 : création de la nomination avec le premier vote. */
export const nominate = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, kind, target } = z.object({ ...base, kind: z.enum(['creator', 'trend']), target: id }).parse(req.data);
  await requireUsername(req, currentUser);
  const now = nowIso();
  if (kind === 'creator') {
    const nominee = await kvGet<L.User>('user:' + target);
    if (!nominee) throw new HttpsError('not-found', 'Ce compte n’existe pas');
    const key = 'creatorvote:' + L.monthKey() + '__' + target;
    const status = await db().runTransaction(async (tx) => {
      if (await kvGet(key, tx)) return 'exists';
      kvSet(key, { username: target, monthKey: L.monthKey(), votes: [currentUser], createdAt: now }, tx, 'server');
      return 'created';
    });
    return ok(status === 'created' ? [key] : [], { status, key });
  }
  const sound = await kvGet<{ name: string }>('sound:' + target);
  if (!sound) throw new HttpsError('not-found', 'Son introuvable');
  const key = 'trendvote:' + L.isoWeekKey() + '__' + target;
  const status = await db().runTransaction(async (tx) => {
    if (await kvGet(key, tx)) return 'exists';
    kvSet(key, { soundId: target, soundName: sound.name, weekKey: L.isoWeekKey(), votes: [currentUser], createdAt: now }, tx, 'server');
    return 'created';
  });
  return ok(status === 'created' ? [key] : [], { status, key });
});

// ---------- Événements et groupes communautaires ----------
/** toggleEventParticipation l. 31243-31253. */
export const toggleEventParticipation = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, eventId } = z.object({ ...base, eventId: id }).parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const e = await kvGet<{ organizer: string; title: string; participants: string[] }>('communityevent:' + eventId, tx);
    if (!e) throw new HttpsError('not-found', 'Événement introuvable.');
    if (!Array.isArray(e.participants)) e.participants = [];
    const joined = L.toggleIn(e.participants, currentUser);
    kvSet('communityevent:' + eventId, e, tx);
    return { joined, organizer: e.organizer, title: e.title };
  });
  const touched = ['communityevent:' + eventId];
  if (r.joined && r.organizer !== currentUser) { const k = await sendNotification(r.organizer, 'event_participation', currentUser, eventId, r.title); if (k) touched.push(k); }
  return ok(touched, { participating: r.joined });
});
/** toggleCommunityGroupMembership l. 34859-34868. */
export const toggleGroupMembership = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, groupId } = z.object({ ...base, groupId: id }).parse(req.data);
  await requireUsername(req, currentUser);
  const member = await db().runTransaction(async (tx) => {
    const g = await kvGet<{ members?: string[] }>('communitygroup:' + groupId, tx);
    if (!g) throw new HttpsError('not-found', 'Groupe introuvable');
    if (!g.members) g.members = [];
    const m = L.toggleIn(g.members, currentUser);
    kvSet('communitygroup:' + groupId, g, tx);
    return m;
  });
  return ok(['communitygroup:' + groupId], { member });
});

// ---------- Penc (salons vocaux) ----------
const pencSchema = z.object({ ...base, pencId: id });
async function getPenc(pencId: string, tx: Transaction): Promise<L.Penc> {
  const p = await kvGet<L.Penc>('penc:' + pencId, tx);
  if (!p) throw new HttpsError('not-found', 'Ce Penc est terminé');
  if (!Array.isArray(p.participants)) p.participants = [];
  return p;
}
/** openPencRoom l. 33217-33226 : participants[] + everJoined[]. Renvoie titre et hôte pour l'écran. */
export const pencJoin = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, pencId } = pencSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const r = await db().runTransaction(async (tx) => {
    const p = await getPenc(pencId, tx);
    if (!p.active) throw new HttpsError('failed-precondition', 'Ce Penc est terminé');
    const changed = L.applyPencJoin(p, currentUser);
    if (changed) kvSet('penc:' + pencId, p, tx);
    return { changed, title: p.title, host: p.host };
  });
  return ok(r.changed ? ['penc:' + pencId] : [], { title: r.title, host: r.host });
});
/** leavePencRoom l. 33383-33389. */
export const pencLeave = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, pencId } = pencSchema.parse(req.data);
  await requireUsername(req, currentUser);
  const changed = await db().runTransaction(async (tx) => {
    const p = await kvGet<L.Penc>('penc:' + pencId, tx);
    if (!p || !p.active || !Array.isArray(p.participants)) return false;
    L.applyPencLeave(p, currentUser);
    kvSet('penc:' + pencId, p, tx);
    return true;
  });
  return ok(changed ? ['penc:' + pencId] : []);
});
/** sendPencChatMessage l. 33299-33311 : filtre plateforme (settings:forbiddenWords), message dans chatMessages[]. */
export const pencMessage = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, pencId, text } = pencSchema.extend({ text: z.string().trim().min(1).max(500) }).parse(req.data);
  await requireUsername(req, currentUser);
  const words = (await setting<string[]>('forbiddenWords', [])) || [];
  if (L.containsForbiddenWord(text, words)) throw new HttpsError('failed-precondition', 'Ce message contient un mot non autorisé');
  await db().runTransaction(async (tx) => {
    const p = await getPenc(pencId, tx);
    if (!p.chatMessages) p.chatMessages = [];
    p.chatMessages.push({ user: currentUser, text, ts: nowIso() });
    kvSet('penc:' + pencId, p, tx);
  });
  return ok(['penc:' + pencId]);
});
/** kickFromPenc l. 33338-33349 et invitePencCoHost l. 33362-33379 (hôte uniquement). */
export const pencModerate = onCall({ region: REGION }, async (req: Req) => {
  const { currentUser, pencId, action, target } = pencSchema.extend({ action: z.enum(['kick', 'cohost']), target: username }).parse(req.data);
  await requireUsername(req, currentUser);
  if (action === 'cohost') {
    if (target === currentUser) throw new HttpsError('failed-precondition', 'Vous êtes déjà l’animateur');
    if (!(await kvGet('user:' + target))) throw new HttpsError('not-found', 'Ce compte n’existe pas');
  }
  const title = await db().runTransaction(async (tx) => {
    const p = await getPenc(pencId, tx);
    if (p.host !== currentUser) throw new HttpsError('permission-denied', 'Réservé à l’animateur de ce Penc');
    if (action === 'kick') L.applyPencKick(p, target);
    else { const err = L.applyPencCoHost(p, target); if (err) throw new HttpsError('failed-precondition', err); }
    kvSet('penc:' + pencId, p, tx);
    return p.title || '';
  });
  const touched = ['penc:' + pencId];
  if (action === 'cohost') { const k = await sendNotification(target, 'penc_cohost_invite', currentUser, null, title); if (k) touched.push(k); }
  return ok(touched);
});

// ---------- Publications programmées (l. 8883-8892) : fonction planifiée, plus aucun client ne publie pour les autres ----------
export async function releaseDueScheduledPosts(now = new Date()): Promise<string[]> {
  const snap = await db().collection('kv_post').where('data.status', '==', 'scheduled').get();
  const released: string[] = [];
  for (const d of snap.docs) {
    const postId = (d.data().data as L.Post).id || d.id;
    const done = await db().runTransaction(async (tx) => {
      const p = await kvGet<L.Post>('post:' + postId, tx);
      if (!p || !L.isDueScheduled(p, now)) return false;
      p.status = 'published';
      kvSet('post:' + postId, p, tx);
      return true;
    });
    if (!done) continue;
    released.push(postId);
    const p = await kvGet<L.Post>('post:' + postId);
    if (p) await fanOutToFollowers(p.userId, 'post', postId);
  }
  return released;
}
export const releaseScheduledPosts = onSchedule({ region: REGION, schedule: 'every 5 minutes' }, async () => { await releaseDueScheduledPosts(); });
