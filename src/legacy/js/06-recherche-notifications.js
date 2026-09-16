/* ---------- RECHERCHE GÉNÉRALE + HISTORIQUE ---------- */
async function fetchSearchHistory(){
  return (await safeGet('searchhistory:' + currentUser, true)) || [];
}
async function addToSearchHistory(query){
  if(!currentUser || !query) return;
  let history = await fetchSearchHistory();
  history = history.filter(q => q.toLowerCase() !== query.toLowerCase());
  history.unshift(query);
  history = history.slice(0, 8);
  await saveWithRetry('searchhistory:' + currentUser, history, true);
}
async function removeFromSearchHistory(query){
  let history = await fetchSearchHistory();
  history = history.filter(q => q !== query);
  await saveWithRetry('searchhistory:' + currentUser, history, true);
  await renderDiscoverSearchResults();
}
async function clearSearchHistory(){
  await saveWithRetry('searchhistory:' + currentUser, [], true);
  await renderDiscoverSearchResults();
  showToast('Historique de recherche effacé ✓');
}
async function trackAdClickAndDiscover(adId, category){
  const ad = await safeGet('ad:' + adId, true).catch(() => null);
  if(ad){
    ad.clicks = (ad.clicks || 0) + 1;
    await saveWithRetry('ad:' + adId, ad, true);
  }
  if(currentUser){
    await saveWithRetry('adclickattribution:' + currentUser, { adId, clickedAt: new Date().toISOString() }, false);
  }
  go('discover');
  await runDiscoverSearch(category);
}
async function recordAdConversionIfAttributed(){
  if(!currentUser) return;
  const attribution = await safeGet('adclickattribution:' + currentUser, false).catch(() => null);
  if(!attribution) return;
  const ageMs = Date.now() - new Date(attribution.clickedAt).getTime();
  if(ageMs > 60 * 60 * 1000){
    await window.storage.delete('adclickattribution:' + currentUser, false).catch(() => {});
    return;
  }
  const ad = await safeGet('ad:' + attribution.adId, true).catch(() => null);
  if(ad){
    ad.conversions = (ad.conversions || 0) + 1;
    await saveWithRetry('ad:' + attribution.adId, ad, true);
  }
  await window.storage.delete('adclickattribution:' + currentUser, false).catch(() => {});
}
async function runDiscoverSearchFromAnchor(tag){
  go('discover');
  await runDiscoverSearch('#' + tag);
}
async function runDiscoverSearch(query){
  document.getElementById('discover-search-input').value = query;
  await addToSearchHistory(query);
  await renderDiscoverSearchResults();
}
async function renderDiscoverSearchResults(){
  const el = document.getElementById('discover-search-results');
  const input = document.getElementById('discover-search-input');
  const query = (input ? input.value : '').trim();
  if(!query){
    const history = await fetchSearchHistory();
    el.innerHTML = history.length === 0 ? '' : '<div class="eyebrow" style="margin-top:0; display:flex; justify-content:space-between; align-items:center;"><span>🕐 Recherches récentes</span><span onclick="clearSearchHistory()" style="font-size:11px; color:var(--coral); cursor:pointer; text-transform:none; font-weight:400;">Tout effacer</span></div>' +
      history.map(q => '<div class="card" style="display:flex; align-items:center; padding:8px 12px;">' +
        '<span style="flex:1; font-size:13px; cursor:pointer;" onclick="runDiscoverSearch(\''+escapeHtml(q).replace(/'/g,"\\'")+'\')">🕐 '+escapeHtml(q)+'</span>' +
        '<span onclick="removeFromSearchHistory(\''+escapeHtml(q).replace(/'/g,"\\'")+'\')" style="color:rgba(245,239,227,0.4); cursor:pointer; padding:2px 6px;">✕</span></div>'
      ).join('');
    return;
  }
  await addToSearchHistory(query);
  const parts = [];
  if(query.startsWith('#')){
    const tag = query.slice(1).toLowerCase();
    if(tag) parts.push('<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:8px;" onclick="openHashtagPage(\''+tag+'\')">Voir toutes les publications #'+escapeHtml(tag)+'</button>');
  } else {
    const allUsers = await fetchUsers();
    const matches = allUsers.filter(u => u.username.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
    if(matches.length > 0){
      parts.push('<div class="eyebrow" style="margin-top:0;">Utilisateurs</div>');
      parts.push(matches.map(u => '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' + smallAvatarBadge(u.username, 32) + '<span style="font-size:13px;">@'+escapeHtml(u.username)+'</span></div>').join(''));
    }
    parts.push('<button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="openHashtagPage(\''+query.toLowerCase()+'\')">Voir les publications #'+escapeHtml(query.toLowerCase())+'</button>');
    if(matches.length === 0) parts.unshift('<div class="empty">Aucun utilisateur trouvé pour « '+escapeHtml(query)+' ».</div>');
    const soundMatches = (await fetchSounds()).filter(s => s.name.toLowerCase().includes(query.toLowerCase()) || (s.artist && s.artist.toLowerCase().includes(query.toLowerCase()))).slice(0, 5);
    if(soundMatches.length > 0){
      parts.push('<div class="eyebrow">🎵 Sons</div>');
      parts.push(soundMatches.map(s =>
        '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
        '<div style="flex:1;"><strong style="font-size:12.5px;">'+escapeHtml(s.name)+'</strong>' +
        (s.artist ? '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">🎤 '+escapeHtml(s.artist)+'</p>' : '') + '</div>' +
        '<button class="btn btn-outline btn-sm" onclick="selectSharedSound(\''+s.id+'\')">Utiliser</button>' +
        '</div>'
      ).join(''));
    }
  }
  el.innerHTML = parts.join('');
}
async function openHashtagPage(tag){
  currentHashtagPage = '#' + tag.toLowerCase();
  go('hashtag-page');
}
async function renderHashtagPage(){
  if(!currentHashtagPage) return;
  document.getElementById('hashtag-page-title').textContent = currentHashtagPage;
  const posts = await fetchPosts();
  const myBlocked = await getMyBlockedUsernames();
  let matching = posts.filter(p => !myBlocked.has(p.userId) && extractHashtags(p.caption).includes(currentHashtagPage));
  const dateFilter = document.getElementById('hashtag-filter-date') ? document.getElementById('hashtag-filter-date').value : 'all';
  if(dateFilter !== 'all'){
    const cutoffs = { '24h': 1, '7d': 7, '30d': 30 };
    const cutoffDate = new Date(Date.now() - cutoffs[dateFilter] * 24*60*60*1000);
    matching = matching.filter(p => new Date(p.createdAt) >= cutoffDate);
  }
  const sortFilter = document.getElementById('hashtag-filter-sort') ? document.getElementById('hashtag-filter-sort').value : 'recent';
  if(sortFilter === 'popular'){
    matching = [...matching].sort((a,b) => ((b.likes?b.likes.length:0) + (b.views||0)) - ((a.likes?a.likes.length:0) + (a.views||0)));
  } else {
    matching = [...matching].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  document.getElementById('hashtag-page-count').textContent = matching.length + ' publication(s)';
  const grid = document.getElementById('hashtag-page-grid');
  if(matching.length === 0){ grid.innerHTML = '<div class="empty">Aucune publication avec ce mot-clé.</div>'; return; }
  grid.innerHTML = matching.map(p => {
    const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
    return '<div class="thumb">' + media + smallWatermark() + '</div>';
  }).join('');
}
/* ---------- CENTRE DE NOTIFICATIONS ---------- */
function getNotificationCategory(type){
  const categoryMap = {
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
    wanted_response: 'commerce', recurring_order_reminder: 'commerce', cagnotte_contribution: 'commerce', challenge_reward: 'commerce', duet_to_order_suggestion: 'commerce', order_cancelled: 'commerce', order_cancelled_by_seller: 'commerce', receipt_confirm_reminder: 'commerce', shipping_reminder: 'commerce', verified_delivery_badge_lost: 'commerce', dispute_resolved_buyer: 'commerce', dispute_resolved_seller: 'commerce', added_to_group: 'education', institutional_announcement: 'education', enrolled_via_institutional_import: 'education', new_course_challenge: 'education'
  };
  return categoryMap[type] || 'other';
}
async function renderActivityLog(){
  const el = document.getElementById('activity-log-list');
  if(!el) return;
  const filter = document.getElementById('activity-log-filter').value;
  const keys = await safeList('activitylog:' + currentUser + '__', true);
  let entries = [];
  for(const k of keys){ const e = await safeGet(k, true).catch(() => null); if(e && !e.hidden) entries.push({...e, id: k}); }
  if(filter !== 'all') entries = entries.filter(e => e.category === filter);
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune entrée pour l’instant.</div>'; return; }
  const categoryLabels = { contenu: '🎬 Contenu', achats: '🛒 Achats', profil: '👤 Profil' };
  el.innerHTML = entries.map(e =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:8px;">' +
    '<span onclick="openActivityLogKebabMenu(\''+e.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<p style="margin:0 0 4px; font-size:12px; color:var(--gold);">'+(categoryLabels[e.category] || e.category)+'</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(e.description)+'</p>' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+new Date(e.createdAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</p></div>'
  ).join('');
}
async function openActivityLogKebabMenu(entryId){
  const e = await safeGet(entryId, true);
  if(!e) return;
  const items = [];
  items.push({ icon: '🔍', label: 'Filtrer par cette catégorie', action: 'closeGenericKebabMenu(); document.getElementById(\'activity-log-filter\').value = \''+e.category+'\'; renderActivityLog()' });
  items.push({ icon: '📤', label: 'Exporter cette entrée', action: 'closeGenericKebabMenu(); exportActivityLogEntry(\''+entryId+'\')' });
  items.push({ icon: '🙈', label: 'Masquer', action: 'closeGenericKebabMenu(); hideActivityLogEntry(\''+entryId+'\')' });
  items.push({ icon: '🗑️', label: 'Vider cette catégorie', action: 'closeGenericKebabMenu(); clearActivityLogCategory(\''+e.category+'\')' });
  openGenericKebabMenu(items);
}
async function exportActivityLogEntry(entryId){
  const e = await safeGet(entryId, true);
  if(!e) return;
  const text = 'Suktum — Journal d’activité\n\n'+e.description+'\n'+new Date(e.createdAt).toLocaleString('fr-FR');
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function hideActivityLogEntry(entryId){
  const e = await safeGet(entryId, true);
  if(!e) return;
  e.hidden = true;
  await saveWithRetry(entryId, e, true);
  showToast('Entrée masquée');
  await renderActivityLog();
}
async function clearActivityLogCategory(category){
  if(!confirm('Vider définitivement tout le journal de la catégorie « ' + category + ' » ? Cette action est irréversible.')) return;
  const keys = await safeList('activitylog:' + currentUser + '__', true);
  for(const k of keys){
    const e = await safeGet(k, true).catch(() => null);
    if(e && e.category === category) await window.storage.delete(k, true).catch(() => {});
  }
  showToast('Catégorie vidée');
  await renderActivityLog();
}
async function logUserActivity(username, category, description){
  const id = 'activitylog:' + username + '__' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  await saveWithRetry(id, { username, category, description, createdAt: new Date().toISOString(), hidden: false }, true);
}
async function createNotification(toUser, type, fromUser, postId, text){
  if(toUser === fromUser) return;
  const target = await safeGet('user:' + toUser, true);
  if(!target) return;
  const category = getNotificationCategory(type);
  if(target.notificationPreferences && target.notificationPreferences[category] === false) return;
  const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  await saveWithRetry('notif:' + id, {
    id, toUser, type, fromUser, postId: postId || null, text: text || '', read: false, createdAt: new Date().toISOString()
  }, true);
}
async function notifyMentions(text, fromUser, postId){
  if(!text || !text.includes('@')) return;
  const allUsers = await fetchUsers();
  const usernames = allUsers.map(u => u.username).sort((a, b) => b.length - a.length); // les plus longs d'abord, pour que "gorgui faye" soit reconnu avant "gorgui" seul
  const seen = new Set();
  for(const uname of usernames){
    const escaped = uname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('@' + escaped + '(?![a-zA-Z0-9_])', 'i');
    if(pattern.test(text) && !seen.has(uname)){
      seen.add(uname);
      await createNotification(uname, 'mention', fromUser, postId, text);
    }
  }
}
/* ---------- NOTIFICATIONS GROUPÉES INTELLIGENTES ---------- */
function groupLikeNotifications(notifs){
  const grouped = [];
  const likeGroups = {};
  for(const n of notifs){
    if(n.type === 'like' && n.postId){
      if(!likeGroups[n.postId]) likeGroups[n.postId] = [];
      likeGroups[n.postId].push(n);
    } else {
      grouped.push(n);
    }
  }
  for(const postId in likeGroups){
    const group = likeGroups[postId];
    if(group.length === 1){ grouped.push(group[0]); continue; }
    grouped.push({
      ...group[0],
      __groupedUsers: group.map(g => g.fromUser),
      read: group.every(g => g.read)
    });
  }
  grouped.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return grouped;
}
function renderGroupedLikeLabel(n){
  const users = n.__groupedUsers;
  const shown = users.slice(0, 2).map(u => '@'+escapeHtml(u)).join(', ');
  const others = users.length - 2;
  return shown + (others > 0 ? ' et ' + others + ' autre(s)' : '') + ' ont aimé votre publication ❤️';
}
async function fetchMyNotifications(){
  const keys = await safeList('notif:', true);
  const all = [];
  for(const k of keys){ const n = await safeGet(k, true); if(n && n.toUser === currentUser) all.push(n); }
  const me = await safeGet('user:' + currentUser, true);
  const blockedTypes = new Set((me && me.blockedNotificationTypes) || []);
  const filtered = blockedTypes.size > 0 ? all.filter(n => !blockedTypes.has(n.type)) : all;
  filtered.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
  return filtered;
}
/* ---------- MODE NE PAS DÉRANGER PROGRAMMABLE ---------- */
async function isInDoNotDisturbWindow(){
  const settings = await safeGet('dndsettings:' + currentUser, true);
  if(!settings || !settings.enabled) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = settings.start.split(':').map(Number);
  const [endH, endM] = settings.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if(startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  return currentMinutes >= startMinutes || currentMinutes < endMinutes; // plage à cheval sur minuit
}
async function saveDoNotDisturbSettings(){
  const enabled = document.getElementById('dnd-enabled-toggle').checked;
  const start = document.getElementById('dnd-start-input').value;
  const end = document.getElementById('dnd-end-input').value;
  await saveWithRetry('dndsettings:' + currentUser, { enabled, start, end }, true);
  showToast('Réglages enregistrés ✓');
  await refreshNotifBadge();
}
async function loadDoNotDisturbSettings(){
  const settings = await safeGet('dndsettings:' + currentUser, true);
  const toggle = document.getElementById('dnd-enabled-toggle');
  const startInput = document.getElementById('dnd-start-input');
  const endInput = document.getElementById('dnd-end-input');
  if(!toggle) return;
  toggle.checked = !!(settings && settings.enabled);
  startInput.value = (settings && settings.start) || '22:00';
  endInput.value = (settings && settings.end) || '07:00';
}
async function refreshNotifBadge(){
  const badge = document.getElementById('notif-badge');
  if(!badge || !currentUser) return;
  const notifs = await fetchMyNotifications();
  const unread = notifs.filter(n => !n.read).length;
  const quiet = await isInDoNotDisturbWindow();
  if(unread > 0 && !quiet){ badge.style.display = 'flex'; badge.textContent = unread > 9 ? '9+' : unread; }
  else { badge.style.display = 'none'; }
}
async function markAllNotificationsRead(){
  const notifs = await fetchMyNotifications();
  let markedCount = 0;
  for(const n of notifs){
    if(!n.read){ n.read = true; await saveWithRetry('notif:' + n.id, n, true); markedCount++; }
  }
  await refreshNotifBadge();
  showToast(markedCount > 0 ? markedCount + ' notification(s) marquée(s) comme lue(s) ✓' : 'Rien à marquer — tout est déjà lu');
  await renderNotifications();
}
async function renderNotifications(skipAutoRead){
  const el = document.getElementById('notifications-list');
  const bannerEl = document.getElementById('dnd-active-banner');
  if(bannerEl){
    const quiet = await isInDoNotDisturbWindow();
    bannerEl.textContent = quiet ? '🌙 Mode ne pas déranger actif — vos notifications sont bien là, juste sans alerte pour l’instant.' : '';
  }
  const notifs = await fetchMyNotifications();
  const me = await safeGet('user:' + currentUser, true);
  const myFollowing = new Set((me && me.following) || []);
  if(notifs.length === 0){ el.innerHTML = '<div class="empty">Aucune notification pour l’instant.</div>'; }
  else{
    const labels = {
      like: (n) => '@'+escapeHtml(n.fromUser)+' a aimé votre publication ❤️',
      live_start: (n) => '🔴 @'+escapeHtml(n.fromUser)+' est en direct maintenant !',
      live_scheduled: (n) => '⏰ @'+escapeHtml(n.fromUser)+' a programmé un nouveau live !',
      live_reminder: (n) => '⏰ Le live de @'+escapeHtml(n.fromUser)+' commence bientôt !',
      live_cancelled: (n) => '✕ @'+escapeHtml(n.fromUser)+' a annulé son live programmé',
      message: (n) => '@'+escapeHtml(n.fromUser)+' vous a envoyé un message'+(n.text ? ' : ' + escapeHtml(n.text) : ''),
      new_post: (n) => '@'+escapeHtml(n.fromUser)+' a publié quelque chose de nouveau 🎬',
      new_lesson: (n) => '📚 Nouvelle leçon disponible : '+escapeHtml(n.text || ''),
      course_group_message: (n) => '@'+escapeHtml(n.fromUser)+' a écrit dans la discussion du cours'+(n.text ? ' : ' + escapeHtml(n.text) : ''),
      course_chat_message: (n) => '@'+escapeHtml(n.fromUser)+' a écrit dans le fil du cours'+(n.text ? ' : ' + escapeHtml(n.text) : ''),
      new_exercise: (n) => '📝 Nouvel exercice disponible : '+escapeHtml(n.text || ''),
      student_left_course: (n) => '🚪 @'+escapeHtml(n.fromUser)+' a quitté votre cours « '+escapeHtml(n.text || '')+' »',
      student_reenrolled: (n) => '♻️ @'+escapeHtml(n.fromUser)+' s’est réinscrit(e) à votre cours « '+escapeHtml(n.text || '')+' »',
      course_notes_updated: (n) => '📝 @'+escapeHtml(n.fromUser)+' a mis à jour les notes de cours partagées',
      shared_feed_invite: (n) => '🤝 @'+escapeHtml(n.fromUser)+' vous invite à créer un fil partagé',
      series_episode_released: (n) => '🎬 Nouvel épisode disponible — '+escapeHtml(n.text || ''),
      system_update: (n) => '🔔 '+escapeHtml(n.text || ''),
      bug_report_resolved: (n) => '✅ Votre signalement a été résolu — '+escapeHtml(n.text || ''),
      bug_report_closed: (n) => 'ℹ️ Votre signalement a été clos sans action — '+escapeHtml(n.text || ''),
      reaction: (n) => '@'+escapeHtml(n.fromUser)+' a réagi '+escapeHtml(n.text)+' à votre publication',
      milestone_1m: (n) => '🏆 Félicitations, vous avez atteint 1 million d’abonnés ! L’équipe Suktum va vous contacter pour vous remettre votre badge et votre cadeau en main propre.',
      comment: (n) => '@'+escapeHtml(n.fromUser)+' a commenté votre publication 💬',
      commentlike: (n) => '@'+escapeHtml(n.fromUser)+' a aimé votre commentaire ❤️',
      commentreply: (n) => '@'+escapeHtml(n.fromUser)+' a répondu à votre commentaire ↩',
      follow: (n) => '@'+escapeHtml(n.fromUser)+' a commencé à vous suivre 👥',
      mention: (n) => '@'+escapeHtml(n.fromUser)+' vous a mentionné(e)',
      referral: (n) => '@'+escapeHtml(n.fromUser)+' a rejoint Suktum grâce à vous 🎉'+(n.text && parseInt(n.text,10) > 0 ? ' — +'+n.text+' point(s) de fidélité offerts !' : ''),
      price_drop: (n) => '📢 @'+escapeHtml(n.fromUser)+' baisse un prix : '+escapeHtml(n.text),
      back_in_stock: (n) => '📦 « '+escapeHtml(n.text)+' » est de nouveau en stock chez @'+escapeHtml(n.fromUser)+' !',
      shipment_update: (n) => {
        const parts = (n.text||'').split('__');
        const stageLabels = { prepared: '📦 préparée', shipped: '🚚 expédiée', delivered: '✓ livrée' };
        return '📦 Votre commande « '+escapeHtml(parts[0])+' » est maintenant '+(stageLabels[parts[1]]||parts[1]);
      },
      duo: (n) => '🎭 @'+escapeHtml(n.fromUser)+' a fait un Duo avec votre vidéo',
      battle_challenge: (n) => '⚔️ @'+escapeHtml(n.fromUser)+' vous défie en battle !',
      battle_accepted: (n) => '⚔️ @'+escapeHtml(n.fromUser)+' a accepté votre défi de battle !',
      battle_finished: (n) => '🏁 Battle terminé — '+(n.text === 'égalité' ? 'égalité !' : (n.text === n.fromUser ? '@'+escapeHtml(n.fromUser)+' a gagné.' : 'vous avez gagné !')),
      story_question: (n) => '❓ @'+escapeHtml(n.fromUser)+' vous a posé une question sur votre story : « '+escapeHtml(n.text)+' »',
      service_slots_empty: (n) => '📅 Votre service « '+escapeHtml(n.text)+' » n’a plus aucun créneau disponible — ajoutez-en de nouveaux pour continuer à recevoir des réservations.',
      kyc_approved: (n) => '🆔 Votre identité a été vérifiée avec succès — le badge est maintenant visible sur votre profil.',
      audience_creator_badge_approved: (n) => '🌟 Vous êtes maintenant reconnu(e) comme Créateur populaire — le badge est visible sur votre profil !',
      business_account_approved: (n) => '🏢 Votre compte Business a été validé !',
      editorial_team_invite: (n) => '📅 @'+escapeHtml(n.fromUser)+' vous a ajouté(e) à son calendrier éditorial d’équipe',
      meeting_room_access_granted: (n) => '🎥 Vous avez maintenant accès à la salle de réunion d’équipe Suktum',
      team_meeting_started: (n) => '🎥 Une réunion d’équipe Suktum vient de démarrer',
      fund_dispute_resolved: (n) => '⚖️ Votre contestation du versement '+escapeHtml(n.text)+' a été examinée',
      account_suspended: (n) => '⏸ Votre compte a été temporairement suspendu'+(n.text ? ' — ' + escapeHtml(n.text) : ''),
      audio_removed: (n) => '🔇 Le son de votre vidéo a été retiré pour non-respect des règles — '+escapeHtml(n.text)+'. Vous pouvez contester ou republier une version modifiée.',
      account_reactivated: (n) => '▶️ Votre compte a été réactivé',
      live_speak_request: (n) => '🖐️ @'+escapeHtml(n.fromUser)+' demande la parole dans votre live',
      live_speak_declined: (n) => '🖐️ Votre demande de parole a été déclinée',
      live_guest_removed: (n) => '🎙️ Vous avez été retiré(e) de la parole dans le live',
      live_comod_granted: (n) => '🛡️ @'+escapeHtml(n.fromUser)+' vous a nommé(e) co-animateur(trice) de son live, avec pouvoir de modération',
      suspension_appeal_rejected: (n) => '⚖️ Votre contestation de suspension a été examinée — la suspension est maintenue',
      ban_appeal_rejected: (n) => '⚖️ Votre contestation de bannissement a été examinée — le bannissement est maintenu',
      penc_cohost_invite: (n) => '🤝 @'+escapeHtml(n.fromUser)+' vous invite comme co-animateur(trice) sur le Penc « '+escapeHtml(n.text)+' »',
      co_creator_invite: (n) => '🤝 @'+escapeHtml(n.fromUser)+' vous invite en co-créateur sur « '+escapeHtml(n.text)+' »',
      co_creator_accepted: (n) => '🤝 @'+escapeHtml(n.fromUser)+' a accepté votre invitation en co-créateur !',
      creator_fund_payout: (n) => '💰 Vous avez gagné '+escapeHtml(n.text)+' FCFA du fonds de récompense créateur ce mois-ci !',
      kyc_rejected: (n) => '🆔 Votre demande de vérification d’identité a été refusée'+(n.text ? ' : '+escapeHtml(n.text) : '')+'. Vous pouvez soumettre à nouveau.',
      reliable_buyer_badge: (n) => '🛒 Félicitations ! Vous êtes maintenant reconnu(e) comme "Acheteur fiable" grâce à vos bonnes notes des vendeurs.',
      affiliate_accepted: (n) => '🤝 @'+escapeHtml(n.fromUser)+' a accepté votre partenariat pour « '+escapeHtml(n.text)+' » — il/elle peut maintenant en faire la promotion.',
      affiliate_sale: (n) => '💰 Une vente via votre vidéo a rapporté '+escapeHtml(n.text)+' FCFA de commission !',
      cagnotte_contribution: (n) => '🎗️ @'+escapeHtml(n.fromUser)+' a contribué '+escapeHtml(n.text)+' FCFA à votre cagnotte !',
      negotiation_offer: (n) => '💬 @'+escapeHtml(n.fromUser)+' propose '+escapeHtml(n.text)+' FCFA pour votre produit',
      negotiation_accepted: (n) => '✓ @'+escapeHtml(n.fromUser)+' a accepté l’offre de '+escapeHtml(n.text)+' FCFA',
      negotiation_rejected: (n) => '✕ @'+escapeHtml(n.fromUser)+' a refusé votre offre',
      recommendation_received: (n) => '👍 @'+escapeHtml(n.fromUser)+' vous a recommandé : « '+escapeHtml(n.text)+' »',
      wanted_response: (n) => '🔍 @'+escapeHtml(n.fromUser)+' a répondu à votre recherche : « '+escapeHtml(n.text)+' »',
      auction_outbid: (n) => '🔨 @'+escapeHtml(n.fromUser)+' a surenchéri à '+escapeHtml(n.text)+' FCFA — à vous de jouer !',
      challenge_reward: (n) => '🏆 Vous avez gagné une récompense pour votre participation : '+escapeHtml(n.text),
      duet_to_order_suggestion: (n) => '💡 @'+escapeHtml(n.fromUser)+' a posé une question sur « '+escapeHtml(n.text)+' » — une réponse suggérée vous attend',
      order_cancelled: (n) => '✕ @'+escapeHtml(n.fromUser)+' a annulé sa commande de « '+escapeHtml(n.text)+' » avant expédition',
      order_cancelled_by_seller: (n) => (() => { const parts = (n.text||'').split('__'); return '✕ @'+escapeHtml(n.fromUser)+' a annulé votre commande de « '+escapeHtml(parts[0]||'')+' » — motif : '+escapeHtml(parts[1]||'non précisé'); })(),
      receipt_confirm_reminder: (n) => '📦 Avez-vous bien reçu votre commande « '+escapeHtml(n.text)+' » ? Confirmez la réception pour protéger votre historique.',
      shipping_reminder: (n) => '🚚 Une commande de « '+escapeHtml(n.text)+' » attend toujours d’être expédiée — pensez à mettre à jour son statut.',
      recurring_order_reminder: (n) => '🔔 Ça fait un mois — pensez-vous à recommander « '+escapeHtml(n.text)+' » ?',
      voice_call_started: (n) => '📞 @'+escapeHtml(n.fromUser)+' essaie de vous appeler'+(n.text ? ' à propos de « '+escapeHtml(n.text)+' »' : '')+' — ouvrez l’app pour répondre.',
      new_product_from_followed_seller: (n) => '🛍️ @'+escapeHtml(n.fromUser)+' que vous suivez vient de publier « '+escapeHtml(n.text)+' »',
      refund_requested: (n) => '💰 @'+escapeHtml(n.fromUser)+' a demandé un remboursement pour « '+escapeHtml(n.text)+' »',
      support_ticket_replied: (n) => '💬 Réponse à votre ticket de support : « '+escapeHtml(n.text)+' »',
      creator_of_the_month: (n) => '🎉 Félicitations ! Vous êtes désormais le Créateur du mois, mis en avant sur Explorer par l’équipe Suktum.',
      video_comment_reply: (n) => '🎥 @'+escapeHtml(n.fromUser)+' a répondu en vidéo à votre commentaire : « '+escapeHtml(n.text)+' »',
      addyours_response: (n) => '✨ @'+escapeHtml(n.fromUser)+' a répondu à votre "Ajoutez la vôtre" !',
      quote_repost: (n) => '💬 @'+escapeHtml(n.fromUser)+' a repartagé votre publication avec un commentaire : « '+escapeHtml(n.text)+' »',
      restricted_mode_changed: (n) => '🔒 Votre parent/tuteur @'+escapeHtml(n.fromUser)+' a '+escapeHtml(n.text)+' le Mode Familial sur votre compte.',
      stitch: (n) => '✂️ @'+escapeHtml(n.fromUser)+' a fait un Stitch avec votre vidéo',
      live_invite: (n) => '🎥 @'+escapeHtml(n.fromUser)+' vous invite en duplex sur son live',
      repost: (n) => '🔁 @'+escapeHtml(n.fromUser)+' a repartagé votre publication',
      memory: (n) => '🎂 Il y a '+escapeHtml((n.text||'').replace('il y a ',''))+', vous publiiez ceci — retrouvez-le !',
      group_invite: (n) => '👥 @'+escapeHtml(n.fromUser)+' vous a ajouté au groupe "'+escapeHtml(n.text)+'"',
      trainer_approved: (n) => '🎓 Votre candidature formateur ('+escapeHtml(n.text)+') a été validée !',
      course_approved: (n) => '🎓 '+escapeHtml(n.text)+' a été validé(e) ✓',
      new_course: (n) => '🎓 @'+escapeHtml(n.fromUser)+' vient de publier un nouveau cours : « '+escapeHtml(n.text)+' »',
      edusub_approved: (n) => '🔒 Votre abonnement à l’Espace Éducation est activé pour 30 jours ✓',
      shopsub_approved: (n) => '🏪 Votre abonnement Boutique est activé pour 30 jours ✓',
      trainer_live: (n) => '🔴 Votre formateur @'+escapeHtml(n.fromUser)+' est en ligne maintenant !',
      exercise_graded: (n) => '📝 Votre exercice a été corrigé — note : '+escapeHtml(n.text)+'/20',
      exercise_late: (n) => '⚠️ Vous êtes en retard sur l’exercice « '+escapeHtml(n.text)+' »',
      seller_inactive: (n) => '📦 Ça fait '+escapeHtml(n.text)+' jours que vous n’avez rien publié dans votre boutique — vos clients aimeraient voir de nouveaux produits !',
      trial_expiring: (n) => '🎁 Votre essai gratuit de l’Espace Éducation se termine dans '+escapeHtml(n.text)+' jour(s) — pensez à payer votre abonnement pour continuer à suivre vos cours sans interruption.',
      edu_renewal: (n) => '⏰ Votre abonnement Espace Éducation expire dans '+escapeHtml(n.text)+' jour(s) — pensez à le renouveler.',
      premium_renewal: (n) => '⏰ Votre abonnement Premium expire dans '+escapeHtml(n.text)+' jour(s) — pensez à le renouveler.',
      account_anniversary: (n) => '🎂 Joyeux anniversaire sur Suktum ! Ça fait '+escapeHtml(n.text)+' an(s) que vous nous accompagnez. Merci de faire partie de la communauté ⛵',
      substitute_assigned: (n) => '👨‍🏫 @'+escapeHtml(n.fromUser)+' vous a désigné(e) comme remplaçant(e) pour « '+escapeHtml(n.text)+' »',
      exam_graded: (n) => '📝 Votre examen a été corrigé — note : '+escapeHtml(n.text)+'/20',
      exam_result: (n) => '📋 Résultat disponible pour "'+escapeHtml((n.text||'').split('|')[0])+'" — note : '+escapeHtml((n.text||'').split('|')[1]||'')+'/20',
      contest_published: (n) => '🏆 Le classement de "'+escapeHtml(n.text)+'" est publié !',
      badge_awarded: (n) => '🏅 @'+escapeHtml(n.fromUser)+' vous a décerné un badge : '+escapeHtml(n.text),
      parent_link_request: (n) => '👨‍👩‍👧 @'+escapeHtml(n.fromUser)+' demande à suivre votre progression',
      parent_link_approved: (n) => '👨‍👩‍👧 @'+escapeHtml(n.fromUser)+' a autorisé votre suivi ✓',
      conference_reminder: (n) => '⏰ La conférence de @'+escapeHtml(n.fromUser)+' commence bientôt !',
      conference_missed: (n) => '📡 La conférence programmée de @'+escapeHtml(n.fromUser)+' ne semble pas avoir eu lieu — contactez-le si besoin.',
      event_participation: (n) => '🎪 @'+escapeHtml(n.fromUser)+' participe à votre événement « '+escapeHtml(n.text)+' »',
      cotrainer_added: (n) => '🤝 @'+escapeHtml(n.fromUser)+' vous a ajouté comme co-formateur sur « '+escapeHtml(n.text)+' »',
      post_tip: (n) => '💰 @'+escapeHtml(n.fromUser)+' vous a envoyé un pourboire de '+escapeHtml(n.text)+' FCFA !',
      direct_gift: (n) => '💝 @'+escapeHtml(n.fromUser)+' vous a envoyé un don de '+escapeHtml(n.text)+' FCFA !',
      ad_approved: (n) => '✅ Votre campagne publicitaire « '+escapeHtml(n.text)+' » a été validée — elle est maintenant diffusée dans le fil.',
      ad_rejected: (n) => '✕ Votre campagne publicitaire « '+escapeHtml(n.text)+' » n’a pas été validée par l’équipe Suktum.',
      ad_budget_spent: (n) => (() => { const parts = (n.text||'').split('__'); return '📊 Votre campagne « '+escapeHtml(parts[0]||'')+' » a atteint son budget après '+escapeHtml(parts[1]||'0')+' vue(s) — la diffusion s’est arrêtée automatiquement.'; })(),
      service_booked: (n) => (() => { const parts = (n.text||'').split('__'); return '📅 @'+escapeHtml(n.fromUser)+' a réservé votre service « '+escapeHtml(parts[0]||'')+' » pour le '+new Date(parts[1]||n.createdAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'.'; })(),
      service_reminder: (n) => (() => { const parts = (n.text||'').split('__'); return '⏰ Rappel : rendez-vous « '+escapeHtml(parts[0]||'')+' » avec @'+escapeHtml(n.fromUser)+' le '+new Date(parts[1]||n.createdAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'.'; })(),
      stock_out: (n) => '📦 Votre produit « '+escapeHtml(n.text)+' » est en rupture de stock.',
      stock_low: (n) => (() => { const parts = (n.text||'').split('__'); return '📦 Il ne reste que '+escapeHtml(parts[1]||'peu')+' en stock pour « '+escapeHtml(parts[0]||'')+' » — pensez à réapprovisionner.'; })(),
      monthly_seller_report: (n) => (() => { const parts = (n.text||'').split('__'); return '📊 Rapport de '+escapeHtml(parts[0]||'')+' : '+escapeHtml(parts[1]||'0')+' vente(s), '+escapeHtml(parts[2]||'0')+' FCFA de chiffre d’affaires, '+escapeHtml(parts[3]||'0')+' nouveau(x) client(s)'+(parts[4] && parts[4] !== '-' ? ', note moyenne '+escapeHtml(parts[4])+'⭐' : '')+'.'; })(),
      recommended_seller_badge: (n) => '🏅 Félicitations ! Vous êtes maintenant "Vendeur recommandé" grâce à vos bonnes notes et votre rapidité d’expédition.',
      active_member_badge: (n) => '🌟 Félicitations ! Vous êtes maintenant "Membre actif" grâce à vos publications qui ont marqué la communauté.',
      verified_delivery_badge: (n) => '🤝 Félicitations ! Vous avez obtenu le badge "Livraisons vérifiées" grâce au taux élevé de réceptions confirmées par vos acheteurs.',
      verified_delivery_badge_lost: (n) => '📉 Votre badge "Livraisons vérifiées" a été retiré — votre taux de réceptions confirmées est retombé à '+escapeHtml(n.text)+' (seuil requis : 80%). Encouragez vos acheteurs à confirmer leurs réceptions pour le récupérer.',
      added_to_group: (n) => '👥 Vous avez été ajouté(e) au groupe « '+escapeHtml(n.text)+' » — un sujet vous attend.',
      institutional_announcement: (n) => '🏛️ Annonce officielle : '+escapeHtml(n.text),
      enrolled_via_institutional_import: (n) => '🏛️ Vous avez été inscrit(e) au cours « '+escapeHtml(n.text)+' » via un programme officiel — accès financé actif.',
      new_course_challenge: (n) => '🏆 Votre formateur @'+escapeHtml(n.fromUser)+' lance un défi : « '+escapeHtml(n.text)+' » — à vous de jouer !',
      dispute_resolved_buyer: (n) => (() => { const parts = (n.text||'').split('__'); return (parts[1] === 'upheld' ? '✓ Votre réclamation sur « ' : '✕ Votre réclamation sur « ')+escapeHtml(parts[0]||'')+' » a été examinée et jugée '+(parts[1] === 'upheld' ? 'fondée.' : 'infondée.'); })(),
      dispute_resolved_seller: (n) => (() => { const parts = (n.text||'').split('__'); return (parts[1] === 'upheld' ? '⚠️ Une réclamation contre vous sur « ' : '✓ Une réclamation contre vous sur « ')+escapeHtml(parts[0]||'')+' » a été examinée et jugée '+(parts[1] === 'upheld' ? 'fondée.' : 'infondée — vous êtes mis hors de cause.'); })(),
      admin_broadcast: (n) => '📢 Message de l’équipe Suktum : '+escapeHtml(n.text),
      state_funded_approved: (n) => '🏛️ Votre accès à l’Espace Éducation est désormais financé — plus rien à payer ✓',
      live_auto_warning: (n) => '⚠️ Votre live a été signalé par '+escapeHtml(n.text)+' personnes différentes — un premier avertissement. Le live continue, mais veillez à respecter les règles de la communauté.',
      live_chat_cooldown: (n) => '⏸ Le chat de votre live a été mis en pause 30 minutes suite à '+escapeHtml(n.text)+' signalements différents. Le live continue.',
      live_auto_cut: (n) => '⛔ Votre live a été coupé automatiquement après avoir été signalé par '+escapeHtml(n.text)+' personnes différentes.',
      warning: (n) => '⚠️ Avertissement de l’équipe Suktum : '+escapeHtml(n.text),
      live_restricted: (n) => '🚫 Votre accès aux lives est temporairement restreint suite à un avertissement.',
      appeal_approved: (n) => '✓ Votre recours a été accepté — la sanction a été levée.',
      appeal_rejected: (n) => '✕ Votre recours a été examiné et rejeté.',
      strike_issued: (n) => '🚨 Un strike a été enregistré sur votre compte — '+escapeHtml(n.text),
      satisfaction_survey: (n) => n.text === 'order' ? '🌟 Votre commande a été livrée — comment s\'est passée votre expérience ?' : '🌟 Votre demande de support a été résolue — êtes-vous satisfait(e) ?'
    };
    el.innerHTML = groupLikeNotifications(notifs).map(n =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;'+(n.read?'':' border-color:var(--gold);')+'" onclick="handleNotificationTap(\''+n.id+'\', \''+escapeHtml(n.fromUser)+'\', '+(n.postId ? '\''+n.postId+'\'' : 'null')+', \''+n.type+'\')">' +
      smallAvatarBadge(n.fromUser, 30) +
      '<span style="font-size:13px; flex:1;">'+(n.__groupedUsers ? renderGroupedLikeLabel(n) : (labels[n.type] ? labels[n.type](n) : 'Nouvelle notification'))+'</span>' +
      (n.type === 'follow'
        ? (myFollowing.has(n.fromUser)
            ? '<span style="font-size:11px; color:var(--lagoon); flex-shrink:0;">✓ Suivi(e)</span>'
            : '<button onclick="event.stopPropagation(); followBackFromNotification(\''+escapeHtml(n.fromUser)+'\')" class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:11px; flex-shrink:0;">Suivre en retour</button>')
        : '') +
      (n.type === 'battle_challenge'
        ? '<button onclick="event.stopPropagation(); acceptBattle(\''+n.postId+'\')" class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:10.5px; flex-shrink:0;">✓ Accepter</button><button onclick="event.stopPropagation(); declineBattle(\''+n.postId+'\')" class="btn btn-outline btn-sm" style="padding:4px 8px; font-size:10.5px; flex-shrink:0; margin-left:4px; border-color:var(--coral); color:var(--coral);">✕</button>'
        : '') +
      (n.type === 'satisfaction_survey'
        ? '<button onclick="event.stopPropagation(); openSatisfactionSurvey(\''+n.postId+'\', \''+n.text+'\')" class="btn btn-outline btn-sm" style="padding:4px 10px; font-size:11px; flex-shrink:0;">Répondre</button>'
        : '') +
      (n.pinned ? '<span style="font-size:14px; flex-shrink:0;">📌</span>' : '') +
      (n.read ? '' : '<span style="width:8px; height:8px; border-radius:50%; background:var(--gold); flex-shrink:0;"></span>') +
      '<span onclick="event.stopPropagation(); openNotificationKebabMenu(\''+n.id+'\')" style="font-size:18px; cursor:pointer; padding:4px; flex-shrink:0;">⋮</span>' +
      '</div>'
    ).join('');
  }
  if(!skipAutoRead){
    for(const n of notifs){
      if(!n.read){ n.read = true; await saveWithRetry('notif:' + n.id, n, true); }
    }
  }
  await refreshNotifBadge();
}
async function openNotificationKebabMenu(notifId){
  const n = await safeGet('notif:' + notifId, true);
  if(!n) return;
  const items = [];
  items.push(n.read
    ? { icon: '📩', label: 'Marquer comme non lu', action: 'closeGenericKebabMenu(); toggleNotificationReadStatus(\''+notifId+'\', false)' }
    : { icon: '✓', label: 'Marquer comme lu', action: 'closeGenericKebabMenu(); toggleNotificationReadStatus(\''+notifId+'\', true)' });
  items.push(n.pinned
    ? { icon: '📌', label: 'Désépingler', action: 'closeGenericKebabMenu(); toggleNotificationPin(\''+notifId+'\', false)' }
    : { icon: '📌', label: 'Épingler', action: 'closeGenericKebabMenu(); toggleNotificationPin(\''+notifId+'\', true)' });
  items.push({ icon: '🔕', label: 'Bloquer ce type d’alerte', action: 'closeGenericKebabMenu(); blockNotificationType(\''+n.type+'\')' });
  items.push({ icon: '🗑️', label: 'Supprimer', action: 'closeGenericKebabMenu(); deleteNotification(\''+notifId+'\')' });
  openGenericKebabMenu(items);
}
async function toggleNotificationReadStatus(notifId, read){
  const n = await safeGet('notif:' + notifId, true);
  if(!n) return;
  n.read = read;
  await saveWithRetry('notif:' + notifId, n, true);
  await renderNotifications(true);
}
async function toggleNotificationPin(notifId, pinned){
  const n = await safeGet('notif:' + notifId, true);
  if(!n) return;
  n.pinned = pinned;
  await saveWithRetry('notif:' + notifId, n, true);
  showToast(pinned ? 'Notification épinglée 📌' : 'Notification désépinglée');
  await renderNotifications(true);
}
async function deleteNotification(notifId){
  await window.storage.delete('notif:' + notifId, true).catch(() => {});
  showToast('Notification supprimée');
  await renderNotifications(true);
}
async function blockNotificationType(type){
  const me = await safeGet('user:' + currentUser, true);
  const blocked = new Set((me && me.blockedNotificationTypes) || []);
  blocked.add(type);
  me.blockedNotificationTypes = Array.from(blocked);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Ce type d’alerte ne s’affichera plus');
  await renderNotifications(true);
}
async function followBackFromNotification(username){
  await toggleFollow(username);
  showToast('Vous suivez maintenant @' + username + ' ✓');
  await renderNotifications();
}
async function handleNotificationTap(notifId, fromUser, postId, type){
  if(type === 'live_invite'){ openLiveView(postId); return; }
  if(type === 'live_start'){ openLiveView(postId); return; }
  if(type === 'live_scheduled'){ openUserProfile(fromUser); return; }
  if(type === 'live_reminder'){ openLiveView(postId); return; }
  if(type === 'live_cancelled'){ openUserProfile(fromUser); return; }
  if(type === 'audio_removed'){ openSinglePostView(postId); return; }
  if(type === 'new_product_from_followed_seller'){ openOrderScreen(postId); return; }
  if(type === 'trainer_live'){ await joinEducationalLive(postId); return; }
  if(type === 'conference_reminder'){ await joinEducationalLive(postId); return; }
  if(type === 'conference_missed'){ await openUserProfile(fromUser); return; }
  if(type === 'event_participation'){ await openEventDetail(postId); return; }
  if(type === 'group_invite'){ openGroupThread(postId); return; }
  if(type === 'exercise_graded'){
    const parts = postId.replace('exercise_', '').split('__');
    const courseId = parts[0];
    await openExerciseDetail(postId, courseId);
    return;
  }
  if(type === 'exam_result'){ await openCourseDetail(postId); return; }
  if(type === 'new_course'){ await openCourseDetail(postId); return; }
  if(type === 'shipment_update'){ go('my-orders'); return; }
  if(type === 'trial_expiring'){ go('education-hub'); return; }
  if(type === 'admin_broadcast'){ openThread(fromUser); return; }
  if(type === 'parent_link_request'){ go('parent-requests-received'); return; }
  if(type === 'parent_link_approved'){ go('parent-space'); return; }
  if(type === 'contest_published'){
    const parts = postId.replace('contest_', '').split('__');
    const courseId = parts[0];
    await openContestDetail(postId, courseId);
    return;
  }
  if(type === 'system_update'){ return; }
  if(type === 'duet_to_order_suggestion'){ await openSinglePostView(postId); return; }
  if(type === 'order_cancelled'){ go('seller-dashboard'); return; }
  if(type === 'order_cancelled_by_seller'){ await openOrderReceipt(postId); return; }
  if(type === 'receipt_confirm_reminder'){ await openOrderReceipt(postId); return; }
  if(type === 'added_to_group'){ await openCourseDetail(postId); return; }
  if(type === 'institutional_announcement'){ go('education-hub'); return; }
  if(type === 'enrolled_via_institutional_import'){ await openCourseDetail(postId); return; }
  if(type === 'new_course_challenge'){ await openChallengeDetail(postId); return; }
  if(type === 'back_in_stock'){ await openOrderScreen(postId); return; }
  if(type === 'dispute_resolved_buyer'){ await openOrderReceipt(postId); return; }
  if(type === 'dispute_resolved_seller'){ go('disputes-against-me'); return; }
  if(type === 'shipping_reminder'){ go('seller-dashboard'); return; }
  if(type === 'recommended_seller_badge' || type === 'verified_delivery_badge' || type === 'verified_delivery_badge_lost' || type === 'active_member_badge'){ go('profile'); return; }
  if(type === 'bug_report_resolved'){ return; }
  if(type === 'bug_report_closed'){ return; }
  if(postId){ openCommentsScreen(postId); }
  else{ openUserProfile(fromUser); }
}
async function joinEducationalLive(liveId){
  if(!(await requireEducationSubscription())) return;
  await openLiveView(liveId);
}

