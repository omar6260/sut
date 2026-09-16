/* ---------- HISTORIQUE DE VISIONNAGE ---------- */
async function renderWatchHistory(){
  const el = document.getElementById('watch-history-grid');
  if(!el) return;
  const history = (await safeGet('watchhistory:' + currentUser, false)) || [];
  if(history.length === 0){ el.innerHTML = '<div class="empty">Aucun historique pour l’instant.</div>'; return; }
  const allPosts = await fetchPosts();
  const items = history.map(h => allPosts.find(p => p.id === h.postId)).filter(Boolean);
  el.innerHTML = items.map(p => {
    const media = p.type === 'video'
      ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>'
      : '<img src="'+p.data+'" loading="lazy">';
    return '<div class="thumb" style="cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' + media + '</div>';
  }).join('');
}
async function clearWatchHistory(){
  await saveWithRetry('watchhistory:' + currentUser, [], false);
  showToast('Historique vidé');
  await renderWatchHistory();
}
/* ---------- CONTENU DU JOUR ---------- */
async function renderDailyContent(){
  const el = document.getElementById('daily-content-list');
  if(!el) return;
  const todayKey = new Date().toISOString().slice(0,10);
  const cacheKey = 'dailycontent:' + (currentUserCountry || 'global') + '__' + todayKey;
  let cached = await safeGet(cacheKey, true);
  if(!cached){
    const posts = (await fetchPosts()).filter(p => !p.suspended && (!currentUserCountry || p.country === currentUserCountry));
    const scored = posts.map(p => ({ id: p.id, score: (p.likes ? p.likes.length : 0) * 2 + (p.views || 0) }))
      .sort((a,b) => b.score - a.score).slice(0, 6).map(x => x.id);
    cached = { postIds: scored, generatedAt: new Date().toISOString() };
    await saveWithRetry(cacheKey, cached, true);
  }
  const allPosts = await fetchPosts();
  const topPosts = cached.postIds.map(id => allPosts.find(p => p.id === id)).filter(p => p && !p.suspended);
  el.innerHTML = topPosts.length === 0
    ? '<div class="empty">Rien de particulier aujourd’hui — revenez plus tard !</div>'
    : '<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:4px;">' + topPosts.map(p => {
        const media = p.type === 'video'
          ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;" style="width:100%; height:100%; object-fit:cover; border-radius:10px;"></video>'
          : '<img src="'+p.data+'" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">';
        return '<div style="width:105px; height:150px; flex-shrink:0; cursor:pointer; position:relative;" onclick="openSinglePostView(\''+p.id+'\')">' + media + '</div>';
      }).join('') + '</div>';
}
async function renderDiscover(){
  const grid = document.getElementById('discover-grid');
  const usersResultsEl = document.getElementById('discover-users-results');
  const recoEl = document.getElementById('search-recommendation-card');
  const query = (document.getElementById('discover-search-input').value || '').toLowerCase();
  const myBlocked = await getMyBlockedUsernames();

  if(recoEl){
    const reco = await safeGet('settings:search_recommendation', true);
    const matches = query && reco && reco.keywords && reco.keywords.some(k => query.includes(k));
    if(matches && reco.username !== currentUser && !myBlocked.has(reco.username)){
      const targetUser = await safeGet('user:' + reco.username, true);
      if(targetUser){
        recoEl.innerHTML = '<div class="card" style="border-color:var(--gold); display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:14px;" onclick="openUserProfile(\''+escapeHtml(reco.username)+'\')">' +
          smallAvatarBadge(reco.username, 40) +
          '<div style="flex:1;"><p style="margin:0 0 2px; font-size:12.5px; color:rgba(245,239,227,0.6);">'+escapeHtml(reco.text || 'Compte recommandé')+'</p>' +
          '<strong style="font-size:13.5px; color:var(--gold);">@'+escapeHtml(reco.username)+'</strong></div>' +
          '</div>';
      } else { recoEl.innerHTML = ''; }
    } else {
      recoEl.innerHTML = '';
    }
  }

  if(query){
    const allUsers = await fetchUsers();
    const matchingUsers = allUsers.filter(u => u.username !== currentUser && !myBlocked.has(u.username) && u.username.toLowerCase().includes(query));
    if(matchingUsers.length === 0){
      usersResultsEl.innerHTML = '';
    } else {
      usersResultsEl.innerHTML = '<div class="eyebrow" style="margin-bottom:8px;">👤 Comptes</div>' +
        matchingUsers.map(u =>
          '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' +
          smallAvatarBadge(u.username, 32) + '<strong style="font-size:13.5px;">@'+escapeHtml(u.username)+'</strong></div>'
        ).join('') + '<div class="eyebrow" style="margin:14px 0 8px;">Publications</div>';
    }
  } else {
    usersResultsEl.innerHTML = '';
  }

  const posts = await fetchPosts();
  const filtered = posts.filter(p => !myBlocked.has(p.userId) && (!query || (p.caption||'').toLowerCase().includes(query) || p.userId.toLowerCase().includes(query)));
  if(filtered.length === 0){ grid.innerHTML = '<div class="empty">Rien à afficher pour l’instant.</div>'; return; }
  grid.innerHTML = filtered.map(p => {
    const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
    return '<div class="thumb">' + media + smallWatermark() + '</div>';
  }).join('');
}

