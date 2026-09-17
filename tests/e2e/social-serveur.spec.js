// Garantit (phase 06, social) : les écritures croisées (like, réaction, commentaire, vue, sondage, abonnement, blocage,
// parrainage, scrutins, événements, Penc) sont faites par le serveur en transaction sur le document legacy (forme inchangée) ;
// les notifications sont créées côté serveur en respectant les préférences du destinataire ; un compte ne peut pas agir au
// nom d'un autre ; les écrans et toasts restent ceux du prototype ; une écriture directe de triche est refusée une fois les
// règles strictes actives.
import { test, expect, BACKEND } from '../support/fixtures.js';

test.skip(BACKEND !== 'firebase', 'logique serveur = backend firebase');

const api = (page, name, data) => page.evaluate(async ({ name, data }) => {
  try { return { ok: true, result: await window.SuktumPlatform.api.call(name, Object.assign({ currentUser: typeof currentUser !== 'undefined' ? currentUser : null, username: typeof currentUser !== 'undefined' ? currentUser : null }, data)) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}, { name, data });

const nowIso = () => new Date().toISOString();
const postDoc = (id, userId, extra = {}) => ({ id, userId, type: 'image', data: 'data:image/png;base64,iVBORw0KGgo=', caption: 'Ma pirogue', likes: [], dislikes: [], comments: [], favoritedBy: [], viewedBy: [], views: 0, status: 'published', createdAt: nowIso(), ...extra });

async function twoAccounts(suktum) {
  const a = await suktum.openDevice('A');
  await suktum.signUp(a, 'Awa_Dakar');
  await suktum.dismissTour(a);
  const b = await suktum.openDevice('B');
  await suktum.signUp(b, 'Moussa_Thies');
  await suktum.dismissTour(b);
  return { a, b };
}
async function notifs(suktum, toUser) {
  const keys = (await suktum.storage.list(null, 'notif:', true)).keys;
  const all = await Promise.all(keys.map((k) => suktum.storage.readJSON(k)));
  return all.filter((n) => !toUser || n.toUser === toUser);
}

test.describe('Social — logique serveur', () => {
  test('like et commentaire depuis le fil : document du post écrit par le serveur, notifications serveur, écrans du prototype', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    await suktum.storage.writeJSON('post:post_a', postDoc('post_a', 'Awa_Dakar'));

    await b.locator('.tab[data-screen="feed"]').click();
    await b.evaluate(() => renderFeed());
    await b.locator('#feed-mode-recent').click();
    const card = b.locator('.feed-card[data-post-id="post_a"]');
    await expect(card).toBeVisible();
    // Vue comptée par le serveur (recordView) à l'affichage de la carte.
    await expect.poll(async () => (await suktum.storage.readJSON('post:post_a')).viewedBy, { timeout: 15_000 }).toContain('Moussa_Thies');
    expect((await suktum.storage.readJSON('post:post_a')).views).toBeGreaterThanOrEqual(1);

    // Like (toggleLike → serveur), forme `likes[]` conservée, notification `like` créée par le serveur.
    await card.locator('button[onclick^="toggleLike"]').dispatchEvent('click');
    await expect(b.locator('.feed-card[data-post-id="post_a"] button[onclick^="toggleLike"]')).toContainText('❤️');
    await expect.poll(async () => (await suktum.storage.readJSON('post:post_a')).likes, { timeout: 15_000 }).toEqual(['Moussa_Thies']);
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).map((n) => n.type), { timeout: 15_000 }).toEqual(['like']);
    expect((await notifs(suktum, 'Awa_Dakar'))[0]).toMatchObject({ toUser: 'Awa_Dakar', fromUser: 'Moussa_Thies', type: 'like', postId: 'post_a', text: '', read: false });

    // Second like = retrait (toggle), sans nouvelle notification.
    await b.locator('.feed-card[data-post-id="post_a"] button[onclick^="toggleLike"]').dispatchEvent('click');
    await expect.poll(async () => (await suktum.storage.readJSON('post:post_a')).likes, { timeout: 15_000 }).toEqual([]);
    expect((await notifs(suktum, 'Awa_Dakar')).length).toBe(1);

    // Commentaire depuis l'écran du prototype.
    await b.locator('.feed-card[data-post-id="post_a"] button[onclick^="openCommentsScreen"]').dispatchEvent('click');
    await expect(b.locator('#screen-comments')).toHaveClass(/active/);
    await b.locator('#comment-input').fill('Magnifique, bon vent @Awa_Dakar !');
    await b.locator('#screen-comments button', { hasText: 'Envoyer' }).click();
    await expect(b.locator('#comments-list')).toContainText('Magnifique, bon vent');
    const post = await suktum.storage.readJSON('post:post_a');
    expect(post.comments).toHaveLength(1);
    expect(post.comments[0]).toMatchObject({ user: 'Moussa_Thies', text: 'Magnifique, bon vent @Awa_Dakar !', replyToIndex: null, likes: [], dislikes: [], status: 'approved' });
    // Notification `comment` + mention (même destinataire) : l'auteur voit les notifications du prototype.
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).map((n) => n.type).sort(), { timeout: 15_000 }).toEqual(['comment', 'like', 'mention']);
    await a.locator('#global-notif-btn').click();
    await expect(a.locator('#screen-notifications')).toHaveClass(/active/);
    await expect(a.locator('#notifications-list')).toContainText('@Moussa_Thies a aimé votre publication');
    await expect(a.locator('#notifications-list')).toContainText('@Moussa_Thies a commenté votre publication');

    // Un compte ne peut pas agir au nom d'un autre.
    const forged = await b.evaluate(async () => { try { await window.SuktumPlatform.api.call('toggleLike', { currentUser: 'Awa_Dakar', username: 'Awa_Dakar', postId: 'post_a' }); return null; } catch (e) { return e.code; } });
    expect(forged).toBe('functions/permission-denied');
    expect(suktum.errors).toEqual([]);
  });

  test('commentaires : restrictions de l’auteur, mots interdits, file d’attente et approbation, suppression et épingle (mêmes messages)', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    await suktum.storage.writeJSON('settings:forbiddenWords', ['idiot']);
    await suktum.storage.writeJSON('user:Awa_Dakar', { ...(await suktum.storage.readJSON('user:Awa_Dakar')), myBlockedCommentWords: ['arnaque'] });
    await suktum.storage.writeJSON('post:post_a', postDoc('post_a', 'Awa_Dakar', { commentRestriction: 'followers' }));

    // B n'est pas abonné : refus avec le message du prototype (réponse { allowed, reason }, pas une erreur).
    let r = await api(b, 'addComment', { postId: 'post_a', text: 'Bonjour' });
    expect(r.result).toMatchObject({ allowed: false, reason: 'Seuls les abonnés de l’auteur peuvent commenter cette publication.' });
    // B s'abonne (serveur) puis retente : mots interdits plateforme et créateur.
    expect((await api(b, 'toggleFollow', { target: 'Awa_Dakar' })).result.following).toBe(true);
    r = await api(b, 'addComment', { postId: 'post_a', text: 'Quel idiot' });
    expect(r.result.reason).toBe('Ce commentaire contient un mot non autorisé — veuillez le reformuler');
    r = await api(b, 'addComment', { postId: 'post_a', text: 'Une ARNAQUE' });
    expect(r.result.reason).toBe('Ce commentaire contient un mot bloqué par le créateur de cette vidéo');
    r = await api(b, 'addComment', { postId: 'post_a', text: 'Bravo !' });
    expect(r.result).toMatchObject({ allowed: true, pending: false });

    // File d'attente : filterAllComments → pending, aucune notification tant que l'auteur n'approuve pas.
    await suktum.storage.writeJSON('post:post_a', { ...(await suktum.storage.readJSON('post:post_a')), filterAllComments: true });
    r = await api(b, 'addComment', { postId: 'post_a', text: 'En attente', replyToIndex: 0 });
    expect(r.result).toMatchObject({ allowed: true, pending: true });
    let post = await suktum.storage.readJSON('post:post_a');
    expect(post.comments[1]).toMatchObject({ status: 'pending', replyToIndex: 0 });
    const before = (await notifs(suktum, 'Awa_Dakar')).length;
    expect((await api(b, 'approveComment', { postId: 'post_a', index: 1 })).code).toBe('functions/permission-denied');
    expect((await api(a, 'approveComment', { postId: 'post_a', index: 1 })).ok).toBe(true);
    post = await suktum.storage.readJSON('post:post_a');
    expect(post.comments[1].status).toBe('approved');
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).length).toBe(before + 1); // l. 14803-14807 : réponse à son propre commentaire → l'auteur de la publication est notifié

    // Épingle (auteur seul), like de commentaire, suppression par l'auteur du commentaire (réindexation de l'épingle).
    expect((await api(b, 'pinComment', { postId: 'post_a', index: 1 })).code).toBe('functions/permission-denied');
    expect((await api(a, 'pinComment', { postId: 'post_a', index: 1 })).result.pinned).toBe(true);
    expect((await api(a, 'toggleCommentLike', { postId: 'post_a', index: 0 })).result.liked).toBe(true);
    post = await suktum.storage.readJSON('post:post_a');
    expect(post.pinnedCommentIndex).toBe(1);
    expect(post.comments[0].likes).toEqual(['Awa_Dakar']);
    await expect.poll(async () => (await notifs(suktum, 'Moussa_Thies')).map((n) => n.type)).toContain('commentlike');
    expect((await api(a, 'deleteComment', { postId: 'post_a', index: 0 })).code).toBe('functions/permission-denied'); // pas son commentaire, pas en attente
    expect((await api(b, 'deleteComment', { postId: 'post_a', index: 0 })).ok).toBe(true);
    post = await suktum.storage.readJSON('post:post_a');
    expect(post.comments).toHaveLength(1);
    expect(post.pinnedCommentIndex).toBe(0);
    expect(suktum.errors).toEqual([]);
  });

  test('abonnement, blocage, réactions, favoris et sondage : documents des deux comptes écrits par le serveur, préférences de notification respectées', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    await suktum.storage.writeJSON('post:post_a', postDoc('post_a', 'Awa_Dakar', { poll: { question: 'Thiéboudienne ou yassa ?', options: ['Thiéboudienne', 'Yassa'] } }));

    // Abonnement depuis le profil (toggleFollowFromProfile → toggleFollow → serveur) : toast du prototype, followers/following symétriques, followsource.
    await b.evaluate(() => openUserProfile('Awa_Dakar'));
    await expect(b.locator('#screen-user-profile')).toHaveClass(/active/);
    await b.locator('#uprofile-follow-btn').click();
    await expect.poll(() => suktum.lastToast(b)).toBe('Abonné(e) à @Awa_Dakar ✓');
    await expect.poll(async () => (await suktum.storage.readJSON('user:Awa_Dakar')).followers, { timeout: 15_000 }).toEqual(['Moussa_Thies']);
    expect((await suktum.storage.readJSON('user:Moussa_Thies')).following).toEqual(['Awa_Dakar']);
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).map((n) => n.type)).toEqual(['follow']);
    expect((await api(b, 'toggleFollow', { target: 'Awa_Dakar', sourcePostId: 'post_a', ensure: true })).result).toMatchObject({ following: true }); // createFollowRelationship : idempotent
    expect((await suktum.storage.readJSON('user:Awa_Dakar')).followers).toEqual(['Moussa_Thies']);

    // Préférence de notification du destinataire : A désactive les likes → aucune notification `like` ; réaction et favoris conservent la forme legacy.
    await suktum.storage.writeJSON('user:Awa_Dakar', { ...(await suktum.storage.readJSON('user:Awa_Dakar')), notificationPreferences: { likes: false } });
    expect((await api(b, 'toggleLike', { postId: 'post_a' })).result.liked).toBe(true);
    expect((await api(b, 'setReaction', { postId: 'post_a', emoji: '🔥' })).result.set).toBe(true);
    expect((await api(b, 'toggleFavorite', { postId: 'post_a' })).result.added).toBe(true);
    expect((await api(b, 'votePostPoll', { postId: 'post_a', optionIndex: 1 })).result.status).toBe('voted');
    expect((await api(b, 'votePostPoll', { postId: 'post_a', optionIndex: 0 })).result.status).toBe('already');
    const post = await suktum.storage.readJSON('post:post_a');
    expect(post).toMatchObject({ likes: ['Moussa_Thies'], favoritedBy: ['Moussa_Thies'], reactions: { '😂': [], '😮': [], '😢': [], '🔥': ['Moussa_Thies'] }, poll: { votes: { Moussa_Thies: 1 } } });
    const types = (await notifs(suktum, 'Awa_Dakar')).map((n) => n.type).sort();
    expect(types).toEqual(['follow', 'reaction']); // pas de `like` (préférence), la réaction est dans la catégorie « autres »

    // Blocage depuis le profil : abonnements rompus des deux côtés, `blockevent:` créé par le serveur, toast du prototype.
    b.once('dialog', (d) => d.dismiss()); // « signaler aussi ? » → non
    await b.evaluate(() => toggleBlockUser());
    await expect.poll(() => suktum.lastToast(b)).toBe('@Awa_Dakar est bloqué(e) — vous ne verrez plus son contenu');
    await expect.poll(async () => (await suktum.storage.readJSON('user:Moussa_Thies')).blocked, { timeout: 15_000 }).toEqual(['Awa_Dakar']);
    expect((await suktum.storage.readJSON('user:Moussa_Thies')).following).toEqual([]);
    expect((await suktum.storage.readJSON('user:Awa_Dakar')).followers).toEqual([]);
    const events = (await suktum.storage.list(null, 'blockevent:Awa_Dakar__', true)).keys;
    expect(events).toHaveLength(1);
    expect(await suktum.storage.readJSON(events[0])).toMatchObject({ blockedUser: 'Awa_Dakar', blockerUser: 'Moussa_Thies' });
    // Bloqué : A ne peut plus commenter chez B, et inversement.
    await suktum.storage.writeJSON('post:post_b', postDoc('post_b', 'Moussa_Thies'));
    expect((await api(a, 'addComment', { postId: 'post_b', text: 'Salut' })).result).toMatchObject({ allowed: false, reason: 'Vous ne pouvez pas commenter cette publication.' });
    expect((await api(b, 'addComment', { postId: 'post_a', text: 'Salut' })).result.allowed).toBe(false);
    expect(suktum.errors).toEqual([]);
  });

  test('parrainage à l’inscription : compteur et points de fidélité du parrain crédités une seule fois par le serveur', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Awa_Dakar');
    await suktum.dismissTour(a);
    const c = await suktum.openDevice('C');
    await c.evaluate(() => { const area = document.getElementById('onboard-referral-area'); if (area) area.style.display = 'block'; });
    await c.locator('#onboard-referral').fill('Awa_Dakar');
    await suktum.signUp(c, 'Fatou_Kaolack');
    await expect.poll(async () => (await suktum.storage.readJSON('user:Awa_Dakar')).referralCount, { timeout: 15_000 }).toBe(1);
    expect(await suktum.storage.readJSON('loyaltypoints:Awa_Dakar')).toBe(10); // settings:referralRewardPoints absent → 10 (l. 26716)
    expect((await suktum.storage.readJSON('user:Fatou_Kaolack')).referredBy).toBe('Awa_Dakar');
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).map((n) => [n.type, n.fromUser, n.text])).toEqual([['referral', 'Fatou_Kaolack', '10']]);
    // Rejeu refusé ; auto-parrainage refusé.
    expect((await api(c, 'applyReferral', { referralCode: 'Awa_Dakar' })).message).toBe('Parrainage déjà appliqué');
    expect((await api(a, 'applyReferral', { referralCode: 'Awa_Dakar' })).message).toBe('Code de parrainage invalide');
    expect((await suktum.storage.readJSON('user:Awa_Dakar')).referralCount).toBe(1);
    expect(suktum.errors).toEqual([]);
  });

  test('scrutins, événements, groupes, stories et Penc : un vote par personne, hôte seul pour exclure, messages du prototype', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    // Nomination créateur du mois + vote toggle.
    const nom = await api(b, 'nominate', { kind: 'creator', target: 'Awa_Dakar' });
    expect(nom.result.status).toBe('created');
    expect((await api(a, 'nominate', { kind: 'creator', target: 'Awa_Dakar' })).result.status).toBe('exists');
    expect((await api(a, 'vote', { kind: 'creator', id: nom.result.key })).result.status).toBe('voted'); // clé complète acceptée (l. 14468)
    expect((await suktum.storage.readJSON(nom.result.key)).votes).toEqual(['Moussa_Thies', 'Awa_Dakar']);
    expect((await api(a, 'vote', { kind: 'creator', id: nom.result.key })).result.status).toBe('removed');
    expect((await api(b, 'nominate', { kind: 'creator', target: 'Inconnu_X' })).message).toBe('Ce compte n’existe pas');
    // Sondage communautaire : un seul vote, clos si expiré.
    await suktum.storage.writeJSON('poll:poll_1', { id: 'poll_1', userId: 'Awa_Dakar', question: 'Q', options: ['A', 'B'], votes: {}, createdAt: nowIso() });
    expect((await api(b, 'vote', { kind: 'poll', id: 'poll_1', optionIndex: 1 })).result.status).toBe('voted');
    expect((await api(b, 'vote', { kind: 'poll', id: 'poll_1', optionIndex: 0 })).result.status).toBe('already');
    expect((await suktum.storage.readJSON('poll:poll_1')).votes).toEqual({ 1: ['Moussa_Thies'] });
    await suktum.storage.writeJSON('poll:poll_2', { id: 'poll_2', userId: 'Awa_Dakar', question: 'Q', options: ['A', 'B'], votes: {}, expiresAt: '2000-01-01T00:00:00.000Z', createdAt: nowIso() });
    expect((await api(b, 'vote', { kind: 'poll', id: 'poll_2', optionIndex: 0 })).result.status).toBe('closed');
    // Événement : participation + notification à l'organisateur ; groupe : adhésion.
    await suktum.storage.writeJSON('communityevent:ev_1', { id: 'ev_1', organizer: 'Awa_Dakar', title: 'Régate', date: '2099-01-01', location: 'Dakar', description: '', participants: [], createdAt: nowIso() });
    expect((await api(b, 'toggleEventParticipation', { eventId: 'ev_1' })).result.participating).toBe(true);
    expect((await suktum.storage.readJSON('communityevent:ev_1')).participants).toEqual(['Moussa_Thies']);
    await expect.poll(async () => (await notifs(suktum, 'Awa_Dakar')).map((n) => [n.type, n.text])).toContainEqual(['event_participation', 'Régate']);
    await suktum.storage.writeJSON('communitygroup:g_1', { id: 'g_1', name: 'Pêcheurs', createdBy: 'Awa_Dakar', members: ['Awa_Dakar'], createdAt: nowIso() });
    expect((await api(b, 'toggleGroupMembership', { groupId: 'g_1' })).result.member).toBe(true);
    expect((await suktum.storage.readJSON('communitygroup:g_1')).members).toEqual(['Awa_Dakar', 'Moussa_Thies']);
    // Story : vue marquée ; question : destinataire seul.
    await suktum.storage.writeJSON('story:st_1', { id: 'st_1', userId: 'Awa_Dakar', type: 'image', data: 'data:image/png;base64,iVBORw0KGgo=', viewedBy: [], createdAt: nowIso() });
    expect((await api(b, 'markStoryViewed', { storyId: 'st_1' })).ok).toBe(true);
    expect((await suktum.storage.readJSON('story:st_1')).viewedBy).toEqual(['Moussa_Thies']);
    await suktum.storage.writeJSON('storyquestion:q_1', { id: 'q_1', fromUser: 'Moussa_Thies', toUser: 'Awa_Dakar', question: '?', answered: false, createdAt: nowIso() });
    expect((await api(b, 'answerStoryQuestion', { questionId: 'q_1' })).code).toBe('functions/permission-denied');
    expect((await api(a, 'answerStoryQuestion', { questionId: 'q_1' })).ok).toBe(true);
    expect((await suktum.storage.readJSON('storyquestion:q_1')).answered).toBe(true);
    // Penc : rejoindre, message filtré, exclusion réservée à l'hôte, co-animateur notifié, quitter.
    await suktum.storage.writeJSON('settings:forbiddenWords', ['idiot']);
    await suktum.storage.writeJSON('penc:penc_1', { id: 'penc_1', host: 'Awa_Dakar', title: 'Causerie', category: 'culture', active: true, participants: ['Awa_Dakar'], createdAt: nowIso() });
    expect((await api(b, 'pencJoin', { pencId: 'penc_1' })).result).toMatchObject({ title: 'Causerie', host: 'Awa_Dakar' });
    expect((await suktum.storage.readJSON('penc:penc_1'))).toMatchObject({ participants: ['Awa_Dakar', 'Moussa_Thies'], everJoined: ['Moussa_Thies'] });
    expect((await api(b, 'pencMessage', { pencId: 'penc_1', text: 'Quel idiot' })).message).toBe('Ce message contient un mot non autorisé');
    expect((await api(b, 'pencMessage', { pencId: 'penc_1', text: 'Salut tout le monde' })).ok).toBe(true);
    expect((await suktum.storage.readJSON('penc:penc_1')).chatMessages[0]).toMatchObject({ user: 'Moussa_Thies', text: 'Salut tout le monde' });
    expect((await api(b, 'pencModerate', { pencId: 'penc_1', action: 'kick', target: 'Awa_Dakar' })).code).toBe('functions/permission-denied');
    expect((await api(a, 'pencModerate', { pencId: 'penc_1', action: 'cohost', target: 'Moussa_Thies' })).ok).toBe(true);
    expect((await api(a, 'pencModerate', { pencId: 'penc_1', action: 'cohost', target: 'Moussa_Thies' })).message).toBe('Déjà co-animateur(trice)');
    await expect.poll(async () => (await notifs(suktum, 'Moussa_Thies')).map((n) => [n.type, n.text])).toContainEqual(['penc_cohost_invite', 'Causerie']);
    expect((await api(a, 'pencModerate', { pencId: 'penc_1', action: 'kick', target: 'Moussa_Thies' })).ok).toBe(true);
    expect(await suktum.storage.readJSON('penc:penc_1')).toMatchObject({ participants: ['Awa_Dakar'], coHosts: [], kicked: ['Moussa_Thies'] });
    await suktum.storage.writeJSON('penc:penc_1', { ...(await suktum.storage.readJSON('penc:penc_1')), active: false });
    expect((await api(b, 'pencJoin', { pencId: 'penc_1' })).message).toBe('Ce Penc est terminé');
    expect(suktum.errors).toEqual([]);
  });

  test('fan-out abonnés : nouvelle publication notifiée selon la préférence privée de chaque abonné (lue par le serveur) ; publication programmée libérée par le serveur', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const c = await suktum.openDevice('C');
    await suktum.signUp(c, 'Fatou_Kaolack');
    await suktum.dismissTour(c);
    expect((await api(b, 'toggleFollow', { target: 'Awa_Dakar' })).result.following).toBe(true);
    expect((await api(c, 'toggleFollow', { target: 'Awa_Dakar' })).result.following).toBe(true);
    // C désactive les alertes de publication pour Awa (préférence privée, écrite par C dans son espace).
    await c.evaluate(() => saveWithRetry('postnotifypref:Fatou_Kaolack__Awa_Dakar', { notifyAll: false }, false));
    await suktum.storage.writeJSON('post:post_a', postDoc('post_a', 'Awa_Dakar'));
    expect((await api(b, 'notifyFollowers', { kind: 'post', id: 'post_a' })).code).toBe('functions/permission-denied'); // pas l'auteur
    const r = await api(a, 'notifyFollowers', { kind: 'post', id: 'post_a' });
    expect(r.result.notified).toBe(1);
    expect((await notifs(suktum, 'Moussa_Thies')).map((n) => n.type)).toEqual(['new_post']);
    expect((await notifs(suktum, 'Fatou_Kaolack')).map((n) => n.type)).toEqual([]);
    expect((await suktum.storage.readJSON('user:Awa_Dakar')).earlyActivityCount).toBe(1); // l. 13781
    // Notification « système » au nom de Suktum : réservée à l'équipe.
    expect((await api(b, 'notify', { toUser: 'Awa_Dakar', type: 'active_member_badge', fromUser: 'Suktum' })).code).toBe('functions/permission-denied');
    expect((await api(b, 'notify', { toUser: 'Awa_Dakar', type: 'duo', postId: 'post_a' })).result.sent).toBe(true);
    // Publication programmée : plus aucun client ne la libère ; la fonction planifiée (releaseScheduledPosts) s'en charge — vérifié ici par sa logique exportée.
    await suktum.storage.writeJSON('post:post_s', postDoc('post_s', 'Awa_Dakar', { status: 'scheduled', scheduledFor: '2000-01-01T00:00:00.000Z' }));
    await b.evaluate(() => releaseScheduledPosts());
    expect((await suktum.storage.readJSON('post:post_s')).status).toBe('scheduled');
    expect(suktum.errors).toEqual([]);
  });

  test.fixme('tentative de triche : écrire directement un like, une notification, le profil d’autrui ou les points du parrain est refusé', async ({ suktum }) => {
    // À activer quand les règles strictes (`node scripts/generate-rules.mjs --phase 06`) seront en place.
    const { b } = await twoAccounts(suktum);
    await suktum.storage.writeJSON('post:post_a', postDoc('post_a', 'Awa_Dakar'));
    expect(await suktum.cheatWrite(b, 'post:post_a', { ...(await suktum.storage.readJSON('post:post_a')), likes: ['Moussa_Thies', 'X', 'Y'] })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'notif:notif_forge', { id: 'notif_forge', toUser: 'Awa_Dakar', type: 'like', fromUser: 'Moussa_Thies', postId: null, text: '', read: false, createdAt: new Date().toISOString() })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'user:Awa_Dakar', { ...(await suktum.storage.readJSON('user:Awa_Dakar')), followers: ['Moussa_Thies'] })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'loyaltypoints:Awa_Dakar', 999999)).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'blockevent:Awa_Dakar__1', { blockedUser: 'Awa_Dakar', blockerUser: 'Moussa_Thies', createdAt: new Date().toISOString() })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'coinbalance:Awa', 999999)).toBe('permission-denied');
  });
});
