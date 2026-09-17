// Règles pures du domaine social (phase 06) : mêmes tableaux, mêmes messages, mêmes seuils que le legacy.
// Aucune dépendance Firebase : testable avec node --test. Les numéros de ligne renvoient à legacy/suktum-app.html.

export const QUICK_REACTION_EMOJIS = ['😂', '😮', '😢', '🔥']; // l. 14245
export const MILLION_FOLLOWERS = 1_000_000; // l. 13542
export const ACTIVE_MEMBER_MIN_POSTS = 10; // l. 22070
export const ACTIVE_MEMBER_MIN_LIKES = 100; // l. 22072
export const EARLY_ACTIVITY_WINDOW_MS = 60 * 60 * 1000; // l. 24746
export const REFERRAL_DEFAULT_POINTS = 10; // l. 26716 (getReferralRewardPoints)
export const REFERRAL_WINDOW_MS = 60 * 60 * 1000; // parrainage accepté seulement juste après l'inscription (l. 7862)

export type Post = {
  id?: string; userId: string; likes?: string[]; dislikes?: string[]; reactions?: Record<string, string[]>;
  comments?: Comment[]; pinnedCommentIndex?: number | null; favoritedBy?: string[]; watchLaterBy?: string[];
  views?: number; viewedBy?: string[]; qualifiedViews?: number; status?: string; scheduledFor?: string | null;
  commentsDisabled?: boolean; commentsCloseAt?: string | null; commentRestriction?: string; filterAllComments?: boolean;
  poll?: { question: string; options: string[]; votes?: Record<string, number> } | null;
  coCreatorUsername?: string | null; coCreatorStatus?: string | null;
  [k: string]: unknown;
};
export type Comment = {
  user: string; text: string; imageData?: string | null; sticker?: string | null; ts: string; replyToIndex: number | null;
  likes?: string[]; dislikes?: string[]; status?: string; edited?: boolean;
};
export type User = {
  username: string; createdAt?: string; followers?: string[]; following?: string[]; blocked?: string[]; muted?: string[];
  notificationPreferences?: Record<string, boolean>; myBlockedCommentWords?: string[]; isTrainer?: boolean;
  reached1M?: boolean; reached1MAt?: string; activeMemberBadge?: boolean; earlyActivityCount?: number; referralCount?: number;
  referredBy?: string | null; referralAppliedAt?: string | null;
  [k: string]: unknown;
};

/** Ajoute/retire `user` dans `arr` (toggle legacy indexOf/push/splice). Renvoie true si ajouté. */
export function toggleIn(arr: string[], user: string): boolean {
  const idx = arr.indexOf(user);
  if (idx === -1) { arr.push(user); return true; }
  arr.splice(idx, 1); return false;
}
export function removeFrom(arr: string[] | undefined, user: string): string[] { return (arr || []).filter((u) => u !== user); }

/** toggleLike l. 14283-14303 : like ↔ retrait ; un like retire le dislike. */
export function applyToggleLike(p: Post, user: string): boolean {
  if (!p.likes) p.likes = [];
  const idx = p.likes.indexOf(user);
  if (idx === -1) {
    p.likes.push(user);
    if (p.dislikes) { const d = p.dislikes.indexOf(user); if (d !== -1) p.dislikes.splice(d, 1); }
    return true;
  }
  p.likes.splice(idx, 1);
  return false;
}
/** toggleDislike l. 13830-13840 : dislike ↔ retrait ; un dislike retire le like. */
export function applyToggleDislike(p: Post, user: string): boolean {
  if (!p.dislikes) p.dislikes = [];
  if (!p.likes) p.likes = [];
  const idx = p.dislikes.indexOf(user);
  if (idx === -1) {
    p.dislikes.push(user);
    const l = p.likes.indexOf(user); if (l !== -1) p.likes.splice(l, 1);
    return true;
  }
  p.dislikes.splice(idx, 1);
  return false;
}
/** selectReaction l. 14264-14275 : une seule réaction rapide par utilisateur ; re-choisir la même la retire. Renvoie true si posée. */
export function applyReaction(p: Post, user: string, emoji: string): boolean {
  if (!p.reactions) p.reactions = {};
  const r = p.reactions;
  QUICK_REACTION_EMOJIS.forEach((e) => { if (!r[e]) r[e] = []; const idx = r[e].indexOf(user); if (idx !== -1) r[e].splice(idx, 1); });
  const alreadyHadThis = (r[emoji] || []).includes(user);
  if (!alreadyHadThis) { r[emoji].push(user); return true; }
  return false;
}

