/* ---------- VOIR UNE PUBLICATION DEPUIS UN PROFIL — SUIVI "VU PAR" ---------- */
/* ---------- PUBLICATIONS FAVORITES VISIBLES PUBLIQUEMENT ---------- */
/* ---------- PLAYLIST DE VIDÉOS ---------- */
async function fetchPlaylistsByUser(username){
  const keys = await safeList('playlist:', true);
  const list = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p && p.ownerUsername === username) list.push(p); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function createPlaylist(){
  const name = document.getElementById('new-playlist-name').value.trim();
  if(!name){ showToast('Donnez un nom à votre playlist'); return; }
  const id = 'playlist_' + Date.now();
  await saveWithRetry('playlist:' + id, { id, ownerUsername: currentUser, name, postIds: [], createdAt: new Date().toISOString() }, true);
  document.getElementById('new-playlist-name').value = '';
  showToast('Playlist créée ✓');
  await renderMyPlaylists();
}
async function renderMyPlaylists(){
  const el = document.getElementById('my-playlists-list');
  if(!el) return;
  const playlists = await fetchPlaylistsByUser(currentUser);
  el.innerHTML = playlists.length === 0 ? '<div class="empty">Aucune playlist pour l’instant.</div>' : playlists.map(p =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openPlaylistDetail(\''+p.id+'\')">' +
    '<span style="font-size:20px;">🎥</span><div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+p.postIds.length+' vidéo(s)</p></div>' +
    '<span onclick="event.stopPropagation(); deletePlaylist(\''+p.id+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>'
  ).join('');
}
async function deletePlaylist(playlistId){
  const p = await safeGet('playlist:' + playlistId, true);
  if(!p || p.ownerUsername !== currentUser) return;
  await window.storage.delete('playlist:' + playlistId, true).catch(() => {});
  showToast('Playlist supprimée');
  await renderMyPlaylists();
}
let currentPlaylistDetailId = null;
async function openPlaylistDetail(playlistId){
  currentPlaylistDetailId = playlistId;
  const p = await safeGet('playlist:' + playlistId, true);
  if(!p){ showToast('Playlist introuvable'); return; }
  go('playlist-detail');
  document.getElementById('playlist-detail-title').textContent = '🎥 ' + p.name;
  const allPosts = await fetchPosts(true);
  const videos = p.postIds.map(id => allPosts.find(x => x.id === id)).filter(Boolean);
  const grid = document.getElementById('playlist-detail-grid');
  grid.innerHTML = videos.length === 0 ? '<div class="empty">Aucune vidéo dans cette playlist pour l’instant.</div>' : videos.map(v =>
    '<div class="thumb" style="cursor:pointer;" onclick="openSinglePostView(\''+v.id+'\')"><video src="'+v.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' + smallWatermark() + '</div>'
  ).join('');
}
async function openAddToPlaylistPicker(postId){
  const el = document.getElementById('add-to-playlist-picker');
  if(!el) return;
  const playlists = await fetchPlaylistsByUser(currentUser);
  if(playlists.length === 0){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:6px 0 0;">Vous n’avez pas encore de playlist — créez-en une depuis "Mes playlists" sur votre profil.</p>';
    return;
  }
  el.innerHTML = '<div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">' +
    playlists.map(p => {
      const alreadyIn = p.postIds.includes(postId);
      return '<button class="btn '+(alreadyIn?'btn-primary':'btn-outline')+' btn-sm" onclick="toggleVideoInPlaylist(\''+p.id+'\', \''+postId+'\')">'+(alreadyIn?'✓ ':'')+escapeHtml(p.name)+'</button>';
    }).join('') + '</div>';
}
async function toggleVideoInPlaylist(playlistId, postId){
  const p = await safeGet('playlist:' + playlistId, true);
  if(!p || p.ownerUsername !== currentUser) return;
  const idx = p.postIds.indexOf(postId);
  if(idx === -1){ p.postIds.push(postId); showToast('Ajoutée à « ' + p.name + ' » ✓'); }
  else { p.postIds.splice(idx, 1); showToast('Retirée de « ' + p.name + ' »'); }
  await saveWithRetry('playlist:' + playlistId, p, true);
  await openAddToPlaylistPicker(postId);
}
/* ---------- PLAYLISTS COLLABORATIVES ---------- */
async function createCollabPlaylist(){
  if(!requireAccount('Créez un compte pour lancer une playlist collaborative')) return;
  const name = document.getElementById('new-collab-playlist-name').value.trim();
  if(!name){ showToast('Donnez un nom à la playlist'); return; }
  const id = 'collabplaylist_' + Date.now();
  await saveWithRetry('collabplaylist:' + id, { id, creator: currentUser, name, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-collab-playlist-name').value = '';
  showToast('Playlist collaborative créée ✓');
  await renderCollabPlaylistsBrowse();
}
async function fetchCollabPlaylistItems(playlistId){
  const keys = await safeList('collabplaylistitem:' + playlistId + '__', true);
  const items = [];
  for(const k of keys){ const i = await safeGet(k, true); if(i) items.push(i); }
  items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return items;
}
async function renderCollabPlaylistsBrowse(){
  const el = document.getElementById('collab-playlists-browse-list');
  if(!el) return;
  const keys = await safeList('collabplaylist:', true);
  const playlists = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) playlists.push(p); }
  playlists.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(playlists.length === 0){ el.innerHTML = '<div class="empty">Aucune playlist collaborative pour l’instant.</div>'; return; }
  const rows = [];
  for(const p of playlists){
    const items = await fetchCollabPlaylistItems(p.id);
    rows.push('<div class="card" style="cursor:pointer; margin-bottom:10px; display:flex; align-items:center; gap:10px;" onclick="openCollabPlaylistDetail(\''+p.id+'\')">' +
      '<span style="font-size:20px;">🎵</span><div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">Créée par @'+escapeHtml(p.creator)+' · '+items.length+' vidéo(s)</p></div></div>');
  }
  el.innerHTML = rows.join('');
}
let currentCollabPlaylistId = null;
async function openCollabPlaylistDetail(id){
  currentCollabPlaylistId = id;
  go('collab-playlist-detail');
  await renderCollabPlaylistDetail();
}
async function renderCollabPlaylistDetail(){
  const p = await safeGet('collabplaylist:' + currentCollabPlaylistId, true);
  if(!p) return;
  document.getElementById('collab-playlist-detail-title').textContent = p.name;
  const items = await fetchCollabPlaylistItems(p.id);
  document.getElementById('collab-playlist-detail-info').textContent = 'Créée par @' + p.creator + ' · ' + items.length + ' vidéo(s)';
  const el = document.getElementById('collab-playlist-detail-items');
  if(items.length === 0){ el.innerHTML = '<div class="empty">Aucune vidéo pour l’instant — soyez le premier à en ajouter une.</div>'; return; }
  const rows = [];
  for(const item of items){
    const post = await safeGet('post:' + item.postId, true);
    if(!post) continue;
    rows.push('<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;" onclick="openSinglePostView(\''+post.id+'\')">' +
      (post.data ? '<video src="'+post.data+'" muted style="width:48px; height:64px; object-fit:cover; border-radius:6px; flex-shrink:0;"></video>' : '') +
      '<div style="flex:1;"><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.8);">'+escapeHtml((post.caption||'').slice(0,50))+'</p>' +
      '<p style="margin:2px 0 0; font-size:10.5px; color:var(--gold);">Ajoutée par @'+escapeHtml(item.addedBy)+'</p></div></div>');
  }
  el.innerHTML = rows.join('');
}
async function openAddToCollabPlaylistPicker(postId){
  if(!requireAccount('Créez un compte pour contribuer à une playlist')) return;
  const el = document.getElementById('add-to-collab-playlist-picker');
  if(!el) return;
  const keys = await safeList('collabplaylist:', true);
  const playlists = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) playlists.push(p); }
  if(playlists.length === 0){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:6px 0 0;">Aucune playlist collaborative n’existe encore — créez-en une depuis Explorer.</p>';
    return;
  }
  const itemsPerPlaylist = {};
  for(const p of playlists){ itemsPerPlaylist[p.id] = await fetchCollabPlaylistItems(p.id); }
  el.innerHTML = '<div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">' +
    playlists.map(p => {
      const already = itemsPerPlaylist[p.id].some(i => i.postId === postId);
      return '<button class="btn '+(already?'btn-primary':'btn-outline')+' btn-sm" onclick="toggleVideoInCollabPlaylist(\''+p.id+'\', \''+postId+'\')">'+(already?'✓ ':'')+escapeHtml(p.name)+'</button>';
    }).join('') + '</div>';
}
/* ---------- COMPARATEUR DE PRODUITS ---------- */
let comparatorSelectedIds = [];
async function renderComparatorSearchResults(){
  const el = document.getElementById('comparator-search-results');
  const query = (document.getElementById('comparator-search-input').value || '').toLowerCase().trim();
  if(!query){ el.innerHTML = ''; return; }
  const products = (await fetchProducts()).filter(p => p.name.toLowerCase().includes(query)).slice(0, 6);
  el.innerHTML = products.length === 0 ? '<p style="font-size:12px; color:rgba(245,239,227,0.4);">Aucun produit trouvé.</p>' : products.map(p =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:6px;" onclick="addToComparator(\''+p.id+'\')">' +
    (p.image ? '<img src="'+p.image+'" style="width:36px; height:36px; border-radius:6px; object-fit:cover;">' : '') +
    '<span style="flex:1; font-size:12.5px;">'+escapeHtml(p.name)+'</span>' +
    '<span style="font-size:12px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</span></div>'
  ).join('');
}
async function addToComparator(productId){
  if(comparatorSelectedIds.includes(productId)){ showToast('Déjà ajouté'); return; }
  if(comparatorSelectedIds.length >= 2) comparatorSelectedIds.shift();
  comparatorSelectedIds.push(productId);
  document.getElementById('comparator-search-input').value = '';
  document.getElementById('comparator-search-results').innerHTML = '';
  await renderComparatorTable();
}
function removeFromComparator(productId){
  comparatorSelectedIds = comparatorSelectedIds.filter(id => id !== productId);
  renderComparatorTable();
}
async function renderComparatorTable(){
  const el = document.getElementById('comparator-table');
  if(!el) return;
  if(comparatorSelectedIds.length === 0){ el.innerHTML = '<div class="empty">Recherchez et ajoutez des produits ci-dessus pour les comparer.</div>'; return; }
  const products = [];
  for(const id of comparatorSelectedIds){
    const p = await safeGet('product:' + id, true);
    if(p) products.push(p);
  }
  const withRatings = [];
  for(const p of products){
    const ratings = await fetchSellerRatings(p.sellerUsername);
    const avgRating = ratings.length > 0 ? (ratings.reduce((s,r) => s + r.stars, 0) / ratings.length).toFixed(1) : null;
    withRatings.push({ product: p, avgRating, ratingCount: ratings.length });
  }
  el.innerHTML = '<div style="display:grid; grid-template-columns:repeat(' + withRatings.length + ', 1fr); gap:10px;">' +
    withRatings.map(x => {
      const p = x.product;
      return '<div class="card">' +
        (p.image ? '<img src="'+p.image+'" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:8px;">' : '') +
        '<strong style="font-size:12.5px; display:block; margin-bottom:6px;">'+escapeHtml(p.name)+'</strong>' +
        '<p style="margin:0 0 4px; font-size:13px; color:var(--gold); font-weight:700;">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</p>' +
        '<p style="margin:0 0 4px; font-size:11px; color:rgba(245,239,227,0.6);">@'+escapeHtml(p.sellerUsername)+'</p>' +
        '<p style="margin:0 0 4px; font-size:11px; color:rgba(245,239,227,0.6);">'+(x.avgRating ? '⭐ '+x.avgRating+' ('+x.ratingCount+' avis)' : 'Pas encore d’avis')+'</p>' +
        '<p style="margin:0 0 8px; font-size:11px; color:rgba(245,239,227,0.6);">'+(p.stock === null || p.stock === undefined ? 'Stock illimité' : (p.stock > 0 ? p.stock + ' en stock' : 'Rupture de stock'))+'</p>' +
        '<button class="btn btn-primary btn-sm" style="width:100%; margin-bottom:6px;" onclick="openOrderScreen(\''+p.id+'\')">Commander</button>' +
        '<span onclick="removeFromComparator(\''+p.id+'\')" style="color:var(--coral); cursor:pointer; font-size:11px;">Retirer</span>' +
        '</div>';
    }).join('') + '</div>';
}
async function toggleVideoInCollabPlaylist(playlistId, postId){
  const items = await fetchCollabPlaylistItems(playlistId);
  const existing = items.find(i => i.postId === postId);
  if(existing){
    const playlist = await safeGet('collabplaylist:' + playlistId, true);
    if(existing.addedBy !== currentUser && (!playlist || playlist.creator !== currentUser)){
      showToast('Seul(e) @' + existing.addedBy + ' ou le créateur de la playlist peut retirer cette vidéo');
      return;
    }
    await window.storage.delete('collabplaylistitem:' + playlistId + '__' + postId + '__' + existing.addedBy, true).catch(() => {});
    showToast('Retirée de la playlist');
  } else {
    await saveWithRetry('collabplaylistitem:' + playlistId + '__' + postId + '__' + currentUser, {
      playlistId, postId, addedBy: currentUser, createdAt: new Date().toISOString()
    }, true);
    showToast('Ajoutée à la playlist collaborative ✓');
  }
  await openAddToCollabPlaylistPicker(postId);
}
async function renderProfilePlaylists(username, containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  const playlists = (await fetchPlaylistsByUser(username)).filter(p => p.postIds.length > 0);
  el.innerHTML = playlists.length === 0 ? '' : '<div class="eyebrow" style="margin-top:0;">🎥 Playlists</div>' +
    playlists.map(p => '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openPlaylistDetail(\''+p.id+'\')">' +
      '<span style="font-size:20px;">🎥</span><div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+p.postIds.length+' vidéo(s)</p></div></div>'
    ).join('');
}
let currentCommentSettingsPostId = null;
let commentSettingsReturnScreen = 'single-post';
async function renderManageCommentsList(){
  const el = document.getElementById('manage-comments-list-content');
  if(!el) return;
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser);
  myPosts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(myPosts.length === 0){ el.innerHTML = '<div class="empty">Vous n’avez pas encore publié.</div>'; return; }
  const restrictionLabels = { everyone: 'Tout le monde', following: 'Personnes suivies', followers: 'Mes abonnés' };
  el.innerHTML = myPosts.map(p => {
    let statusLabel;
    if(p.commentsDisabled) statusLabel = '🔒 Désactivés';
    else if(p.commentsCloseAt && new Date() > new Date(p.commentsCloseAt)) statusLabel = '⏱️ Fermés';
    else statusLabel = restrictionLabels[p.commentRestriction || 'everyone'];
    return '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer;" onclick="openCommentSettingsPanel(\''+p.id+'\')">' +
      '<span style="flex:1; font-size:12.5px;">'+escapeHtml((p.caption || '(sans légende)').slice(0,40))+'</span>' +
      '<span style="font-size:11px; color:var(--gold);">'+statusLabel+'</span></div>';
  }).join('');
}
async function openCommentSettingsPanel(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p || p.userId !== currentUser) return;
  currentCommentSettingsPostId = postId;
  const activeEl = document.querySelector('.screen.active');
  if(activeEl) commentSettingsReturnScreen = activeEl.id.replace('screen-', '');
  go('comment-settings');
  document.getElementById('comments-disabled-toggle').checked = !!p.commentsDisabled;
  document.getElementById('comment-restriction-select').value = p.commentRestriction || 'everyone';
  let closeAfterHours = '';
  if(p.commentsCloseAt){
    const totalHours = Math.round((new Date(p.commentsCloseAt) - new Date(p.createdAt)) / (60*60*1000));
    if([24, 168, 720].includes(totalHours)) closeAfterHours = String(totalHours);
  }
  document.getElementById('comment-close-after-select').value = closeAfterHours;
  document.getElementById('filter-all-comments-toggle').checked = !!p.filterAllComments;
  const pendingCount = (p.comments || []).filter(c => c.status === 'pending').length;
  document.getElementById('pending-comments-count').textContent = pendingCount;
}
async function saveCommentSettings(){
  if(!currentCommentSettingsPostId) return;
  const p = await safeGet('post:' + currentCommentSettingsPostId, true);
  if(!p || p.userId !== currentUser) return;
  p.commentsDisabled = document.getElementById('comments-disabled-toggle').checked;
  p.commentRestriction = document.getElementById('comment-restriction-select').value;
  const closeAfterHours = document.getElementById('comment-close-after-select').value;
  p.commentsCloseAt = closeAfterHours ? new Date(new Date(p.createdAt).getTime() + parseInt(closeAfterHours, 10)*60*60*1000).toISOString() : null;
  p.filterAllComments = document.getElementById('filter-all-comments-toggle').checked;
  await saveWithRetry('post:' + currentCommentSettingsPostId, p, true);
  showToast('Réglages des commentaires enregistrés ✓');
}
async function loadDefaultCommentRestrictionForPublish(){
  const select = document.getElementById('publish-comment-restriction-select');
  if(!select || !currentUser) return;
  select.value = await getMyDefaultCommentRestriction();
}
async function getMyDefaultCommentRestriction(){
  const me = await safeGet('user:' + currentUser, true);
  return (me && me.defaultCommentRestriction) || 'everyone';
}
async function addTopicPreference(){
  const input = document.getElementById('new-topic-hashtag-input');
  let tag = input.value.trim().toLowerCase().replace(/^#/, '');
  if(!tag){ showToast('Écrivez un hashtag'); return; }
  const prefs = (await safeGet('topicpreferences:' + currentUser, false)) || {};
  if(!(tag in prefs)) prefs[tag] = 0;
  await saveWithRetry('topicpreferences:' + currentUser, prefs, false);
  input.value = '';
  await renderManageTopicsList();
}
async function setTopicWeight(tag, weight){
  const prefs = (await safeGet('topicpreferences:' + currentUser, false)) || {};
  prefs[tag] = weight;
  await saveWithRetry('topicpreferences:' + currentUser, prefs, false);
  await renderManageTopicsList();
}
async function removeTopicPreference(tag){
  const prefs = (await safeGet('topicpreferences:' + currentUser, false)) || {};
  delete prefs[tag];
  await saveWithRetry('topicpreferences:' + currentUser, prefs, false);
  await renderManageTopicsList();
}
async function renderManageTopicsList(){
  const el = document.getElementById('manage-topics-list');
  if(!el) return;
  const prefs = (await safeGet('topicpreferences:' + currentUser, false)) || {};
  const tags = Object.keys(prefs);
  if(tags.length === 0){ el.innerHTML = '<div class="empty">Aucun centre d’intérêt réglé pour l’instant.</div>'; return; }
  el.innerHTML = tags.map(tag => {
    const w = prefs[tag];
    return '<div class="card" style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><strong style="font-size:13px;">#'+escapeHtml(tag)+'</strong><span onclick="removeTopicPreference(\''+escapeHtml(tag)+'\')" style="color:var(--coral); font-size:12px; cursor:pointer;">✕ Retirer</span></div>' +
      '<div style="display:flex; gap:6px;">' +
      '<button class="btn btn-sm" style="flex:1; background:'+(w===-5?'var(--coral)':'none')+'; border:1px solid var(--coral); color:'+(w===-5?'var(--night)':'var(--coral)')+';" onclick="setTopicWeight(\''+escapeHtml(tag)+'\', -5)">Moins</button>' +
      '<button class="btn btn-sm" style="flex:1; background:'+(w===0?'var(--gold)':'none')+'; border:1px solid var(--gold); color:'+(w===0?'var(--night)':'var(--gold)')+';" onclick="setTopicWeight(\''+escapeHtml(tag)+'\', 0)">Normal</button>' +
      '<button class="btn btn-sm" style="flex:1; background:'+(w===8?'var(--lagoon)':'none')+'; border:1px solid var(--lagoon); color:'+(w===8?'var(--night)':'var(--lagoon)')+';" onclick="setTopicWeight(\''+escapeHtml(tag)+'\', 8)">Plus</button>' +
      '</div></div>';
  }).join('');
}
async function saveDefaultCommentRestriction(){
  const value = document.getElementById('default-comment-restriction-select').value;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.defaultCommentRestriction = value;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Réglage par défaut enregistré ✓ — s’appliquera à vos prochaines publications');
}
async function loadDefaultCommentRestrictionSetting(){
  const select = document.getElementById('default-comment-restriction-select');
  if(!select) return;
  select.value = await getMyDefaultCommentRestriction();
}
async function togglePinToProfile(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p || p.userId !== currentUser) return;
  if(!p.pinnedToProfile){
    const myPosts = (await fetchPosts()).filter(x => x.userId === currentUser && x.pinnedToProfile);
    if(myPosts.length >= 3){ showToast('Vous pouvez mettre en avant 3 publications maximum — retirez-en une d’abord'); return; }
    p.pinnedToProfile = true;
    showToast('Ajoutée à vos favoris publics ⭐');
  } else {
    p.pinnedToProfile = false;
    showToast('Retirée de vos favoris publics');
  }
  await saveWithRetry('post:' + postId, p, true);
  await openSinglePostView(postId);
}
async function openSinglePostView(postId){
  go('single-post');
  const el = document.getElementById('single-post-content');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const upNextEl = document.getElementById('up-next-suggestion');
  if(upNextEl){ upNextEl.style.display = 'none'; upNextEl.innerHTML = ''; }
  const p = await safeGet('post:' + postId, true);
  if(!p){ el.innerHTML = '<div class="empty">Publication introuvable.</div>'; return; }

  await recordPostView(postId);
  const refreshed = await safeGet('post:' + postId, true);
  singlePostViewCachedPost = refreshed;

  const media = refreshed.type === 'video'
    ? '<video id="video-'+postId+'" data-caption="'+escapeHtml(refreshed.caption||'')+'" controls autoplay style="width:100%; border-radius:14px 14px 0 0; max-height:60vh; background:#000;" src="'+refreshed.data+'" '+(refreshed.clipStartTime !== undefined && refreshed.clipStartTime !== null ? 'onloadedmetadata="this.currentTime='+refreshed.clipStartTime+'; renderChapterMarkers(this, \''+postId+'\'); applyPreferredPlaybackSpeed(this, \''+postId+'\'); checkPictureInPictureSupport(\''+postId+'\')"' : 'onloadedmetadata="resumeVideoPlayback(this, \''+postId+'\'); renderChapterMarkers(this, \''+postId+'\'); applyPreferredPlaybackSpeed(this, \''+postId+'\'); checkPictureInPictureSupport(\''+postId+'\')"')+' ontimeupdate="'+(refreshed.clipStartTime !== undefined && refreshed.clipStartTime !== null ? 'if(this.currentTime>='+refreshed.clipEndTime+') this.currentTime='+refreshed.clipStartTime+'; ' : 'saveVideoWatchPositionThrottled(this, \''+postId+'\'); ')+'updateScrubBarPosition(\''+postId+'\'); updateSingleViewCaption(\''+postId+'\')" onplay="startVideoVoiceover(\''+escapeHtml(postId)+'\')" onpause="stopVideoVoiceover()" onended="stopVideoVoiceover(); showUpNextSuggestion(\''+postId+'\'); '+(refreshed.clipStartTime === undefined || refreshed.clipStartTime === null ? 'clearVideoWatchPosition(\''+postId+'\')' : '')+'"></video>' +
      '<div style="background:#000; border-radius:0 0 14px 14px; padding:2px 10px 8px;"><div style="position:relative;"><input type="range" id="scrub-'+postId+'" min="0" max="100" value="0" step="0.1" oninput="handleScrubInput(\''+postId+'\', this)" onchange="handleScrubCommit(\''+postId+'\')" style="width:100%; margin:0; accent-color:var(--gold);"><div id="chapter-markers-'+postId+'" style="position:absolute; top:0; left:0; right:0; height:100%; pointer-events:none;"></div></div><p id="scrub-time-'+postId+'" style="display:none; text-align:center; font-size:11px; color:var(--gold); margin:2px 0 0;"></p><div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;"><button id="pip-btn-'+postId+'" onclick="togglePictureInPicture(\''+postId+'\')" style="display:none; background:rgba(245,239,227,0.1); border:1px solid var(--line); color:var(--cream); border-radius:6px; font-size:11px; padding:3px 8px;">🖼️ Image dans l’image</button><select id="playback-speed-'+postId+'" onchange="setPreferredPlaybackSpeed(\''+postId+'\', this.value)" style="width:auto; margin:0; font-size:11px; padding:3px 6px; background:rgba(245,239,227,0.1); border:1px solid var(--line); color:var(--cream); border-radius:6px;"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><span onclick="openMediaPlayerKebabMenu(\''+postId+'\')" style="font-size:20px; cursor:pointer; padding:2px 6px; color:var(--cream); flex-shrink:0;">⋮</span></div></div>' +
    (refreshed.wordTimings && refreshed.wordTimings.length > 0 ? '<div class="word-caption-overlay" id="single-caption-overlay-'+postId+'" style="position:relative; z-index:3; text-align:center; pointer-events:none; margin-top:-60px; margin-bottom:20px; display:none;"><span style="display:inline-block; background:rgba(11,46,61,0.75); color:var(--gold); font-family:\'Baloo 2\'; font-weight:700; font-size:20px; padding:6px 16px; border-radius:10px;"></span></div>' : '')
    : '<img src="'+refreshed.data+'" style="width:100%; border-radius:14px; max-height:60vh; object-fit:cover;">';
  const isMine = refreshed.userId === currentUser;
  const hasHotspotPosition = refreshed.taggedProductId && refreshed.taggedProductX !== undefined && refreshed.taggedProductX !== null;
  const mediaWithHotspot = '<div style="position:relative;">' + media +
    (hasHotspotPosition ? '<span onclick="toggleTaggedProductCardVisibility()" style="position:absolute; left:'+refreshed.taggedProductX+'%; top:'+refreshed.taggedProductY+'%; transform:translate(-50%,-50%); width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,0.92); border:2px solid var(--gold); display:flex; align-items:center; justify-content:center; font-size:14px; cursor:pointer; box-shadow:0 0 0 5px rgba(242,183,5,0.28); z-index:2;">🛍️</span>' : '') +
    (isMine && refreshed.taggedProductId ? '<div id="hotspot-placement-overlay-'+postId+'" style="display:none; position:absolute; inset:0; cursor:crosshair; z-index:3;" onclick="placeProductHotspot(\''+postId+'\', event)"></div>' : '') +
    '</div>';
  const viewedBy = Array.isArray(refreshed.viewedBy) ? refreshed.viewedBy : [];
  const soundForSingleView = refreshed.soundId ? await safeGet('sound:' + refreshed.soundId, true) : null;
  const quotedPostForSingleView = refreshed.quotedPostId ? await safeGet('post:' + refreshed.quotedPostId, true) : null;
  const soundAttributionForSingleView = soundForSingleView
    ? (soundForSingleView.artist ? soundForSingleView.artist + ' — ' + soundForSingleView.name : 'Son original — @' + soundForSingleView.uploaderUsername)
    : (refreshed.audioData ? 'Son original — @' + refreshed.userId : '');

  const previousPart = refreshed.seriesPartOf ? await safeGet('post:' + refreshed.seriesPartOf, true) : null;
  const allPostsForSeriesLookup = await fetchPosts(true);
  const nextPart = allPostsForSeriesLookup.find(p => p.seriesPartOf === postId);

  el.innerHTML =
    mediaWithHotspot +
    ((previousPart || nextPart) ? '<div style="display:flex; gap:8px; margin-top:10px;">' +
      (previousPart ? '<button class="btn btn-outline btn-sm" style="flex:1;" onclick="openSinglePostView(\''+previousPart.id+'\')">⬅️ Partie précédente</button>' : '') +
      (nextPart ? '<button class="btn btn-primary btn-sm" style="flex:1;" onclick="openSinglePostView(\''+nextPart.id+'\')">Voir la suite ➡️</button>' : '') +
      '</div>' : '') +
    (refreshed.videoReplyTo ? '<div class="card" style="margin:10px 0; border-color:var(--lagoon); cursor:pointer;" onclick="openCommentsScreenFromReply(\''+escapeHtml(refreshed.videoReplyTo.postId)+'\')"><p style="margin:0; font-size:12px; color:var(--lagoon);">🎥 En réponse au commentaire de @'+escapeHtml(refreshed.videoReplyTo.commentAuthor)+' : « '+escapeHtml(refreshed.videoReplyTo.commentText)+' »</p></div>' : '') +
    (refreshed.suggestedReplyText && refreshed.duoWithUsername === currentUser ? '<div class="card" style="margin:10px 0; border-color:var(--gold);"><p style="margin:0 0 6px; font-size:12px; color:var(--gold); font-weight:600;">💡 Réponse suggérée pour ce spectateur</p><p style="margin:0 0 8px; font-size:12.5px; font-style:italic;">« '+escapeHtml(refreshed.suggestedReplyText)+' »</p><button class="btn btn-outline btn-sm" onclick="sendSuggestedDuetReply(\''+postId+'\')">Envoyer cette réponse en commentaire</button></div>' : '') +
    (quotedPostForSingleView ? '<div class="card" style="margin:10px 0; display:flex; gap:10px; align-items:center; cursor:pointer;" onclick="openSinglePostView(\''+escapeHtml(quotedPostForSingleView.id)+'\')"><img src="'+quotedPostForSingleView.data+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;"><div><p style="margin:0; font-size:12px; color:var(--gold);">💬 Citation de @'+escapeHtml(quotedPostForSingleView.userId)+'</p><p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.6);">'+escapeHtml((quotedPostForSingleView.caption||'').slice(0,50))+'</p></div></div>' : '') +
    '<p style="margin:14px 0 4px; font-size:13px;"><span onclick="openUserProfile(\''+escapeHtml(refreshed.userId)+'\')" style="color:var(--lagoon); cursor:pointer; font-weight:600;">@'+escapeHtml(refreshed.userId)+'</span></p>' +
    (refreshed.caption ? '<p style="margin:0 0 12px; font-size:13.5px;">'+formatCaptionWithLinks(refreshed.caption, refreshed.id)+'</p>' : '') +
    (refreshed.poll ? renderPostPollHtml(refreshed) : '') +
    (isMine && refreshed.type === 'video' ? '<div id="retention-stats-'+postId+'"></div>' : '') +
    (refreshed.coCreatorUsername && refreshed.coCreatorStatus === 'accepted'
      ? '<p style="margin:0 0 12px; font-size:12px; color:var(--lagoon);">🤝 Avec @'+escapeHtml(refreshed.coCreatorUsername)+'</p>'
      : refreshed.coCreatorUsername && refreshed.coCreatorStatus === 'pending' && refreshed.coCreatorUsername === currentUser
        ? '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 8px; font-size:12.5px;">🤝 @'+escapeHtml(refreshed.userId)+' vous invite en co-créateur sur cette publication.</p><div style="display:flex; gap:8px;"><button class="btn btn-primary btn-sm" onclick="acceptCoCreatorInvite(\''+postId+'\')">✓ Accepter</button><button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="declineCoCreatorInvite(\''+postId+'\')">✕ Refuser</button></div></div>'
        : refreshed.coCreatorUsername && refreshed.coCreatorStatus === 'pending' && refreshed.userId === currentUser
          ? '<p style="margin:0 0 12px; font-size:12px; color:var(--gold);">⏳ En attente d’acceptation de @'+escapeHtml(refreshed.coCreatorUsername)+'</p>'
          : '') +
    (soundAttributionForSingleView ? '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.7);">🎵 '+escapeHtml(soundAttributionForSingleView)+'</p>' : '') +
    (refreshed.images && refreshed.images.length > 1 && refreshed.audioData ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px;" onclick="startSyncedSlideshow(\''+escapeHtml(postId)+'\')">🖼️ Lancer le diaporama synchronisé</button>' : '') +
    '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.5);"><span onclick="openLikersList(\''+postId+'\')" style="cursor:pointer; text-decoration:underline;">❤️ '+(refreshed.likes?refreshed.likes.length:0)+'</span> · 👁️ '+(refreshed.views||0)+' vue(s)</p>' +
    (refreshed.taggedProductId ? '<div id="tagged-product-card" style="margin-bottom:10px;'+(hasHotspotPosition ? ' display:none;' : '')+'"></div>' : '') +
    '<p onclick="explainWhyThisVideo(\''+postId+'\')" style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5); cursor:pointer; text-decoration:underline;">ℹ️ Pourquoi cette vidéo ?</p>' +
    '<p id="why-this-video-explanation" style="display:none; font-size:12px; color:var(--gold); background:rgba(242,183,5,0.08); border-radius:8px; padding:10px; margin:0 0 12px;"></p>' +
    (isMine && refreshed.type === 'video' ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px;" onclick="openProductTagPicker(\''+postId+'\')">🛍️ '+(refreshed.taggedProductId ? 'Changer le produit lié' : 'Lier un produit à vendre')+'</button><div id="product-tag-picker"></div>' : '') +
    (isMine && refreshed.taggedProductId ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px; margin-left:8px; border-color:var(--gold); color:var(--gold);" onclick="startPlacingProductHotspot(\''+postId+'\')">📍 '+(hasHotspotPosition ? 'Repositionner' : 'Positionner')+' l’étiquette</button>' : '') +
    (isMine ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px;" onclick="togglePinToProfile(\''+postId+'\')">'+(refreshed.pinnedToProfile ? '📌 Retirer des favoris de mon profil' : '⭐ Mettre en avant sur mon profil')+'</button>' : '') +
    (isMine ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px; margin-left:8px;" onclick="openCommentSettingsPanel(\''+postId+'\')">💬 Gérer les commentaires</button>' : '') +
    (isMine && refreshed.type === 'video' ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px; margin-left:8px;" onclick="openAddToPlaylistPicker(\''+postId+'\')">🎥 Ajouter à une playlist</button><div id="add-to-playlist-picker"></div>' : '') +
    (refreshed.type === 'video' ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px; margin-left:8px;" onclick="openAddToCollabPlaylistPicker(\''+postId+'\')">🎵 Ajouter à une playlist collaborative</button><div id="add-to-collab-playlist-picker"></div>' : '') +
    (refreshed.soundId ? '<button class="btn btn-outline btn-sm" style="margin-bottom:10px;" onclick="useSoundFromPost(\''+refreshed.soundId+'\')">🎵 Utiliser ce son</button>' : '') +
    (isMine
      ? '<div class="eyebrow">👁️ Vu par</div><div id="single-post-viewers"></div>'
      : (viewedBy.includes(currentUser) ? '<p style="margin:0; font-size:11.5px; color:var(--lagoon);">✓ Vous avez vu cette vidéo</p>' : ''));

  if(isMine){
    const viewersEl = document.getElementById('single-post-viewers');
    const others = viewedBy.filter(u => u !== currentUser);
    viewersEl.innerHTML = others.length === 0 ? '<div class="empty">Personne d’autre n’a encore vu cette publication.</div>' : others.map(u =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' + smallAvatarBadge(u, 30) + '<span style="font-size:13px;">@'+escapeHtml(u)+'</span></div>'
    ).join('');
  }
  if(refreshed.taggedProductId) await renderTaggedProductCard(refreshed.taggedProductId, refreshed.userId);
  if(isMine && refreshed.type === 'video') await renderRetentionStats(postId);
}
async function renderTaggedProductCard(productId, postAuthor){
  const el = document.getElementById('tagged-product-card');
  if(!el) return;
  const p = await safeGet('product:' + productId, true);
  if(!p){ el.innerHTML = ''; return; }
  if(p.isMysteryBox){
    el.innerHTML = '<div class="card" style="display:flex; align-items:center; gap:10px; border-color:var(--coral);">' +
      '<div style="width:48px; height:48px; border-radius:8px; background:rgba(232,85,47,0.15); display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0;">🎁</div>' +
      '<div style="flex:1;"><strong style="font-size:13px;">🎁 Colis mystère</strong>' +
      '<p style="margin:2px 0 0; font-size:12px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA'+(p.mysteryEstimatedValue ? ' — valeur estimée jusqu’à '+p.mysteryEstimatedValue.toLocaleString('fr-FR')+' FCFA' : '')+'</p></div>' +
      '<button class="btn btn-primary btn-sm" onclick="openOrderScreenWithAffiliate(\''+p.id+'\', \''+escapeHtml(postAuthor||'')+'\')">Réserver</button>' +
      '</div>';
    return;
  }
  el.innerHTML = '<div class="card" style="display:flex; align-items:center; gap:10px; border-color:var(--gold);">' +
    (p.image ? '<img src="'+p.image+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-size:13px;">🛍️ '+escapeHtml(p.name)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:12px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</p></div>' +
    '<button class="btn btn-primary btn-sm" onclick="'+(p.isService ? "openServiceBookingPicker('"+p.id+"')" : "openOrderScreenWithAffiliate('"+p.id+"', '"+escapeHtml(postAuthor||'')+"')")+'">'+(p.isService?'Réserver':'Acheter')+'</button>' +
    '</div>';
}
let pendingAffiliateCreator = null;
async function openOrderScreenWithAffiliate(productId, referringCreator){
  const p = await safeGet('product:' + productId, true);
  pendingAffiliateCreator = (p && p.affiliateCommissionPercent && referringCreator && referringCreator !== p.sellerUsername) ? referringCreator : null;
  await openOrderScreen(productId);
}
async function openProductTagPicker(postId){
  const el = document.getElementById('product-tag-picker');
  if(el.innerHTML.trim() !== ''){ el.innerHTML = ''; return; }
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
  const myPartnerships = await fetchAffiliatePartnerships(currentUser);
  const partnershipProducts = [];
  for(const part of myPartnerships){
    const p = await safeGet('product:' + part.productId, true);
    if(p) partnershipProducts.push(p);
  }
  if(myProducts.length === 0 && partnershipProducts.length === 0){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:6px 0 0;">Vous n’avez encore aucun produit à lier — vos produits ou un partenariat accepté.</p>';
    return;
  }
  el.innerHTML = '<div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">' +
    (myProducts.length > 0 ? '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:0;">Mes produits</p>' : '') +
    myProducts.map(p => '<button class="btn btn-outline btn-sm" onclick="tagProductToPost(\''+postId+'\', \''+p.id+'\')">'+escapeHtml(p.name)+'</button>').join('') +
    (partnershipProducts.length > 0 ? '<p style="font-size:10.5px; color:var(--gold); margin:6px 0 0;">🤝 Mes partenariats</p>' : '') +
    partnershipProducts.map(p => '<button class="btn btn-outline btn-sm" onclick="tagProductToPost(\''+postId+'\', \''+p.id+'\')">'+escapeHtml(p.name)+' — @'+escapeHtml(p.sellerUsername)+'</button>').join('') +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="tagProductToPost(\''+postId+'\', null)">✕ Retirer le lien produit</button>' +
    '</div>';
}
function startPlacingProductHotspot(postId){
  const overlay = document.getElementById('hotspot-placement-overlay-' + postId);
  if(!overlay) return;
  overlay.style.display = 'block';
  showToast('Touchez l’endroit exact de la vidéo où placer l’étiquette 🛍️');
}
async function placeProductHotspot(postId, event){
  const overlay = event.currentTarget;
  const rect = overlay.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * 100);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * 100);
  const p = await safeGet('post:' + postId, true);
  if(!p || p.userId !== currentUser) return;
  p.taggedProductX = Math.max(0, Math.min(100, x));
  p.taggedProductY = Math.max(0, Math.min(100, y));
  await saveWithRetry('post:' + postId, p, true);
  showToast('Étiquette positionnée ✓');
  await openSinglePostView(postId);
}
function toggleTaggedProductCardVisibility(){
  const card = document.getElementById('tagged-product-card');
  if(card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
}
async function tagProductToPost(postId, productId){
  const p = await safeGet('post:' + postId, true);
  if(!p || p.userId !== currentUser) return;
  p.taggedProductId = productId;
  await saveWithRetry('post:' + postId, p, true);
  showToast(productId ? 'Produit lié à la vidéo ✓' : 'Lien produit retiré');
  await openSinglePostView(postId);
}
async function recordPostView(postId){
  const sessionKey = postId + '__' + currentUser;
  if(postViewsCountedThisSession.has(sessionKey)) return;
  postViewsCountedThisSession.add(sessionKey);
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.views = (p.views || 0) + 1;
  if(!Array.isArray(p.viewedBy)) p.viewedBy = [];
  if(currentUser && !p.viewedBy.includes(currentUser)) p.viewedBy.push(currentUser);
  await saveWithRetry('post:' + postId, p, true);
  if(currentUser){
    let history = (await safeGet('watchhistory:' + currentUser, false)) || [];
    history = history.filter(h => h.postId !== postId);
    history.unshift({ postId, viewedAt: new Date().toISOString() });
    history = history.slice(0, 100);
    await saveWithRetry('watchhistory:' + currentUser, history, false);
  }
}
async function renderProfileDeliveryTracking(){
  if(!currentUser) return;
  const el = document.getElementById('profile-delivery-tracking-section');
  if(!el) return;
  const myOrders = (await fetchOrders()).filter(o => o.buyerUsername === currentUser && o.shipmentStage && o.shipmentStage !== 'delivered' && o.status !== 'cancelled');
  if(myOrders.length === 0){ el.innerHTML = ''; return; }
  const stageLabels = { prepared: '📦 En préparation', shipped: '🚚 En route' };
  el.innerHTML = '<div class="eyebrow">📦 Livraison(s) en cours</div>' +
    myOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(o =>
      '<div class="card" style="margin-bottom:8px; cursor:pointer;" onclick="openOrderReceipt(\''+o.id+'\')"><p style="margin:0; font-size:13px;">'+(stageLabels[o.shipmentStage] || o.shipmentStage)+' — '+escapeHtml(o.productName)+'</p></div>'
    ).join('');
}
async function renderFeed(){
  const container = document.getElementById('feed-container');
  let posts = await fetchPosts();
  const myUser = await safeGet('user:' + currentUser, true);
  const myBlocked = new Set((myUser && myUser.blocked) || []);
  const myMuted = new Set((myUser && myUser.muted) || []);
  const shouldStartUnmuted = hasUserInteractedThisSession && myUser && myUser.preferredSoundOn === true;
  const allUsersForReciprocalBlock = await fetchUsers();
  const blockedByOthers = new Set(allUsersForReciprocalBlock.filter(u => (u.blocked || []).includes(currentUser)).map(u => u.username));
  posts = posts.filter(p => !myBlocked.has(p.userId) && !myMuted.has(p.userId) && !blockedByOthers.has(p.userId));
  const notInterestedIds = new Set(await fetchNotInterestedPostIds());
  posts = posts.filter(p => !notInterestedIds.has(p.id));
  const shadowBannedUsersUniversal = new Set((await safeGet('settings:shadowbannedusers', true)) || []);
  posts = posts.filter(p => p.userId === currentUser || !shadowBannedUsersUniversal.has(p.userId));
  if(await isRestrictedModeActive(currentUser)){
    posts = posts.filter(p => !p.sensitive);
  }
  if(feedMode === 'foryou') posts = await sortPostsForYou(posts);
  if(feedMode === 'community') posts = await sortPostsCollaborative(posts);
  if(feedMode === 'following'){
    const meForFollowing = await safeGet('user:' + currentUser, true);
    const myFollowingOnlySet = new Set((meForFollowing && meForFollowing.following) || []);
    posts = posts.filter(p => myFollowingOnlySet.has(p.userId)).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if(feedMode === 'friends'){
    const meForFriends = await safeGet('user:' + currentUser, true);
    const myFollowingSet = new Set((meForFriends && meForFriends.following) || []);
    const myFollowersSet = new Set((meForFriends && meForFriends.followers) || []);
    const mutuals = new Set([...myFollowingSet].filter(u => myFollowersSet.has(u)));
    posts = posts.filter(p => mutuals.has(p.userId)).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if(feedMode === 'local'){
    if(currentUserCity){
      const sameCity = posts.filter(p => p.city && p.city.toLowerCase() === currentUserCity.toLowerCase());
      const sameCountryOnly = posts.filter(p => (!p.city || p.city.toLowerCase() !== currentUserCity.toLowerCase()) && p.country === currentUserCountry);
      posts = sameCity.concat(sameCountryOnly);
    } else {
      posts = posts.filter(p => p.country === currentUserCountry);
    }
  }
  const boostKeys = await safeList('boost:', true);
  const boostedIds = new Set();
  for(const k of boostKeys){
    const b = await safeGet(k, true);
    if(b && new Date(b.expiresAt) > new Date()) boostedIds.add(b.postId);
  }
  if(boostedIds.size > 0){
    const boosted = posts.filter(p => boostedIds.has(p.id));
    const rest = posts.filter(p => !boostedIds.has(p.id));
    posts = boosted.concat(rest);
  }
  if(posts.length === 0){
    container.innerHTML = '<div class="empty" style="padding-top:40vh;">Aucune publication pour l’instant.<br>Soyez le premier à publier ! ⛵</div>';
    return;
  }
  const myFollowing = new Set((myUser && myUser.following) || []);
  const premiumUsernames = await fetchPremiumUsernames();
  const allUsersForBadges = await fetchUsers();
  const verifiedUsernames = new Set(allUsersForBadges.filter(u => u.verifiedBadge).map(u => u.username));
  const officialPartnerMap = {};
  allUsersForBadges.filter(u => u.officialPartner).forEach(u => { officialPartnerMap[u.username] = u.officialPartnerLabel || 'Compte officiel'; });
  const hideLikeCountMap = {};
  allUsersForBadges.filter(u => u.hideLikeCount).forEach(u => { hideLikeCountMap[u.username] = true; });
  const hideViewCountMap = {};
  allUsersForBadges.filter(u => u.hideViewCount).forEach(u => { hideViewCountMap[u.username] = true; });
  const feedSoundsById = {};
  (await fetchSounds()).forEach(s => { feedSoundsById[s.id] = s; });
  container.innerHTML = posts.map(p => {
    const liked = p.likes.includes(currentUser);
    const disliked = (p.dislikes || []).includes(currentUser);
    const postReactions = p.reactions || {};
    let myReaction = '';
    for(const emoji of Object.keys(postReactions)){
      if((postReactions[emoji] || []).includes(currentUser)){ myReaction = emoji; break; }
    }
    const reactionEntries = Object.keys(postReactions).map(e => [e, (postReactions[e]||[]).length]).filter(([,c]) => c > 0).sort((a,b) => b[1]-a[1]);
    const reactionSummary = reactionEntries.length > 0 ? reactionEntries.slice(0,2).map(([e,c]) => e+c).join(' ') : '';
    const favorited = (p.favoritedBy || []).includes(currentUser);
    const watchLater = (p.watchLaterBy || []).includes(currentUser);
    const following = myFollowing.has(p.userId);
    const audioTag = p.audioData ? '<audio id="audio-'+p.id+'" src="'+p.audioData+'" loop muted></audio>' : '';
    const feedSound = p.soundId ? feedSoundsById[p.soundId] : null;
    const soundAttributionText = feedSound
      ? (feedSound.artist ? feedSound.artist + ' — ' + feedSound.name : 'Son original — @' + feedSound.uploaderUsername)
      : (p.audioData ? 'Son original — @' + p.userId : '');
    const captionHashtags = extractHashtags(p.caption);
    const searchAnchorTag = captionHashtags.length > 0 ? captionHashtags[0].slice(1) : null;
    const toggleSoundFn = p.audioData ? 'toggleSoundWithAudio(this, \''+p.id+'\')' : 'toggleVideoMutePreference(this)';
    let media = p.type === 'beforeafter'
      ? '<div class="before-after-slider" id="ba-slider-'+p.id+'" style="position:relative; width:100%; height:100%; overflow:hidden; touch-action:none;" onpointerdown="startBeforeAfterDrag(event, \''+p.id+'\')">' +
          '<img src="'+p.afterImage+'" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">' +
          '<div id="ba-before-wrap-'+p.id+'" style="position:absolute; inset:0; width:50%; height:100%; overflow:hidden;"><img src="'+p.beforeImage+'" style="width:200%; height:100%; object-fit:cover; max-width:none;"></div>' +
          '<div id="ba-handle-'+p.id+'" style="position:absolute; top:0; bottom:0; left:50%; width:3px; background:white; transform:translateX(-50%);"><div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:38px; height:38px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; font-size:16px;">↔️</div></div>' +
          '<span style="position:absolute; top:14px; left:14px; background:rgba(11,46,61,0.6); color:white; font-size:11px; padding:3px 10px; border-radius:10px;">AVANT</span>' +
          '<span style="position:absolute; top:14px; right:14px; background:rgba(11,46,61,0.6); color:white; font-size:11px; padding:3px 10px; border-radius:10px;">APRÈS</span>' +
        '</div>'
      : p.type === 'video'
      ? (dataSaverEnabled
          ? '<div class="thumb" style="width:100%; height:100%; position:relative; background:var(--night-2);" onclick="if(handleMediaClickAfterLongPress()) loadVideoOnTap(\''+p.id+'\')" onmousedown="startLongPress(\''+p.id+'\')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress(\''+p.id+'\')" ontouchend="cancelLongPress()" ontouchcancel="cancelLongPress()"><video id="video-'+p.id+'" data-src="'+p.data+'" '+(p.customThumbnail ? 'poster="'+p.customThumbnail+'"' : '')+' loop muted playsinline '+(p.clipStartTime !== undefined && p.clipStartTime !== null ? 'onloadedmetadata="this.currentTime='+p.clipStartTime+'"' : '')+' ontimeupdate="detectVideoRewatch(this, \''+p.id+'\')'+(p.clipStartTime !== undefined && p.clipStartTime !== null ? '; if(this.currentTime>='+p.clipEndTime+') this.currentTime='+p.clipStartTime : '')+'" style="width:100%; height:100%; object-fit:cover; touch-action:manipulation;"></video><div id="video-play-overlay-'+p.id+'" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(11,46,61,0.45);"><span style="font-size:44px;">▶️</span></div></div>' + audioTag
          : '<video id="video-'+p.id+'" src="'+p.data+'" '+(p.customThumbnail ? 'poster="'+p.customThumbnail+'"' : '')+' loop playsinline autoplay '+(shouldStartUnmuted ? '' : 'muted ')+(p.clipStartTime !== undefined && p.clipStartTime !== null ? 'onloadedmetadata="this.currentTime='+p.clipStartTime+'"' : '')+' ontimeupdate="detectVideoRewatch(this, \''+p.id+'\')'+(p.clipStartTime !== undefined && p.clipStartTime !== null ? '; if(this.currentTime>='+p.clipEndTime+') this.currentTime='+p.clipStartTime : '')+'" onclick="if(handleMediaClickAfterLongPress()){ '+toggleSoundFn+'; handleDoubleTapLike(\''+p.id+'\', event) }" onmousedown="startLongPress(\''+p.id+'\')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress(\''+p.id+'\')" ontouchend="cancelLongPress()" ontouchcancel="cancelLongPress()" style="touch-action:manipulation;"></video>' + audioTag)
      : (p.images && p.images.length > 1
          ? '<img id="carousel-img-'+p.id+'" data-index="0" src="'+p.images[0]+'" loading="lazy" style="touch-action:manipulation;" onclick="if(handleMediaClickAfterLongPress()){ '+toggleSoundFn+'; handleDoubleTapLike(\''+p.id+'\', event) }" onmousedown="startLongPress(\''+p.id+'\')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress(\''+p.id+'\')" ontouchend="cancelLongPress()" ontouchcancel="cancelLongPress()">' +
            '<button onclick="event.stopPropagation(); navigateCarousel(\''+p.id+'\', -1)" style="position:absolute; left:6px; top:50%; transform:translateY(-50%); background:rgba(11,46,61,0.6); border:none; color:white; border-radius:50%; width:30px; height:30px; z-index:4;">‹</button>' +
            '<button onclick="event.stopPropagation(); navigateCarousel(\''+p.id+'\', 1)" style="position:absolute; right:6px; top:50%; transform:translateY(-50%); background:rgba(11,46,61,0.6); border:none; color:white; border-radius:50%; width:30px; height:30px; z-index:4;">›</button>' +
            '<div id="carousel-dots-'+p.id+'" style="position:absolute; top:14px; left:0; right:0; display:flex; justify-content:center; gap:5px; z-index:4;">' +
            p.images.map((img,i) => '<span style="width:6px; height:6px; border-radius:50%; background:'+(i===0?'white':'rgba(255,255,255,0.4)')+';"></span>').join('') + '</div>' +
            audioTag
          : '<img src="'+p.data+'" loading="lazy" style="touch-action:manipulation;" onclick="if(handleMediaClickAfterLongPress()){ '+toggleSoundFn+'; handleDoubleTapLike(\''+p.id+'\', event) }" onmousedown="startLongPress(\''+p.id+'\')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress(\''+p.id+'\')" ontouchend="cancelLongPress()" ontouchcancel="cancelLongPress()">' + audioTag);
    if(subtitlesEnabled && p.type === 'video'){
      media += '<div id="subtitle-'+p.id+'" style="position:absolute; bottom:60px; left:10px; right:10px; text-align:center; pointer-events:none; z-index:3;"></div>';
      safeGet('settings:subtitleLanguage', false).then(lang => generateVideoSubtitles(p.id, p.data, lang || 'fr')).then(text => {
        const el = document.getElementById('subtitle-' + p.id);
        if(el && text) el.innerHTML = '<span style="background:rgba(0,0,0,0.65); color:white; font-size:13px; font-weight:600; padding:4px 10px; border-radius:6px; box-decoration-break:clone; -webkit-box-decoration-break:clone;">'+escapeHtml(text)+'</span>';
      });
    }
    if(p.sensitive && !sensitiveRevealedThisSession.has(p.id)){
      media = '<div style="width:100%; height:100%; filter:blur(35px); transform:scale(1.1); pointer-events:none;">' + media + '</div>' +
        '<div style="position:absolute; inset:0; z-index:4; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:0 30px; text-align:center; background:rgba(11,46,61,0.55);">' +
        '<span style="font-size:36px;">⚠️</span>' +
        '<p style="margin:0; font-size:13.5px; color:var(--cream);">Ce contenu a été marqué comme sensible.</p>' +
        '<button onclick="revealSensitiveContent(\''+p.id+'\')" class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);">Voir quand même</button>' +
        '</div>';
    }
    const overlayWatermark = p.watermarkBaked ? '' :
      '<div class="watermark" style="position:absolute; bottom:14px; left:14px; z-index:3; display:flex; align-items:center; gap:6px; background:rgba(11,46,61,0.55); backdrop-filter:blur(3px); padding:4px 10px 4px 6px; border-radius:20px; pointer-events:none;">' +
      '<img src="'+effectivePlatformLogo+'" style="width:22px; height:auto;"><span style="font-family:\'Baloo 2\'; font-weight:700; font-size:11.5px; color:var(--cream); letter-spacing:.02em;">Suktum</span></div>';
    recordPostView(p.id);
    const isMine = p.userId === currentUser;
    const boostedBadge = boostedIds.has(p.id) ? '<div style="position:absolute; top:16px; left:16px; z-index:3; background:var(--coral); color:white; font-family:\'Baloo 2\'; font-weight:700; font-size:10.5px; padding:3px 10px; border-radius:12px;">🚀 Boosté</div>' : '';
    const wordCaptionOverlay = (p.wordTimings && p.wordTimings.length > 0) ? '<div class="word-caption-overlay" style="position:absolute; bottom:120px; left:0; right:0; z-index:3; text-align:center; pointer-events:none;"><span style="display:inline-block; background:rgba(11,46,61,0.75); color:var(--gold); font-family:\'Baloo 2\'; font-weight:700; font-size:22px; padding:6px 16px; border-radius:10px;"></span></div>' : '';
    return '<div class="feed-card" data-post-id="'+escapeHtml(p.id)+'" ontouchstart="handleSwipeStart(event)" ontouchmove="handleSwipeMove(event)" ontouchend="handleSwipeEnd(event, \''+p.id+'\')">' + media + overlayWatermark + boostedBadge + wordCaptionOverlay +
      '<div style="position:absolute; top:16px; right:16px; z-index:3; background:rgba(11,46,61,0.55); padding:3px 10px; border-radius:12px; font-size:11px; color:rgba(245,239,227,0.8);">👁️ '+((hideViewCountMap[p.userId] && p.userId !== currentUser) ? '🔒' : (p.views||0))+'</div>' +
      '<div class="feed-actions">' +
      '<button onclick="toggleLike(\''+p.id+'\')"><span class="icon" style="'+(liked?'':'color:var(--gold); font-size:26px;')+'">'+(liked?'❤️':'♡')+'</span><span onclick="event.stopPropagation(); openLikersList(\''+p.id+'\')">'+((hideLikeCountMap[p.userId] && p.userId !== currentUser) ? '🔒' : p.likes.length)+'</span></button>' +
      '<button onclick="toggleDislike(\''+p.id+'\')"><span class="icon" style="'+(disliked?'':'opacity:0.45;')+'">👎</span>'+(p.dislikes ? p.dislikes.length : 0)+'</button>' +
      '<button onclick="toggleReactionPicker(\''+p.id+'\')" id="reaction-btn-'+p.id+'"><span class="icon">'+(myReaction || '😊')+'</span>'+reactionSummary+'</button>' +
      '<button onclick="openCommentsScreen(\''+p.id+'\')"><span class="icon">💬</span>'+p.comments.length+'</button>' +
      '<button onclick="toggleFavorite(\''+p.id+'\')"><span class="icon">'+(favorited?'🔖':'📑')+'</span>'+(favorited?t('post_saved'):t('post_save'))+'</button>' +
      (p.type === 'video' ? '<button onclick="toggleWatchLater(\''+p.id+'\')"><span class="icon">'+(watchLater?'⏰':'🕐')+'</span>'+(watchLater?t('post_watch_later_added'):t('post_watch_later'))+'</button>' : '') +
      '<button onclick="sharePost(\''+p.id+'\')"><span class="icon">📤</span>'+t('post_send')+'</button>' +
      '<button onclick="shareToWhatsapp(\''+p.id+'\')"><span class="icon">💬</span>WhatsApp</button>' +
      (!isMine ? '<button onclick="openTipScreen(\''+p.id+'\')"><span class="icon">💰</span>'+t('post_tip')+'</button>' : '') +
      '<button onclick="openShareToFriends(\''+p.id+'\')"><span class="icon">👥</span>'+t('post_friend')+'</button>' +
      (!isMine ? '<button aria-label="Pas intéressé" onclick="markNotInterested(\''+p.id+'\')"><span class="icon" style="opacity:0.5;">🚫</span></button>' : '') +
      (!isMine && !p.isRepost ? '<button onclick="repostToProfile(\''+p.id+'\')"><span class="icon">🔁</span>'+t('post_repost')+'</button>' : '') +
      (!isMine ? '<button onclick="startQuoteRepost(\''+p.id+'\')"><span class="icon">💬</span>'+t('post_quote')+'</button>' : '') +
      (p.type === 'video' ? '<button onclick="startDuoRecording(\''+p.id+'\')"><span class="icon">🎭</span>'+t('post_duo')+'</button>' : '') +
      (p.type === 'video' ? '<button onclick="startStitchRecording(\''+p.id+'\')"><span class="icon">✂️</span>Stitch</button>' : '') +
      (!isMine ? '<button onclick="reportPost(\''+p.id+'\')"><span class="icon">⚠️</span>Signaler</button>' : '') +
      '</div>' +
      '<div class="overlay">'+(p.repostedByFollowedUser ? '<p style="font-size:11px; color:var(--gold); margin:0 0 4px;">🔁 Repartagé par @'+escapeHtml(p.repostedByFollowedUser)+'</p>' : '')+'<p class="username"><span onclick="openUserProfile(\''+escapeHtml(p.userId)+'\')" style="cursor:pointer;">@'+escapeHtml(p.userId)+'</span>'+(premiumUsernames.has(p.userId) || verifiedUsernames.has(p.userId) ? ' <span style="color:var(--lagoon);" title="Vérifié">✓</span>' : '')+(officialPartnerMap[p.userId] ? ' <span style="color:var(--gold);" title="'+escapeHtml(officialPartnerMap[p.userId])+'">🏛️</span>' : '') + (p.userId !== currentUser ? ' <button onclick="toggleFollow(\''+escapeHtml(p.userId)+'\', \''+p.id+'\')" style="background:'+(following?'var(--gold)':'none')+'; border:1px solid var(--gold); color:'+(following?'var(--night)':'var(--gold)')+'; border-radius:12px; padding:2px 10px; font-size:11px; margin-left:8px; vertical-align:middle;">'+(following?'Abonné(e)':'Suivre')+'</button>' : '') +'</p><p class="caption" id="caption-'+p.id+'"><span id="caption-text-'+p.id+'" data-raw-caption="'+escapeHtml(p.caption||'')+'">'+renderCaptionWithToggle(p.caption, p.id)+'</span>'+(p.caption ? ' <span onclick="translateCaption(\''+p.id+'\')" style="color:var(--lagoon); font-size:11px; cursor:pointer; white-space:nowrap;">🌐 Traduire</span> <span onclick="readCaptionAloud(\''+p.id+'\')" style="color:var(--gold); font-size:11px; cursor:pointer; white-space:nowrap;">🔊 Écouter</span>' : '')+'</p>'+(soundAttributionText ? '<p style=\"font-size:11.5px; color:rgba(245,239,227,0.7); margin:4px 0 0; display:flex; align-items:center; gap:6px;\"><span'+(p.soundId ? ' data-sound-id=\"'+p.soundId+'\" onclick=\"event.stopPropagation(); openSoundDetailPage(this.dataset.soundId); go(\'sound-detail\');\" style=\"cursor:pointer; display:inline-block; width:16px; height:16px; border-radius:50%; background:conic-gradient(var(--gold) 0deg, var(--coral) 120deg, var(--lagoon) 240deg, var(--gold) 360deg); animation:spinDisc 3s linear infinite; flex-shrink:0;\"' : ' style=\"display:inline-block;\"')+'>'+(p.soundId ? '' : '🎵')+'</span>'+escapeHtml(soundAttributionText)+'</p>' : '')+(searchAnchorTag ? '<span data-anchor-tag=\"'+escapeHtml(searchAnchorTag)+'\" onclick=\"event.stopPropagation(); runDiscoverSearchFromAnchor(this.dataset.anchorTag)\" style=\"display:inline-block; margin-top:6px; background:rgba(245,239,227,0.12); border-radius:14px; padding:4px 12px; font-size:11.5px; cursor:pointer;\">🔍 '+escapeHtml(searchAnchorTag)+'</span>' : '')+(p.linkedSeriesId ? '<span data-linked-series="'+escapeHtml(p.linkedSeriesId)+'" onclick="event.stopPropagation(); openSeriesDetail(this.dataset.linkedSeries)" style="display:inline-block; margin-top:6px; background:var(--coral); color:var(--night); border-radius:14px; padding:5px 14px; font-weight:600; font-size:11.5px; cursor:pointer;">▶️ Voir la suite</span>' : '')+'</div>' +
      '</div>';
  }).join('');
  const ad = await pickAdForFeed();
  if(ad){
    recordAdImpression(ad);
    const cards = container.innerHTML.split(/(?=<div class="feed-card")/).filter(Boolean);
    const adCardHtml = renderAdCard(ad);
    const withAds = [];
    cards.forEach((c, i) => { withAds.push(c); if((i+1) % 4 === 0) withAds.push(adCardHtml); });
    container.innerHTML = withAds.join('');
  }
  setupFeedQuickScrollObserver();
  setupWordCaptionSync(posts);
  primeUpcomingVideoDecoding();
}
function primeUpcomingVideoDecoding(){
  const videos = document.querySelectorAll('#feed-container video');
  let firstVisibleIndex = 0;
  const scrollTop = document.getElementById('feed-container').scrollTop;
  for(let i = 0; i < videos.length; i++){
    if(videos[i].closest('.feed-card').offsetTop >= scrollTop - 50){ firstVisibleIndex = i; break; }
  }
  for(let i = firstVisibleIndex + 1; i <= firstVisibleIndex + 3 && i < videos.length; i++){
    videos[i].preload = 'auto';
  }
}
function setupWordCaptionSync(posts){
  posts.forEach(p => {
    if(!p.wordTimings || p.wordTimings.length === 0) return;
    const card = document.querySelector('.feed-card[data-post-id="'+p.id+'"]');
    if(!card) return;
    const video = card.querySelector('video');
    const overlaySpan = card.querySelector('.word-caption-overlay span');
    if(!video || !overlaySpan) return;
    video.addEventListener('timeupdate', () => {
      const timings = p.wordTimings;
      let currentWord = '';
      for(let i = 0; i < timings.length; i++){
        if(video.currentTime >= timings[i].time && (i === timings.length - 1 || video.currentTime < timings[i+1].time)){
          currentWord = timings[i].word;
          break;
        }
      }
      overlaySpan.textContent = currentWord;
    });
  });
}
function updateSingleViewCaption(postId){
  const p = singlePostViewCachedPost;
  if(!p || !p.wordTimings || p.wordTimings.length === 0) return;
  const overlayEl = document.getElementById('single-caption-overlay-' + postId);
  const video = document.getElementById('video-' + postId);
  if(!overlayEl || !video || overlayEl.style.display === 'none') return;
  const overlaySpan = overlayEl.querySelector('span');
  const timings = p.wordTimings;
  let currentWord = '';
  for(let i = 0; i < timings.length; i++){
    if(video.currentTime >= timings[i].time && (i === timings.length - 1 || video.currentTime < timings[i+1].time)){
      currentWord = timings[i].word;
      break;
    }
  }
  overlaySpan.textContent = currentWord;
}
function toggleSingleViewCaptions(postId){
  const el = document.getElementById('single-caption-overlay-' + postId);
  if(!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function openMediaPlayerKebabMenu(postId){
  const p = singlePostViewCachedPost;
  const isMine = p && p.userId === currentUser;
  const items = [];
  if(p && p.downloadable !== false) items.push({ icon: '⬇️', label: 'Télécharger', action: 'closeGenericKebabMenu(); downloadPostMedia(\''+postId+'\')' });
  items.push({ icon: 'ℹ️', label: 'Qualité : unique (pas de choix)', action: 'closeGenericKebabMenu(); showToast(\'Suktum ne stocke qu’une seule qualité par vidéo pour l’instant\')' });
  if(p && p.type === 'video') items.push({ icon: '⚡', label: 'Vitesse', action: 'closeGenericKebabMenu(); openSpeedPickerFromMenu(\''+postId+'\')' });
  items.push({ icon: dataSaverEnabled ? '📶' : '📵', label: 'Alléger l’affichage', action: 'closeGenericKebabMenu(); toggleDataSaverFromMenu()' });
  items.push({ icon: '🔁', label: 'Défilement auto', action: 'closeGenericKebabMenu(); toggleAutoplayFromMenu()' });
  if(p && p.wordTimings && p.wordTimings.length > 0){
    const el = document.getElementById('single-caption-overlay-' + postId);
    const isShown = el && el.style.display !== 'none';
    items.push({ icon: '📝', label: isShown ? 'Masquer les sous-titres' : 'Activer les sous-titres', action: 'closeGenericKebabMenu(); toggleSingleViewCaptions(\''+postId+'\')' });
  }
  items.push({ icon: '🎥', label: 'Ajouter à une playlist', action: 'closeGenericKebabMenu(); openAddToPlaylistPicker(\''+postId+'\')' });
  items.push({ icon: '📤', label: 'Partager', action: 'closeGenericKebabMenu(); sharePost(\''+postId+'\')' });
  if(p && !isMine) items.push({ icon: '🚫', label: 'Pas intéressé', action: 'closeGenericKebabMenu(); markNotInterested(\''+postId+'\')' });
  if(p && !isMine) items.push({ icon: '⚠️', label: 'Signaler', action: 'closeGenericKebabMenu(); reportPost(\''+postId+'\')' });
  openGenericKebabMenu(items);
}
async function createFollowRelationship(followerUsername, followedUsername){
  if(followerUsername === followedUsername) return;
  const target = await safeGet('user:' + followedUsername, true);
  const follower = await safeGet('user:' + followerUsername, true);
  if(!target || !follower) return;
  if(!target.followers) target.followers = [];
  if(!follower.following) follower.following = [];
  if(target.followers.includes(followerUsername)) return; // déjà abonné, rien à faire
  target.followers.push(followerUsername);
  follower.following.push(followedUsername);
  await saveWithRetry('user:' + followedUsername, target, true);
  await saveWithRetry('user:' + followerUsername, follower, true);
  await createNotification(followedUsername, 'follow', followerUsername);
}
/* ---------- PALIER 1 MILLION D'ABONNÉS — BADGE + CADEAU REMIS EN MAIN PROPRE ---------- */
async function checkMillionFollowersMilestone(username){
  const u = await safeGet('user:' + username, true);
  if(!u || u.reached1M) return;
  const followerCount = (u.followers || []).length;
  if(followerCount < 1000000) return;
  u.reached1M = true;
  u.reached1MAt = new Date().toISOString();
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'milestone_1m', 'Suktum', null, null);
  await logAdminAction('🏆 Nouveau membre du club 1 million d’abonnés', '@' + username);
}
async function markGiftDelivered(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.giftDeliveredAt = new Date().toISOString();
  await saveWithRetry('user:' + username, u, true);
  showToast('Marqué comme remis ✓');
  await logAdminAction('🎁 Cadeau 1 million d’abonnés remis en main propre', '@' + username);
  await renderMillionFollowersAdminList();
}
async function renderMillionFollowersAdminList(){
  const el = document.getElementById('admin-million-followers-list');
  if(!el) return;
  const allUsers = await fetchUsers();
  const eligible = allUsers.filter(u => u.reached1M);
  el.innerHTML = eligible.length === 0 ? '<div class="empty">Personne n’a encore atteint 1 million d’abonnés.</div>' : eligible.map(u =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px; font-weight:600;">🏆 @'+escapeHtml(u.username)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">Palier atteint le '+new Date(u.reached1MAt).toLocaleDateString('fr-FR')+'</p>' +
    (u.giftDeliveredAt
      ? '<p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Badge et cadeau remis en main propre le '+new Date(u.giftDeliveredAt).toLocaleDateString('fr-FR')+'</p>'
      : '<button class="btn btn-primary btn-sm" onclick="markGiftDelivered(\''+escapeHtml(u.username)+'\')">✓ Marquer le cadeau comme remis</button>') +
    '</div>'
  ).join('');
}
async function toggleFollow(username, sourcePostId){
  if(!requireAccount('Créez un compte pour suivre quelqu’un')) return;
  const target = await safeGet('user:' + username, true);
  const me = await safeGet('user:' + currentUser, true);
  if(!target || !me) return;
  if(!target.followers) target.followers = [];
  if(!me.following) me.following = [];
  const idx = target.followers.indexOf(currentUser);
  if(idx === -1){
    target.followers.push(currentUser);
    me.following.push(username);
    triggerHapticFeedback('light');
    showToast('Abonné(e) à @' + username + ' ✓');
    if(sourcePostId){
      await saveWithRetry('followsource:' + username + '__' + currentUser, { sourcePostId, followedAt: new Date().toISOString() }, true);
    }
  } else {
    target.followers.splice(idx, 1);
    me.following.splice(me.following.indexOf(username), 1);
    showToast('Désabonné(e) de @' + username);
    await window.storage.delete('postnotifypref:' + currentUser + '__' + username, false).catch(() => {});
    await window.storage.delete('followsource:' + username + '__' + currentUser, true).catch(() => {});
    const sharedFeedKey = threadKeyFor(currentUser, username);
    await window.storage.delete('sharedfeed:' + sharedFeedKey, true).catch(() => {});
  }
  await saveWithRetry('user:' + username, target, true);
  await saveWithRetry('user:' + currentUser, me, true);
  if(idx === -1){
    await createNotification(username, 'follow', currentUser);
    await checkMillionFollowersMilestone(username);
  }
  await renderFeed();
  await renderPostNotificationPrefButton(username);
}
async function renderMuteButton(username){
  const btn = document.getElementById('uprofile-mute-btn');
  if(!btn || !currentUser || username === currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const isMuted = me && (me.muted || []).includes(username);
  btn.style.display = 'block';
  btn.style.borderColor = isMuted ? 'var(--coral)' : '';
  btn.style.color = isMuted ? 'var(--coral)' : '';
  btn.textContent = isMuted ? '🔇 En sourdine — appuyer pour réactiver' : '🔈 Mettre en sourdine';
}
async function toggleMuteUser(){
  if(!currentViewedProfileUsername || currentViewedProfileUsername === currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  if(!me.muted) me.muted = [];
  const idx = me.muted.indexOf(currentViewedProfileUsername);
  if(idx === -1){
    me.muted.push(currentViewedProfileUsername);
    showToast('@' + currentViewedProfileUsername + ' mis(e) en sourdine — sans être notifié(e)');
  } else {
    me.muted.splice(idx, 1);
    showToast('@' + currentViewedProfileUsername + ' réactivé(e) dans votre fil');
  }
  await saveWithRetry('user:' + currentUser, me, true);
  await renderMuteButton(currentViewedProfileUsername);
}
async function renderPostNotificationPrefButton(username){
  const btn = document.getElementById('uprofile-postnotif-btn');
  if(!btn || !currentUser || username === currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const isFollowing = me && (me.following || []).includes(username);
  if(!isFollowing){ btn.style.display = 'none'; return; }
  const pref = await safeGet('postnotifypref:' + currentUser + '__' + username, false).catch(() => null);
  const notifyAll = pref === null || pref === undefined || pref.notifyAll !== false;
  btn.style.display = 'block';
  btn.textContent = notifyAll ? '🔔 Notifié(e) de chaque publication' : '🔕 Notifications de publication limitées';
}
async function renderScheduledLivesOnProfile(username, containerId){
  const el = document.getElementById(containerId || 'uprofile-scheduled-lives');
  if(!el) return;
  const upcoming = (await fetchLives()).filter(l => l.username === username && l.status === 'scheduled' && l.scheduledTime && new Date(l.scheduledTime) > new Date());
  if(upcoming.length === 0){ el.innerHTML = ''; if(scheduledLiveCountdownInterval){ clearInterval(scheduledLiveCountdownInterval); scheduledLiveCountdownInterval = null; } return; }
  const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
  el.innerHTML = upcoming.map(l => {
    const hasReminder = me && (me.liveReminders || []).includes(l.id);
    return '<div class="card" style="margin-bottom:10px; border-color:var(--gold);">' +
      (l.title ? '<p style="margin:0 0 6px; font-size:13px; font-weight:600;">'+escapeHtml(l.title)+'</p>' : '') +
      '<p style="margin:0 0 8px; font-size:20px; font-weight:700; color:var(--gold); font-family:\'Baloo 2\';" id="scheduled-countdown-'+l.id+'" data-target="'+l.scheduledTime+'">--:--:--</p>' +
      (username !== currentUser ? '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="toggleLiveReminder(\''+l.id+'\')">'+(hasReminder ? '✓ Rappel activé' : '🔔 Me rappeler') + '</button>' : '<button class="btn btn-primary btn-sm" style="width:100%; margin-bottom:6px;" onclick="startScheduledLiveNow(\''+l.id+'\')">🔴 Démarrer maintenant</button><button class="btn btn-outline btn-sm" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="cancelScheduledLive(\''+l.id+'\')">✕ Annuler ce live</button>') +
      '</div>';
  }).join('');
  if(scheduledLiveCountdownInterval) clearInterval(scheduledLiveCountdownInterval);
  const updateCountdowns = () => {
    upcoming.forEach(l => {
      const elCountdown = document.getElementById('scheduled-countdown-' + l.id);
      if(!elCountdown) return;
      const diffMs = new Date(l.scheduledTime).getTime() - Date.now();
      if(diffMs <= 0){ elCountdown.textContent = 'En attente de démarrage...'; return; }
      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      elCountdown.textContent = (days > 0 ? days + 'j ' : '') + String(hours).padStart(2,'0') + ':' + String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0');
    });
  };
  updateCountdowns();
  scheduledLiveCountdownInterval = setInterval(updateCountdowns, 1000);
}
let scheduledLiveCountdownInterval = null;
async function toggleLiveReminder(liveId){
  if(!requireAccount('Créez un compte pour recevoir un rappel')) return;
  const me = await safeGet('user:' + currentUser, true);
  const reminders = new Set(me.liveReminders || []);
  const hadReminder = reminders.has(liveId);
  if(hadReminder) reminders.delete(liveId); else reminders.add(liveId);
  me.liveReminders = Array.from(reminders);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast(hadReminder ? 'Rappel annulé' : 'Vous recevrez un rappel avant le début ✓');
  await renderScheduledLivesOnProfile(currentViewedProfileUsername || currentUserDetailTarget);
}
async function checkAndSendLiveReminders(){
  const scheduledLives = (await fetchLives()).filter(l => l.status === 'scheduled' && l.scheduledTime);
  for(const l of scheduledLives){
    const minutesUntil = (new Date(l.scheduledTime).getTime() - Date.now()) / 60000;
    if(minutesUntil <= 10 && minutesUntil > 0 && !l.reminderSent){
      const keys = await safeList('user:', true);
      for(const k of keys){
        const u = await safeGet(k, true).catch(() => null);
        if(u && (u.liveReminders || []).includes(l.id)){
          await createNotification(u.username, 'live_reminder', l.username, l.id, null);
        }
      }
      const fresh = await safeGet('live:' + l.id, true);
      if(fresh){ fresh.reminderSent = true; await saveWithRetry('live:' + l.id, fresh, true); }
    }
  }
}
async function renderLiveHistoryButton(username){
  const btn = document.getElementById('uprofile-live-history-btn');
  if(!btn || !currentUser) return;
  const isOwner = username === currentUser;
  let hasAccess = isOwner;
  if(!isOwner){
    const target = await safeGet('user:' + username, true);
    hasAccess = !!(target && target.followers && target.followers.includes(currentUser));
  }
  if(!hasAccess){ btn.style.display = 'none'; return; }
  const keys = await safeList('livechattranscript:', true);
  let count = 0;
  for(const k of keys){ const t = await safeGet(k, true).catch(() => null); if(t && t.streamerUsername === username) count++; }
  btn.style.display = count > 0 ? 'block' : 'none';
}
let currentLiveHistoryTargetUser = null;
async function openCreatorLiveHistoryList(){
  const username = currentViewedProfileUsername || currentUserDetailTarget;
  if(!username) return;
  currentLiveHistoryTargetUser = username;
  go('creator-live-history');
  const el = document.getElementById('creator-live-history-list');
  const keys = await safeList('livechattranscript:', true);
  const transcripts = [];
  for(const k of keys){ const t = await safeGet(k, true).catch(() => null); if(t && t.streamerUsername === username) transcripts.push(t); }
  transcripts.sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt));
  el.innerHTML = transcripts.length === 0 ? '<div class="empty">Aucun historique disponible.</div>' : transcripts.map(t =>
    '<div class="card" style="margin-bottom:8px; cursor:pointer;" onclick="openLiveChatTranscriptDetail(\''+t.liveId+'\')">' +
    '<p style="margin:0 0 4px; font-size:13px;">Live du '+new Date(t.savedAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+t.messages.length+' message(s)</p></div>'
  ).join('');
}
async function renderLiveNotificationPrefButton(username){
  const btn = document.getElementById('uprofile-livenotif-btn');
  if(!btn || !currentUser || username === currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const isFollowing = me && (me.following || []).includes(username);
  if(!isFollowing){ btn.style.display = 'none'; return; }
  const pref = await safeGet('livenotifypref:' + currentUser + '__' + username, false).catch(() => null);
  const notifyAll = pref === null || pref === undefined || pref.notifyAll !== false;
  btn.style.display = 'block';
  btn.textContent = notifyAll ? '🔴 Alerté(e) à chaque live' : '🔕 Alertes de live désactivées';
}
async function toggleLiveNotificationPreference(){
  if(!currentUserDetailTarget && !currentViewedProfileUsername) return;
  const username = currentViewedProfileUsername || currentUserDetailTarget;
  const pref = (await safeGet('livenotifypref:' + currentUser + '__' + username, false).catch(() => null)) || { notifyAll: true };
  pref.notifyAll = !pref.notifyAll;
  await saveWithRetry('livenotifypref:' + currentUser + '__' + username, pref, false);
  showToast(pref.notifyAll ? 'Vous serez alerté(e) à chaque live ✓' : 'Alertes de live désactivées pour ce compte ✓');
  await renderLiveNotificationPrefButton(username);
}
async function notifyFollowersOfNewLive(l){
  const author = await safeGet('user:' + l.username, true);
  if(!author || !author.followers || author.followers.length === 0) return;
  for(const followerUsername of author.followers){
    const pref = await safeGet('livenotifypref:' + followerUsername + '__' + l.username, false).catch(() => null);
    const notifyAll = !pref || pref.notifyAll !== false;
    if(notifyAll) await createNotification(followerUsername, 'live_start', l.username, l.id, null);
  }
}
async function togglePostNotificationPreference(){
  if(!currentUserDetailTarget && !currentViewedProfileUsername) return;
  const username = currentViewedProfileUsername || currentUserDetailTarget;
  const pref = (await safeGet('postnotifypref:' + currentUser + '__' + username, false).catch(() => null)) || { notifyAll: true };
  pref.notifyAll = !pref.notifyAll;
  await saveWithRetry('postnotifypref:' + currentUser + '__' + username, pref, false);
  showToast(pref.notifyAll ? 'Vous serez notifié(e) de chaque publication ✓' : 'Notifications limitées pour ce compte ✓');
  await renderPostNotificationPrefButton(username);
}
async function notifyFollowersOfNewPost(post){
  await trackEarlyActivity(post.userId);
  const author = await safeGet('user:' + post.userId, true);
  if(!author || !author.followers || author.followers.length === 0) return;
  for(const followerUsername of author.followers){
    const pref = await safeGet('postnotifypref:' + followerUsername + '__' + post.userId, false).catch(() => null);
    const notifyAll = !pref || pref.notifyAll !== false;
    if(notifyAll) await createNotification(followerUsername, 'new_post', post.userId, post.id, null);
  }
}
function smallAvatarBadge(username, size){
  const s = size || 26;
  return '<span style="width:'+s+'px; height:'+s+'px; border-radius:50%; background:linear-gradient(135deg, var(--coral), var(--gold), var(--lagoon)); display:inline-flex; align-items:center; justify-content:center; font-family:\'Baloo 2\'; font-weight:700; font-size:'+Math.round(s*0.46)+'px; color:var(--night); flex-shrink:0; vertical-align:middle;">'+escapeHtml((username||'?').charAt(0).toUpperCase())+'</span>';
}
function smallWatermark(){
  return '<div style="position:absolute; bottom:4px; left:4px; z-index:2; display:flex; align-items:center; gap:3px; background:rgba(11,46,61,0.6); padding:2px 6px 2px 3px; border-radius:8px; pointer-events:none;">' +
    '<img src="'+effectivePlatformLogo+'" style="width:12px; height:auto;"><span style="font-family:\'Baloo 2\'; font-weight:700; font-size:8px; color:var(--cream);">Suktum</span></div>';
}
function toggleSoundWithAudio(el, postId){
  const audio = document.getElementById('audio-' + postId);
  if(audio){
    audio.muted = !audio.muted;
    if(!audio.muted){ audio.currentTime = 0; audio.play().catch(() => {}); }
    else { audio.pause(); }
    saveMutePreference(!audio.muted);
  }
  if(el.tagName === 'VIDEO') el.muted = true;
}
async function toggleAutoplayNextVideo(){
  const enabled = document.getElementById('autoplay-next-toggle').checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.autoplayNextVideo = enabled;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast(enabled ? 'Lecture automatique activée ✓' : 'Lecture automatique désactivée');
}
async function loadAutoplayToggle(){
  const toggle = document.getElementById('autoplay-next-toggle');
  if(!toggle || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  toggle.checked = !me || me.autoplayNextVideo !== false;
}
function toggleVideoMutePreference(video){
  video.muted = !video.muted;
  saveMutePreference(!video.muted);
}
async function saveMutePreference(soundOn){
  hasUserInteractedThisSession = true;
  if(!currentUser) return;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.preferredSoundOn = soundOn;
  await saveWithRetry('user:' + currentUser, me, true);
}
async function toggleDislike(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(!p.dislikes) p.dislikes = [];
  if(!p.likes) p.likes = [];
  const idx = p.dislikes.indexOf(currentUser);
  if(idx === -1){
    p.dislikes.push(currentUser);
    const likeIdx = p.likes.indexOf(currentUser);
    if(likeIdx !== -1) p.likes.splice(likeIdx, 1);
  } else {
    p.dislikes.splice(idx, 1);
  }
  await saveWithRetry('post:' + postId, p, true);
  await renderFeed();
}
async function toggleWatchLater(postId){
  if(!requireAccount('Créez un compte pour ajouter à votre liste')) return;
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(!p.watchLaterBy) p.watchLaterBy = [];
  const idx = p.watchLaterBy.indexOf(currentUser);
  if(idx === -1){ p.watchLaterBy.push(currentUser); showToast('Ajouté à « À regarder plus tard » ⏰'); }
  else { p.watchLaterBy.splice(idx, 1); showToast('Retiré de votre liste'); }
  await saveWithRetry('post:' + postId, p, true);
  if(document.getElementById('screen-feed').classList.contains('active')) await renderFeed();
  if(document.getElementById('screen-watch-later').classList.contains('active')) await renderWatchLaterList();
}
async function renderWatchLaterList(){
  const el = document.getElementById('watch-later-list');
  if(!el || !currentUser) return;
  const posts = await fetchPosts();
  const myList = posts.filter(p => (p.watchLaterBy || []).includes(currentUser));
  myList.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(myList.length === 0){ el.innerHTML = '<div class="empty">Aucune vidéo dans votre liste pour l’instant.</div>'; return; }
  el.innerHTML = myList.map(p =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px; cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' +
    (p.customThumbnail ? '<img src="'+p.customThumbnail+'" style="width:52px; height:52px; border-radius:8px; object-fit:cover;">' : '<div style="width:52px; height:52px; border-radius:8px; background:var(--night-2); display:flex; align-items:center; justify-content:center; font-size:20px;">🎬</div>') +
    '<div style="flex:1;"><p style="margin:0; font-size:13px;">'+escapeHtml((p.caption||'Sans légende').slice(0,60))+'</p>' +
    '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">@'+escapeHtml(p.userId)+'</p></div>' +
    '<button onclick="event.stopPropagation(); toggleWatchLater(\''+p.id+'\')" style="background:none; border:none; color:var(--coral); font-size:16px;">✕</button>' +
    '</div>'
  ).join('');
}
async function toggleFavorite(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(!p.favoritedBy) p.favoritedBy = [];
  const idx = p.favoritedBy.indexOf(currentUser);
  if(idx === -1){ p.favoritedBy.push(currentUser); showToast('Ajouté à vos favoris 🔖'); }
  else { p.favoritedBy.splice(idx, 1); showToast('Retiré de vos favoris'); }
  await saveWithRetry('post:' + postId, p, true);
  if(document.getElementById('screen-feed').classList.contains('active')) await renderFeed();
  if(document.getElementById('screen-favorites').classList.contains('active')) await renderFavorites();
  if(document.getElementById('screen-profile').classList.contains('active') && profileActiveTab === 'favorites') await renderProfileGrid();
}
async function renderFavorites(){
  const grid = document.getElementById('favorites-grid');
  const posts = (await fetchPosts()).filter(p => (p.favoritedBy || []).includes(currentUser));
  await renderFavoriteFoldersTabs();
  const folders = (await safeGet('favoritefolders:' + currentUser, true)) || [];
  const assignments = (await safeGet('favoriteassignments:' + currentUser, true)) || {};
  const filteredPosts = currentFavoriteFolderFilter === 'all'
    ? posts
    : posts.filter(p => assignments[p.id] === currentFavoriteFolderFilter);
  if(posts.length === 0){ grid.innerHTML = '<div class="empty">Aucun favori pour l’instant.<br>Appuyez sur 📑 sous une vidéo pour l’enregistrer ici.</div>'; return; }
  if(filteredPosts.length === 0){ grid.innerHTML = '<div class="empty">Aucun favori dans ce dossier pour l’instant.</div>'; return; }
  grid.innerHTML = filteredPosts.map(p => {
    const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
    return '<div class="thumb" style="position:relative;">' + media + smallWatermark() +
      '<button onclick="toggleFavorite(\''+p.id+'\')" style="position:absolute; top:4px; right:4px; background:rgba(11,46,61,0.75); border:none; color:var(--cream); border-radius:50%; width:26px; height:26px; font-size:13px;">✕</button>' +
      (folders.length > 0 ? '<button onclick="openFolderAssignPicker(\''+p.id+'\')" style="position:absolute; bottom:4px; right:4px; background:rgba(11,46,61,0.75); border:none; color:var(--cream); border-radius:8px; padding:2px 6px; font-size:10px;">📁</button>' : '') +
      '</div>';
  }).join('');
}
/* ---------- DOSSIERS DE FAVORIS NOMMÉS ---------- */
let currentFavoriteFolderFilter = 'all';
async function fetchFavoriteFolders(){
  return (await safeGet('favoritefolders:' + currentUser, true)) || [];
}
async function createFavoriteFolder(){
  const input = document.getElementById('new-favorite-folder-input');
  const name = input.value.trim();
  if(!name){ showToast('Donnez un nom au dossier'); return; }
  const folders = await fetchFavoriteFolders();
  if(folders.includes(name)){ showToast('Ce dossier existe déjà'); return; }
  folders.push(name);
  await saveWithRetry('favoritefolders:' + currentUser, folders, true);
  input.value = '';
  showToast('Dossier créé ✓');
  await renderFavorites();
}
async function deleteFavoriteFolder(name){
  let folders = await fetchFavoriteFolders();
  folders = folders.filter(f => f !== name);
  await saveWithRetry('favoritefolders:' + currentUser, folders, true);
  const assignments = (await safeGet('favoriteassignments:' + currentUser, true)) || {};
  for(const postId in assignments){ if(assignments[postId] === name) delete assignments[postId]; }
  await saveWithRetry('favoriteassignments:' + currentUser, assignments, true);
  if(currentFavoriteFolderFilter === name) currentFavoriteFolderFilter = 'all';
  showToast('Dossier supprimé');
  await renderFavorites();
}
function selectFavoriteFolderFilter(name){
  currentFavoriteFolderFilter = name;
  renderFavorites();
}
async function renderFavoriteFoldersTabs(){
  const el = document.getElementById('favorite-folders-tabs');
  if(!el) return;
  const folders = await fetchFavoriteFolders();
  el.innerHTML = '<button onclick="selectFavoriteFolderFilter(\'all\')" style="flex-shrink:0; border:none; border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(currentFavoriteFolderFilter==='all'?'var(--coral)':'transparent')+'; color:'+(currentFavoriteFolderFilter==='all'?'var(--night)':'var(--cream)')+'; border:1px solid var(--line);">Tous</button>' +
    folders.map(f => '<button onclick="selectFavoriteFolderFilter(\''+escapeHtml(f)+'\')" style="flex-shrink:0; border:none; border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(currentFavoriteFolderFilter===f?'var(--coral)':'transparent')+'; color:'+(currentFavoriteFolderFilter===f?'var(--night)':'var(--cream)')+'; border:1px solid var(--line); margin-left:6px;">📁 '+escapeHtml(f)+'</button>').join('');
}
async function openFolderAssignPicker(postId){
  const folders = await fetchFavoriteFolders();
  const assignments = (await safeGet('favoriteassignments:' + currentUser, true)) || {};
  const current = assignments[postId];
  const options = folders.map(f => (f === current ? '✓ ' : '') + f).join(' | ');
  const choice = prompt('Ranger dans quel dossier ?\n' + options + '\n\n(Laissez vide pour retirer d’un dossier)', current || '');
  if(choice === null) return;
  const trimmed = choice.trim();
  if(!trimmed){ delete assignments[postId]; }
  else if(folders.includes(trimmed)){ assignments[postId] = trimmed; }
  else { showToast('Dossier inconnu — créez-le d’abord'); return; }
  await saveWithRetry('favoriteassignments:' + currentUser, assignments, true);
  showToast('Rangé ✓');
  await renderFavorites();
}
async function deleteMyPost(postId){
  const post = (await fetchPosts(true)).find(p => p.id === postId);
  if(!post || post.userId !== currentUser) return;
  const ok = confirm('Supprimer définitivement cette publication ? Cette action est irréversible.');
  if(!ok) return;
  await window.storage.delete('post:' + postId, true).catch(() => {});
  showToast('Publication supprimée');
  await renderFeed();
}
/* ---------- RÉACTIONS RAPIDES VARIÉES ---------- */
const QUICK_REACTION_EMOJIS = ['😂', '😮', '😢', '🔥'];
/* ---------- PLEIN ÉCRAN / ZOOM SUR LES MÉDIAS DU FIL ---------- */
let mediaZoomScale = 1;
let mediaZoomPinchStartDist = null;
let mediaZoomPinchStartScale = 1;
/* ---------- DÉTECTION D'APPUI LONG POUR OUVRIR LE ZOOM (bouton masqué, geste naturel) ---------- */
let longPressTimer = null;
let longPressTriggered = false;
let swipeStartX = 0, swipeStartY = 0, swipeIsHorizontal = false;
function handleSwipeStart(event){
  const touch = event.touches[0];
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeIsHorizontal = false;
}
function handleSwipeMove(event){
  const touch = event.touches[0];
  const deltaX = touch.clientX - swipeStartX;
  const deltaY = touch.clientY - swipeStartY;
  if(Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > 20){
    swipeIsHorizontal = true;
    event.preventDefault();
  }
}
function handleSwipeEnd(event, postId){
  if(!swipeIsHorizontal) return;
  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - swipeStartX;
  if(deltaX < -80) openCommentsScreen(postId);
  swipeIsHorizontal = false;
}
let lastTapTimestamps = {};
function startBeforeAfterDrag(event, postId){
  const container = document.getElementById('ba-slider-' + postId);
  const beforeWrap = document.getElementById('ba-before-wrap-' + postId);
  const handle = document.getElementById('ba-handle-' + postId);
  if(!container || !beforeWrap || !handle) return;
  const updatePosition = (clientX) => {
    const rect = container.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));
    beforeWrap.style.width = pct + '%';
    handle.style.left = pct + '%';
  };
  updatePosition(event.clientX);
  const onMove = (e) => { updatePosition(e.clientX); };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
function handleDoubleTapLike(postId, event){
  const now = Date.now();
  const lastTap = lastTapTimestamps[postId] || 0;
  lastTapTimestamps[postId] = now;
  if(now - lastTap < 300){
    triggerLikeWithHeartAnimation(postId, event);
    lastTapTimestamps[postId] = 0;
  }
}
async function triggerLikeWithHeartAnimation(postId, event){
  if(!currentUser) return;
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(!(p.likes||[]).includes(currentUser)) await toggleLike(postId);
  showHeartAnimation(event);
}
let feedPullStartY = 0, feedPullActive = false;
function handleFeedPullStart(event){
  const container = document.getElementById('feed-container');
  if(container.scrollTop > 0) return;
  feedPullStartY = event.touches[0].clientY;
  feedPullActive = true;
}
function handleFeedPullMove(event){
  if(!feedPullActive) return;
  const deltaY = event.touches[0].clientY - feedPullStartY;
  if(deltaY <= 0) return;
  const indicator = document.getElementById('feed-pull-refresh-indicator');
  const pull = Math.min(deltaY, 100);
  indicator.style.display = 'block';
  indicator.style.opacity = String(pull / 100);
  indicator.style.transform = 'translateY(' + (pull * 0.6) + 'px) rotate(' + (pull * 3) + 'deg)';
}
async function handleFeedPullEnd(event){
  if(!feedPullActive) return;
  feedPullActive = false;
  const deltaY = (event.changedTouches[0].clientY - feedPullStartY);
  const indicator = document.getElementById('feed-pull-refresh-indicator');
  indicator.style.opacity = '0';
  indicator.style.transform = '';
  setTimeout(() => { indicator.style.display = 'none'; }, 250);
  if(deltaY > 70){
    triggerHapticFeedback('light');
    showToast('Actualisation du fil...');
    await renderFeed();
  }
}
let liveTapLikeBuffer = 0;
let liveTapLikeFlushTimer = null;
function handleLiveTapLike(event){
  if(!currentLiveView) return;
  const countEl = document.getElementById('live-tap-like-count');
  const currentDisplayed = parseInt(countEl.textContent, 10) || 0;
  countEl.textContent = currentDisplayed + 1;
  liveTapLikeBuffer++;
  showHeartAnimation(event);
  if(liveTapLikeFlushTimer) clearTimeout(liveTapLikeFlushTimer);
  liveTapLikeFlushTimer = setTimeout(flushLiveTapLikes, 800);
}
async function flushLiveTapLikes(){
  if(liveTapLikeBuffer === 0 || !currentLiveView) return;
  const toAdd = liveTapLikeBuffer;
  liveTapLikeBuffer = 0;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  l.liveLikes = (l.liveLikes || 0) + toAdd;
  await saveWithRetry('live:' + currentLiveView.id, l, true);
}
function showHeartAnimation(event){
  const heart = document.createElement('div');
  heart.textContent = '❤️';
  heart.style.cssText = 'position:fixed; font-size:80px; pointer-events:none; z-index:200; animation:heartPop 0.8s ease-out forwards;';
  let x = window.innerWidth/2, y = window.innerHeight/2;
  if(event){
    if(event.clientX !== undefined){ x = event.clientX; y = event.clientY; }
    else if(event.changedTouches && event.changedTouches[0]){ x = event.changedTouches[0].clientX; y = event.changedTouches[0].clientY; }
  }
  heart.style.left = (x - 40) + 'px';
  heart.style.top = (y - 40) + 'px';
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 800);
}
let currentVideoActionsPostId = null;
async function openVideoActionsMenu(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  triggerHapticFeedback('medium');
  currentVideoActionsPostId = postId;
  const isMine = p.userId === currentUser;
  const favorited = (p.favoritedBy || []).includes(currentUser);
  const items = [];
  items.push({ icon: favorited ? '🔖' : '📑', label: favorited ? 'Enregistré' : 'Enregistrer', action: 'toggleFavorite(\''+postId+'\'); closeVideoActionsMenu()' });
  if(p.downloadable !== false) items.push({ icon: '⬇️', label: 'Télécharger', action: 'downloadPostMedia(\''+postId+'\'); closeVideoActionsMenu()' });
  if(!isMine) items.push({ icon: '🚫', label: 'Pas intéressé', action: 'markNotInterested(\''+postId+'\'); closeVideoActionsMenu()' });
  if(!isMine) items.push({ icon: '⚠️', label: 'Signaler', action: 'reportPost(\''+postId+'\'); closeVideoActionsMenu()' });
  if(!isMine) items.push({ icon: '🚫', label: 'Bloquer @'+escapeHtml(p.userId), action: 'closeVideoActionsMenu(); blockUserFromPost(\''+p.userId+'\')' });
  if(isMine) items.push({ icon: '🚀', label: 'Promouvoir', action: 'requestBoostPost(\''+postId+'\'); closeVideoActionsMenu()' });
  if(isMine) items.push({ icon: '🗑️', label: 'Supprimer', action: 'deleteMyPost(\''+postId+'\'); closeVideoActionsMenu()' });
  if(p.type === 'video') items.push({ icon: '⚡', label: 'Vitesse', action: 'openSpeedPickerFromMenu(\''+postId+'\')' });
  items.push({ icon: dataSaverEnabled ? '📶' : '📵', label: 'Alléger l’affichage', action: 'toggleDataSaverFromMenu()' });
  items.push({ icon: '🔁', label: 'Défilement auto', action: 'toggleAutoplayFromMenu()' });
  items.push({ icon: 'Aa', label: 'Légendes', action: 'toggleSubtitlesFromMenu()' });
  if(p.caption) items.push({ icon: '🌐', label: 'Traduire', action: 'closeVideoActionsMenu(); translateCaption(\''+postId+'\')' });
  if(p.type === 'video') items.push({ icon: '🖼️', label: 'Image incrustée', action: 'togglePictureInPicture(\''+postId+'\'); closeVideoActionsMenu()' });
  items.push({ icon: '🔗', label: 'Copier le lien', action: 'copyPostLink(\''+postId+'\'); closeVideoActionsMenu()' });
  items.push({ icon: '🔍', label: 'Zoomer', action: 'closeVideoActionsMenu(); openMediaZoom(\''+postId+'\')' });
  const el = document.getElementById('video-actions-menu-content');
  el.innerHTML = items.map(it => '<div onclick="'+it.action+'" style="display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; padding:6px 0;"><span style="font-size:22px; width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:rgba(245,239,227,0.08); border-radius:50%;">'+it.icon+'</span><span style="font-size:10.5px; text-align:center; color:rgba(245,239,227,0.8);">'+it.label+'</span></div>').join('');
  document.getElementById('video-actions-menu-overlay').style.display = 'block';
}
async function blockUserFromPost(username){
  const ok = confirm('Bloquer @' + username + ' ? Vous ne verrez plus son contenu et il/elle ne pourra plus interagir avec vous.');
  if(!ok) return;
  const previousViewedProfile = currentViewedProfileUsername;
  currentViewedProfileUsername = username;
  await toggleBlockUser();
  currentViewedProfileUsername = previousViewedProfile;
}
function closeVideoActionsMenu(){
  document.getElementById('video-actions-menu-overlay').style.display = 'none';
}
function openSpeedPickerFromMenu(postId){
  closeVideoActionsMenu();
  const select = document.getElementById('playback-speed-' + postId);
  if(select) select.focus();
}
async function toggleDataSaverFromMenu(){
  dataSaverEnabled = !dataSaverEnabled;
  await saveWithRetry('settings:datasaver', dataSaverEnabled, false);
  const checkbox = document.getElementById('data-saver-toggle');
  if(checkbox){ checkbox.checked = dataSaverEnabled; document.getElementById('data-saver-toggle-visual').style.background = dataSaverEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)'; }
  showToast(dataSaverEnabled ? 'Économie de données activée ✓' : 'Économie de données désactivée');
  closeVideoActionsMenu();
}
async function toggleAutoplayFromMenu(){
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.autoplayNextVideo = me.autoplayNextVideo === false;
  await saveWithRetry('user:' + currentUser, me, true);
  const checkbox = document.getElementById('autoplay-next-toggle');
  if(checkbox) checkbox.checked = me.autoplayNextVideo;
  showToast(me.autoplayNextVideo ? 'Lecture automatique activée ✓' : 'Lecture automatique désactivée');
  closeVideoActionsMenu();
}
async function toggleSubtitlesFromMenu(){
  subtitlesEnabled = !subtitlesEnabled;
  await saveWithRetry('settings:subtitles', subtitlesEnabled, false);
  const checkbox = document.getElementById('subtitles-toggle');
  if(checkbox){ checkbox.checked = subtitlesEnabled; document.getElementById('subtitles-toggle-visual').style.background = subtitlesEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)'; }
  showToast(subtitlesEnabled ? 'Sous-titres activés ✓' : 'Sous-titres désactivés');
  closeVideoActionsMenu();
  await renderFeed();
}
async function copyPostLink(postId){
  const url = window.location.href + '#post-' + postId;
  try{
    await navigator.clipboard.writeText(url);
    showToast('Lien copié ✓');
  }catch(e){
    showToast('Impossible de copier le lien sur cet appareil');
  }
}
function startLongPress(postId){
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    openVideoActionsMenu(postId);
  }, 500);
}
function cancelLongPress(){
  if(longPressTimer){ clearTimeout(longPressTimer); longPressTimer = null; }
}
function handleMediaClickAfterLongPress(){
  if(longPressTriggered){ longPressTriggered = false; return false; }
  return true;
}
async function openMediaZoom(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  const overlay = document.getElementById('media-zoom-overlay');
  const content = document.getElementById('media-zoom-content');
  mediaZoomScale = 1;
  if(p.type === 'video'){
    content.innerHTML = '<video id="zoom-video" src="'+p.data+'" controls autoplay playsinline style="max-width:100%; max-height:100%;"></video>';
  } else {
    content.innerHTML = '<img id="zoom-image" src="'+p.data+'" ondblclick="toggleDoubleTapZoom()" style="max-width:100%; max-height:100%; transform:scale(1); transition:transform 0.15s; touch-action:none;">';
  }
  overlay.style.display = 'block';
  setupMediaPinchZoom();
}
function closeMediaZoom(){
  const overlay = document.getElementById('media-zoom-overlay');
  const video = document.getElementById('zoom-video');
  if(video) video.pause();
  overlay.style.display = 'none';
  document.getElementById('media-zoom-content').innerHTML = '';
}
function toggleDoubleTapZoom(){
  const img = document.getElementById('zoom-image');
  if(!img) return;
  mediaZoomScale = mediaZoomScale > 1 ? 1 : 2.5;
  img.style.transform = 'scale(' + mediaZoomScale + ')';
}
function getTouchDistance(touches){
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}
function setupMediaPinchZoom(){
  const content = document.getElementById('media-zoom-content');
  content.ontouchstart = (e) => {
    if(e.touches.length === 2){
      mediaZoomPinchStartDist = getTouchDistance(e.touches);
      mediaZoomPinchStartScale = mediaZoomScale;
    }
  };
  content.ontouchmove = (e) => {
    if(e.touches.length === 2 && mediaZoomPinchStartDist){
      const img = document.getElementById('zoom-image');
      if(img){
        const newDist = getTouchDistance(e.touches);
        mediaZoomScale = Math.min(4, Math.max(1, mediaZoomPinchStartScale * (newDist / mediaZoomPinchStartDist)));
        img.style.transform = 'scale(' + mediaZoomScale + ')';
      }
    }
  };
  content.ontouchend = () => { mediaZoomPinchStartDist = null; };
}
async function toggleReactionPicker(postId){
  const existing = document.getElementById('reaction-picker-' + postId);
  document.querySelectorAll('[id^="reaction-picker-"]').forEach(el => el.remove());
  if(existing) return; // était déjà ouvert, on vient de le fermer ci-dessus
  if(!requireAccount('Créez un compte pour réagir')) return;
  const btn = document.getElementById('reaction-btn-' + postId);
  if(!btn) return;
  const picker = document.createElement('div');
  picker.id = 'reaction-picker-' + postId;
  picker.style.cssText = 'position:absolute; background:rgba(11,46,61,0.95); border:1px solid var(--line); border-radius:20px; padding:6px 10px; display:flex; gap:8px; z-index:20; bottom:100%; margin-bottom:6px;';
  picker.innerHTML = QUICK_REACTION_EMOJIS.map(e => '<span style="font-size:20px; cursor:pointer;" onclick="event.stopPropagation(); selectReaction(\''+postId+'\', \''+e+'\')">'+e+'</span>').join('');
  btn.style.position = 'relative';
  btn.appendChild(picker);
}
async function selectReaction(postId, emoji){
  document.querySelectorAll('[id^="reaction-picker-"]').forEach(el => el.remove());
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(!p.reactions) p.reactions = {};
  QUICK_REACTION_EMOJIS.forEach(e => {
    if(!p.reactions[e]) p.reactions[e] = [];
    const idx = p.reactions[e].indexOf(currentUser);
    if(idx !== -1) p.reactions[e].splice(idx, 1);
  });
  const alreadyHadThis = (p.reactions[emoji] || []).includes(currentUser);
  if(!alreadyHadThis){
    p.reactions[emoji].push(currentUser);
    await createNotification(p.userId, 'reaction', currentUser, postId, emoji);
  }
  await saveWithRetry('post:' + postId, p, true);
  await renderFeed();
}
function triggerHapticFeedback(intensity){
  if(!navigator.vibrate) return;
  const duration = intensity === 'light' ? 10 : intensity === 'medium' ? 20 : 30;
  navigator.vibrate(duration);
}
async function toggleLike(postId){
  if(!requireAccount('Créez un compte pour aimer une publication')) return;
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  const idx = p.likes.indexOf(currentUser);
  let nowLiked = false;
  if(idx === -1){
    p.likes.push(currentUser);
    if(p.dislikes){ const dIdx = p.dislikes.indexOf(currentUser); if(dIdx !== -1) p.dislikes.splice(dIdx, 1); }
    nowLiked = true;
    triggerHapticFeedback('light');
  } else {
    p.likes.splice(idx, 1);
  }
  await saveWithRetry('post:' + postId, p, true);
  if(nowLiked){
    await createNotification(p.userId, 'like', currentUser, postId);
  }
  await checkActiveMemberBadge(p.userId);
  await renderFeed();
}
let currentCommentsPostId = null;
let expandedCommentThreads = new Set();
async function openCommentsScreen(postId){
  if(currentCommentsPostId !== postId) expandedCommentThreads = new Set();
  currentCommentsPostId = postId;
  go('comments');
  await loadCommentDraft();
}
function toggleCommentThread(index){
  if(expandedCommentThreads.has(index)) expandedCommentThreads.delete(index);
  else expandedCommentThreads.add(index);
  renderCommentsScreen();
}
async function renderCommentsScreen(){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  const el = document.getElementById('comments-list');
  if(!p){ el.innerHTML = '<div class="empty">Publication introuvable.</div>'; return; }
  const restrictionBanner = document.getElementById('comment-restriction-banner');
  const inputRow = document.getElementById('comment-input-row');
  if(restrictionBanner && inputRow){
    const check = await canUserCommentOnPost(p);
    if(!check.allowed){
      restrictionBanner.textContent = '🔒 ' + check.reason;
      restrictionBanner.style.display = 'block';
      inputRow.style.display = 'none';
    } else {
      restrictionBanner.style.display = 'none';
      inputRow.style.display = 'flex';
    }
  }
  if(!p.comments || p.comments.length === 0){ el.innerHTML = '<div class="empty">Aucun commentaire pour l’instant. Soyez le premier !</div>'; }
  const countHeaderEl = document.getElementById('comments-count-header');
  if(countHeaderEl) countHeaderEl.textContent = (p.comments ? p.comments.length : 0) + ' commentaire' + ((p.comments && p.comments.length > 1) ? 's' : '');
  if(!p.comments || p.comments.length === 0) return;
  const isOwner = p.userId === currentUser;
  const distinctCommenters = [...new Set(p.comments.map(c => c.user))];
  const commenterPhotos = {};
  for(const username of distinctCommenters){
    const u = await safeGet('user:' + username, true).catch(() => null);
    commenterPhotos[username] = (u && u.photo) ? u.photo : null;
  }
  const renderOneComment = (i, isPinned) => {
    const c = p.comments[i];
    const avatarHtml = '<div class="avatar" onclick="openUserProfile(\''+escapeHtml(c.user)+'\')" style="width:32px; height:32px; font-size:14px; cursor:pointer; flex-shrink:0; background-size:cover; background-position:center;'+(commenterPhotos[c.user] ? ' background-image:url('+commenterPhotos[c.user]+');' : '')+'">'+(commenterPhotos[c.user] ? '' : escapeHtml(c.user).charAt(0).toUpperCase())+'</div>';
    return '<div class="card" style="padding:10px 14px; display:flex; gap:10px;'+(c.replyToIndex !== undefined && c.replyToIndex !== null ? ' margin-left:24px; border-left:2px solid var(--lagoon);' : '')+(isPinned ? ' border-color:var(--gold);' : '')+'">' +
    avatarHtml +
    '<div style="flex:1; min-width:0;">' +
    (isPinned ? '<p style="margin:0 0 4px; font-size:11px; color:var(--gold);">📌 Commentaire épinglé</p>' : '') +
    (c.status === 'pending' ? '<p style="margin:0 0 4px; font-size:11px; color:var(--coral);">⏳ En attente d’approbation</p>' : '') +
    '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">' +
    '<div style="flex:1;">' +
    '<strong style="font-size:13px; font-family:\'Baloo 2\'; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(c.user)+'\')">@'+escapeHtml(c.user)+'</strong>' +
    (c.user === p.userId ? ' <span style="font-size:10px; color:var(--gold); background:rgba(242,183,5,0.15); border-radius:8px; padding:1px 7px; vertical-align:middle;">Créateur</span>' : '') +
    '<p id="comment-text-'+i+'" style="margin:4px 0 0; font-size:13.5px;">'+formatCaptionWithLinks(c.text)+(c.text ? ' <span onclick="translateComment('+i+')" style="color:var(--lagoon); font-size:11px; cursor:pointer; white-space:nowrap;">🌐 Traduire</span>' : '')+(c.edited ? ' <span style="color:rgba(245,239,227,0.4); font-size:10.5px;">(modifié)</span>' : '')+'</p>' +
    (c.imageData ? '<img src="'+c.imageData+'" style="max-width:160px; border-radius:8px; margin-top:6px;">' : '') +
    (c.sticker ? '<div style="font-size:34px; margin-top:6px;">'+c.sticker+'</div>' : '') +
    '</div>' +
    '<div style="display:flex; flex-direction:column; align-items:center; gap:6px; flex-shrink:0;">' +
    '<span onclick="toggleCommentLike('+i+')" style="cursor:pointer; text-align:center; color:'+((c.likes||[]).includes(currentUser)?'var(--coral)':'rgba(245,239,227,0.5)')+';"><div style="font-size:16px;">'+((c.likes||[]).includes(currentUser)?'❤️':'🤍')+'</div><div style="font-size:10px;">'+((c.likes||[]).length||'')+'</div></span>' +
    '<span onclick="toggleCommentDislike('+i+')" style="cursor:pointer; font-size:15px; color:'+((c.dislikes||[]).includes(currentUser)?'var(--gold)':'rgba(245,239,227,0.4)')+';">👎</span>' +
    '</div>' +
    '</div>' +
    '<span onclick="startCommentReply('+i+', \''+escapeHtml(c.user)+'\')" style="color:var(--gold); font-size:11px; cursor:pointer; margin-top:6px; display:inline-block;">↩ Répondre</span>' +
    ' <span onclick="startVideoReplyToComment(\''+currentCommentsPostId+'\', '+i+', \''+escapeHtml(c.user)+'\')" style="color:var(--lagoon); font-size:11px; cursor:pointer; margin-top:6px; margin-left:10px; display:inline-block;">🎥 Répondre en vidéo</span>' +
    ' <span onclick="openCommentKebabMenu('+i+')" style="color:rgba(245,239,227,0.5); font-size:16px; cursor:pointer; margin-top:6px; margin-left:10px; display:inline-block; padding:2px 4px;">⋮</span>' +
    '</div>' +
    '</div>';
  };
  const sortOrderEl = document.getElementById('comment-sort-order');
  const sortOrder = sortOrderEl ? sortOrderEl.value : 'top';
  const topLevel = p.comments.map((c, i) => i).filter(i =>
    (p.comments[i].replyToIndex === undefined || p.comments[i].replyToIndex === null) &&
    (p.comments[i].status !== 'pending' || p.comments[i].user === currentUser || p.userId === currentUser)
  );
  topLevel.sort((a, b) => {
    const aPinned = p.pinnedCommentIndex === a ? 1 : 0;
    const bPinned = p.pinnedCommentIndex === b ? 1 : 0;
    if(aPinned !== bPinned) return bPinned - aPinned;
    if(sortOrder === 'recent') return new Date(p.comments[b].ts) - new Date(p.comments[a].ts);
    const aLikes = (p.comments[a].likes || []).length;
    const bLikes = (p.comments[b].likes || []).length;
    if(aLikes !== bLikes) return bLikes - aLikes;
    return new Date(p.comments[b].ts) - new Date(p.comments[a].ts);
  });
  el.innerHTML = topLevel.map(i => {
    const replies = p.comments.map((c, ri) => ri).filter(ri => p.comments[ri].replyToIndex === i && (p.comments[ri].status !== 'pending' || p.comments[ri].user === currentUser || p.userId === currentUser));
    const isExpanded = expandedCommentThreads.has(i);
    return renderOneComment(i, p.pinnedCommentIndex === i) +
      (replies.length > 0
        ? '<div style="margin-left:24px; margin-bottom:6px;"><span onclick="toggleCommentThread('+i+')" style="color:var(--lagoon); font-size:12px; cursor:pointer; display:inline-block; margin:2px 0 6px;">'+(isExpanded ? '▲ Masquer' : '▼ Afficher')+' '+replies.length+' réponse'+(replies.length>1?'s':'')+'</span>' +
          (isExpanded ? replies.map(ri => renderOneComment(ri, p.pinnedCommentIndex === ri)).join('') : '') +
          '</div>'
        : '');
  }).join('');
}
/* ---------- VOTE COMMUNAUTÉ SUR LES FUTURES FONCTIONNALITÉS ---------- */
/* ---------- SONDAGE DE SATISFACTION APRÈS UN COURS ---------- */
let currentSurveyCourseId = null;
async function submitCourseSurvey(){
  const satisfaction = document.getElementById('survey-satisfaction').value;
  const recommend = document.getElementById('survey-recommend').value;
  const comment = document.getElementById('survey-comment').value.trim();
  const surveyKey = 'coursesurvey:' + currentSurveyCourseId + '__' + currentUser;
  await saveWithRetry(surveyKey, { courseId: currentSurveyCourseId, studentUsername: currentUser, satisfaction, recommend, comment, createdAt: new Date().toISOString() }, true);
  showToast('Merci pour votre avis ✓');
  await openCourseCertificate(currentSurveyCourseId);
}
async function skipCourseSurvey(){
  const surveyKey = 'coursesurvey:' + currentSurveyCourseId + '__' + currentUser;
  await saveWithRetry(surveyKey, { skipped: true, createdAt: new Date().toISOString() }, true);
  await openCourseCertificate(currentSurveyCourseId);
}
async function proposeFeatureIdea(){
  const title = document.getElementById('new-feature-title').value.trim();
  const desc = document.getElementById('new-feature-desc').value.trim();
  if(!title){ showToast('Renseignez au moins un titre'); return; }
  const id = 'featurevote_' + Date.now();
  await saveWithRetry('featurevote:' + id, {
    id, title, desc, authorUsername: currentUser, votes: [], createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-feature-title').value = '';
  document.getElementById('new-feature-desc').value = '';
  showToast('Proposition publiée ✓');
  go('feature-votes');
}
async function renderFeatureVotesList(){
  const el = document.getElementById('feature-votes-list');
  if(!el) return;
  const keys = await safeList('featurevote:', true);
  const ideas = [];
  for(const k of keys){ const f = await safeGet(k, true); if(f) ideas.push(f); }
  ideas.sort((a,b) => (b.votes?b.votes.length:0) - (a.votes?a.votes.length:0));
  el.innerHTML = ideas.length === 0 ? '<div class="empty">Aucune proposition pour l’instant — soyez le premier !</div>' : ideas.map(f => {
    const hasVoted = (f.votes || []).includes(currentUser);
    return '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(f.title)+'</p>' +
    (f.desc ? '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.6);">'+escapeHtml(f.desc)+'</p>' : '') +
    '<p style="margin:0 0 10px; font-size:11px; color:rgba(245,239,227,0.4);">Proposé par @'+escapeHtml(f.authorUsername)+'</p>' +
    '<button class="btn '+(hasVoted?'btn-primary':'btn-outline')+' btn-sm" onclick="voteForFeature(\''+f.id+'\')">👍 '+(f.votes?f.votes.length:0)+' vote(s)'+(hasVoted?' — Voté ✓':'')+'</button></div>';
  }).join('');
}
async function nominateCreatorOfMonth(){
  const input = document.getElementById('new-creator-nomination-input');
  const username = input.value.trim().replace(/^@/, '');
  if(!username){ showToast('Écrivez un nom d’utilisateur'); return; }
  const nominee = await safeGet('user:' + username, true);
  if(!nominee){ showToast('Ce compte n’existe pas'); return; }
  const monthKey = new Date().toISOString().slice(0,7);
  const id = monthKey + '__' + username;
  const existing = await safeGet('creatorvote:' + id, true);
  if(existing){ showToast('Déjà nominé(e) ce mois-ci — votez pour cette personne ci-dessous'); input.value = ''; await renderCreatorVoteList(); return; }
  await saveWithRetry('creatorvote:' + id, { username, monthKey, votes: [currentUser], createdAt: new Date().toISOString() }, true);
  input.value = '';
  showToast('Nomination ajoutée ✓');
  await renderCreatorVoteList();
}
async function voteForCreatorOfMonth(voteId){
  const v = await safeGet('creatorvote:' + voteId, true);
  if(!v) return;
  if(!Array.isArray(v.votes)) v.votes = [];
  const idx = v.votes.indexOf(currentUser);
  if(idx === -1) v.votes.push(currentUser);
  else v.votes.splice(idx, 1);
  await saveWithRetry('creatorvote:' + voteId, v, true);
  await renderCreatorVoteList();
}
async function nominateSoundForWeeklyTrend(soundId){
  const sound = await safeGet('sound:' + soundId, true);
  if(!sound) return;
  const weekKey = getISOWeekKey(new Date());
  const id = weekKey + '__' + soundId;
  const existing = await safeGet('trendvote:' + id, true);
  if(existing){ showToast('Déjà nominé cette semaine — votez ci-dessous'); await renderWeeklyTrendElection(); return; }
  await saveWithRetry('trendvote:' + id, { soundId, soundName: sound.name, weekKey, votes: [currentUser], createdAt: new Date().toISOString() }, true);
  showToast('Nomination ajoutée ✓');
  await renderWeeklyTrendElection();
}
async function voteForWeeklyTrend(voteId){
  const v = await safeGet('trendvote:' + voteId, true);
  if(!v) return;
  if(!Array.isArray(v.votes)) v.votes = [];
  const idx = v.votes.indexOf(currentUser);
  if(idx === -1) v.votes.push(currentUser);
  else v.votes.splice(idx, 1);
  await saveWithRetry('trendvote:' + voteId, v, true);
  await renderWeeklyTrendElection();
}
async function renderWeeklyTrendElection(){
  const el = document.getElementById('weekly-trend-election-section');
  if(!el) return;
  const weekKey = getISOWeekKey(new Date());
  const keys = await safeList('trendvote:' + weekKey + '__', true);
  const nominees = [];
  for(const k of keys){ const v = await safeGet(k, true); if(v) nominees.push({...v, id: k}); }
  nominees.sort((a,b) => (b.votes?b.votes.length:0) - (a.votes?a.votes.length:0));
  const topSounds = (await fetchSounds()).slice(0, 8);
  el.innerHTML =
    '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:0 0 10px;">Proposez un son parmi les plus utilisés cette semaine, puis votez pour élire le trend officiel.</p>' +
    (topSounds.length === 0 ? '' : '<div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; margin-bottom:12px;">' +
      topSounds.map(s => '<button class="btn btn-outline btn-sm" style="white-space:nowrap;" onclick="nominateSoundForWeeklyTrend(\''+s.id+'\')">+ '+escapeHtml(s.name.slice(0,20))+'</button>').join('') + '</div>') +
    (nominees.length === 0 ? '<div class="empty">Aucune nomination cette semaine.</div>' : nominees.map((v,i) => {
      const hasVoted = (v.votes || []).includes(currentUser);
      return '<div class="card" style="'+(i===0 && v.votes.length>0 ? 'border-color:var(--gold);' : '')+'"><p style="margin:0 0 8px; font-size:13px; font-weight:600;">'+(i===0 && v.votes.length>0 ? '👑 ' : '')+escapeHtml(v.soundName)+'</p>' +
      '<button class="btn '+(hasVoted?'btn-primary':'btn-outline')+' btn-sm" onclick="voteForWeeklyTrend(\''+v.id+'\')">👍 '+(v.votes?v.votes.length:0)+' vote(s)'+(hasVoted?' — Voté ✓':'')+'</button></div>';
    }).join(''));
}
async function renderCreatorVoteList(){
  const el = document.getElementById('creator-vote-list');
  if(!el) return;
  const monthKey = new Date().toISOString().slice(0,7);
  const keys = await safeList('creatorvote:' + monthKey + '__', true);
  const nominees = [];
  for(const k of keys){ const v = await safeGet(k, true); if(v) nominees.push({...v, id: k}); }
  nominees.sort((a,b) => (b.votes?b.votes.length:0) - (a.votes?a.votes.length:0));
  el.innerHTML = nominees.length === 0 ? '<div class="empty">Aucune nomination ce mois-ci — soyez le premier !</div>' : nominees.map(v => {
    const hasVoted = (v.votes || []).includes(currentUser);
    return '<div class="card"><p style="margin:0 0 8px; font-size:13px; font-weight:600;">@'+escapeHtml(v.username)+'</p>' +
    '<button class="btn '+(hasVoted?'btn-primary':'btn-outline')+' btn-sm" onclick="voteForCreatorOfMonth(\''+v.id+'\')">👍 '+(v.votes?v.votes.length:0)+' vote(s)'+(hasVoted?' — Voté ✓':'')+'</button></div>';
  }).join('');
}
async function proposePencTopic(){
  const input = document.getElementById('new-penc-topic-input');
  const title = input.value.trim();
  if(!title){ showToast('Écrivez un thème'); return; }
  const id = 'penctopic_' + Date.now();
  await saveWithRetry('penctopicvote:' + id, { id, title, authorUsername: currentUser, votes: [currentUser], createdAt: new Date().toISOString() }, true);
  input.value = '';
  showToast('Thème proposé ✓');
  await renderPencTopicVotesList();
}
async function voteForPencTopic(topicId){
  const t = await safeGet('penctopicvote:' + topicId, true);
  if(!t) return;
  if(!Array.isArray(t.votes)) t.votes = [];
  const idx = t.votes.indexOf(currentUser);
  if(idx === -1) t.votes.push(currentUser);
  else t.votes.splice(idx, 1);
  await saveWithRetry('penctopicvote:' + topicId, t, true);
  await renderPencTopicVotesList();
}
async function renderPencTopicVotesList(){
  const el = document.getElementById('penc-topic-votes-list');
  if(!el) return;
  const keys = await safeList('penctopicvote:', true);
  const topics = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) topics.push(t); }
  topics.sort((a,b) => (b.votes?b.votes.length:0) - (a.votes?a.votes.length:0));
  el.innerHTML = topics.length === 0 ? '<div class="empty">Aucun thème proposé pour l’instant — soyez le premier !</div>' : topics.map(t => {
    const hasVoted = (t.votes || []).includes(currentUser);
    return '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(t.title)+'</p>' +
    '<p style="margin:0 0 10px; font-size:11px; color:rgba(245,239,227,0.4);">Proposé par @'+escapeHtml(t.authorUsername)+'</p>' +
    '<button class="btn '+(hasVoted?'btn-primary':'btn-outline')+' btn-sm" onclick="voteForPencTopic(\''+t.id+'\')">👍 '+(t.votes?t.votes.length:0)+' vote(s)'+(hasVoted?' — Voté ✓':'')+'</button></div>';
  }).join('');
}
async function voteForFeature(featureId){
  const f = await safeGet('featurevote:' + featureId, true);
  if(!f) return;
  if(!Array.isArray(f.votes)) f.votes = [];
  const idx = f.votes.indexOf(currentUser);
  if(idx === -1) f.votes.push(currentUser);
  else f.votes.splice(idx, 1);
  await saveWithRetry('featurevote:' + featureId, f, true);
  await renderFeatureVotesList();
}
/* ---------- PANIER MULTI-PRODUITS ---------- */
/* ---------- ASSEMBLER PLUSIEURS CLIPS EN UNE SEULE VIDÉO ---------- */
async function mergeClipsIntoOne(){
  const statusEl = document.getElementById('merge-status');
  const clip1 = document.getElementById('clip-1-input').files[0];
  const clip2 = document.getElementById('clip-2-input').files[0];
  const clip3 = document.getElementById('clip-3-input').files[0];
  if(!clip1 || !clip2){ showToast('Choisissez au moins 2 clips'); return; }
  const clips = [clip1, clip2].concat(clip3 ? [clip3] : []);
  const transitionType = document.getElementById('clip-transition-select').value;
  statusEl.textContent = '⏳ Chargement de la bibliothèque de traitement vidéo...';
  try{
    const ffmpeg = await getFFmpegInstance();
    const { fetchFile } = FFmpeg;
    statusEl.textContent = '⏳ Assemblage en cours...';
    for(let i = 0; i < clips.length; i++){
      ffmpeg.FS('writeFile', 'clip' + i + '.mp4', await fetchFile(clips[i]));
    }
    const scaleLabels = clips.map((_, i) => '[' + i + ':v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1[v' + i + '];').join('');
    const args = [];
    clips.forEach((_, i) => { args.push('-i', 'clip' + i + '.mp4'); });
    let filterComplex;
    if(transitionType === 'none' || clips.length < 2){
      const concatInputs = clips.map((_, i) => '[v' + i + '][' + i + ':a]').join('');
      filterComplex = scaleLabels + concatInputs + 'concat=n=' + clips.length + ':v=1:a=1[outv][outa]';
    } else {
      statusEl.textContent = '⏳ Analyse de la durée des clips...';
      const durations = [];
      for(const clip of clips){
        const duration = await new Promise(resolve => {
          const probeVideo = document.createElement('video');
          probeVideo.preload = 'metadata';
          probeVideo.onloadedmetadata = () => resolve(probeVideo.duration || 2);
          probeVideo.onerror = () => resolve(2);
          probeVideo.src = URL.createObjectURL(clip);
        });
        durations.push(duration);
      }
      const xfadeDuration = 0.5;
      let videoChain = '';
      let cumulativeOffset = durations[0] - xfadeDuration;
      for(let i = 1; i < clips.length; i++){
        const prevLabel = i === 1 ? 'v0' : 'xfv' + (i-1);
        videoChain += (i === 1 ? '' : ';') + '[' + prevLabel + '][v' + i + ']xfade=transition=' + transitionType + ':duration=' + xfadeDuration + ':offset=' + cumulativeOffset.toFixed(2) + '[xfv' + i + ']';
        cumulativeOffset += durations[i] - xfadeDuration;
      }
      let audioChain = '';
      let audioCumulativeOffset = durations[0] - xfadeDuration;
      for(let i = 1; i < clips.length; i++){
        const prevLabel = i === 1 ? (i-1) + ':a' : 'xfa' + (i-1);
        audioChain += (i === 1 ? '' : ';') + '[' + prevLabel + '][' + i + ':a]acrossfade=d=' + xfadeDuration + '[xfa' + i + ']';
        audioCumulativeOffset += durations[i] - xfadeDuration;
      }
      const finalVideoLabel = 'xfv' + (clips.length - 1);
      const finalAudioLabel = 'xfa' + (clips.length - 1);
      filterComplex = scaleLabels + videoChain + ';' + audioChain + ';[' + finalVideoLabel + ']copy[outv];[' + finalAudioLabel + ']acopy[outa]';
    }
    args.push('-filter_complex', filterComplex, '-map', '[outv]', '-map', '[outa]', '-crf', '28', '-preset', 'ultrafast', 'merged.mp4');
    await ffmpeg.run(...args);
    const data = ffmpeg.FS('readFile', 'merged.mp4');
    processedVideoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const dt = new DataTransfer();
    dt.items.add(clip1);
    document.getElementById('publish-file').files = dt.files;
    originalSelectedFile = clip1;
    statusEl.textContent = '✓ Clips assemblés (' + (processedVideoBlob.size / (1024*1024)).toFixed(2) + ' Mo) — direction la publication...';
    showToast('Clips assemblés ✓');
    setTimeout(() => go('publish'), 800);
  }catch(e){
    statusEl.textContent = '✕ Assemblage indisponible pour le moment (' + e.message + ')';
    processedVideoBlob = null;
  }
}
async function addToCart(productId){
  const cart = (await safeGet('cart:' + currentUser, true)) || [];
  const existing = cart.find(item => item.productId === productId);
  if(existing) existing.quantity += 1;
  else cart.push({ productId, quantity: 1 });
  await saveWithRetry('cart:' + currentUser, cart, true);
  showToast('Ajouté au panier 🛒');
}
async function removeFromCart(productId){
  let cart = (await safeGet('cart:' + currentUser, true)) || [];
  cart = cart.filter(item => item.productId !== productId);
  await saveWithRetry('cart:' + currentUser, cart, true);
  await renderCartScreen();
}
async function renderCartScreen(){
  const listEl = document.getElementById('cart-items-list');
  const totalEl = document.getElementById('cart-total');
  const formEl = document.getElementById('cart-checkout-form');
  const cart = (await safeGet('cart:' + currentUser, true)) || [];
  if(cart.length === 0){
    listEl.innerHTML = '<div class="empty">Votre panier est vide.</div>';
    totalEl.textContent = '';
    formEl.style.display = 'none';
    return;
  }
  const allProducts = await fetchProducts();
  let total = 0;
  listEl.innerHTML = cart.map(item => {
    const p = allProducts.find(x => x.id === item.productId);
    if(!p) return '';
    total += p.price * item.quantity;
    return '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
      '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:12px; color:var(--gold);">'+item.quantity+' × '+p.price.toLocaleString('fr-FR')+' FCFA</p></div>' +
      '<span onclick="removeFromCart(\''+p.id+'\')" style="color:var(--coral); cursor:pointer; font-size:18px;">🗑️</span></div>';
  }).join('');
  totalEl.textContent = 'Total : ' + total.toLocaleString('fr-FR') + ' FCFA';
  formEl.style.display = 'block';
}
async function submitCartCheckout(){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function toggleCommentLike(index){
  if(!requireAccount('Créez un compte pour aimer un commentaire')) return;
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index]) return;
  const c = p.comments[index];
  if(!c.likes) c.likes = [];
  if(!c.dislikes) c.dislikes = [];
  const idx = c.likes.indexOf(currentUser);
  let nowLiked = false;
  if(idx === -1){
    c.likes.push(currentUser);
    const dIdx = c.dislikes.indexOf(currentUser);
    if(dIdx !== -1) c.dislikes.splice(dIdx, 1);
    nowLiked = true;
  } else {
    c.likes.splice(idx, 1);
  }
  await saveWithRetry('post:' + currentCommentsPostId, p, true);
  if(nowLiked && c.user !== currentUser) await createNotification(c.user, 'commentlike', currentUser, currentCommentsPostId);
  await renderCommentsScreen();
}
async function toggleCommentDislike(index){
  if(!requireAccount('Créez un compte pour réagir à un commentaire')) return;
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index]) return;
  const c = p.comments[index];
  if(!c.likes) c.likes = [];
  if(!c.dislikes) c.dislikes = [];
  const idx = c.dislikes.indexOf(currentUser);
  if(idx === -1){
    c.dislikes.push(currentUser);
    const lIdx = c.likes.indexOf(currentUser);
    if(lIdx !== -1) c.likes.splice(lIdx, 1);
  } else {
    c.dislikes.splice(idx, 1);
  }
  await saveWithRetry('post:' + currentCommentsPostId, p, true);
  await renderCommentsScreen();
}
async function openCommentKebabMenu(index){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments || !p.comments[index]) return;
  const c = p.comments[index];
  const isOwner = p.userId === currentUser;
  const isMine = c.user === currentUser;
  const isPinned = p.pinnedCommentIndex === index;
  const items = [];
  items.push({ icon: '🎥', label: 'Répondre en vidéo', action: 'closeGenericKebabMenu(); startVideoReplyToComment(\''+currentCommentsPostId+'\', '+index+', \''+escapeHtml(c.user).replace(/'/g,"\\'")+'\')' });
  if(isMine){
    items.push({ icon: '✏️', label: 'Modifier', action: 'closeGenericKebabMenu(); startEditComment('+index+')' });
    items.push({ icon: '🗑️', label: 'Supprimer', action: 'closeGenericKebabMenu(); deleteOwnComment('+index+')' });
  } else {
    items.push({ icon: '🚩', label: 'Signaler', action: 'closeGenericKebabMenu(); reportComment('+index+')' });
  }
  if(isOwner){
    items.push({ icon: '📌', label: isPinned ? 'Désépingler' : 'Épingler', action: 'closeGenericKebabMenu(); togglePinComment('+index+')' });
  }
  openGenericKebabMenu(items);
}
async function togglePinComment(index){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || p.userId !== currentUser) return;
  p.pinnedCommentIndex = (p.pinnedCommentIndex === index) ? null : index;
  await saveWithRetry('post:' + currentCommentsPostId, p, true);
  await renderCommentsScreen();
}
async function openPendingCommentsReview(){
  if(!currentCommentSettingsPostId) return;
  go('pending-comments-review');
  await renderPendingCommentsReview();
}
async function renderPendingCommentsReview(){
  const el = document.getElementById('pending-comments-review-list');
  if(!el || !currentCommentSettingsPostId) return;
  const p = await safeGet('post:' + currentCommentSettingsPostId, true);
  if(!p || p.userId !== currentUser){ el.innerHTML = ''; return; }
  const pendingIndices = (p.comments || []).map((c, i) => i).filter(i => p.comments[i].status === 'pending');
  if(pendingIndices.length === 0){ el.innerHTML = '<div class="empty">Aucun commentaire en attente pour l’instant.</div>'; return; }
  const pendingCommenterPhotos = {};
  for(const i of pendingIndices){
    const username = p.comments[i].user;
    if(pendingCommenterPhotos[username] !== undefined) continue;
    const u = await safeGet('user:' + username, true).catch(() => null);
    pendingCommenterPhotos[username] = (u && u.photo) ? u.photo : null;
  }
  el.innerHTML = pendingIndices.map(i => {
    const c = p.comments[i];
    const avatarHtml = '<div class="avatar" onclick="openUserProfile(\''+escapeHtml(c.user)+'\')" style="width:28px; height:28px; font-size:12px; cursor:pointer; flex-shrink:0; display:inline-flex; vertical-align:middle; margin-right:8px; background-size:cover; background-position:center;'+(pendingCommenterPhotos[c.user] ? ' background-image:url('+pendingCommenterPhotos[c.user]+');' : '')+'">'+(pendingCommenterPhotos[c.user] ? '' : escapeHtml(c.user).charAt(0).toUpperCase())+'</div>';
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; display:flex; align-items:center;">'+avatarHtml+'<strong>@'+escapeHtml(c.user)+'</strong></p>' +
      (c.text ? '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.75);">'+escapeHtml(c.text)+'</p>' : '') +
      (c.imageData ? '<img src="'+c.imageData+'" style="max-width:160px; border-radius:8px; margin-bottom:8px;">' : '') +
      (c.sticker ? '<div style="font-size:34px; margin-bottom:8px;">'+c.sticker+'</div>' : '') +
      '<div style="display:flex; gap:8px;">' +
      '<button class="btn btn-primary btn-sm" onclick="approvePendingComment('+i+')">✓ Approuver</button>' +
      '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="rejectPendingComment('+i+')">✕ Supprimer</button>' +
      '</div></div>';
  }).join('');
}
async function approvePendingComment(index){
  const p = await safeGet('post:' + currentCommentSettingsPostId, true);
  if(!p || p.userId !== currentUser || !p.comments[index] || p.comments[index].status !== 'pending') return;
  p.comments[index].status = 'approved';
  await saveWithRetry('post:' + currentCommentSettingsPostId, p, true);
  const c = p.comments[index];
  if(c.replyToIndex !== undefined && c.replyToIndex !== null && p.comments[c.replyToIndex] && p.comments[c.replyToIndex].user !== c.user){
    await createNotification(p.comments[c.replyToIndex].user, 'commentreply', c.user, currentCommentSettingsPostId, c.text.slice(0,60));
  } else {
    await createNotification(p.userId, 'comment', c.user, currentCommentSettingsPostId, c.text.slice(0,60));
  }
  await notifyMentions(c.text, c.user, currentCommentSettingsPostId);
  showToast('Commentaire approuvé ✓');
  await renderPendingCommentsReview();
}
async function rejectPendingComment(index){
  const p = await safeGet('post:' + currentCommentSettingsPostId, true);
  if(!p || p.userId !== currentUser || !p.comments[index] || p.comments[index].status !== 'pending') return;
  if(!confirm('Supprimer définitivement ce commentaire ?')) return;
  p.comments.splice(index, 1);
  if(p.pinnedCommentIndex !== null && p.pinnedCommentIndex !== undefined){
    if(p.pinnedCommentIndex === index) p.pinnedCommentIndex = null;
    else if(p.pinnedCommentIndex > index) p.pinnedCommentIndex -= 1;
  }
  await saveWithRetry('post:' + currentCommentSettingsPostId, p, true);
  showToast('Commentaire supprimé ✓');
  await renderPendingCommentsReview();
}
async function deleteOwnComment(index){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index] || p.comments[index].user !== currentUser) return;
  if(!confirm('Supprimer définitivement ce commentaire ?')) return;
  p.comments.splice(index, 1);
  if(p.pinnedCommentIndex !== null && p.pinnedCommentIndex !== undefined){
    if(p.pinnedCommentIndex === index) p.pinnedCommentIndex = null;
    else if(p.pinnedCommentIndex > index) p.pinnedCommentIndex -= 1;
  }
  await saveWithRetry('post:' + currentCommentsPostId, p, true);
  showToast('Commentaire supprimé ✓');
  await renderCommentsScreen();
}
async function startEditComment(index){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index] || p.comments[index].user !== currentUser) return;
  const el = document.getElementById('comment-text-' + index);
  if(!el) return;
  const currentText = p.comments[index].text;
  el.innerHTML = '<textarea id="comment-edit-input-'+index+'" style="min-height:60px; margin:0 0 6px;">'+escapeHtml(currentText)+'</textarea>' +
    '<button class="btn btn-primary btn-sm" onclick="saveEditComment('+index+')">Enregistrer</button> ' +
    '<button class="btn btn-outline btn-sm" onclick="renderCommentsScreen()">Annuler</button>';
}
async function saveEditComment(index){
  const input = document.getElementById('comment-edit-input-' + index);
  if(!input) return;
  const newText = input.value.trim();
  if(!newText){ showToast('Le commentaire ne peut pas être vide'); return; }
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index] || p.comments[index].user !== currentUser) return;
  p.comments[index].text = newText;
  p.comments[index].edited = true;
  await saveWithRetry('post:' + currentCommentsPostId, p, true);
  showToast('Commentaire modifié ✓');
  await renderCommentsScreen();
}
let currentReplyToIndex = null;
/* ---------- RÉPONSE VIDÉO À UN COMMENTAIRE ---------- */
let pendingVideoReplyTo = null;
function openCommentsScreenFromReply(postId){
  openCommentsScreen(postId);
}
async function startVideoReplyToComment(postId, commentIndex, commentAuthor){
  const p = await safeGet('post:' + postId, true);
  if(!p || !p.comments || !p.comments[commentIndex]) return;
  pendingVideoReplyTo = {
    postId, commentIndex, commentAuthor,
    commentText: p.comments[commentIndex].text
  };
  showToast('Filmez votre réponse vidéo à @' + commentAuthor);
  go('publish');
}
function renderVideoReplyBanner(){
  const el = document.getElementById('video-reply-banner');
  if(!el) return;
  if(!pendingVideoReplyTo){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '🎥 Réponse vidéo à @'+escapeHtml(pendingVideoReplyTo.commentAuthor)+' : « '+escapeHtml(pendingVideoReplyTo.commentText.slice(0,60))+(pendingVideoReplyTo.commentText.length>60?'...':'')+' » <span onclick="cancelVideoReply()" style="color:rgba(245,239,227,0.5); cursor:pointer; text-decoration:underline; margin-left:6px;">Annuler</span>';
}
function cancelVideoReply(){
  pendingVideoReplyTo = null;
  renderVideoReplyBanner();
}
function startCommentReply(index, username){
  currentReplyToIndex = index;
  const input = document.getElementById('comment-input');
  input.value = '@' + username + ' ';
  input.focus();
  const banner = document.getElementById('comment-reply-banner');
  if(banner) banner.innerHTML = 'En réponse à @'+escapeHtml(username)+' <span onclick="cancelCommentReply()" style="color:rgba(245,239,227,0.5); cursor:pointer; text-decoration:underline;">Annuler</span>';
}
function cancelCommentReply(){
  currentReplyToIndex = null;
  const banner = document.getElementById('comment-reply-banner');
  if(banner) banner.innerHTML = '';
}
async function canUserCommentOnPost(p){
  if(p.commentsDisabled) return { allowed: false, reason: 'Les commentaires ont été désactivés par l’auteur.' };
  if(currentUser !== p.userId && await isBlockedEitherWay(p.userId)) return { allowed: false, reason: 'Vous ne pouvez pas commenter cette publication.' };
  if(p.commentsCloseAt && new Date() > new Date(p.commentsCloseAt)) return { allowed: false, reason: 'Les commentaires sont fermés depuis le délai fixé par l’auteur.' };
  if(p.commentRestriction && p.commentRestriction !== 'everyone' && currentUser !== p.userId){
    const owner = await safeGet('user:' + p.userId, true);
    if(p.commentRestriction === 'following' && !((owner && owner.following) || []).includes(currentUser)){
      return { allowed: false, reason: 'Seules les personnes suivies par l’auteur peuvent commenter cette publication.' };
    }
    if(p.commentRestriction === 'followers' && !((owner && owner.followers) || []).includes(currentUser)){
      return { allowed: false, reason: 'Seuls les abonnés de l’auteur peuvent commenter cette publication.' };
    }
  }
  return { allowed: true };
}
async function addComment(postId, text, replyToIndex, imageData, sticker){
  const p = await safeGet('post:' + postId, true);
  if(!p) return { allowed: false, reason: 'Publication introuvable.' };
  const check = await canUserCommentOnPost(p);
  if(!check.allowed) return check;
  if(!p.comments) p.comments = [];
  const newIndex = p.comments.length;
  const isPending = !!p.filterAllComments && currentUser !== p.userId;
  p.comments.push({user: currentUser, text, imageData: imageData || null, sticker: sticker || null, ts: new Date().toISOString(), replyToIndex: (replyToIndex !== undefined && replyToIndex !== null) ? replyToIndex : null, likes: [], dislikes: [], status: isPending ? 'pending' : 'approved'});
  await saveWithRetry('post:' + postId, p, true);
  if(!isPending){
    if(replyToIndex !== undefined && replyToIndex !== null && p.comments[replyToIndex] && p.comments[replyToIndex].user !== currentUser){
      await createNotification(p.comments[replyToIndex].user, 'commentreply', currentUser, postId);
    } else {
      await createNotification(p.userId, 'comment', currentUser, postId);
    }
    await notifyMentions(text, currentUser, postId);
  }
  return { allowed: true, pending: isPending };
}
/* ---------- LISTE DE MOTS INTERDITS CONFIGURABLE ---------- */
async function getCreatorBlockedWords(username){
  const u = await safeGet('user:' + username, true);
  return (u && u.myBlockedCommentWords) || [];
}
async function saveMyBlockedCommentWords(){
  const raw = document.getElementById('my-blocked-words-input').value;
  const words = raw.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.myBlockedCommentWords = words;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Vos mots bloqués enregistrés ✓ (' + words.length + ' mot(s))');
}
/* ---------- ACCUSÉS DE LECTURE OPTIONNELS ---------- */
async function toggleReadReceipts(){
  const enabled = document.getElementById('read-receipts-toggle').checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.readReceiptsEnabled = enabled;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast(enabled ? 'Accusés de lecture activés ✓' : 'Accusés de lecture désactivés');
}
/* ---------- PRÉFÉRENCES DE NOTIFICATION ---------- */
const NOTIFICATION_CATEGORY_LABELS = {
  likes: '❤️ Likes',
  comments: '💬 Commentaires',
  follows: '👤 Nouveaux abonnés',
  mentions: '🔗 Mentions',
  directmessages: '✉️ Messages',
  messages: '📞 Appels',
  newposts: '🎬 Nouvelles publications',
  education: '🎓 Espace éducation',
  commerce: '🛍️ Activité boutique',
  other: '📋 Autres notifications'
};
async function toggleNotificationPreference(category){
  const checked = document.getElementById('notif-pref-' + category).checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  if(!me.notificationPreferences) me.notificationPreferences = {};
  me.notificationPreferences[category] = checked;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast(checked ? 'Notifications activées ✓' : 'Notifications désactivées');
}
async function renderNotificationPreferences(){
  const el = document.getElementById('notification-preferences-toggles');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const prefs = (me && me.notificationPreferences) || {};
  el.innerHTML = Object.keys(NOTIFICATION_CATEGORY_LABELS).map(cat => {
    const enabled = prefs[cat] !== false;
    return '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">' +
      '<input type="checkbox" id="notif-pref-' + cat + '" ' + (enabled ? 'checked' : '') + ' style="width:auto;" onchange="toggleNotificationPreference(\'' + cat + '\')">' +
      '<label style="margin:0; font-size:12.5px;" for="notif-pref-' + cat + '">' + NOTIFICATION_CATEGORY_LABELS[cat] + '</label>' +
      '</div>';
  }).join('');
}
async function loadReadReceiptsToggle(){
  const toggle = document.getElementById('read-receipts-toggle');
  if(!toggle) return;
  const me = await safeGet('user:' + currentUser, true);
  toggle.checked = !!(me && me.readReceiptsEnabled);
}
async function markThreadReadReceipt(otherUsername){
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.readReceiptsEnabled) return;
  await saveWithRetry('threadreadreceipt:' + currentUser + '__' + threadKeyFor(currentUser, otherUsername), new Date().toISOString(), true);
}
async function loadMyBlockedCommentWords(){
  const input = document.getElementById('my-blocked-words-input');
  if(!input) return;
  const words = await getCreatorBlockedWords(currentUser);
  input.value = words.join('\n');
}
async function getForbiddenWords(){
  return (await safeGet('settings:forbiddenWords', true)) || [];
}
async function saveForbiddenWords(){
  const raw = document.getElementById('forbidden-words-input').value;
  const words = raw.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
  const oldWords = (await safeGet('settings:forbiddenWords', true)) || [];
  await saveWithRetry('settings:forbiddenWords', words, true);
  if(oldWords.length !== words.length || oldWords.join(',') !== words.join(',')){
    await logCommissionChange('Liste de mots filtrés', oldWords.length + ' mot(s)', words.length + ' mot(s)');
  }
  showToast('Liste enregistrée ✓ (' + words.length + ' mot(s))');
}
async function loadForbiddenWords(){
  const input = document.getElementById('forbidden-words-input');
  if(!input) return;
  const words = await getForbiddenWords();
  input.value = words.join('\n');
}
/* ---------- CATÉGORIES DE PRODUITS INTERDITES ---------- */
const DEFAULT_PROHIBITED_PRODUCT_KEYWORDS = ['arme', 'pistolet', 'fusil', 'munition', 'drogue', 'cannabis', 'cocaïne', 'contrefaçon', 'faux document', 'animal vivant', 'espèce protégée', 'médicament sur ordonnance'];
async function getProhibitedProductKeywords(){
  const stored = await safeGet('settings:prohibitedProductKeywords', true);
  return stored || DEFAULT_PROHIBITED_PRODUCT_KEYWORDS;
}
async function saveProhibitedProductKeywords(){
  const raw = document.getElementById('prohibited-products-input').value;
  const words = raw.split('\n').map(w => w.trim().toLowerCase()).filter(Boolean);
  await saveWithRetry('settings:prohibitedProductKeywords', words, true);
  showToast('Liste enregistrée ✓ (' + words.length + ' mot(s))');
}
async function loadProhibitedProductKeywords(){
  const input = document.getElementById('prohibited-products-input');
  if(!input) return;
  const words = await getProhibitedProductKeywords();
  input.value = words.join('\n');
}
function containsForbiddenWord(text, forbiddenWords){
  const lower = text.toLowerCase();
  return forbiddenWords.find(w => lower.includes(w));
}
/* ---------- BROUILLONS DE COMMENTAIRES ---------- */
/* ---------- INVITATION CO-CRÉATEUR ---------- */
async function acceptCoCreatorInvite(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p || p.coCreatorUsername !== currentUser) return;
  p.coCreatorStatus = 'accepted';
  await saveWithRetry('post:' + postId, p, true);
  await createNotification(p.userId, 'co_creator_accepted', currentUser, postId, null);
  showToast('Invitation acceptée ✓ — vous êtes maintenant crédité(e) sur cette publication');
  await openSinglePostView(postId);
}
async function declineCoCreatorInvite(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p || p.coCreatorUsername !== currentUser) return;
  p.coCreatorStatus = 'declined';
  await saveWithRetry('post:' + postId, p, true);
  showToast('Invitation refusée');
  await openSinglePostView(postId);
}
async function saveCommentDraft(){
  if(!currentCommentsPostId || !currentUser) return;
  const text = document.getElementById('comment-input').value;
  if(!text){ await window.storage.delete('commentdraft:' + currentUser + '__' + currentCommentsPostId, false).catch(() => {}); return; }
  await saveWithRetry('commentdraft:' + currentUser + '__' + currentCommentsPostId, text, false);
}
async function loadCommentDraft(){
  const input = document.getElementById('comment-input');
  if(!input || !currentCommentsPostId || !currentUser) return;
  const draft = await safeGet('commentdraft:' + currentUser + '__' + currentCommentsPostId, false).catch(() => null);
  input.value = draft || '';
}
async function clearCommentDraft(){
  if(!currentCommentsPostId || !currentUser) return;
  await window.storage.delete('commentdraft:' + currentUser + '__' + currentCommentsPostId, false).catch(() => {});
}
async function onCommentImageSelected(){
  const file = document.getElementById('comment-image-input').files[0];
  if(!file) return;
  window.pendingCommentSticker = null;
  document.getElementById('comment-sticker-panel').style.display = 'none';
  const dataUrl = await compressImageDataUrl(await readFileAsDataURL(file), 800, 0.8);
  window.pendingCommentImage = dataUrl;
  document.getElementById('comment-image-preview').innerHTML = '<img id="comment-image-preview-img" style="max-height:80px; border-radius:8px;"><span onclick="removeCommentImage()" style="margin-left:8px; color:var(--coral); cursor:pointer; font-size:12px;">✕ Retirer</span>';
  document.getElementById('comment-image-preview-img').src = dataUrl;
  document.getElementById('comment-image-preview').style.display = 'block';
}
function removeCommentImage(){
  window.pendingCommentImage = null;
  document.getElementById('comment-image-input').value = '';
  document.getElementById('comment-image-preview').style.display = 'none';
}
function toggleCommentStickerPanel(){
  const panel = document.getElementById('comment-sticker-panel');
  panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}
function pickCommentSticker(emoji){
  window.pendingCommentSticker = emoji;
  removeCommentImage();
  document.getElementById('comment-sticker-panel').style.display = 'none';
  document.getElementById('comment-image-preview-img').src = '';
  document.getElementById('comment-image-preview').innerHTML = '<span style="font-size:32px;">'+emoji+'</span><span onclick="removeCommentSticker()" style="margin-left:8px; color:var(--coral); cursor:pointer; font-size:12px;">✕ Retirer</span>';
  document.getElementById('comment-image-preview').style.display = 'block';
}
function removeCommentSticker(){
  window.pendingCommentSticker = null;
  document.getElementById('comment-image-preview').style.display = 'none';
  document.getElementById('comment-image-preview').innerHTML = '<img id="comment-image-preview-img" style="max-height:80px; border-radius:8px;"><span onclick="removeCommentImage()" style="margin-left:8px; color:var(--coral); cursor:pointer; font-size:12px;">✕ Retirer</span>';
}
async function submitComment(){
  if(!requireAccount('Créez un compte pour commenter')) return;
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  const imageData = window.pendingCommentImage || null;
  const sticker = window.pendingCommentSticker || null;
  if(!text && !imageData && !sticker) return;
  if(!currentCommentsPostId) return;
  if(imageData){
    showToast('Vérification de l’image...');
    const moderation = await moderateImageWithCloudVision(imageData);
    if(moderation.flagged){
      await saveWithRetry('autoblockedcomment:' + Date.now(), {
        username: currentUser, postId: currentCommentsPostId, imageData, reason: moderation.reason || 'Contenu inapproprié détecté automatiquement (Google Cloud Vision)', createdAt: new Date().toISOString()
      }, true);
      showToast('Cette image a été bloquée automatiquement (contenu inapproprié détecté)');
      return;
    }
  }
  if(text){
    const forbiddenWords = await getForbiddenWords();
    const matched = containsForbiddenWord(text, forbiddenWords);
    if(matched){ showToast('Ce commentaire contient un mot non autorisé — veuillez le reformuler'); return; }
    const post = await safeGet('post:' + currentCommentsPostId, true);
    if(post && post.userId){
      const creatorWords = await getCreatorBlockedWords(post.userId);
      if(containsForbiddenWord(text, creatorWords)){ showToast('Ce commentaire contient un mot bloqué par le créateur de cette vidéo'); return; }
    }
  }
  const result = await addComment(currentCommentsPostId, text, currentReplyToIndex, imageData, sticker);
  if(!result.allowed){ showToast(result.reason); return; }
  if(result.pending) showToast('Commentaire envoyé — en attente d’approbation de l’auteur');
  await clearCommentDraft();
  input.value = '';
  window.pendingCommentImage = null;
  window.pendingCommentSticker = null;
  document.getElementById('comment-image-preview').style.display = 'none';
  currentReplyToIndex = null;
  cancelCommentReply();
  await renderCommentsScreen();
}
function dataURLtoFile(dataUrl, filename){
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while(n--){ u8arr[n] = bstr.charCodeAt(n); }
  return new File([u8arr], filename, { type: mime });
}
/* ---------- PARTAGER AVEC UN AMI (contacts internes) ---------- */
let currentSharePostId = null;
async function openShareToFriends(postId){
  currentSharePostId = postId;
  go('share-friends');
  await renderShareFriendsList();
}
async function renderShareFriendsList(){
  const el = document.getElementById('share-friends-list');
  const me = await safeGet('user:' + currentUser, true);
  const following = (me && me.following) || [];
  if(following.length === 0){
    el.innerHTML = '<div class="empty">Vous ne suivez encore personne.<br>Suivez des créateurs depuis le fil pour pouvoir leur envoyer des publications.</div>';
    return;
  }
  el.innerHTML = following.map(username =>
    '<div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
    '<span style="display:flex; align-items:center; gap:10px; font-size:13.5px;">' + smallAvatarBadge(username, 30) + '@'+escapeHtml(username) + '</span>' +
    '<button class="btn btn-primary btn-sm" onclick="sendPostToFriend(\''+escapeHtml(username)+'\')">Envoyer</button>' +
    '</div>'
  ).join('');
}
async function sendPostToFriend(friendUsername){
  if(!currentSharePostId) return;
  const posts = await fetchPosts();
  const p = posts.find(x => x.id === currentSharePostId);
  if(!p){ showToast('Publication introuvable'); return; }
  const key = 'dm:' + threadKeyFor(currentUser, friendUsername);
  const msgs = (await safeGet(key, true)) || [];
  msgs.push({
    from: currentUser, type: 'shared_post', postId: p.id, postType: p.type, postData: p.data,
    postCaption: p.caption || '', postAuthor: p.userId, text: '📎 A partagé une publication', ts: new Date().toISOString()
  });
  await saveWithRetry(key, msgs, true);
  showToast('Envoyé à @' + friendUsername + ' ✓');
}
async function shareToWhatsapp(postId){
  const posts = await fetchPosts();
  const p = posts.find(x => x.id === postId);
  if(!p){ showToast('Publication introuvable'); return; }
  const url = window.location.href.split('#')[0] + '#post-' + postId;
  const messageParts = [];
  if(p.caption) messageParts.push(p.caption.slice(0,150));
  messageParts.push(url);
  const message = encodeURIComponent(messageParts.join(' — '));
  window.open('https://wa.me/?text=' + message, '_blank');
}
async function sharePost(postId){
  const posts = await fetchPosts();
  const p = posts.find(x => x.id === postId);
  if(!p){ showToast('Publication introuvable'); return; }
  const filename = 'suktum-' + postId + (p.type === 'video' ? '.mp4' : '.jpg');
  try{
    const file = dataURLtoFile(p.data, filename);
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ title: 'Suktum', text: p.caption || '', files: [file] });
      await recordShareSignal(postId);
      return;
    }
  }catch(e){ /* repli ci-dessous */ }
  const url = window.location.href + '#post-' + postId;
  if(navigator.share){ navigator.share({title: 'Suktum', text: p.caption || '', url}); await recordShareSignal(postId); return; }
  try{
    await navigator.clipboard.writeText(url);
    showToast('Lien copié — collez-le où vous voulez le partager ⛵');
    await recordShareSignal(postId);
  }catch(e){
    showToast('Impossible de copier le lien automatiquement — voici le lien : ' + url);
  }
}
async function recordShareSignal(postId){
  if(!currentUser) return;
  await saveWithRetry('shareSignal:' + currentUser + '__' + postId, { postId, username: currentUser, sharedAt: new Date().toISOString() }, true).catch(() => {});
}

