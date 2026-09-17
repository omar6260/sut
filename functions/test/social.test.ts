import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/social/logic.js';

const post = (extra: Partial<L.Post> = {}): L.Post => ({ id: 'p1', userId: 'Awa', likes: [], dislikes: [], comments: [], ...extra });

test('like : toggle, un like retire le dislike (l. 14283)', () => {
  const p = post({ dislikes: ['Moussa'] });
  assert.equal(L.applyToggleLike(p, 'Moussa'), true);
  assert.deepEqual(p.likes, ['Moussa']); assert.deepEqual(p.dislikes, []);
  assert.equal(L.applyToggleLike(p, 'Moussa'), false);
  assert.deepEqual(p.likes, []);
});
test('dislike : toggle, un dislike retire le like (l. 13830)', () => {
  const p = post({ likes: ['Moussa'] });
  assert.equal(L.applyToggleDislike(p, 'Moussa'), true);
  assert.deepEqual(p.dislikes, ['Moussa']); assert.deepEqual(p.likes, []);
  assert.equal(L.applyToggleDislike(p, 'Moussa'), false);
});
test('réaction rapide : une seule par utilisateur ; re-choisir la même la conserve (comportement du prototype l. 14264-14275, `alreadyHadThis` évalué après retrait)', () => {
  const p = post();
  assert.equal(L.applyReaction(p, 'Moussa', '😂'), true);
  assert.equal(L.applyReaction(p, 'Moussa', '🔥'), true);
  assert.deepEqual(p.reactions!['😂'], []); assert.deepEqual(p.reactions!['🔥'], ['Moussa']);
  assert.equal(L.applyReaction(p, 'Moussa', '🔥'), true);
  assert.deepEqual(p.reactions!['🔥'], ['Moussa']);
});
test('commentaires : règles d’accès de canUserCommentOnPost, messages identiques (l. 14930)', () => {
  const owner: L.User = { username: 'Awa', followers: ['Fan'], following: ['Ami'] };
  assert.equal(L.canComment(post({ commentsDisabled: true }), 'Moussa', owner, false).reason, 'Les commentaires ont été désactivés par l’auteur.');
  assert.equal(L.canComment(post(), 'Moussa', owner, true).reason, 'Vous ne pouvez pas commenter cette publication.');
  assert.equal(L.canComment(post({ commentsCloseAt: '2000-01-01T00:00:00Z' }), 'Moussa', owner, false).reason, 'Les commentaires sont fermés depuis le délai fixé par l’auteur.');
  assert.equal(L.canComment(post({ commentRestriction: 'following' }), 'Moussa', owner, false).reason, 'Seules les personnes suivies par l’auteur peuvent commenter cette publication.');
  assert.equal(L.canComment(post({ commentRestriction: 'following' }), 'Ami', owner, false).allowed, true);
  assert.equal(L.canComment(post({ commentRestriction: 'followers' }), 'Moussa', owner, false).reason, 'Seuls les abonnés de l’auteur peuvent commenter cette publication.');
  assert.equal(L.canComment(post({ commentRestriction: 'followers' }), 'Fan', owner, false).allowed, true);
  assert.equal(L.canComment(post({ commentRestriction: 'followers', commentsDisabled: false }), 'Awa', owner, false).allowed, true); // l'auteur commente toujours
});
test('commentaires : filtre de mots (plateforme puis créateur), ajout pending si filterAllComments (l. 15170, 14945)', () => {
  assert.equal(L.commentWordFilter('Quel idiot', ['idiot'], []), 'Ce commentaire contient un mot non autorisé — veuillez le reformuler');
  assert.equal(L.commentWordFilter('Vive le Sénégal', [], ['sénégal']), 'Ce commentaire contient un mot bloqué par le créateur de cette vidéo');
  assert.equal(L.commentWordFilter('Bonjour', ['idiot'], ['nul']), null);
  const p = post({ filterAllComments: true });
  const r = L.appendComment(p, 'Moussa', 'Salut', null, null, null, '2026-09-17T00:00:00.000Z');
  assert.deepEqual(r, { index: 0, pending: true });
  assert.deepEqual(p.comments![0], { user: 'Moussa', text: 'Salut', imageData: null, sticker: null, ts: '2026-09-17T00:00:00.000Z', replyToIndex: null, likes: [], dislikes: [], status: 'pending' });
  assert.equal(L.appendComment(p, 'Awa', 'Merci', 0, null, null, 'x').pending, false);
});
test('commentaires : suppression réindexe l’épinglé, like/dislike exclusifs (l. 14822, 14730)', () => {
  const p = post({ comments: [{ user: 'a', text: '1', ts: '', replyToIndex: null }, { user: 'b', text: '2', ts: '', replyToIndex: null }, { user: 'c', text: '3', ts: '', replyToIndex: null }], pinnedCommentIndex: 2 });
  L.spliceComment(p, 0);
  assert.equal(p.pinnedCommentIndex, 1); assert.equal(p.comments!.length, 2);
  L.spliceComment(p, 1);
  assert.equal(p.pinnedCommentIndex, null);
  const c = p.comments![0];
  assert.equal(L.applyCommentVote(c, 'x', 'dislike'), true);
  assert.equal(L.applyCommentVote(c, 'x', 'like'), true);
  assert.deepEqual(c.likes, ['x']); assert.deepEqual(c.dislikes, []);
  assert.equal(L.applyCommentVote(c, 'x', 'like'), false);
});
test('vues : views + viewedBy sans doublon, visiteur anonyme compté, vue qualifiée séparée (l. 13260, 10767)', () => {
  const p = post();
  L.applyView(p, 'Moussa', false); L.applyView(p, 'Moussa', false); L.applyView(p, null, false);
  assert.equal(p.views, 3); assert.deepEqual(p.viewedBy, ['Moussa']);
  L.applyView(p, 'Moussa', true);
  assert.equal(p.qualifiedViews, 1); assert.equal(p.views, 3);
});
test('sondage sur publication : un seul vote (l. 33259) ; sondage communautaire : clos / déjà voté (l. 31196)', () => {
  const p = post({ poll: { question: 'Q', options: ['A', 'B'] } });
  assert.equal(L.applyPostPollVote(p, 'Moussa', 1), 'voted');
  assert.equal(L.applyPostPollVote(p, 'Moussa', 0), 'already');
  assert.deepEqual(p.poll!.votes, { Moussa: 1 });
  const poll: { expiresAt?: string | null; votes?: Record<string, string[]> } = {};
  assert.equal(L.applyCommunityPollVote(poll, 'Moussa', 0), 'voted');
  assert.equal(L.applyCommunityPollVote(poll, 'Moussa', 1), 'already');
  assert.equal(L.applyCommunityPollVote({ expiresAt: '2000-01-01' }, 'Moussa', 0), 'closed');
  assert.deepEqual(poll.votes, { 0: ['Moussa'] });
});
test('abonnement : toggle symétrique, `ensure` ne retire jamais, palier 1M une seule fois (l. 13579, 13529, 13539)', () => {
  const t: L.User = { username: 'Awa' }, me: L.User = { username: 'Moussa' };
  assert.deepEqual(L.applyFollow(t, me, 'Moussa', 'Awa', false), { following: true, changed: true });
  assert.deepEqual(t.followers, ['Moussa']); assert.deepEqual(me.following, ['Awa']);
  assert.deepEqual(L.applyFollow(t, me, 'Moussa', 'Awa', true), { following: true, changed: false });
  assert.deepEqual(L.applyFollow(t, me, 'Moussa', 'Awa', false), { following: false, changed: true });
  assert.deepEqual(t.followers, []); assert.deepEqual(me.following, []);
  const star: L.User = { username: 'Star', followers: new Array(1_000_000).fill('x') };
  assert.equal(L.reachesMillion(star, 'now'), true);
  assert.equal(star.reached1M, true); assert.equal(star.reached1MAt, 'now');
  assert.equal(L.reachesMillion(star, 'later'), false);
  assert.equal(L.reachesMillion({ username: 'Petit', followers: ['a'] }, 'now'), false);
});
test('badge membre actif : ≥ 10 publications et ≥ 100 likes, attribution puis retrait (l. 22067)', () => {
  const posts = Array.from({ length: 10 }, (_, i) => post({ id: 'p' + i, likes: new Array(10).fill('u') }));
  const u: L.User = { username: 'Awa' };
  assert.equal(L.activeMemberBadgeChange(u, posts.slice(0, 9)), null);
  assert.equal(L.activeMemberBadgeChange(u, posts), 'granted');
  assert.equal(L.activeMemberBadgeChange(u, posts), null);
  posts[0].likes = [];
  assert.equal(L.activeMemberBadgeChange(u, posts), 'revoked');
  assert.equal(u.activeMemberBadge, false);
});
test('activité précoce : première heure seulement (l. 24742)', () => {
  const now = Date.now();
  const u: L.User = { username: 'a', createdAt: new Date(now - 10 * 60_000).toISOString() };
  assert.equal(L.applyEarlyActivity(u, now), true); assert.equal(u.earlyActivityCount, 1);
  const old: L.User = { username: 'b', createdAt: new Date(now - 2 * 3600_000).toISOString() };
  assert.equal(L.applyEarlyActivity(old, now), false); assert.equal(old.earlyActivityCount, undefined);
});
test('blocage : sourdine retirée, abonnements rompus dans les deux sens ; déblocage ; blocage réciproque (l. 16240, 16232)', () => {
  const me: L.User = { username: 'Moussa', muted: ['Awa'], following: ['Awa', 'X'], followers: ['Awa'] };
  const them: L.User = { username: 'Awa', followers: ['Moussa', 'Y'], following: ['Moussa'] };
  assert.equal(L.applyBlock(me, them, 'Moussa', 'Awa'), true);
  assert.deepEqual(me, { username: 'Moussa', muted: [], following: ['X'], followers: [], blocked: ['Awa'] });
  assert.deepEqual(them, { username: 'Awa', followers: ['Y'], following: [] });
  assert.equal(L.blockedEitherWay(me, them, 'Moussa', 'Awa'), true);
  assert.equal(L.blockedEitherWay(them, me, 'Awa', 'Moussa'), true);
  assert.equal(L.applyBlock(me, them, 'Moussa', 'Awa'), false);
  assert.deepEqual(me.blocked, []);
  assert.equal(L.blockedEitherWay(me, them, 'Moussa', 'Awa'), false);
});
test('notifications : catégorie, préférence du destinataire, pas d’auto-notification, forme du document (l. 11423, 11452)', () => {
  assert.equal(L.notificationCategory('like'), 'likes'); assert.equal(L.notificationCategory('commentreply'), 'other'); assert.equal(L.notificationCategory('new_post'), 'newposts');
  const target: L.User = { username: 'Awa', notificationPreferences: { likes: false } };
  assert.equal(L.notificationAllowed('Awa', 'Moussa', 'like', target), false);
  assert.equal(L.notificationAllowed('Awa', 'Moussa', 'comment', target), true);
  assert.equal(L.notificationAllowed('Awa', 'Awa', 'comment', target), false);
  assert.equal(L.notificationAllowed('Awa', 'Moussa', 'comment', null), false);
  assert.deepEqual(L.buildNotification('notif_1', 'Awa', 'like', 'Moussa', undefined, undefined, 'ts'), { id: 'notif_1', toUser: 'Awa', type: 'like', fromUser: 'Moussa', postId: null, text: '', read: false, createdAt: 'ts' });
});
test('mentions : candidats les plus longs d’abord, insensibles à la casse, frontière de mot (l. 11463)', () => {
  assert.deepEqual(L.mentionCandidates('Bravo @awa_dakar et @Moussa_Thies !'), ['Moussa_Thies', 'awa_dakar']);
  assert.deepEqual(L.mentionCandidates('sans mention'), []);
  assert.equal(L.mentionMatches('Bravo @awa_dakar', 'Awa_Dakar'), true);
  assert.equal(L.mentionMatches('Bravo @awa_dakar2', 'Awa_Dakar'), false);
});
test('scrutins : vote toggle, clés du mois et de la semaine ISO (l. 14466, 14449, 31000)', () => {
  const d: { votes?: string[] } = {};
  assert.equal(L.applyListVote(d, 'a'), true); assert.equal(L.applyListVote(d, 'a'), false); assert.deepEqual(d.votes, []);
  assert.equal(L.monthKey(new Date('2026-09-17T12:00:00Z')), '2026-09');
  assert.equal(L.isoWeekKey(new Date(2026, 8, 17)), '2026-W38');
  assert.equal(L.isoWeekKey(new Date(2027, 0, 1)), '2026-W53');
});
test('parrainage : une fois, juste après l’inscription, pas soi-même ; points par défaut 10 (l. 7862, 26716)', () => {
  const now = Date.now();
  const me: L.User = { username: 'Neo', createdAt: new Date(now - 60_000).toISOString() };
  const ref: L.User = { username: 'Awa' };
  assert.equal(L.referralCheck(me, ref, 'Neo', 'Awa', now), null);
  assert.equal(L.referralCheck(me, ref, 'Neo', 'Neo', now), 'Code de parrainage invalide');
  assert.equal(L.referralCheck(me, null, 'Neo', 'Zed', now), 'Ce code de parrainage ne correspond à aucun compte');
  assert.equal(L.referralCheck({ ...me, referredBy: 'Awa' }, ref, 'Neo', 'Awa', now), 'Parrainage déjà appliqué');
  assert.equal(L.referralCheck({ ...me, createdAt: new Date(now - 2 * 3600_000).toISOString() }, ref, 'Neo', 'Awa', now), 'Le parrainage ne peut être appliqué qu’à l’inscription');
  assert.equal(L.referralPoints(null), 10); assert.equal(L.referralPoints(0), 0); assert.equal(L.referralPoints(7.9), 7); assert.equal(L.referralPoints('abc'), 0);
});
test('publications programmées : échues seulement (l. 8883)', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  assert.equal(L.isDueScheduled(post({ status: 'scheduled', scheduledFor: '2026-09-17T11:00:00Z' }), now), true);
  assert.equal(L.isDueScheduled(post({ status: 'scheduled', scheduledFor: '2026-09-17T13:00:00Z' }), now), false);
  assert.equal(L.isDueScheduled(post({ status: 'published', scheduledFor: '2026-09-17T11:00:00Z' }), now), false);
});
test('Penc : rejoindre (participants + everJoined), quitter, exclure, co-animateur (l. 33217-33389)', () => {
  const p: L.Penc = { host: 'Awa', active: true, participants: ['Awa'] };
  assert.equal(L.applyPencJoin(p, 'Moussa'), true); assert.equal(L.applyPencJoin(p, 'Moussa'), false);
  assert.deepEqual(p.participants, ['Awa', 'Moussa']); assert.deepEqual(p.everJoined, ['Moussa']);
  L.applyPencLeave(p, 'Moussa'); assert.deepEqual(p.participants, ['Awa']);
  assert.equal(L.applyPencCoHost(p, 'Awa'), 'Vous êtes déjà l’animateur');
  assert.equal(L.applyPencCoHost(p, 'Fatou'), null); assert.equal(L.applyPencCoHost(p, 'Fatou'), 'Déjà co-animateur(trice)');
  assert.deepEqual(p.participants, ['Awa', 'Fatou']);
  L.applyPencKick(p, 'Fatou');
  assert.deepEqual(p.participants, ['Awa']); assert.deepEqual(p.coHosts, []); assert.deepEqual(p.kicked, ['Fatou']);
});
