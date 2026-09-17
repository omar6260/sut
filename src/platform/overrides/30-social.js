// Surcharges sociales (phase 06) : likes, réactions, commentaires, vues, sondages, co-création, favoris, abonnements, blocage,
// parrainage, stories, scrutins, événements/groupes, Penc, notifications (création et fan-out abonnés).
// Chargé après les scripts legacy et avant 20-init.js. Toute écriture sur le document d'un autre utilisateur passe par le
// serveur (functions/src/social) ; les écrans, toasts et enchaînements sont ceux du prototype (rendu legacy réutilisé).
(function () {
  const P = window.SuktumPlatform;
  if (window.__SUKTUM_STORAGE_INJECTED || !P || !P.api || !P.env) return; // pas de plateforme (tests mémoire) → legacy intact
  const call = (name, data) => P.api.call(name, Object.assign({ currentUser, username: currentUser }, data));
  const fail = (e) => { showToast(e.message || 'Erreur serveur'); };
  const quiet = (name) => (e) => { console.info('[phase 06 social] ' + name + ' :', e && e.message); };
  const original = {
    completeOnboarding: window.completeOnboarding, showCurrentStory: window.showCurrentStory,
    createFollowRelationship: window.createFollowRelationship,
  };

  // ---- Publications : like / dislike / réaction (l. 14283, 13830, 14264) ----
  window.toggleLike = async function (postId) {
    if (!requireAccount('Créez un compte pour aimer une publication')) return;
    let r;
    try { r = await call('toggleLike', { postId }); } catch (e) { fail(e); return; }
    if (r.liked) triggerHapticFeedback('light');
    await renderFeed();
  };
  window.toggleDislike = async function (postId) {
    if (!currentUser) return;
    try { await call('toggleDislike', { postId }); } catch (e) { fail(e); return; }
    await renderFeed();
  };
  window.selectReaction = async function (postId, emoji) {
    document.querySelectorAll('[id^="reaction-picker-"]').forEach((el) => el.remove());
    if (!currentUser) return;
    try { await call('setReaction', { postId, emoji }); } catch (e) { fail(e); return; }
    await renderFeed();
  };

  // ---- Favoris / à regarder plus tard (l. 13874, 13847) — forme legacy conservée (tableaux dans le post) ----
  window.toggleFavorite = async function (postId) {
    if (!currentUser) return;
    let r;
    try { r = await call('toggleFavorite', { postId }); } catch (e) { fail(e); return; }
    showToast(r.added ? 'Ajouté à vos favoris 🔖' : 'Retiré de vos favoris');
    if (document.getElementById('screen-feed').classList.contains('active')) await renderFeed();
    if (document.getElementById('screen-favorites').classList.contains('active')) await renderFavorites();
    if (document.getElementById('screen-profile').classList.contains('active') && profileActiveTab === 'favorites') await renderProfileGrid();
  };
  window.toggleWatchLater = async function (postId) {
    if (!requireAccount('Créez un compte pour ajouter à votre liste')) return;
    let r;
    try { r = await call('toggleWatchLater', { postId }); } catch (e) { fail(e); return; }
    showToast(r.added ? 'Ajouté à « À regarder plus tard » ⏰' : 'Retiré de votre liste');
    if (document.getElementById('screen-feed').classList.contains('active')) await renderFeed();
    if (document.getElementById('screen-watch-later').classList.contains('active')) await renderWatchLaterList();
  };

  // ---- Vues (l. 13260, 10767) : compteur serveur ; l'historique privé reste côté client ----
  window.recordPostView = async function (postId) {
    const sessionKey = postId + '__' + currentUser;
    if (postViewsCountedThisSession.has(sessionKey)) return;
    postViewsCountedThisSession.add(sessionKey);
    await call('recordView', { postId }).catch(quiet('recordView'));
    if (currentUser) {
      let history = (await safeGet('watchhistory:' + currentUser, false)) || [];
      history = history.filter((h) => h.postId !== postId);
      history.unshift({ postId, viewedAt: new Date().toISOString() });
      history = history.slice(0, 100);
      await saveWithRetry('watchhistory:' + currentUser, history, false);
    }
  };
  window.recordQualifiedView = async function (postId) {
    const sessionKey = postId + '__' + currentUser;
    if (qualifiedViewsCountedThisSession.has(sessionKey)) return;
    qualifiedViewsCountedThisSession.add(sessionKey);
    await call('recordView', { postId, qualified: true }).catch(quiet('recordView'));
  };

  // ---- Commentaires (l. 14945 addComment ; 14730/14749 likes ; 14822 suppression ; 14797/14812 modération ; 14770 épingle ; 14842 édition) ----
  window.addComment = async function (postId, text, replyToIndex, imageData, sticker) {
    let r;
    try { r = await call('addComment', { postId, text: text || '', replyToIndex: replyToIndex !== undefined && replyToIndex !== null ? replyToIndex : null, imageData: imageData || null, sticker: sticker || null }); }
    catch (e) { return { allowed: false, reason: e.message || 'Erreur serveur' }; }
    return r.allowed ? { allowed: true, pending: r.pending } : { allowed: false, reason: r.reason };
  };
  window.toggleCommentLike = async function (index) {
    if (!requireAccount('Créez un compte pour aimer un commentaire')) return;
    try { await call('toggleCommentLike', { postId: currentCommentsPostId, index }); } catch (e) { fail(e); return; }
    await renderCommentsScreen();
  };
  window.toggleCommentDislike = async function (index) {
    if (!requireAccount('Créez un compte pour réagir à un commentaire')) return;
    try { await call('toggleCommentDislike', { postId: currentCommentsPostId, index }); } catch (e) { fail(e); return; }
    await renderCommentsScreen();
  };
  window.deleteOwnComment = async function (index) {
    if (!confirm('Supprimer définitivement ce commentaire ?')) return;
    try { await call('deleteComment', { postId: currentCommentsPostId, index }); } catch (e) { fail(e); return; }
    showToast('Commentaire supprimé ✓');
    await renderCommentsScreen();
  };
  window.rejectPendingComment = async function (index) {
    if (!confirm('Supprimer définitivement ce commentaire ?')) return;
    try { await call('deleteComment', { postId: currentCommentSettingsPostId, index }); } catch (e) { fail(e); return; }
    showToast('Commentaire supprimé ✓');
    await renderPendingCommentsReview();
  };
  window.approvePendingComment = async function (index) {
    try { await call('approveComment', { postId: currentCommentSettingsPostId, index }); } catch (e) { fail(e); return; }
    showToast('Commentaire approuvé ✓');
    await renderPendingCommentsReview();
  };
  window.togglePinComment = async function (index) {
    try { await call('pinComment', { postId: currentCommentsPostId, index }); } catch (e) { fail(e); return; }
    await renderCommentsScreen();
  };
  window.saveEditComment = async function (index) {
    const input = document.getElementById('comment-edit-input-' + index);
    if (!input) return;
    const newText = input.value.trim();
    if (!newText) { showToast('Le commentaire ne peut pas être vide'); return; }
    try { await call('editComment', { postId: currentCommentsPostId, index, text: newText }); } catch (e) { fail(e); return; }
    showToast('Commentaire modifié ✓');
    await renderCommentsScreen();
  };

  // ---- Sondage sur publication (l. 33259) et co-création (l. 15080) ----
  window.voteOnPostPoll = async function (postId, optionIndex) {
    if (!requireAccount('Créez un compte pour voter')) return;
    let r;
    try { r = await call('votePostPoll', { postId, optionIndex }); } catch (e) { fail(e); return; }
    if (r.status === 'already') { showToast('Vous avez déjà voté'); return; }
    await openSinglePostView(postId);
  };
  window.acceptCoCreatorInvite = async function (postId) {
    try { await call('respondCoCreator', { postId, accept: true }); } catch (e) { fail(e); return; }
    showToast('Invitation acceptée ✓ — vous êtes maintenant crédité(e) sur cette publication');
    await openSinglePostView(postId);
  };
  window.declineCoCreatorInvite = async function (postId) {
    try { await call('respondCoCreator', { postId, accept: false }); } catch (e) { fail(e); return; }
    showToast('Invitation refusée');
    await openSinglePostView(postId);
  };

  // ---- Abonnements (l. 13579 toggleFollow, 13529 createFollowRelationship) ----
  window.toggleFollow = async function (username, sourcePostId) {
    if (!requireAccount('Créez un compte pour suivre quelqu’un')) return;
    let r;
    try { r = await call('toggleFollow', { target: username, sourcePostId: sourcePostId || null }); } catch (e) { fail(e); return; }
    if (r.following) { triggerHapticFeedback('light'); showToast('Abonné(e) à @' + username + ' ✓'); }
    else {
      showToast('Désabonné(e) de @' + username);
      await window.storage.delete('postnotifypref:' + currentUser + '__' + username, false).catch(() => {});
    }
    await renderFeed();
    await renderPostNotificationPrefButton(username);
  };
  window.createFollowRelationship = async function (followerUsername, followedUsername) {
    if (followerUsername === followedUsername) return;
    if (followerUsername !== currentUser) return original.createFollowRelationship(followerUsername, followedUsername); // pour un tiers (admin/formateur) : domaine éducation
    await call('toggleFollow', { target: followedUsername, ensure: true }).catch(quiet('createFollowRelationship'));
  };

  // ---- Blocage (l. 16240) ----
  window.toggleBlockUser = async function () {
    if (!currentViewedProfileUsername) return;
    const target = currentViewedProfileUsername;
    const me = (await safeGet('user:' + currentUser, true)) || { username: currentUser };
    const isBlocked = (me.blocked || []).includes(target);
    if (!isBlocked && !me.isTrainer) {
      const t = await safeGet('user:' + target, true);
      if (t && t.isTrainer) { openTrainerDisputeForm(target); return; }
    }
    let shouldAlsoReport = false;
    if (!isBlocked) {
      shouldAlsoReport = confirm('Ce blocage est-il lié à du harcèlement ou un comportement abusif ? Cliquez sur OK pour aussi signaler ce compte aux modérateurs de Suktum, avec vos derniers échanges en pièce jointe.');
    }
    let r;
    try { r = await call('blockUser', { target }); } catch (e) { fail(e); return; }
    if (r.blocked) {
      if (shouldAlsoReport) await fileHarassmentReportWithEvidence(target);
      showToast('@' + target + ' est bloqué(e) — vous ne verrez plus son contenu');
    } else {
      showToast('@' + target + ' débloqué(e)');
    }
    await renderUserProfile();
    await renderMuteButton(target);
  };

  // ---- Parrainage (l. 7862-7867) : appliqué par le serveur après la création du compte ----
  window.completeOnboarding = async function () {
    const name = document.getElementById('onboard-username').value.trim();
    const referralInput = document.getElementById('onboard-referral');
    const referralCode = referralInput ? referralInput.value.trim() : '';
    const existed = name ? !!(await safeGet('user:' + name, true)) : true;
    const r = await original.completeOnboarding.apply(this, arguments);
    if (!existed && referralCode && referralCode !== name && currentUser === name) {
      await call('applyReferral', { referralCode }).catch(quiet('applyReferral'));
    }
    return r;
  };

  // ---- Activité précoce (l. 24742) et fan-out abonnés (l. 13780, 13761, 24075) ----
  window.trackEarlyActivity = async function (username) {
    if (!username || username !== currentUser) return;
    await call('trackEarlyActivity', {}).catch(quiet('trackEarlyActivity'));
  };
  window.notifyFollowersOfNewPost = async function (post) {
    if (!post || !post.id) return;
    await call('notifyFollowers', { kind: 'post', id: post.id }).catch(quiet('notifyFollowers'));
  };
  window.notifyFollowersOfNewLive = async function (l) {
    if (!l || !l.id) return;
    await call('notifyFollowers', { kind: 'live', id: l.id }).catch(quiet('notifyFollowers'));
  };
  window.notifyFollowersOfScheduledLive = async function (l) {
    if (!l || !l.id) return;
    await call('notifyFollowers', { kind: 'live_scheduled', id: l.id }).catch(quiet('notifyFollowers'));
  };
  // ---- Notifications (l. 11452) : le serveur applique les préférences du destinataire ----
  window.createNotification = async function (toUser, type, fromUser, postId, text) {
    if (!toUser || toUser === fromUser || !currentUser) return;
    await call('notify', { toUser, type, fromUser: fromUser || currentUser, postId: postId || null, text: text || null }).catch(quiet('notify ' + type));
  };
  // Publications programmées (l. 8883) : fonction planifiée côté serveur.
  window.releaseScheduledPosts = async function () {};

  // ---- Stories (l. 11990 viewedBy, 12077 question répondue) ----
  window.showCurrentStory = async function () {
    const s = currentStoryQueue[currentStoryIndex];
    if (s && currentUser) {
      if (!s.viewedBy) s.viewedBy = [];
      if (!s.viewedBy.includes(currentUser)) { s.viewedBy.push(currentUser); call('markStoryViewed', { storyId: s.id }).catch(quiet('markStoryViewed')); }
    }
    return original.showCurrentStory.apply(this, arguments);
  };
  window.markStoryQuestionAnswered = async function (questionId) {
    try { await call('answerStoryQuestion', { questionId }); } catch (e) { fail(e); return; }
    showToast('Marquée comme répondue ✓');
    await renderMyStoryQuestions();
  };

  // ---- Scrutins (l. 14556 fonctionnalités, 14444/14458 créateur du mois, 14470/14479 trend, 14532 thèmes Penc, 31196 sondages) ----
  const stripPrefix = (id, prefix) => (typeof id === 'string' && id.startsWith(prefix + ':') ? id.slice(prefix.length + 1) : id);
  window.voteForFeature = async function (featureId) {
    try { await call('vote', { kind: 'feature', id: stripPrefix(featureId, 'featurevote') }); } catch (e) { fail(e); return; }
    await renderFeatureVotesList();
  };
  window.voteForCreatorOfMonth = async function (voteId) {
    try { await call('vote', { kind: 'creator', id: stripPrefix(voteId, 'creatorvote') }); } catch (e) { fail(e); return; }
    await renderCreatorVoteList();
  };
  window.voteForWeeklyTrend = async function (voteId) {
    try { await call('vote', { kind: 'trend', id: stripPrefix(voteId, 'trendvote') }); } catch (e) { fail(e); return; }
    await renderWeeklyTrendElection();
  };
  window.voteForPencTopic = async function (topicId) {
    try { await call('vote', { kind: 'penctopic', id: stripPrefix(topicId, 'penctopicvote') }); } catch (e) { fail(e); return; }
    await renderPencTopicVotesList();
  };
  window.voteOnPoll = async function (pollId, optionIndex) {
    let r;
    try { r = await call('vote', { kind: 'poll', id: stripPrefix(pollId, 'poll'), optionIndex }); } catch (e) { fail(e); return; }
    if (r.status === 'closed') { showToast('Ce sondage est clos'); return; }
    if (r.status === 'already') return;
    await renderPollsList();
  };
  window.nominateCreatorOfMonth = async function () {
    const input = document.getElementById('new-creator-nomination-input');
    const username = input.value.trim().replace(/^@/, '');
    if (!username) { showToast('Écrivez un nom d’utilisateur'); return; }
    let r;
    try { r = await call('nominate', { kind: 'creator', target: username }); } catch (e) { fail(e); return; }
    if (r.status === 'exists') { showToast('Déjà nominé(e) ce mois-ci — votez pour cette personne ci-dessous'); input.value = ''; await renderCreatorVoteList(); return; }
    input.value = '';
    showToast('Nomination ajoutée ✓');
    await renderCreatorVoteList();
  };
  window.nominateSoundForWeeklyTrend = async function (soundId) {
    let r;
    try { r = await call('nominate', { kind: 'trend', target: soundId }); } catch (e) { fail(e); return; }
    if (r.status === 'exists') { showToast('Déjà nominé cette semaine — votez ci-dessous'); await renderWeeklyTrendElection(); return; }
    showToast('Nomination ajoutée ✓');
    await renderWeeklyTrendElection();
  };

  // ---- Événements et groupes communautaires (l. 31243, 34859) ----
  window.toggleEventParticipation = async function (eventId) {
    try { await call('toggleEventParticipation', { eventId }); } catch (e) { fail(e); return; }
    await openEventDetail(eventId);
  };
  window.toggleCommunityGroupMembership = async function () {
    if (!currentCommunityGroupId) return;
    try { await call('toggleGroupMembership', { groupId: currentCommunityGroupId }); } catch (e) { fail(e); return; }
    await renderCommunityGroupWall();
  };

  // ---- Penc (l. 33217 rejoindre, 33299 message, 33338 exclure, 33362 co-animateur, 33383 quitter) ----
  window.openPencRoom = async function (pencId) {
    if (!requireAccount('Créez un compte pour rejoindre un Penc')) return;
    let r;
    try { r = await call('pencJoin', { pencId }); } catch (e) { showToast(e.message === 'Ce Penc est terminé' ? e.message : (e.message || 'Ce Penc est terminé')); return; }
    currentPencId = pencId;
    document.getElementById('penc-room-title').textContent = '🌳 ' + r.title;
    document.getElementById('penc-room-iframe').src = 'https://meet.jit.si/suktum-penc-' + pencId + '#config.startAudioOnly=true&config.startWithVideoMuted=true&config.prejoinPageEnabled=false';
    document.getElementById('penc-end-btn').style.display = r.host === currentUser ? 'block' : 'none';
    document.getElementById('penc-report-btn').style.display = r.host !== currentUser ? 'block' : 'none';
    document.getElementById('penc-cohost-invite').style.display = r.host === currentUser ? 'block' : 'none';
    go('penc-room');
    await renderPencRoomParticipants();
    if (pencRoomRefreshInterval) clearInterval(pencRoomRefreshInterval);
    pencRoomRefreshInterval = setInterval(renderPencRoomParticipants, 4000);
  };
  window.sendPencChatMessage = async function () {
    if (!currentPencId || !currentUser) return;
    const input = document.getElementById('penc-chat-input');
    const text = input.value.trim();
    if (!text) return;
    try { await call('pencMessage', { pencId: currentPencId, text }); } catch (e) { fail(e); return; }
    input.value = '';
    await renderPencRoomParticipants();
  };
  window.kickFromPenc = async function (username) {
    if (!currentPencId) return;
    if (!confirm('Exclure @' + username + ' de ce Penc ?')) return;
    try { await call('pencModerate', { pencId: currentPencId, action: 'kick', target: username }); } catch (e) { fail(e); return; }
    showToast('@' + username + ' exclu(e) du Penc ✓');
    await renderPencRoomParticipants();
  };
  window.invitePencCoHost = async function () {
    if (!currentPencId) return;
    const username = document.getElementById('penc-cohost-input').value.trim();
    if (!username) { showToast('Renseignez un nom d’utilisateur'); return; }
    if (username === currentUser) { showToast('Vous êtes déjà l’animateur'); return; }
    try { await call('pencModerate', { pencId: currentPencId, action: 'cohost', target: username }); } catch (e) { fail(e); return; }
    document.getElementById('penc-cohost-input').value = '';
    showToast('@' + username + ' invité(e) comme co-animateur(trice) ✓');
    await renderPencRoomParticipants();
  };
  window.leavePencRoom = async function () {
    if (pencRoomRefreshInterval) { clearInterval(pencRoomRefreshInterval); pencRoomRefreshInterval = null; }
    if (currentPencId && currentUser) await call('pencLeave', { pencId: currentPencId }).catch(quiet('pencLeave'));
    const iframe = document.getElementById('penc-room-iframe');
    if (iframe) iframe.removeAttribute('src');
    currentPencId = null;
    go('penc-browse');
  };
})();