/** canUserCommentOnPost l. 14930-14944 (le blocage réciproque est passé en paramètre). */
export function canComment(p: Post, user: string, owner: User | null, blockedEitherWay: boolean, now = new Date()): { allowed: boolean; reason?: string } {
  if (p.commentsDisabled) return { allowed: false, reason: 'Les commentaires ont été désactivés par l’auteur.' };
  if (user !== p.userId && blockedEitherWay) return { allowed: false, reason: 'Vous ne pouvez pas commenter cette publication.' };
  if (p.commentsCloseAt && now > new Date(p.commentsCloseAt)) return { allowed: false, reason: 'Les commentaires sont fermés depuis le délai fixé par l’auteur.' };
  if (p.commentRestriction && p.commentRestriction !== 'everyone' && user !== p.userId) {
    if (p.commentRestriction === 'following' && !((owner && owner.following) || []).includes(user)) {
      return { allowed: false, reason: 'Seules les personnes suivies par l’auteur peuvent commenter cette publication.' };
    }
    if (p.commentRestriction === 'followers' && !((owner && owner.followers) || []).includes(user)) {
      return { allowed: false, reason: 'Seuls les abonnés de l’auteur peuvent commenter cette publication.' };
    }
  }
  return { allowed: true };
}
/** containsForbiddenWord l. 15057-15060. */
export function containsForbiddenWord(text: string, words: string[]): string | undefined {
  const lower = (text || '').toLowerCase();
  return words.find((w) => w && lower.includes(w));
}
/** Filtre de submitComment l. 15170-15179 : liste plateforme puis mots bloqués par le créateur. */
export function commentWordFilter(text: string, platformWords: string[], creatorWords: string[]): string | null {
  if (!text) return null;
  if (containsForbiddenWord(text, platformWords)) return 'Ce commentaire contient un mot non autorisé — veuillez le reformuler';
  if (containsForbiddenWord(text, creatorWords)) return 'Ce commentaire contient un mot bloqué par le créateur de cette vidéo';
  return null;
}
/** addComment l. 14945-14954 : ajoute le commentaire (pending si filterAllComments et pas l'auteur). */
export function appendComment(p: Post, user: string, text: string, replyToIndex: number | null, imageData: string | null, sticker: string | null, now: string): { index: number; pending: boolean } {
  if (!p.comments) p.comments = [];
  const index = p.comments.length;
  const pending = !!p.filterAllComments && user !== p.userId;
  p.comments.push({ user, text, imageData: imageData || null, sticker: sticker || null, ts: now, replyToIndex: replyToIndex !== undefined && replyToIndex !== null ? replyToIndex : null, likes: [], dislikes: [], status: pending ? 'pending' : 'approved' });
  return { index, pending };
}
/** Suppression d'un commentaire l. 14822-14830 / 14812-14818 : réindexe le commentaire épinglé. */
export function spliceComment(p: Post, index: number): void {
  p.comments!.splice(index, 1);
  if (p.pinnedCommentIndex !== null && p.pinnedCommentIndex !== undefined) {
    if (p.pinnedCommentIndex === index) p.pinnedCommentIndex = null;
    else if (p.pinnedCommentIndex > index) p.pinnedCommentIndex -= 1;
  }
}
/** toggleCommentLike l. 14730-14745 (like retire le dislike) et toggleCommentDislike l. 14749-14764. */
export function applyCommentVote(c: Comment, user: string, kind: 'like' | 'dislike'): boolean {
  if (!c.likes) c.likes = [];
  if (!c.dislikes) c.dislikes = [];
  const mine = kind === 'like' ? c.likes : c.dislikes, other = kind === 'like' ? c.dislikes : c.likes;
  const idx = mine.indexOf(user);
  if (idx === -1) { mine.push(user); const o = other.indexOf(user); if (o !== -1) other.splice(o, 1); return true; }
  mine.splice(idx, 1);
  return false;
}