/* ---------- PROFILE ---------- */
let avatarTapCount = 0;
let avatarTapTimer = null;
function handleAvatarTap(){
  avatarTapCount++;
  if(avatarTapTimer) clearTimeout(avatarTapTimer);
  avatarTapTimer = setTimeout(() => { avatarTapCount = 0; }, 2000);
  if(avatarTapCount >= 5){
    avatarTapCount = 0;
    clearTimeout(avatarTapTimer);
    go('admin-login');
  }
}
/* ---------- PROFIL PUBLIC (LECTURE SEULE) ---------- */
let previousScreenBeforeUserProfile = 'feed';
let currentViewedProfileUsername = null;
async function openUserProfile(username){
  if(username === currentUser){ go('profile'); return; }
  const targetUser = await safeGet('user:' + username, true);
  if(targetUser && (targetUser.blocked || []).includes(currentUser)){
    showToast('Utilisateur introuvable');
    return;
  }
  const activeEl = document.querySelector('.screen.active');
  if(activeEl && activeEl.id !== 'screen-user-profile') previousScreenBeforeUserProfile = activeEl.id.replace('screen-', '');
  currentViewedProfileUsername = username;
  go('user-profile');
  await recordProfileVisit(username);
  await renderPostNotificationPrefButton(username);
  await renderLiveNotificationPrefButton(username);
  await renderLiveHistoryButton(username);
  await renderScheduledLivesOnProfile(username, 'uprofile-scheduled-lives');
  await renderMuteButton(username);
}
function goBackFromUserProfile(){
  go(previousScreenBeforeUserProfile);
}
/* ---------- QUI A VU MON PROFIL (réciprocité : opt-out = ni vu ni voyant) ---------- */
async function isPrivateBrowsingEnabled(){
  const value = await safeGet('settings:privateProfileBrowsing', false).catch(() => null);
  return value === true;
}
async function recordProfileVisit(profileOwner){
  if(!currentUser) return;
  if(isGenuineOwnerSession) return;
  if(await isPrivateBrowsingEnabled()) return;
  await saveWithRetry('profilevisit:' + profileOwner + '__' + currentUser, {
    visitor: currentUser, profileOwner, visitedAt: new Date().toISOString()
  }, true);
}
async function togglePrivateProfileBrowsing(){
  const checked = document.getElementById('private-browsing-toggle').checked;
  await saveWithRetry('settings:privateProfileBrowsing', checked, false);
  showToast(checked ? 'Navigation privée activée — vos visites ne seront plus visibles, et vous ne verrez plus les vôtres non plus' : 'Navigation privée désactivée');
  await renderProfileVisitors();
}
async function loadPrivateBrowsingToggle(){
  const toggle = document.getElementById('private-browsing-toggle');
  if(!toggle) return;
  toggle.checked = await isPrivateBrowsingEnabled();
}
async function renderProfileVisitors(){
  const el = document.getElementById('profile-visitors-list');
  if(!el) return;
  const isPrivate = await isPrivateBrowsingEnabled();
  if(isPrivate){
    el.innerHTML = '<div class="empty">Désactivez la navigation privée pour voir qui a visité votre profil — c’est réciproque : si vous ne voulez pas être vu(e), vous ne pouvez pas voir non plus.</div>';
    return;
  }
  const keys = await safeList('profilevisit:' + currentUser + '__', true);
  const visits = [];
  for(const k of keys){ const v = await safeGet(k, true); if(v) visits.push(v); }
  visits.sort((a,b) => new Date(b.visitedAt) - new Date(a.visitedAt));
  el.innerHTML = visits.length === 0 ? '<div class="empty">Personne n’a encore visité votre profil.</div>' : visits.map(v =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(v.visitor)+'\')">' + smallAvatarBadge(v.visitor, 32) +
    '<div style="flex:1;"><strong style="font-size:13px;">@'+escapeHtml(v.visitor)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+new Date(v.visitedAt).toLocaleString('fr-FR')+'</p></div></div>'
  ).join('');
}
/* ---------- MUR DES RECOMMANDATIONS ---------- */
async function fetchRecommendationsFor(username){
  const keys = await safeList('recommendation:' + username + '__', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function submitRecommendation(){
  const target = currentViewedProfileUsername;
  if(!target || target === currentUser) return;
  const text = document.getElementById('new-recommendation-text').value.trim();
  if(!text){ showToast('Écrivez votre recommandation'); return; }
  const id = target + '__' + currentUser;
  await saveWithRetry('recommendation:' + id, { target, author: currentUser, text, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-recommendation-text').value = '';
  showToast('Recommandation publiée ✓');
  await createNotification(target, 'recommendation_received', currentUser, null, text.slice(0,60));
  await renderRecommendationWall();
}
async function deleteRecommendation(author){
  const target = currentViewedProfileUsername;
  await window.storage.delete('recommendation:' + target + '__' + author, true).catch(() => {});
  showToast('Recommandation retirée');
  await renderRecommendationWall();
}
async function renderRecommendationWall(){
  const target = currentViewedProfileUsername;
  if(!target) return;
  const formEl = document.getElementById('recommendation-add-form');
  const listEl = document.getElementById('recommendation-wall-list');
  if(!formEl || !listEl) return;
  const recommendations = await fetchRecommendationsFor(target);
  const alreadyRecommended = recommendations.some(r => r.author === currentUser);
  if(target === currentUser){
    formEl.innerHTML = '';
  } else if(alreadyRecommended){
    formEl.innerHTML = '<p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Vous avez déjà recommandé @'+escapeHtml(target)+'</p>';
  } else {
    formEl.innerHTML = '<label style="margin-top:0;">Recommander @'+escapeHtml(target)+'</label><textarea id="new-recommendation-text" placeholder="Pourquoi recommandez-vous cette personne ?"></textarea><button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="submitRecommendation()">Publier</button>';
  }
  listEl.innerHTML = recommendations.length === 0 ? '<div class="empty">Aucune recommandation pour l’instant.</div>' : recommendations.map(r =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(r.text)+'</p>' +
    '<p style="margin:0; font-size:10.5px; color:var(--gold);">— @'+escapeHtml(r.author)+(r.author === currentUser ? ' <span onclick="deleteRecommendation(\''+r.author+'\')" style="color:var(--coral); cursor:pointer; text-decoration:underline;">retirer</span>' : '')+'</p></div>'
  ).join('');
}
async function renderUserProfile(){
  const username = currentViewedProfileUsername;
  if(!username) return;
  const u = await safeGet('user:' + username, true);
  const posts = (await fetchPosts()).filter(p => p.userId === username);
  await renderRecommendationWall();
  const storefrontEl = document.getElementById('uprofile-storefront');
  if(storefrontEl){
    if(u && (u.storefrontName || u.storefrontTagline || u.storefrontBanner)){
      storefrontEl.innerHTML = '<div class="card" style="padding:0; overflow:hidden;">' +
        (u.storefrontBanner ? '<img src="'+u.storefrontBanner+'" style="width:100%; height:100px; object-fit:cover; display:block;">' : '') +
        '<div style="padding:12px;">' +
        (u.storefrontName ? '<strong style="font-size:15px; font-family:\'Baloo 2\';">🏪 '+escapeHtml(u.storefrontName)+'</strong>' : '') +
        (u.storefrontTagline ? '<p style="margin:4px 0 0; font-size:12.5px; color:rgba(245,239,227,0.7);">'+escapeHtml(u.storefrontTagline)+'</p>' : '') +
        '</div></div>';
    } else {
      storefrontEl.innerHTML = '';
    }
  }
  await renderProfileShopButton(username);
  const invisibleIndicator = document.getElementById('owner-invisible-mode-indicator');
  if(invisibleIndicator) invisibleIndicator.style.display = isGenuineOwnerSession ? 'block' : 'none';
  document.getElementById('uprofile-username').textContent = '@' + username;
  const onlineStatusEl = document.getElementById('uprofile-online-status');
  if(onlineStatusEl){
    const status = u ? formatOnlineStatus(u.lastActiveAt) : null;
    onlineStatusEl.textContent = status ? status.label : '';
    onlineStatusEl.style.color = status && status.online ? 'var(--lagoon)' : 'rgba(245,239,227,0.5)';
  }
  document.getElementById('uprofile-alumni-badge').style.display = (u && u.isAlumnus) ? 'inline-block' : 'none';
  document.getElementById('uprofile-1m-badge').style.display = (u && u.reached1M) ? 'inline-block' : 'none';
  document.getElementById('uprofile-recommended-badge').style.display = (u && u.recommendedSeller) ? 'inline-block' : 'none';
  document.getElementById('uprofile-verified-delivery-badge').style.display = (u && u.verifiedDeliveryBadge) ? 'inline-block' : 'none';
  document.getElementById('uprofile-active-member-badge').style.display = (u && u.activeMemberBadge) ? 'inline-block' : 'none';
  const wishlistEl = document.getElementById('uprofile-wishlist');
  if(wishlistEl){
    if(u && u.wishlistVisible){
      const list = (await safeGet('wishlist:' + username, true)) || [];
      const products = [];
      for(const productId of list){ const p = await safeGet('product:' + productId, true).catch(() => null); if(p) products.push(p); }
      wishlistEl.innerHTML = products.length === 0 ? '' :
        '<div class="eyebrow">🎁 Liste de souhaits</div>' +
        '<div class="card">' + products.map(p => '<p style="margin:0 0 4px; font-size:12.5px;">• '+escapeHtml(p.name)+' — '+p.price.toLocaleString('fr-FR')+' FCFA</p>').join('') + '</div>';
    } else {
      wishlistEl.innerHTML = '';
    }
  }
  document.getElementById('uprofile-audience-creator-badge').style.display = (u && u.audienceCreatorBadgeStatus === 'verified') ? 'inline-block' : 'none';
  document.getElementById('uprofile-kyc-badge').style.display = (u && u.identityVerified) ? 'inline-block' : 'none';
  document.getElementById('uprofile-buyer-badge').style.display = (u && u.reliableBuyer) ? 'inline-block' : 'none';
  document.getElementById('uprofile-count').textContent = posts.length + ' publication(s)';
  const avatarEl = document.getElementById('uprofile-avatar');
  if(u && u.photo){ avatarEl.style.backgroundImage = 'url(' + u.photo + ')'; avatarEl.textContent = ''; }
  else { avatarEl.style.backgroundImage = ''; avatarEl.textContent = username.charAt(0).toUpperCase(); }

  const followingCount = (u && u.following) ? u.following.length : 0;
  const followerCount = (u && u.followers) ? u.followers.length : 0;
  const totalLikes = posts.reduce((s,p) => s + (p.likes ? p.likes.length : 0), 0);
  document.getElementById('uprofile-following').textContent = followingCount;
  document.getElementById('uprofile-followers').textContent = followerCount;
  document.getElementById('uprofile-likes').textContent = totalLikes;

  document.getElementById('uprofile-bio').textContent = (u && u.bio) || '';
  const linkEl = document.getElementById('uprofile-link');
  if(u && u.link){ linkEl.style.display = 'inline-block'; linkEl.href = u.link; linkEl.textContent = '🔗 ' + u.link; }
  else { linkEl.style.display = 'none'; }
  const phoneEl = document.getElementById('uprofile-phone');
  if(u && u.phone){ phoneEl.style.display = 'block'; phoneEl.textContent = '📞 ' + u.phone; }
  else { phoneEl.style.display = 'none'; }

  const myUser = await safeGet('user:' + currentUser, true);
  const following = (myUser && myUser.following) || [];
  const isFollowing = following.includes(username);
  const followBtn = document.getElementById('uprofile-follow-btn');
  followBtn.textContent = isFollowing ? t('action_following') + ' ✓' : t('action_follow');
  followBtn.className = isFollowing ? 'btn btn-outline' : 'btn btn-primary';

  const myBlocked = await getMyBlockedUsernames();
  const isBlocked = myBlocked.has(username);
  document.getElementById('uprofile-block-btn').textContent = isBlocked ? '✓ Bloqué(e)' : '🚫 Bloquer';

  const featuredEl = document.getElementById('uprofile-featured');
  const featuredPosts = posts.filter(p => p.pinnedToProfile);
  featuredEl.innerHTML = featuredPosts.length === 0 ? '' : '<div class="eyebrow" style="margin-top:0;">⭐ Publications favorites</div>' +
    '<div class="grid3">' + featuredPosts.map(p => {
      const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
      return '<div class="thumb" style="cursor:pointer; border:2px solid var(--gold);" onclick="openSinglePostView(\''+p.id+'\')">' + media + smallWatermark() + '</div>';
    }).join('') + '</div>';
  await renderProfilePlaylists(username, 'uprofile-playlists');

  const grid = document.getElementById('uprofile-grid');
  if(posts.length === 0){ grid.innerHTML = '<div class="empty">Aucune publication pour l’instant.</div>'; }
  else{
    grid.innerHTML = posts.map(p => {
      const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
      return '<div class="thumb" style="cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' + media + smallWatermark() + '</div>';
    }).join('');
  }
}
async function toggleFollowFromProfile(){
  if(!currentViewedProfileUsername) return;
  await toggleFollow(currentViewedProfileUsername);
  await renderUserProfile();
}
async function reportUserAccount(){
  if(!currentViewedProfileUsername) return;
  const reason = prompt('Pourquoi signalez-vous le compte @' + currentViewedProfileUsername + ' ?');
  if(reason === null || !reason.trim()) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'account', targetUser: currentViewedProfileUsername,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Compte signalé, merci ⚠️');
}
async function isBlockedEitherWay(otherUsername){
  if(!currentUser || !otherUsername || currentUser === otherUsername) return false;
  const me = await safeGet('user:' + currentUser, true);
  if(me && (me.blocked || []).includes(otherUsername)) return true;
  const them = await safeGet('user:' + otherUsername, true);
  if(them && (them.blocked || []).includes(currentUser)) return true;
  return false;
}
async function toggleBlockUser(){
  if(!currentViewedProfileUsername) return;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  if(!me.blocked) me.blocked = [];
  const idx = me.blocked.indexOf(currentViewedProfileUsername);
  if(idx === -1 && !me.isTrainer){
    const target = await safeGet('user:' + currentViewedProfileUsername, true);
    if(target && target.isTrainer){
      openTrainerDisputeForm(currentViewedProfileUsername);
      return;
    }
  }
  let shouldAlsoReport = false;
  if(idx === -1){
    shouldAlsoReport = confirm('Ce blocage est-il lié à du harcèlement ou un comportement abusif ? Cliquez sur OK pour aussi signaler ce compte aux modérateurs de Suktum, avec vos derniers échanges en pièce jointe.');
  }
  if(idx === -1){
    me.blocked.push(currentViewedProfileUsername);
    if(me.muted) me.muted = me.muted.filter(u => u !== currentViewedProfileUsername);
    const sharedFeedKeyOnBlock = threadKeyFor(currentUser, currentViewedProfileUsername);
    await window.storage.delete('sharedfeed:' + sharedFeedKeyOnBlock, true).catch(() => {});
    // Rompre les abonnements mutuels dans les deux sens, comme réellement exigé
    if(me.following) me.following = me.following.filter(u => u !== currentViewedProfileUsername);
    const them = await safeGet('user:' + currentViewedProfileUsername, true);
    if(them){
      if(them.followers) them.followers = them.followers.filter(u => u !== currentUser);
      if(them.following) them.following = them.following.filter(u => u !== currentUser);
      await saveWithRetry('user:' + currentViewedProfileUsername, them, true);
    }
    if(me.followers) me.followers = me.followers.filter(u => u !== currentViewedProfileUsername);
    await saveWithRetry('blockevent:' + currentViewedProfileUsername + '__' + Date.now(), { blockedUser: currentViewedProfileUsername, blockerUser: currentUser, createdAt: new Date().toISOString() }, true);
    await checkBlockSpikeThreshold(currentViewedProfileUsername);
    if(shouldAlsoReport) await fileHarassmentReportWithEvidence(currentViewedProfileUsername);
    showToast('@' + currentViewedProfileUsername + ' est bloqué(e) — vous ne verrez plus son contenu');
  } else {
    me.blocked.splice(idx, 1);
    showToast('@' + currentViewedProfileUsername + ' débloqué(e)');
  }
  await saveWithRetry('user:' + currentUser, me, true);
  await renderUserProfile();
  await renderMuteButton(currentViewedProfileUsername);
}
async function openLikersList(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(p.userId !== currentUser){
    const owner = await safeGet('user:' + p.userId, true);
    if(owner && owner.hideLikeCount){
      go('likers-list');
      document.getElementById('likers-list-content').innerHTML = '<div class="empty">🔒 Ce créateur a choisi de masquer qui a aimé cette publication.</div>';
      return;
    }
  }
  go('likers-list');
  const el = document.getElementById('likers-list-content');
  const myBlocked = await getMyBlockedUsernames();
  const likers = (p.likes || []).filter(u => !myBlocked.has(u));
  if(likers.length === 0){ el.innerHTML = '<div class="empty">Personne n’a encore aimé cette publication.</div>'; return; }
  el.innerHTML = likers.map(u => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' +
    smallAvatarBadge(u, 36) + '<span style="font-size:13.5px;">@'+escapeHtml(u)+'</span></div>'
  ).join('');
}
async function getMyBlockedUsernames(){
  const me = await safeGet('user:' + currentUser, true);
  return new Set((me && me.blocked) || []);
}

let profileActiveTab = 'posts';
async function renderProfile(){
  await checkSubscriptionRenewalReminder();
  await checkRecurringOrderReminders();
  await checkTrialExpiryReminder();
  await checkReceiptConfirmReminder();
  await checkShippingReminder();
  await checkMissedConferences();
  await renderProfileDeliveryTracking();
  await checkAccountAnniversary();
  await checkServiceBookingReminders();
  await checkMonthlySellerReport();
  await checkSellerInactivityReminder();
  document.getElementById('profile-username').textContent = '@' + (currentUser || '');
  const avatarEl = document.getElementById('profile-avatar');
  const posts = (await fetchPosts()).filter(p => p.userId === currentUser);
  document.getElementById('profile-count').textContent = posts.length + ' publication(s)';
  const featuredEl = document.getElementById('profile-featured');
  const myFeaturedPosts = posts.filter(p => p.pinnedToProfile);
  if(featuredEl){
    featuredEl.innerHTML = myFeaturedPosts.length === 0 ? '' : '<div class="eyebrow" style="margin-top:0;">⭐ Mes publications favorites</div>' +
      '<div class="grid3">' + myFeaturedPosts.map(p => {
        const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
        return '<div class="thumb" style="cursor:pointer; border:2px solid var(--gold);" onclick="openSinglePostView(\''+p.id+'\')">' + media + smallWatermark() + '</div>';
      }).join('') + '</div>';
  }
  await renderProfilePlaylists(currentUser, 'my-playlists-preview');
  const me = await safeGet('user:' + currentUser, true);
  document.getElementById('profile-alumni-badge').style.display = (me && me.isAlumnus) ? 'inline-block' : 'none';
  document.getElementById('profile-1m-badge').style.display = (me && me.reached1M) ? 'inline-block' : 'none';
  document.getElementById('profile-recommended-badge').style.display = (me && me.recommendedSeller) ? 'inline-block' : 'none';
  document.getElementById('profile-verified-delivery-badge').style.display = (me && me.verifiedDeliveryBadge) ? 'inline-block' : 'none';
  document.getElementById('profile-active-member-badge').style.display = (me && me.activeMemberBadge) ? 'inline-block' : 'none';
  document.getElementById('profile-kyc-badge').style.display = (me && me.identityVerified) ? 'inline-block' : 'none';
  document.getElementById('profile-buyer-badge').style.display = (me && me.reliableBuyer) ? 'inline-block' : 'none';
  if(me && me.photo){
    avatarEl.style.backgroundImage = 'url(' + me.photo + ')';
    avatarEl.textContent = '';
  } else {
    avatarEl.style.backgroundImage = '';
    avatarEl.textContent = (currentUser || '?').charAt(0).toUpperCase();
  }
  document.getElementById('profile-username-input').placeholder = 'Actuel : @' + currentUser;
  const followerCount = (me && me.followers) ? me.followers.length : 0;
  const followingCount = (me && me.following) ? me.following.length : 0;
  const totalLikes = posts.reduce((s,p) => s + (p.likes ? p.likes.length : 0), 0);
  document.getElementById('stat-following').textContent = followingCount;
  document.getElementById('stat-followers').textContent = followerCount;
  document.getElementById('stat-likes').textContent = totalLikes;

  document.getElementById('profile-bio-display').textContent = (me && me.bio) ? me.bio : '';
  document.getElementById('profile-bio-input').value = (me && me.bio) || '';
  document.getElementById('profile-link-input').value = (me && me.link) || '';
  document.getElementById('profile-phone-input').value = (me && me.phone) || '';
  document.getElementById('profile-city-input').value = (me && me.city) || '';
  document.getElementById('profile-origin-country-input').value = (me && me.originCountry) || '';
  document.getElementById('profile-gender-input').value = (me && me.gender) || '';
  const hasAnyProfileInfo = !!(me && (me.bio || me.link || me.phone || me.city || me.originCountry || me.gender));
  document.getElementById('profile-edit-menu-btn').textContent = hasAnyProfileInfo ? '✏️ Modifier ma bio, mon lien, mon numéro...' : '➕ Ajouter une bio, un lien, un numéro...';
  const phoneEl = document.getElementById('profile-phone-display');
  if(me && me.phone){
    phoneEl.style.display = 'block';
    phoneEl.textContent = '📞 ' + me.phone;
  } else {
    phoneEl.style.display = 'none';
  }
  const linkEl = document.getElementById('profile-link-display');
  if(me && me.link){
    linkEl.style.display = 'inline-block';
    linkEl.href = me.link;
    linkEl.textContent = '🔗 ' + me.link;
  } else {
    linkEl.style.display = 'none';
  }

  await renderProfileGrid();
  await renderContentGoalCard();
  await renderDailyStreakCard();
  await loadDoNotDisturbSettings();
  await loadAutoplayToggle();
  await renderThemePicker();
  await renderProfileHighlights();
  await renderReferralCard(me);
}
async function renderBadgeCard(me){
  const el = document.getElementById('badge-card');
  if(!el) return;
  if(me && me.verifiedBadge){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Vous avez le badge vérifié.</p>';
    return;
  }
  const pendingReq = (await fetchBadgeRequests()).find(r => r.username === currentUser && r.status === 'pending');
  if(pendingReq){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Paiement en attente de vérification ('+pendingReq.price.toLocaleString('fr-FR')+' FCFA).</p>';
    return;
  }
  const price = await getBadgePrice();
  el.innerHTML = '<p style="margin:0 0 10px; font-size:13px;">Un badge vérifié permanent, en un paiement unique.</p>' +
    '<p style="margin:0 0 10px; font-size:16px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+price.toLocaleString('fr-FR')+' FCFA (une fois)</p>' +
    '<button class="btn btn-outline" onclick="requestVerifiedBadge()">✓ Obtenir le badge vérifié</button>';
}
async function sellMyProduct(){
  const name = document.getElementById('my-product-name').value.trim();
  const price = parseInt(document.getElementById('my-product-price').value, 10);
  const fileInput = document.getElementById('my-product-image');
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.shopSuspended){ showToast('Votre boutique est suspendue — contactez le support'); return; }
  if(!name || isNaN(price) || price <= 0){ showToast('Renseignez au moins le nom et un prix valide'); return; }
  let image = null;
  if(fileInput.files[0]){
    try{ image = await readFileAsDataURL(fileInput.files[0]); }catch(e){}
  }
  const id = 'prod_' + Date.now();
  await saveWithRetry('product:' + id, {
    id, name, price, country: currentUserCountry, image, sellerUsername: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('my-product-name').value = '';
  document.getElementById('my-product-price').value = '';
  fileInput.value = '';
  showToast('Produit mis en vente ✓');
}

async function importProductsFromCSV(){
  const fileInput = document.getElementById('csv-import-input');
  const statusEl = document.getElementById('csv-import-status');
  const file = fileInput.files[0];
  if(!file){ statusEl.textContent = 'Choisissez un fichier CSV d’abord.'; return; }
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.shopSuspended){ statusEl.textContent = 'Votre boutique est suspendue.'; return; }
  statusEl.textContent = 'Import en cours...';
  try{
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let imported = 0, skipped = 0;
    for(const line of lines){
      const parts = line.split(',');
      if(parts.length < 2) { skipped++; continue; }
      const name = parts[0].trim();
      const price = parseInt(parts[1].trim(), 10);
      if(!name || isNaN(price) || price <= 0 || /^(nom|name)$/i.test(name)){ skipped++; continue; }
      const id = 'prod_' + Date.now() + '_' + imported;
      await saveWithRetry('product:' + id, {
        id, name, price, country: currentUserCountry, image: null, sellerUsername: currentUser, createdAt: new Date().toISOString()
      }, true);
      imported++;
    }
    statusEl.textContent = imported + ' produit(s) importé(s)' + (skipped > 0 ? ', ' + skipped + ' ligne(s) ignorée(s)' : '') + ' ✓';
    showToast('Import terminé ✓');
    fileInput.value = '';
  }catch(e){
    statusEl.textContent = 'Impossible de lire ce fichier CSV.';
  }
}