/** Vues l. 13260-13263 (views + viewedBy) et l. 10767 (qualifiedViews). */
export function applyView(p: Post, user: string | null, qualified: boolean): void {
  if (qualified) { p.qualifiedViews = (p.qualifiedViews || 0) + 1; return; }
  p.views = (p.views || 0) + 1;
  if (!Array.isArray(p.viewedBy)) p.viewedBy = [];
  if (user && !p.viewedBy.includes(user)) p.viewedBy.push(user);
}
/** voteOnPostPoll l. 33259-33266 : un seul vote par utilisateur. */
export function applyPostPollVote(p: Post, user: string, optionIndex: number): 'voted' | 'already' {
  if (!p.poll) throw new Error('no-poll');
  if (!p.poll.votes) p.poll.votes = {};
  if (p.poll.votes[user] !== undefined) return 'already';
  p.poll.votes[user] = optionIndex;
  return 'voted';
}
/** voteOnPoll (sondage communautaire) l. 31196-31209 : clos si expiré, un seul vote, pas de changement. */
export function applyCommunityPollVote(poll: { expiresAt?: string | null; votes?: Record<string, string[]> }, user: string, optionIndex: number, now = new Date()): 'voted' | 'closed' | 'already' {
  if (poll.expiresAt && new Date(poll.expiresAt) < now) return 'closed';
  const alreadyVoted = Object.values(poll.votes || {}).some((arr) => arr.includes(user));
  if (alreadyVoted) return 'already';
  if (!poll.votes) poll.votes = {};
  if (!poll.votes[optionIndex]) poll.votes[optionIndex] = [];
  poll.votes[optionIndex].push(user);
  return 'voted';
}

/** toggleFollow l. 13579-13599 : renvoie true si désormais abonné. `ensure` = createFollowRelationship l. 13529 (jamais de retrait). */
export function applyFollow(target: User, me: User, meName: string, targetName: string, ensure: boolean): { following: boolean; changed: boolean } {
  if (!target.followers) target.followers = [];
  if (!me.following) me.following = [];
  const idx = target.followers.indexOf(meName);
  if (idx === -1) {
    target.followers.push(meName);
    if (!me.following.includes(targetName)) me.following.push(targetName);
    return { following: true, changed: true };
  }
  if (ensure) return { following: true, changed: false };
  target.followers.splice(idx, 1);
  const f = me.following.indexOf(targetName); if (f !== -1) me.following.splice(f, 1);
  return { following: false, changed: true };
}
/** checkMillionFollowersMilestone l. 13539-13549 : renvoie true si le palier vient d'être atteint. */
export function reachesMillion(u: User, now: string): boolean {
  if (u.reached1M) return false;
  if ((u.followers || []).length < MILLION_FOLLOWERS) return false;
  u.reached1M = true; u.reached1MAt = now;
  return true;
}
/** checkActiveMemberBadge l. 22067-22083 : ≥ 10 publications publiées et ≥ 100 likes reçus. Renvoie 'granted' | 'revoked' | null. */
export function activeMemberBadgeChange(u: User, publishedPosts: Post[]): 'granted' | 'revoked' | null {
  if (publishedPosts.length < ACTIVE_MEMBER_MIN_POSTS) return null;
  const totalLikes = publishedPosts.reduce((s, p) => s + ((p.likes || []).length), 0);
  const qualifies = totalLikes >= ACTIVE_MEMBER_MIN_LIKES;
  if (qualifies && !u.activeMemberBadge) { u.activeMemberBadge = true; return 'granted'; }
  if (!qualifies && u.activeMemberBadge) { u.activeMemberBadge = false; return 'revoked'; }
  return null;
}
/** trackEarlyActivity l. 24742-24749 : compteur de la première heure du compte. */
export function applyEarlyActivity(u: User, nowMs: number): boolean {
  const age = nowMs - new Date(u.createdAt || 0).getTime();
  if (age > EARLY_ACTIVITY_WINDOW_MS) return false;
  u.earlyActivityCount = (u.earlyActivityCount || 0) + 1;
  return true;
}

/** toggleBlockUser l. 16240-16265 : blocage → sourdine retirée, abonnements rompus dans les deux sens ; déblocage simple. */
export function applyBlock(me: User, them: User | null, meName: string, targetName: string): boolean {
  if (!me.blocked) me.blocked = [];
  const idx = me.blocked.indexOf(targetName);
  if (idx === -1) {
    me.blocked.push(targetName);
    if (me.muted) me.muted = me.muted.filter((u) => u !== targetName);
    if (me.following) me.following = me.following.filter((u) => u !== targetName);
    if (them) {
      if (them.followers) them.followers = them.followers.filter((u) => u !== meName);
      if (them.following) them.following = them.following.filter((u) => u !== meName);
    }
    if (me.followers) me.followers = me.followers.filter((u) => u !== targetName);
    return true;
  }
  me.blocked.splice(idx, 1);
  return false;
}
/** isBlockedEitherWay l. 16232-16239. */
export function blockedEitherWay(me: User | null, them: User | null, meName: string, themName: string): boolean {
  if (!meName || !themName || meName === themName) return false;
  if (me && (me.blocked || []).includes(themName)) return true;
  if (them && (them.blocked || []).includes(meName)) return true;
  return false;
}

/** getNotificationCategory l. 11423-11438 (copie conforme). */
export function notificationCategory(type: string): string {
  const categoryMap: Record<string, string> = {
    like: 'likes', commentlike: 'likes',
    comment: 'comments',
    follow: 'follows', referral: 'follows',
    mention: 'mentions',
    message: 'directmessages', voice_call_started: 'messages',
    new_post: 'newposts', series_episode_released: 'newposts',
    new_lesson: 'education', course_group_message: 'education', course_chat_message: 'education', new_exercise: 'education', student_left_course: 'education', student_reenrolled: 'education', course_notes_updated: 'education',
    refund_requested: 'commerce', business_account_approved: 'commerce', negotiation_offer: 'commerce',
    negotiation_accepted: 'commerce', negotiation_rejected: 'commerce', auction_outbid: 'commerce',
    stock_low: 'commerce', stock_out: 'commerce', new_product_from_followed_seller: 'commerce',
    wanted_response: 'commerce', recurring_order_reminder: 'commerce', cagnotte_contribution: 'commerce', challenge_reward: 'commerce', duet_to_order_suggestion: 'commerce', order_cancelled: 'commerce', order_cancelled_by_seller: 'commerce', receipt_confirm_reminder: 'commerce', shipping_reminder: 'commerce', verified_delivery_badge_lost: 'commerce', dispute_resolved_buyer: 'commerce', dispute_resolved_seller: 'commerce', added_to_group: 'education', institutional_announcement: 'education', enrolled_via_institutional_import: 'education', new_course_challenge: 'education',
  };
  return categoryMap[type] || 'other';
}
/** createNotification l. 11452-11459 : refus si auto-notification ou préférence désactivée par le destinataire. */
export function notificationAllowed(toUser: string, fromUser: string, type: string, target: User | null): boolean {
  if (toUser === fromUser) return false;
  if (!target) return false;
  const category = notificationCategory(type);
  if (target.notificationPreferences && target.notificationPreferences[category] === false) return false;
  return true;
}
/** Forme exacte du document notif: l. 11457 (à texte vide : ''). */
export function buildNotification(id: string, toUser: string, type: string, fromUser: string, postId: string | null | undefined, text: string | null | undefined, createdAt: string) {
  return { id, toUser, type, fromUser, postId: postId || null, text: text || '', read: false, createdAt };
}
/** notifyMentions l. 11463-11476 : candidats `@nom` (les plus longs d'abord, insensible à la casse, un seul par nom). */
export function mentionCandidates(text: string): string[] {
  if (!text || !text.includes('@')) return [];
  const found = new Set<string>();
  for (const m of text.matchAll(/@([\p{L}\p{N}_]+)/gu)) found.add(m[1]);
  return [...found].sort((a, b) => b.length - a.length);
}
export function mentionMatches(text: string, username: string): boolean {
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('@' + escaped + '(?![a-zA-Z0-9_])', 'i').test(text);
}

/** Vote toggle des scrutins l. 14466 / 14487 / 14540 / 14564. */
export function applyListVote(doc: { votes?: string[] }, user: string): boolean {
  if (!Array.isArray(doc.votes)) doc.votes = [];
  return toggleIn(doc.votes, user);
}
/** Clé du mois l. 14449 et de la semaine ISO l. 31000 (getISOWeekKey). */
export function monthKey(d = new Date()): string { return d.toISOString().slice(0, 7); }
export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

/** Parrainage l. 7862-7867 : conditions d'application (une fois, juste après l'inscription, pas soi-même). */
export function referralCheck(me: User | null, referrer: User | null, meName: string, code: string, nowMs: number): string | null {
  if (!code || code === meName) return 'Code de parrainage invalide';
  if (!me) return 'Compte introuvable';
  if (me.referredBy) return 'Parrainage déjà appliqué';
  if (nowMs - new Date(me.createdAt || 0).getTime() > REFERRAL_WINDOW_MS) return 'Le parrainage ne peut être appliqué qu’à l’inscription';
  if (!referrer) return 'Ce code de parrainage ne correspond à aucun compte';
  return null;
}
export function referralPoints(setting: unknown): number {
  const v = setting === null || setting === undefined ? REFERRAL_DEFAULT_POINTS : Number(setting);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** releaseScheduledPosts l. 8883-8892 : publications programmées échues. */
export function isDueScheduled(p: Post, now = new Date()): boolean {
  return p.status === 'scheduled' && !!p.scheduledFor && new Date(p.scheduledFor) <= now;
}

/** Penc l. 33219-33226 (join), 33385-33388 (leave), 33340-33348 (kick), 33366-33375 (co-animateur). */
export type Penc = { host: string; active?: boolean; title?: string; participants: string[]; everJoined?: string[]; kicked?: string[]; coHosts?: string[]; chatMessages?: { user: string; text: string; ts: string }[]; [k: string]: unknown };
export function applyPencJoin(p: Penc, user: string): boolean {
  if (!p.everJoined) p.everJoined = [];
  let changed = false;
  if (!p.participants.includes(user)) { p.participants.push(user); changed = true; }
  if (!p.everJoined.includes(user)) { p.everJoined.push(user); changed = true; }
  return changed;
}
export function applyPencLeave(p: Penc, user: string): void { p.participants = p.participants.filter((u) => u !== user); }
export function applyPencKick(p: Penc, username: string): void {
  p.participants = p.participants.filter((u) => u !== username);
  if (p.coHosts) p.coHosts = p.coHosts.filter((u) => u !== username);
  if (!p.kicked) p.kicked = [];
  if (!p.kicked.includes(username)) p.kicked.push(username);
}
export function applyPencCoHost(p: Penc, username: string): string | null {
  if (username === p.host) return 'Vous êtes déjà l’animateur';
  if (!p.coHosts) p.coHosts = [];
  if (p.coHosts.includes(username)) return 'Déjà co-animateur(trice)';
  p.coHosts.push(username);
  if (!p.participants.includes(username)) p.participants.push(username);
  return null;
}
