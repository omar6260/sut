/* ---------- MESSAGES ---------- */
async function renderMessagesList(){
  const el = document.getElementById('messages-list');
  const keys = await safeList('dm:', true);
  const threads = {};
  for(const k of keys){
    const msgs = await safeGet(k, true);
    if(!msgs || msgs.length === 0) continue;
    const threadKey = k.replace('dm:', '');
    const parties = threadKey.split('__');
    if(!parties.includes(currentUser)) continue;
    const other = parties.find(p => p !== currentUser) || parties[0];
    threads[other] = msgs[msgs.length - 1];
  }
  const names = Object.keys(threads);
  if(names.length === 0){ el.innerHTML = '<div class="empty">Aucune conversation pour l’instant.</div>'; return; }
  const pinned = new Set((await safeGet('pinnedcontacts:' + currentUser, true)) || []);
  const sortedNames = [...names].sort((a, b) => {
    const aPinned = pinned.has(a) ? 1 : 0;
    const bPinned = pinned.has(b) ? 1 : 0;
    if(aPinned !== bPinned) return bPinned - aPinned;
    return new Date(threads[b].createdAt||0) - new Date(threads[a].createdAt||0);
  });
  el.innerHTML = sortedNames.map(n =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<div style="flex:1; cursor:pointer;" onclick="openThread(\''+n+'\')">' +
    '<strong style="font-family:\'Baloo 2\'; font-size:14px;">'+(pinned.has(n)?'⭐ ':'')+'@'+escapeHtml(n)+'</strong>' +
    '<p style="font-size:12.5px; color:rgba(245,239,227,0.6); margin:4px 0 0;">'+escapeHtml((threads[n].text||'').slice(0,50))+'</p>' +
    '</div>' +
    '<button onclick="event.stopPropagation(); toggleContactPin(\''+n+'\')" style="background:none; border:none; font-size:18px; color:'+(pinned.has(n)?'var(--gold)':'rgba(245,239,227,0.3)')+';">'+(pinned.has(n)?'⭐':'☆')+'</button>' +
    '</div>'
  ).join('');
}
async function toggleContactPin(username){
  let pinned = (await safeGet('pinnedcontacts:' + currentUser, true)) || [];
  if(pinned.includes(username)) pinned = pinned.filter(p => p !== username);
  else pinned.push(username);
  await saveWithRetry('pinnedcontacts:' + currentUser, pinned, true);
  await renderMessagesList();
}
function threadKeyFor(a, b){ return [a, b].sort().join('__'); }
async function renderSharedFeedBanner(partnerUsername){
  const el = document.getElementById('shared-feed-banner');
  if(!el || !currentUser || partnerUsername === currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const partner = await safeGet('user:' + partnerUsername, true);
  const isMutual = me && partner && (me.following || []).includes(partnerUsername) && (me.followers || []).includes(partnerUsername);
  if(!isMutual){ el.style.display = 'none'; return; }
  const key = threadKeyFor(currentUser, partnerUsername);
  const record = await safeGet('sharedfeed:' + key, true);
  el.style.display = 'block';
  if(!record){
    el.innerHTML = '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="inviteToSharedFeed(\''+escapeHtml(partnerUsername)+'\')">🤝 Créer un fil partagé</button>';
  } else if(record.status === 'pending' && record.invitedBy !== currentUser){
    el.innerHTML = '<button class="btn btn-primary btn-sm" style="width:100%;" onclick="acceptSharedFeedInvite(\''+escapeHtml(partnerUsername)+'\')">🤝 Accepter le fil partagé de @'+escapeHtml(partnerUsername)+'</button>';
  } else if(record.status === 'pending'){
    el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0;">🤝 Invitation envoyée — en attente de réponse.</p>';
  } else if(record.status === 'active'){
    el.innerHTML = '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="openSharedFeed(\''+escapeHtml(partnerUsername)+'\')">🤝 Voir le fil partagé du jour</button>';
  }
}
async function inviteToSharedFeed(partnerUsername){
  const key = threadKeyFor(currentUser, partnerUsername);
  await saveWithRetry('sharedfeed:' + key, { userA: currentUser, userB: partnerUsername, status: 'pending', invitedBy: currentUser, createdAt: new Date().toISOString() }, true);
  await createNotification(partnerUsername, 'shared_feed_invite', currentUser, null, null);
  showToast('Invitation envoyée ✓');
  await renderSharedFeedBanner(partnerUsername);
}
async function acceptSharedFeedInvite(partnerUsername){
  const key = threadKeyFor(currentUser, partnerUsername);
  const record = await safeGet('sharedfeed:' + key, true);
  if(!record || record.status !== 'pending') return;
  record.status = 'active';
  record.acceptedAt = new Date().toISOString();
  await saveWithRetry('sharedfeed:' + key, record, true);
  showToast('Fil partagé activé ✓');
  await renderSharedFeedBanner(partnerUsername);
}
async function buildCombinedTopicWeights(usernameA, usernameB){
  const posts = await fetchPosts();
  const weights = {};
  posts.forEach(p => {
    const likedByEither = (p.likes || []).includes(usernameA) || (p.likes || []).includes(usernameB) ||
      (p.favoritedBy || []).includes(usernameA) || (p.favoritedBy || []).includes(usernameB);
    if(!likedByEither) return;
    extractHashtags(p.caption).forEach(tag => { weights[tag] = (weights[tag] || 0) + 1; });
  });
  return weights;
}
async function openSharedFeed(partnerUsername){
  currentSharedFeedPartner = partnerUsername;
  go('shared-feed');
  document.getElementById('shared-feed-title').textContent = '🤝 Fil partagé avec @' + partnerUsername;
  const key = threadKeyFor(currentUser, partnerUsername);
  const record = await safeGet('sharedfeed:' + key, true);
  if(!record || record.status !== 'active') return;
  const todayKey = new Date().toISOString().slice(0,10);
  if(record.lastGeneratedDate !== todayKey){
    const weights = await buildCombinedTopicWeights(record.userA, record.userB);
    const allPosts = await fetchPosts();
    const scored = allPosts.map(p => ({
      post: p,
      score: extractHashtags(p.caption).reduce((s, t) => s + (weights[t] || 0), 0)
    })).filter(s => s.score > 0);
    scored.sort((a,b) => b.score - a.score);
    record.todaysPostIds = scored.slice(0, 15).map(s => s.post.id);
    record.lastGeneratedDate = todayKey;
    await saveWithRetry('sharedfeed:' + key, record, true);
  }
  const el = document.getElementById('shared-feed-content');
  if(!record.todaysPostIds || record.todaysPostIds.length === 0){
    el.innerHTML = '<div class="empty">Pas encore assez d’intérêts communs identifiés — aimez ou mettez en favori quelques publications d’abord.</div>';
    return;
  }
  const todaysPosts = [];
  for(const pid of record.todaysPostIds){ const p = await safeGet('post:' + pid, true); if(p) todaysPosts.push(p); }
  el.innerHTML = todaysPosts.map(p => '<div class="card" style="margin-bottom:8px; cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')"><p style="margin:0; font-size:12.5px;">@'+escapeHtml(p.userId)+' — '+escapeHtml((p.caption || '(sans légende)').slice(0,50))+'</p></div>').join('');
}
async function leaveSharedFeed(){
  if(!currentSharedFeedPartner) return;
  if(!confirm('Quitter ce fil partagé ?')) return;
  const key = threadKeyFor(currentUser, currentSharedFeedPartner);
  await window.storage.delete('sharedfeed:' + key, true).catch(() => {});
  showToast('Fil partagé quitté');
  go('thread');
}
let currentSharedFeedPartner = null;
let currentThreadPartner = null;
async function openThread(username){
  currentThreadPartner = username;
  document.getElementById('thread-title').textContent = '@' + username;
  const searchInput = document.getElementById('thread-search-input');
  if(searchInput) searchInput.value = '';
  const searchCountEl = document.getElementById('thread-search-results-count');
  if(searchCountEl) searchCountEl.style.display = 'none';
  const searchClearBtn = document.getElementById('thread-search-clear-btn');
  if(searchClearBtn) searchClearBtn.style.display = 'none';
  const partner = await safeGet('user:' + username, true);
  const statusEl = document.getElementById('thread-online-status');
  if(statusEl){
    const status = partner ? formatOnlineStatus(partner.lastActiveAt) : null;
    statusEl.textContent = status ? status.label : '';
    statusEl.style.color = status && status.online ? 'var(--lagoon)' : 'rgba(245,239,227,0.5)';
  }
  await markThreadReadReceipt(username);
  go('thread');
  await renderThreadMessages();
  await renderSharedFeedBanner(username);
  await checkAiSuggestedReply();
}
async function checkAiSuggestedReply(){
  const banner = document.getElementById('thread-ai-suggestion-banner');
  if(!banner) return;
  banner.style.display = 'none';
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
  if(myProducts.length === 0) return;
  const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
  const msgs = (await safeGet(key, true)) || [];
  const lastMsg = msgs[msgs.length - 1];
  if(!lastMsg || lastMsg.from !== currentThreadPartner || lastMsg.type) return;
  const recurringKeywords = ['disponible', 'stock', 'prix', 'combien', 'livraison', 'livrer', 'quand'];
  const textLower = (lastMsg.text || '').toLowerCase();
  if(!recurringKeywords.some(kw => textLower.includes(kw))) return;
  banner.innerHTML = '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:0 0 4px;">🤖 Suggestion de réponse — à vérifier avant d’envoyer :</p><p id="ai-suggestion-text" style="font-size:12px; color:var(--gold); margin:0 0 6px;">⏳ Génération...</p>';
  banner.style.display = 'block';
  const productNames = myProducts.map(p => p.name).join(', ');
  const prompt = 'Un client demande : "' + lastMsg.text + '". Tu es un vendeur sur Suktum proposant ces produits : ' + productNames + '. Rédige une courte réponse commerciale amicale en français (2 phrases maximum), sans embellir ce que tu ne sais pas vraiment (stock, prix exacts) — reste générique si l’info précise n’est pas connue.';
  const suggestion = await callAIProvider(prompt, 150, await getGovernanceAIProvider());
  const textEl = document.getElementById('ai-suggestion-text');
  if(!textEl) return;
  if(suggestion){
    textEl.textContent = suggestion;
    banner.innerHTML += '<button class="btn btn-outline btn-sm" onclick="useAiSuggestedReply()">Utiliser cette suggestion</button>';
  } else {
    banner.style.display = 'none';
  }
}
function useAiSuggestedReply(){
  const text = document.getElementById('ai-suggestion-text').textContent;
  document.getElementById('thread-input').value = text;
  document.getElementById('thread-ai-suggestion-banner').style.display = 'none';
}
async function renderThreadMessages(){
  const el = document.getElementById('thread-messages');
  const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
  const msgs = (await safeGet(key, true)) || [];
  if(msgs.length === 0){ el.innerHTML = '<div class="empty">Dites bonjour ⛵</div>'; return; }
  let showVuOnLastMessage = false;
  const lastMsg = msgs[msgs.length - 1];
  if(lastMsg.from === currentUser){
    const me = await safeGet('user:' + currentUser, true);
    const partner = await safeGet('user:' + currentThreadPartner, true);
    if(me && me.readReceiptsEnabled && partner && partner.readReceiptsEnabled){
      const partnerLastRead = await safeGet('threadreadreceipt:' + currentThreadPartner + '__' + threadKeyFor(currentUser, currentThreadPartner), true).catch(() => null);
      if(partnerLastRead && new Date(partnerLastRead) >= new Date(lastMsg.ts)) showVuOnLastMessage = true;
    }
  }
  el.innerHTML = msgs.map((m, i) => {
    const mine = m.from === currentUser;
    const reportBtn = mine ? '' : '<button data-from="'+escapeHtml(m.from)+'" data-text="'+encodeURIComponent(m.text)+'" onclick="reportMessage(this.dataset.from, decodeURIComponent(this.dataset.text))" style="background:none; border:none; color:rgba(245,239,227,0.35); font-size:10.5px; margin-top:2px; align-self:flex-start; cursor:pointer;">⚠️ Signaler</button>';
    if(m.type === 'shared_post'){
      const media = m.postType === 'video' ? '<video src="'+m.postData+'" muted style="width:100%; height:100%; object-fit:cover; touch-action:manipulation;"></video>' : '<img src="'+m.postData+'" style="width:100%; height:100%; object-fit:cover;">';
      const bubble = '<div style="background:'+(mine?'var(--coral)':'var(--night-2)')+'; border-radius:14px; overflow:hidden; width:160px;">' +
        '<div style="width:100%; aspect-ratio:9/14; position:relative;">' + media + '</div>' +
        '<div style="padding:8px 10px;"><p style="margin:0; font-size:11px; color:'+(mine?'var(--night)':'var(--cream)')+';">📎 Publication de @'+escapeHtml(m.postAuthor)+'</p></div>' +
        '</div>';
      return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:78%;">' + bubble + reportBtn + '</div>';
    }
    if(m.type === 'photo'){
      return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:70%;">' +
        '<img src="'+m.mediaData+'" style="width:100%; border-radius:14px; display:block;">' + reportBtn + '</div>';
    }
    if(m.type === 'voice'){
      return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:78%;">' +
        '<div style="background:'+(mine?'var(--coral)':'var(--night-2)')+'; padding:8px 12px; border-radius:14px;"><audio src="'+m.mediaData+'" controls style="width:220px; height:36px;"></audio></div>' + reportBtn + '</div>';
    }
    const reactionsHtml = (m.reactions && Object.keys(m.reactions).some(e => (m.reactions[e]||[]).length > 0))
      ? '<div style="display:flex; gap:3px; margin-top:2px; align-self:'+(mine?'flex-end':'flex-start')+';">' +
        Object.keys(m.reactions).filter(e => (m.reactions[e]||[]).length > 0).map(e => '<span style="font-size:12px; background:rgba(11,46,61,0.6); border-radius:10px; padding:1px 6px;">'+e+' '+m.reactions[e].length+'</span>').join('') +
        '</div>' : '';
    return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:78%;">' +
      '<div id="dm-text-'+i+'" onmousedown="startMessageLongPress('+i+')" onmouseup="cancelMessageLongPress()" onmouseleave="cancelMessageLongPress()" ontouchstart="startMessageLongPress('+i+')" ontouchend="cancelMessageLongPress()" ontouchcancel="cancelMessageLongPress()" style="background:'+(mine?'var(--coral)':'var(--night-2)')+'; color:'+(mine?'var(--night)':'var(--cream)')+'; padding:9px 13px; border-radius:14px; font-size:13.5px;">'+escapeHtml(m.text)+'</div>' +
      (!mine ? '<span onclick="translateDirectMessage('+i+')" style="color:var(--lagoon); font-size:10.5px; margin-top:2px; align-self:flex-start; cursor:pointer;">🌐 Traduire</span>' : '') +
      reactionsHtml +
      '<div id="msg-reaction-picker-'+i+'" style="display:none; gap:8px; margin-top:4px; background:rgba(11,46,61,0.95); border-radius:14px; padding:5px 10px; align-self:'+(mine?'flex-end':'flex-start')+';">' +
      ['😂','😮','😢','🔥'].map(e => '<span style="font-size:18px; cursor:pointer;" onclick="toggleMessageReaction('+i+', \''+e+'\')">'+e+'</span>').join('') +
      '</div>' +
      (mine && i === msgs.length - 1 && showVuOnLastMessage ? '<span style="font-size:10px; color:var(--lagoon); margin-top:2px; align-self:flex-end;">✓✓ Vu</span>' : '') +
      reportBtn +
      '</div>';
  }).join('');
  el.scrollTop = el.scrollHeight;
}
let messageLongPressTimer = null;
function startMessageLongPress(index){
  messageLongPressTimer = setTimeout(() => {
    document.querySelectorAll('[id^="msg-reaction-picker-"]').forEach(el => { if(el.id !== 'msg-reaction-picker-'+index) el.style.display = 'none'; });
    const picker = document.getElementById('msg-reaction-picker-' + index);
    if(picker) picker.style.display = picker.style.display === 'flex' ? 'none' : 'flex';
  }, 500);
}
function cancelMessageLongPress(){
  if(messageLongPressTimer){ clearTimeout(messageLongPressTimer); messageLongPressTimer = null; }
}
async function toggleMessageReaction(index, emoji){
  const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
  const msgs = (await safeGet(key, true)) || [];
  const m = msgs[index];
  if(!m) return;
  if(!m.reactions) m.reactions = {};
  ['😂','😮','😢','🔥'].forEach(e => {
    if(!m.reactions[e]) m.reactions[e] = [];
    const idx = m.reactions[e].indexOf(currentUser);
    if(idx !== -1) m.reactions[e].splice(idx, 1);
  });
  if(!(m.reactions[emoji] || []).includes(currentUser)) m.reactions[emoji].push(currentUser);
  await saveWithRetry(key, msgs, true);
  await renderThreadMessages();
}
async function reportMessage(fromUser, text){
  const reason = prompt('Pourquoi signalez-vous ce message ?');
  if(reason === null || !reason.trim()) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'message', targetUser: fromUser, messageText: text,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Message signalé, merci ⚠️');
}

/* ---------- SUPPORT & LITIGES ---------- */
async function submitBugReport(){
  const description = document.getElementById('bug-report-description').value.trim();
  if(!description){ showToast('Décrivez le problème avant d’envoyer'); return; }
  if(!currentUser){ showToast('Créez un compte pour signaler un bug'); return; }
  const myRecentReports = await fetchMyBugReports();
  const oneDayAgo = Date.now() - 24*60*60*1000;
  const recentCount = myRecentReports.filter(t => new Date(t.createdAt).getTime() > oneDayAgo).length;
  if(recentCount >= 5){ showToast('Vous avez déjà envoyé 5 signalements aujourd’hui — réessayez demain'); return; }
  let screenshot = null;
  const screenshotFile = document.getElementById('bug-report-screenshot').files[0];
  if(screenshotFile){
    screenshot = await compressImageDataUrl(await readFileAsDataURL(screenshotFile), 900, 0.75);
  }
  const id = 'devtask_' + Date.now();
  await saveWithRetry('devtask:' + id, {
    id, title: '🐛 ' + description.slice(0,80), status: 'todo', assignee: null,
    reportedBy: currentUser, isBugReport: true, fullDescription: description, screenshot,
    createdBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('bug-report-description').value = '';
  document.getElementById('bug-report-screenshot').value = '';
  showToast('Signalement envoyé à l’équipe technique ✓');
}
async function fetchMyBugReports(){
  const keys = await safeList('devtask:', true);
  const reports = [];
  for(const k of keys){ const t = await safeGet(k, true).catch(() => null); if(t && t.isBugReport && t.reportedBy === currentUser) reports.push(t); }
  reports.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return reports;
}
async function renderMyBugReports(){
  const el = document.getElementById('my-bug-reports-list');
  if(!el) return;
  const reports = await fetchMyBugReports();
  const statusLabel = { todo: '⏳ En attente', inprogress: '🔧 En cours', done: '✅ Résolu' };
  el.innerHTML = reports.length === 0 ? '<div class="empty">Vous n’avez encore signalé aucun bug.</div>' :
    reports.map(t => '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(t.fullDescription || t.title)+'</p>' +
      (t.screenshot ? '<img src="'+t.screenshot+'" style="width:100%; border-radius:8px; margin-bottom:6px;">' : '') +
      '<p style="margin:0; font-size:11px; color:var(--gold);">'+statusLabel[t.status]+' · '+new Date(t.createdAt).toLocaleDateString('fr-FR')+'</p></div>').join('');
}
async function submitTicket(){
  const category = document.getElementById('ticket-category').value;
  const subject = document.getElementById('ticket-subject').value.trim();
  const message = document.getElementById('ticket-message').value.trim();
  if(!subject || !message){ showToast('Renseignez au moins le sujet et la description'); return; }
  const id = 'ticket_' + Date.now();
  const submitter = await safeGet('user:' + currentUser, true);
  const isPriority = await isHighVisibilityAccount(submitter);
  await saveWithRetry('ticket:' + id, {
    id, username: currentUser, country: currentUserCountry, category, subject, message,
    isPriority, status: 'open', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('ticket-subject').value = '';
  document.getElementById('ticket-message').value = '';
  showToast(isPriority ? 'Votre demande a été envoyée en ligne prioritaire ✓' : 'Votre demande a été envoyée au support ✓');
  await loadMyTickets();
}
async function fetchTickets(){
  const keys = await safeList('ticket:', true);
  const tickets = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) tickets.push(t); }
  tickets.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return tickets;
}
async function loadMyTickets(){
  const el = document.getElementById('my-tickets-list');
  const tickets = (await fetchTickets()).filter(t => t.username === currentUser);
  if(tickets.length === 0){ el.innerHTML = '<div class="empty">Aucune demande envoyée pour l’instant.</div>'; return; }
  el.innerHTML = tickets.map(t =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(t.subject)+'</strong></p>' +
    '<p style="margin:0; font-size:12px; color:'+(t.status==='resolved'?'var(--lagoon)':'var(--gold)')+';">'+(t.status==='resolved'?'✓ Résolu':'⏳ En attente')+'</p>' +
    '</div>'
  ).join('');
}
async function populateTicketFilters(){
  const countrySel = document.getElementById('ticket-filter-country');
  if(countrySel.options.length <= 1){
    COUNTRY_LIST.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; countrySel.appendChild(o); });
  }
  const currencySel = document.getElementById('ticket-filter-currency');
  if(currencySel.options.length <= 1){
    const currencies = [...new Set(Object.values(COUNTRY_CURRENCY))];
    currencies.forEach(cur => { const o = document.createElement('option'); o.value = cur; o.textContent = cur; currencySel.appendChild(o); });
  }
}
/* ---------- RECHERCHE GLOBALE DANS LE BACK-OFFICE ---------- */
async function renderBackofficeSearch(){
  const resultsEl = document.getElementById('backoffice-search-results');
  if(!resultsEl) return;
  const query = (document.getElementById('backoffice-search-input').value || '').toLowerCase().trim();
  if(!query || query.length < 2){ resultsEl.innerHTML = ''; return; }
  const [users, orders, allTickets, reports] = await Promise.all([fetchUsers(), fetchOrders(), fetchTickets(), fetchReports()]);
  const matchedUsers = users.filter(u => u.username.toLowerCase().includes(query)).slice(0,5);
  const matchedOrders = orders.filter(o => (o.productName||'').toLowerCase().includes(query) || (o.buyerUsername||'').toLowerCase().includes(query)).slice(0,5);
  const realTickets = allTickets.filter(t => t.subject !== undefined);
  const matchedTickets = realTickets.filter(t => t.subject.toLowerCase().includes(query) || t.username.toLowerCase().includes(query)).slice(0,5);
  const matchedReports = reports.filter(r => (r.targetUser||'').toLowerCase().includes(query)).slice(0,5);
  if(matchedUsers.length === 0 && matchedOrders.length === 0 && matchedTickets.length === 0 && matchedReports.length === 0){
    resultsEl.innerHTML = '<div class="empty">Aucun résultat.</div>';
    return;
  }
  let html = '';
  if(matchedUsers.length > 0) html += '<p class="eyebrow" style="margin:8px 0 4px;">👤 Utilisateurs</p>' + matchedUsers.map(u =>
    '<div class="card" style="cursor:pointer; margin-bottom:6px;" onclick="openUserDetail(\''+escapeHtml(u.username)+'\')"><span style="font-size:13px;">@'+escapeHtml(u.username)+'</span></div>'
  ).join('');
  if(matchedOrders.length > 0) html += '<p class="eyebrow" style="margin:8px 0 4px;">🛍️ Commandes</p>' + matchedOrders.map(o =>
    '<div class="card" style="margin-bottom:6px;"><span style="font-size:13px;">'+escapeHtml(o.productName)+' — @'+escapeHtml(o.buyerUsername)+' ('+o.total.toLocaleString('fr-FR')+' FCFA)</span></div>'
  ).join('');
  if(matchedTickets.length > 0) html += '<p class="eyebrow" style="margin:8px 0 4px;">🎫 Tickets</p>' + matchedTickets.map(t =>
    '<div class="card" style="margin-bottom:6px;"><span style="font-size:13px;">'+escapeHtml(t.subject)+' — @'+escapeHtml(t.username)+'</span></div>'
  ).join('');
  if(matchedReports.length > 0) html += '<p class="eyebrow" style="margin:8px 0 4px;">🚩 Signalements</p>' + matchedReports.map(r =>
    '<div class="card" style="cursor:pointer; margin-bottom:6px;" onclick="openUserDetail(\''+escapeHtml(r.targetUser)+'\')"><span style="font-size:13px;">@'+escapeHtml(r.targetUser)+' — '+escapeHtml(r.reason)+'</span></div>'
  ).join('');
  resultsEl.innerHTML = html;
}
/* ---------- ROSTER D'ASTREINTE ---------- */
/* ---------- TESTS A/B (infrastructure réutilisable) ---------- */
/* ---------- TÂCHES DE DÉVELOPPEMENT (kanban) ---------- */
async function createDevTask(){
  const title = document.getElementById('new-dev-task-title').value.trim();
  const assignee = document.getElementById('new-dev-task-assignee').value.trim();
  if(!title){ showToast('Écrivez un titre'); return; }
  const id = 'devtask_' + Date.now();
  await saveWithRetry('devtask:' + id, {
    id, title, assignee: assignee || null, status: 'todo', createdBy: currentAdminName || (isTechTeamMember ? currentTechTeamName : 'Propriétaire'), createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-dev-task-title').value = '';
  document.getElementById('new-dev-task-assignee').value = '';
  showToast('Tâche ajoutée ✓');
  await renderDevTasks();
}
async function moveDevTask(id, newStatus){
  const t = await safeGet('devtask:' + id, true);
  if(!t) return;
  t.status = newStatus;
  await saveWithRetry('devtask:' + id, t, true);
  if(newStatus === 'done' && t.isBugReport && t.reportedBy){
    await createNotification(t.reportedBy, 'bug_report_resolved', currentUser, null, t.fullDescription ? t.fullDescription.slice(0,80) : t.title);
  }
  await renderDevTasks();
}
async function deleteDevTask(id){
  const t = await safeGet('devtask:' + id, true);
  if(t && t.isBugReport){
    if(!confirm('Supprimer ce signalement de bug sans le résoudre ?')) return;
  }
  await window.storage.delete('devtask:' + id, true).catch(() => {});
  if(t && t.isBugReport && t.reportedBy){
    await createNotification(t.reportedBy, 'bug_report_closed', currentUser, null, t.fullDescription ? t.fullDescription.slice(0,80) : t.title);
  }
  showToast('Tâche supprimée');
  await renderDevTasks();
}
async function renderDevTasks(){
  const keys = await safeList('devtask:', true);
  const tasks = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) tasks.push(t); }
  tasks.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const columns = { todo: 'dev-tasks-todo', inprogress: 'dev-tasks-inprogress', done: 'dev-tasks-done' };
  const nextStatus = { todo: 'inprogress', inprogress: 'done', done: null };
  const nextLabel = { todo: '▶ Démarrer', inprogress: '✓ Terminer' };
  Object.entries(columns).forEach(([status, elId]) => {
    const el = document.getElementById(elId);
    if(!el) return;
    const columnTasks = tasks.filter(t => t.status === status);
    el.innerHTML = columnTasks.length === 0 ? '<p style="font-size:11px; color:rgba(245,239,227,0.3);">Vide</p>' : columnTasks.map(t =>
      '<div class="card" style="margin-bottom:8px; padding:10px;">' +
      '<p style="margin:0 0 4px; font-size:12px; font-weight:600;">'+escapeHtml(t.title)+'</p>' +
      (t.isBugReport ? '<p style="margin:0 0 6px; font-size:10.5px; color:var(--coral);">🐛 Signalé par @'+escapeHtml(t.reportedBy)+'</p>' : '') +
      (t.screenshot ? '<img src="'+t.screenshot+'" style="width:100%; border-radius:6px; margin-bottom:6px;">' : '') +
      (t.assignee ? '<p style="margin:0 0 6px; font-size:10.5px; color:var(--gold);">👤 '+escapeHtml(t.assignee)+'</p>' : '') +
      (nextStatus[status] ? '<button class="btn btn-outline btn-sm" style="width:100%; font-size:10.5px; padding:4px;" onclick="moveDevTask(\''+t.id+'\', \''+nextStatus[status]+'\')">'+nextLabel[status]+'</button>' : '') +
      '<span onclick="deleteDevTask(\''+t.id+'\')" style="color:var(--coral); cursor:pointer; font-size:10px; display:inline-block; margin-top:4px;">🗑️</span>' +
      '</div>'
    ).join('');
  });
}
function simpleStringHash(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
async function getABTestVariant(testName){
  if(!currentUser) return 'A';
  const variant = simpleStringHash(testName + '__' + currentUser) % 2 === 0 ? 'A' : 'B';
  const exposureKey = 'abexposure:' + testName + '__' + currentUser;
  const alreadyExposed = await safeGet(exposureKey, true).catch(() => null);
  if(!alreadyExposed){
    await saveWithRetry(exposureKey, { testName, username: currentUser, variant, createdAt: new Date().toISOString() }, true);
  }
  return variant;
}
async function recordABConversion(testName){
  if(!currentUser) return;
  const exposureKey = 'abexposure:' + testName + '__' + currentUser;
  const exposure = await safeGet(exposureKey, true).catch(() => null);
  if(!exposure) return;
  await saveWithRetry('abconversion:' + testName + '__' + currentUser, { testName, username: currentUser, variant: exposure.variant, createdAt: new Date().toISOString() }, true);
}
async function createABTest(){
  const name = document.getElementById('new-ab-test-name').value.trim();
  const variantA = document.getElementById('new-ab-variant-a').value.trim();
  const variantB = document.getElementById('new-ab-variant-b').value.trim();
  if(!name || !variantA || !variantB){ showToast('Renseignez le nom et les deux variantes'); return; }
  await saveWithRetry('abtestdef:' + name, { name, variantA, variantB, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-ab-test-name').value = '';
  document.getElementById('new-ab-variant-a').value = '';
  document.getElementById('new-ab-variant-b').value = '';
  showToast('Test créé ✓');
  await renderABTestsList();
}
async function deleteABTest(name){
  await window.storage.delete('abtestdef:' + name, true).catch(() => {});
  showToast('Test supprimé');
  await renderABTestsList();
}
async function renderABTestsList(){
  const el = document.getElementById('ab-tests-list');
  if(!el) return;
  const defKeys = await safeList('abtestdef:', true);
  const tests = [];
  for(const k of defKeys){ const t = await safeGet(k, true); if(t) tests.push(t); }
  if(tests.length === 0){ el.innerHTML = '<div class="empty">Aucun test créé pour l’instant.</div>'; return; }
  const exposureKeys = await safeList('abexposure:', true);
  const conversionKeys = await safeList('abconversion:', true);
  const allExposures = [];
  for(const k of exposureKeys){ const e = await safeGet(k, true); if(e) allExposures.push(e); }
  const allConversions = [];
  for(const k of conversionKeys){ const c = await safeGet(k, true); if(c) allConversions.push(c); }
  el.innerHTML = tests.map(t => {
    const exposuresA = allExposures.filter(e => e.testName === t.name && e.variant === 'A').length;
    const exposuresB = allExposures.filter(e => e.testName === t.name && e.variant === 'B').length;
    const conversionsA = allConversions.filter(c => c.testName === t.name && c.variant === 'A').length;
    const conversionsB = allConversions.filter(c => c.testName === t.name && c.variant === 'B').length;
    const rateA = exposuresA > 0 ? (conversionsA / exposuresA * 100).toFixed(1) : '—';
    const rateB = exposuresB > 0 ? (conversionsB / exposuresB * 100).toFixed(1) : '—';
    return '<div class="card" style="margin-bottom:10px;">' +
      '<p style="margin:0 0 8px; font-size:13px; font-weight:600;">'+escapeHtml(t.name)+'</p>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">' +
      '<div><strong>A — '+escapeHtml(t.variantA)+'</strong><p style="margin:2px 0 0; color:var(--gold);">'+exposuresA+' vue(s) · '+conversionsA+' conversion(s) · '+rateA+(rateA !== '—' ? '%' : '')+'</p></div>' +
      '<div><strong>B — '+escapeHtml(t.variantB)+'</strong><p style="margin:2px 0 0; color:var(--gold);">'+exposuresB+' vue(s) · '+conversionsB+' conversion(s) · '+rateB+(rateB !== '—' ? '%' : '')+'</p></div>' +
      '</div>' +
      '<span onclick="deleteABTest(\''+t.name+'\')" class="admin-super-only" style="color:var(--coral); cursor:pointer; font-size:11px; display:inline-block; margin-top:8px;">🗑️ Supprimer ce test</span>' +
      '</div>';
  }).join('');
}
/* ---------- ÉQUIPE TECHNIQUE (accès cloisonné, lecture seule) ---------- */
async function createMyNote(){
  const text = document.getElementById('new-note-text').value.trim();
  if(!text){ showToast('Écrivez une note d’abord'); return; }
  const id = 'note:' + currentUser + '__' + Date.now();
  await saveWithRetry(id, { text, color: null, pinned: false, trashed: false, createdAt: new Date().toISOString() }, false);
  document.getElementById('new-note-text').value = '';
  showToast('Note ajoutée ✓');
  await renderMyNotes();
}
async function renderMissedLives(){
  const el = document.getElementById('missed-lives-list');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const myFollowing = new Set((me && me.following) || []);
  if(myFollowing.size === 0){ el.innerHTML = '<div class="empty">Vous ne suivez personne pour l’instant.</div>'; return; }
  const keys = await safeList('livehistory:', true);
  const histories = [];
  for(const k of keys){ const h = await safeGet(k, true).catch(() => null); if(h && myFollowing.has(h.username)) histories.push(h); }
  histories.sort((a,b) => new Date(b.endedAt) - new Date(a.endedAt));
  if(histories.length === 0){ el.innerHTML = '<div class="empty">Aucun live manqué de vos abonnements pour l’instant.</div>'; return; }
  el.innerHTML = histories.map(h => {
    const durationMin = Math.max(1, Math.round((new Date(h.endedAt) - new Date(h.startedAt)) / 60000));
    return '<div class="card" style="margin-bottom:10px;">' +
      '<p style="margin:0 0 4px; font-size:13px;">'+(h.isAudioOnly ? '🎙️' : '🔴')+' <strong style="cursor:pointer; color:var(--lagoon);" onclick="openUserProfile(\''+escapeHtml(h.username)+'\')">@'+escapeHtml(h.username)+'</strong></p>' +
      (h.title ? '<p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(h.title)+'</p>' : '') +
      '<p style="margin:0 0 6px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+new Date(h.endedAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+' · '+durationMin+' min · '+h.viewerCount+' spectateur(s)</p>' +
      (h.hasTranscript
        ? '<button class="btn btn-outline btn-sm" onclick="openLiveChatTranscriptDetail(\''+h.id+'\')">📝 Voir le compte-rendu du chat</button>'
        : '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.4);">Aucun compte-rendu disponible pour ce live.</p>') +
      '</div>';
  }).join('');
}
async function renderMySanctions(){
  const el = document.getElementById('my-sanctions-list');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const warnings = ((me && me.warnings) || []).map((w, i) => ({ type: 'warning', index: i, ...w }));
  const suspensions = ((me && me.suspensionHistory) || []).filter(s => s.action === 'suspended').map((s, i) => ({ type: 'suspension', index: i, ...s }));
  const all = [...warnings, ...suspensions].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(all.length === 0){ el.innerHTML = '<div class="empty">Aucune sanction sur votre compte.</div>'; return; }
  const appealKeys = await safeList('sanctionappeal:' + currentUser + '__', true);
  const appeals = [];
  for(const k of appealKeys){ const a = await safeGet(k, true).catch(() => null); if(a) appeals.push(a); }
  el.innerHTML = all.map(s => {
    const sanctionRef = s.type + '_' + s.index;
    const existingAppeal = appeals.find(a => a.sanctionRef === sanctionRef);
    return '<div class="card" style="margin-bottom:10px; '+(s.type === 'suspension' ? 'border-color:var(--coral);' : 'border-color:var(--gold);')+'">' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+(s.type === 'suspension' ? '⏸ Suspension' : '⚠️ Avertissement')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(s.reason || 'Non précisé')+'</p>' +
      (s.durationDays ? '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">Durée : '+s.durationDays+' jour(s)</p>' : '') +
      '<p style="margin:0 0 8px; font-size:11px; color:rgba(245,239,227,0.4);">'+new Date(s.createdAt).toLocaleDateString('fr-FR')+'</p>' +
      (existingAppeal
        ? '<p style="margin:0; font-size:12px; color:'+(existingAppeal.status === 'approved' ? 'var(--lagoon)' : existingAppeal.status === 'rejected' ? 'var(--coral)' : 'var(--gold)')+';">'+(existingAppeal.status === 'pending' ? '⏳ Recours en cours d’examen' : existingAppeal.status === 'approved' ? '✓ Recours accepté' : '✕ Recours rejeté')+'</p>'
        : '<button class="btn btn-outline btn-sm" onclick="submitSanctionAppeal(\''+sanctionRef+'\', \''+s.type+'\')">Faire appel</button>') +
      '</div>';
  }).join('');
}
async function submitSanctionAppeal(sanctionRef, sanctionType){
  const reason = prompt('Expliquez pourquoi vous estimez cette sanction injustifiée (visible par la modération) :');
  if(reason === null || !reason.trim()) return;
  const id = 'appeal_' + Date.now();
  await saveWithRetry('sanctionappeal:' + currentUser + '__' + id, {
    id, username: currentUser, sanctionRef, sanctionType, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Recours envoyé — en attente d’examen ✓');
  await renderMySanctions();
}
async function renderMyNotes(){
  const el = document.getElementById('my-notes-list');
  if(!el) return;
  const keys = await safeList('note:' + currentUser + '__', false);
  const notes = [];
  for(const k of keys){ const n = await safeGet(k, false).catch(() => null); if(n && !n.trashed) notes.push({...n, id: k}); }
  notes.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
  if(notes.length === 0){ el.innerHTML = '<div class="empty">Aucune note pour l’instant.</div>'; return; }
  const colorMap = { coral: 'rgba(232,85,47,0.15)', gold: 'rgba(242,183,5,0.15)', lagoon: 'rgba(47,184,166,0.15)' };
  el.innerHTML = notes.map(n =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:10px; background:'+(colorMap[n.color] || 'var(--night-2)')+';">' +
    (n.pinned ? '<span style="font-size:12px; margin-right:4px;">📌</span>' : '') +
    '<span onclick="openNoteKebabMenu(\''+n.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<p style="margin:0; font-size:13.5px; white-space:pre-line;">'+escapeHtml(n.text)+'</p></div>'
  ).join('');
}
async function openNoteKebabMenu(noteId){
  const n = await safeGet(noteId, false);
  if(!n) return;
  const items = [];
  items.push({ icon: '📤', label: 'Partager', action: 'closeGenericKebabMenu(); shareMyNote(\''+noteId+'\')' });
  items.push({ icon: '📌', label: n.pinned ? 'Désépingler' : 'Épingler en haut', action: 'closeGenericKebabMenu(); toggleNotePin(\''+noteId+'\')' });
  items.push({ icon: '🎨', label: 'Changer la couleur', action: 'closeGenericKebabMenu(); cycleNoteColor(\''+noteId+'\')' });
  items.push({ icon: '🗑️', label: 'Déplacer vers la corbeille', action: 'closeGenericKebabMenu(); trashMyNote(\''+noteId+'\')' });
  openGenericKebabMenu(items);
}
async function shareMyNote(noteId){
  const n = await safeGet(noteId, false);
  if(!n) return;
  if(navigator.share){ await navigator.share({ title: 'Ma note Suktum', text: n.text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(n.text); showToast('Note copiée ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function toggleNotePin(noteId){
  const n = await safeGet(noteId, false);
  if(!n) return;
  n.pinned = !n.pinned;
  await saveWithRetry(noteId, n, false);
  await renderMyNotes();
}
async function cycleNoteColor(noteId){
  const n = await safeGet(noteId, false);
  if(!n) return;
  const cycle = [null, 'coral', 'gold', 'lagoon'];
  const currentIndex = cycle.indexOf(n.color);
  n.color = cycle[(currentIndex + 1) % cycle.length];
  await saveWithRetry(noteId, n, false);
  await renderMyNotes();
}
async function trashMyNote(noteId){
  const n = await safeGet(noteId, false);
  if(!n) return;
  n.trashed = true;
  await saveWithRetry(noteId, n, false);
  showToast('Note déplacée vers la corbeille');
  await renderMyNotes();
}
async function createTechTeamMember(){
  const name = document.getElementById('new-techteam-name').value.trim();
  const pin = document.getElementById('new-techteam-pin').value;
  if(!name || !pin){ showToast('Renseignez un nom et un mot de passe'); return; }
  const members = (await safeGet('settings:techteammembers', true)) || [];
  const mustChangePassword = document.getElementById('techteam-must-change').checked;
  members.push({ name, pinHash: await sha256Hex(pin), mustChangePassword });
  await saveWithRetry('settings:techteammembers', members, true);
  document.getElementById('new-techteam-name').value = '';
  document.getElementById('new-techteam-pin').value = '';
  document.getElementById('techteam-must-change').checked = false;
  showToast('Accès créé ✓');
  await logAdminAction('Accès équipe technique créé', name);
  await renderTechTeamMembersList();
}
async function deleteTechTeamMember(name){
  let members = (await safeGet('settings:techteammembers', true)) || [];
  members = members.filter(m => m.name !== name);
  await saveWithRetry('settings:techteammembers', members, true);
  showToast('Accès supprimé');
  await logAdminAction('Accès équipe technique supprimé', name);
  await renderTechTeamMembersList();
}
async function renderTechTeamMembersList(){
  const el = document.getElementById('techteam-members-list');
  if(!el) return;
  const members = (await safeGet('settings:techteammembers', true)) || [];
  el.innerHTML = members.length === 0 ? '<div class="empty">Aucun accès équipe technique créé pour l’instant.</div>' : members.map(m =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;"><span style="flex:1; font-size:13px;">'+escapeHtml(m.name)+(m.active === false ? ' <span style="color:var(--coral); font-size:11px;">⏸ Suspendu</span>' : '')+'</span>' +
    '<span onclick="toggleAdminAccountActive(\'settings:techteammembers\', \''+escapeHtml(m.name)+'\', \'name\', \''+escapeHtml(m.name)+'\')" style="color:var(--gold); cursor:pointer; padding:4px;">'+(m.active === false ? '▶️' : '⏸')+'</span>' +
    '<span onclick="changeAdminAccountPassword(\'settings:techteammembers\', \''+escapeHtml(m.name)+'\', \'name\', \''+escapeHtml(m.name)+'\')" style="color:var(--gold); cursor:pointer; padding:4px;">🔑</span>' +
    '<span onclick="deleteTechTeamMember(\''+escapeHtml(m.name)+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>'
  ).join('');
}
function goBackFromTeamScreen(){
  go(isTechTeamMember ? 'techteam-home' : 'admin');
}
function logOutTechTeam(){
  isTechTeamMember = false;
  currentTechTeamName = null;
  document.body.classList.remove('techteam-mode');
  showToast('Déconnecté(e)');
  go('feed');
}
async function loadOnCallMemberOptions(){
  const select = document.getElementById('oncall-member-select');
  if(!select) return;
  const members = await fetchAllTeamMemberNames();
  select.innerHTML = members.map(m => '<option value="'+escapeHtml(m)+'">'+escapeHtml(m)+'</option>').join('');
}
async function assignOnCallWeek(){
  const dateInput = document.getElementById('oncall-date-input').value;
  const member = document.getElementById('oncall-member-select').value;
  if(!dateInput || !member){ showToast('Choisissez une date et un membre'); return; }
  const weekKey = getISOWeekKey(new Date(dateInput + 'T12:00:00'));
  await saveWithRetry('oncall:' + weekKey, { weekKey, member, assignedBy: currentAdminName, createdAt: new Date().toISOString() }, true);
  showToast('Astreinte assignée pour la semaine ' + weekKey + ' ✓');
  await logAdminAction('Astreinte assignée', member + ' — semaine ' + weekKey);
  await renderOnCallRoster();
}
async function renderOnCallRoster(){
  await loadOnCallMemberOptions();
  const currentWeekKey = getISOWeekKey(new Date());
  const currentEl = document.getElementById('oncall-current-week');
  if(currentEl){
    const currentAssignment = await safeGet('oncall:' + currentWeekKey, true).catch(() => null);
    currentEl.innerHTML = '<div class="card" style="border-color:var(--gold); text-align:center;">' +
      '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase;">Cette semaine ('+currentWeekKey+')</p>' +
      '<p style="margin:0; font-size:16px; font-weight:700;">'+(currentAssignment ? '📞 '+escapeHtml(currentAssignment.member) : 'Personne d’assigné pour l’instant')+'</p>' +
      '</div>';
  }
  const listEl = document.getElementById('oncall-schedule-list');
  if(listEl){
    const keys = await safeList('oncall:', true);
    const assignments = [];
    for(const k of keys){ const a = await safeGet(k, true); if(a) assignments.push(a); }
    assignments.sort((a,b) => a.weekKey.localeCompare(b.weekKey));
    listEl.innerHTML = assignments.length === 0 ? '<div class="empty">Aucune semaine assignée pour l’instant.</div>' : assignments.map(a =>
      '<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;'+(a.weekKey === currentWeekKey ? ' border-color:var(--gold);' : '')+'">' +
      '<span style="font-size:13px;">Semaine '+a.weekKey+'</span>' +
      '<span style="font-size:13px; color:var(--gold); font-weight:600;">'+escapeHtml(a.member)+'</span>' +
      '</div>'
    ).join('');
  }
}
async function fetchAllTeamMemberNames(){
  const [regionalAdmins, moderators, payoutSpecialists, customRoles] = await Promise.all([
    safeGet('settings:regionaladmins', true), safeGet('settings:moderators', true),
    safeGet('settings:payoutspecialists', true), safeGet('settings:customroles', true)
  ]);
  const names = new Set(['Propriétaire']);
  (regionalAdmins || []).forEach(a => names.add(a.name));
  (moderators || []).forEach(m => names.add(m.name));
  (payoutSpecialists || []).forEach(s => names.add(s.name));
  (customRoles || []).forEach(r => names.add(r.name));
  return [...names];
}
/* ---------- BIBLIOTHÈQUE DE RÉPONSES STANDARD ---------- */
async function fetchSupportMacros(){
  return (await safeGet('settings:supportMacros', true)) || [];
}
async function addSupportMacro(){
  const title = document.getElementById('new-macro-title').value.trim();
  const text = document.getElementById('new-macro-text').value.trim();
  if(!title || !text){ showToast('Renseignez un titre et un texte'); return; }
  const macros = await fetchSupportMacros();
  macros.push({ id: 'macro_' + Date.now(), title, text });
  await saveWithRetry('settings:supportMacros', macros, true);
  document.getElementById('new-macro-title').value = '';
  document.getElementById('new-macro-text').value = '';
  showToast('Réponse standard ajoutée ✓');
  await renderSupportMacrosAdmin();
}
async function deleteSupportMacro(macroId){
  let macros = await fetchSupportMacros();
  macros = macros.filter(m => m.id !== macroId);
  await saveWithRetry('settings:supportMacros', macros, true);
  showToast('Réponse standard supprimée');
  await renderSupportMacrosAdmin();
}
async function renderSupportMacrosAdmin(){
  const el = document.getElementById('support-macros-admin-list');
  if(!el) return;
  const macros = await fetchSupportMacros();
  el.innerHTML = macros.length === 0 ? '<div class="empty">Aucune réponse standard créée pour l’instant.</div>' : macros.map(m =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(m.title)+'</p>' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(m.text)+'</p>' +
    '<span onclick="deleteSupportMacro(\''+m.id+'\')" style="color:var(--coral); cursor:pointer; font-size:11px;">🗑️ Supprimer</span></div>'
  ).join('');
}
async function applySupportMacro(ticketId){
  const picker = document.getElementById('ticket-macro-' + ticketId);
  if(!picker.value) return;
  const macros = await fetchSupportMacros();
  const macro = macros.find(m => m.id === picker.value);
  if(macro) document.getElementById('ticket-reply-' + ticketId).value = macro.text;
}
async function sendTicketReply(ticketId){
  const text = document.getElementById('ticket-reply-' + ticketId).value.trim();
  if(!text){ showToast('Écrivez une réponse avant d’envoyer'); return; }
  const t = await safeGet('ticket:' + ticketId, true);
  if(!t) return;
  t.response = text;
  t.respondedBy = currentAdminName;
  t.respondedAt = new Date().toISOString();
  await saveWithRetry('ticket:' + ticketId, t, true);
  await createNotification(t.username, 'support_ticket_replied', 'Suktum', ticketId, text.slice(0,80));
  showToast('Réponse envoyée ✓');
  await loadTicketsList();
}
async function assignTicketTo(ticketId, memberName){
  if(!memberName) return;
  const t = await safeGet('ticket:' + ticketId, true);
  if(!t) return;
  t.assignedTo = memberName;
  await saveWithRetry('ticket:' + ticketId, t, true);
  showToast('Ticket assigné à ' + memberName + ' ✓');
  await logAdminAction('Ticket assigné', memberName + ' — ' + t.subject);
  await loadTicketsList();
}
async function loadTicketsList(){
  const el = document.getElementById('admin-tickets-list');
  if(!el) return;
  await renderSupportSLA();
  const teamMembers = await fetchAllTeamMemberNames();
  const macros = await fetchSupportMacros();
  const countryFilter = document.getElementById('ticket-filter-country').value;
  const currencyFilter = document.getElementById('ticket-filter-currency').value;
  let tickets = await fetchTickets();
  if(countryFilter) tickets = tickets.filter(t => t.country === countryFilter);
  if(currencyFilter) tickets = tickets.filter(t => COUNTRY_CURRENCY[t.country] === currencyFilter);
  if(tickets.length === 0){ el.innerHTML = '<div class="empty">Aucune réclamation pour ces filtres.</div>'; return; }
  const catLabel = {acheteur: '🛒 Acheteur', vendeur: '🏪 Vendeur', autre: 'Autre'};
  el.innerHTML = tickets.map(t =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(t.subject)+'</strong> — '+(catLabel[t.category]||t.category)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">@'+escapeHtml(t.username)+' · '+escapeHtml(t.country||'—')+' ('+ (COUNTRY_CURRENCY[t.country] || '—') +')</p>' +
    '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.75);">'+escapeHtml(t.message)+'</p>' +
    (t.assignedTo ? '<p style="margin:0 0 8px; font-size:11.5px; color:var(--gold);">👤 Assigné à '+escapeHtml(t.assignedTo)+'</p>' : '') +
    (t.response ? '<p style="margin:0 0 8px; font-size:12px; color:var(--lagoon);">💬 Votre réponse : « '+escapeHtml(t.response)+' »</p>' : '') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">' +
    '<select onchange="assignTicketTo(\''+t.id+'\', this.value)" style="margin:0; width:auto; flex:1;"><option value="">Assigner à...</option>' +
    teamMembers.map(m => '<option value="'+escapeHtml(m)+'"'+(t.assignedTo === m ? ' selected' : '')+'>'+escapeHtml(m)+'</option>').join('') +
    '</select>' +
    (t.status === 'resolved'
      ? '<span style="font-size:12px; color:var(--lagoon);">✓ Résolu</span>'
      : '<button class="btn btn-outline btn-sm" onclick="resolveTicket(\''+t.id+'\')">✓ Marquer comme résolu</button>') +
    '</div>' +
    (macros.length > 0 ? '<select id="ticket-macro-'+t.id+'" onchange="applySupportMacro(\''+t.id+'\')" style="margin:0 0 6px;"><option value="">— Insérer une réponse standard —</option>' + macros.map(m => '<option value="'+m.id+'">'+escapeHtml(m.title)+'</option>').join('') + '</select>' : '') +
    '<textarea id="ticket-reply-'+t.id+'" placeholder="Votre réponse..." style="min-height:60px;">'+escapeHtml(t.response||'')+'</textarea>' +
    '<button class="btn btn-primary btn-sm" style="width:100%; margin-top:6px;" onclick="sendTicketReply(\''+t.id+'\')">✉️ Envoyer la réponse</button>' +
    '</div>'
  ).join('');
}
/* ---------- SUIVI DU TEMPS DE RÉPONSE AU SUPPORT (SLA) ---------- */
async function renderSupportSLA(){
  const el = document.getElementById('support-sla-display');
  if(!el) return;
  const allTickets = await fetchTickets();
  const realTickets = allTickets.filter(t => t.subject !== undefined);
  const scopedTickets = adminScope === 'all' ? realTickets : realTickets.filter(t => t.country === adminScope);
  const resolvedWithTiming = scopedTickets.filter(t => t.resolvedAt);
  if(resolvedWithTiming.length === 0){
    el.innerHTML = '<div class="card"><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">⏱️ Pas encore assez de tickets résolus pour calculer un délai moyen de réponse.</p></div>';
    return;
  }
  const avgHours = resolvedWithTiming.reduce((sum,t) => sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (60*60*1000), 0) / resolvedWithTiming.length;
  el.innerHTML = '<div class="card"><p style="margin:0; font-size:13px; color:var(--gold);">⏱️ Délai moyen de réponse : '+avgHours.toFixed(1)+' heure(s) — basé sur '+resolvedWithTiming.length+' ticket(s) réellement résolu(s).</p></div>';
}
/* ---------- SONDAGE DE SATISFACTION RÉEL ---------- */
let currentSurveyTarget = null;
let currentSurveyStars = 0;
async function openSatisfactionSurvey(targetId, surveyType){
  currentSurveyTarget = { targetId, surveyType };
  currentSurveyStars = 0;
  go('satisfaction-survey');
  document.getElementById('satisfaction-survey-question').textContent = surveyType === 'order'
    ? 'Comment s’est passée votre expérience avec cette commande ?'
    : 'Êtes-vous satisfait(e) de la façon dont votre demande a été traitée ?';
  document.getElementById('satisfaction-survey-comment').value = '';
  renderSurveyStars();
}
function renderSurveyStars(){
  const el = document.getElementById('satisfaction-survey-stars');
  el.innerHTML = [1,2,3,4,5].map(n =>
    '<span onclick="setSurveyStars('+n+')" style="cursor:pointer; color:'+(n <= currentSurveyStars ? 'var(--gold)' : 'rgba(245,239,227,0.2)')+';">★</span>'
  ).join('');
}
function setSurveyStars(n){
  currentSurveyStars = n;
  renderSurveyStars();
}
async function submitSatisfactionSurvey(){
  if(currentSurveyStars === 0){ showToast('Choisissez une note avant d’envoyer'); return; }
  if(!currentSurveyTarget) return;
  const comment = document.getElementById('satisfaction-survey-comment').value.trim();
  const id = (currentSurveyTarget.surveyType) + '_' + currentSurveyTarget.targetId + '__' + currentUser;
  await saveWithRetry('satisfactionsurvey:' + id, {
    targetId: currentSurveyTarget.targetId, surveyType: currentSurveyTarget.surveyType,
    respondent: currentUser, stars: currentSurveyStars, comment, createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre retour ✓');
  currentSurveyTarget = null;
  go('notifications');
}
async function renderSatisfactionSummary(){
  const el = document.getElementById('satisfaction-summary-display');
  if(!el) return;
  const keys = await safeList('satisfactionsurvey:', true);
  const surveys = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) surveys.push(s); }
  if(surveys.length === 0){ el.innerHTML = '<div class="empty">Aucune réponse au sondage de satisfaction pour l’instant.</div>'; return; }
  const orderSurveys = surveys.filter(s => s.surveyType === 'order');
  const ticketSurveys = surveys.filter(s => s.surveyType === 'ticket');
  const avg = arr => arr.length ? (arr.reduce((s,x) => s + x.stars, 0) / arr.length).toFixed(1) : '—';
  el.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">🛍️ Commandes : ⭐ ' + avg(orderSurveys) + '/5 (' + orderSurveys.length + ' réponse(s))</p>' +
    '<p style="margin:0; font-size:13px;">🎫 Support : ⭐ ' + avg(ticketSurveys) + '/5 (' + ticketSurveys.length + ' réponse(s))</p></div>' +
    surveys.filter(s => s.comment).slice(0,5).map(s =>
      '<div class="card" style="margin-top:8px;"><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.75);">' + '⭐'.repeat(s.stars) + ' « ' + escapeHtml(s.comment) + ' »</p></div>'
    ).join('');
}
async function resolveTicket(id){
  const t = await safeGet('ticket:' + id, true);
  if(!t) return;
  t.status = 'resolved';
  t.resolvedAt = new Date().toISOString();
  await saveWithRetry('ticket:' + id, t, true);
  showToast('Réclamation marquée comme résolue ✓');
  await createNotification(t.username, 'satisfaction_survey', currentAdminName || 'Suktum', id, 'ticket');
  await loadTicketsList();
}
/* ---------- DISCUSSIONS DE GROUPE ---------- */
let currentGroupId = null;
async function fetchMyGroups(){
  const keys = await safeList('group:', true);
  const groups = [];
  for(const k of keys){ const g = await safeGet(k, true); if(g && g.members.includes(currentUser)) groups.push(g); }
  return groups;
}
async function renderMyGroupsList(){
  const el = document.getElementById('my-groups-list');
  if(!el) return;
  const groups = await fetchMyGroups();
  if(groups.length === 0){ el.innerHTML = '<div class="empty">Aucun groupe pour l’instant.</div>'; return; }
  el.innerHTML = groups.map(g =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openGroupThread(\''+g.id+'\')">' +
    '<div class="avatar" style="width:36px; height:36px; font-size:16px;">👥</div>' +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(g.name)+'</strong>' +
    '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:2px 0 0;">'+g.members.length+' membre(s)</p></div>' +
    '</div>'
  ).join('');
}
async function renderGroupMemberPicker(){
  const el = document.getElementById('group-member-picker');
  const me = await safeGet('user:' + currentUser, true);
  const following = (me && me.following) || [];
  if(following.length === 0){ el.innerHTML = '<div class="empty">Vous ne suivez encore personne à ajouter.</div>'; return; }
  el.innerHTML = following.map(u =>
    '<label style="display:flex; align-items:center; gap:10px; padding:9px 0; cursor:pointer;">' +
    '<input type="checkbox" class="group-member-checkbox" value="'+escapeHtml(u)+'" style="width:18px; height:18px;">' +
    smallAvatarBadge(u, 28) + '<span style="font-size:13px;">@'+escapeHtml(u)+'</span>' +
    '</label>'
  ).join('');
}
async function createGroupChat(){
  const name = document.getElementById('group-name-input').value.trim();
  const checked = Array.from(document.querySelectorAll('.group-member-checkbox:checked')).map(c => c.value);
  if(!name){ showToast('Donnez un nom au groupe'); return; }
  if(checked.length === 0){ showToast('Choisissez au moins un membre'); return; }
  const id = 'group_' + Date.now();
  const members = [currentUser, ...checked];
  await saveWithRetry('group:' + id, { id, name, members, createdBy: currentUser, createdAt: new Date().toISOString() }, true);
  await saveWithRetry('groupmsg:' + id, [], true);
  for(const member of checked){
    await createNotification(member, 'group_invite', currentUser, id, name);
  }
  document.getElementById('group-name-input').value = '';
  showToast('Groupe créé ✓');
  openGroupThread(id);
}
async function openGroupThread(groupId){
  currentGroupId = groupId;
  const g = await safeGet('group:' + groupId, true);
  if(!g){ showToast('Ce groupe n’existe plus'); go('messages'); return; }
  document.getElementById('group-thread-title').textContent = '👥 ' + g.name;
  go('group-thread');
  await renderGroupMessages();
}
async function renderGroupMessages(){
  if(!currentGroupId) return;
  const el = document.getElementById('group-thread-messages');
  const msgs = (await safeGet('groupmsg:' + currentGroupId, true)) || [];
  if(msgs.length === 0){ el.innerHTML = '<div class="empty">Aucun message pour l’instant.</div>'; }
  else{
    el.innerHTML = msgs.map(m => {
      const mine = m.from === currentUser;
      return '<div style="display:flex; flex-direction:column; align-self:'+(mine?'flex-end':'flex-start')+'; max-width:78%;">' +
        (mine ? '' : '<span style="font-size:11px; color:var(--gold); margin-bottom:2px;">@'+escapeHtml(m.from)+'</span>') +
        '<div style="background:'+(mine?'var(--coral)':'var(--night-2)')+'; color:'+(mine?'var(--night)':'var(--cream)')+'; padding:9px 13px; border-radius:14px; font-size:13.5px;">'+escapeHtml(m.text)+'</div>' +
        '</div>';
    }).join('');
  }
  el.scrollTop = el.scrollHeight;
}
async function sendGroupMessage(){
  if(!currentGroupId) return;
  const input = document.getElementById('group-thread-input');
  const text = input.value.trim();
  if(!text) return;
  const msgs = (await safeGet('groupmsg:' + currentGroupId, true)) || [];
  msgs.push({ from: currentUser, text, ts: new Date().toISOString() });
  await saveWithRetry('groupmsg:' + currentGroupId, msgs, true);
  input.value = '';
  await renderGroupMessages();
}
async function renderGroupMembersScreen(){
  if(!currentGroupId) return;
  const g = await safeGet('group:' + currentGroupId, true);
  const el = document.getElementById('group-members-list');
  if(!g){ el.innerHTML = ''; return; }
  el.innerHTML = g.members.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' +
    smallAvatarBadge(u, 28) + '<span style="font-size:13px;">@'+escapeHtml(u)+(u===g.createdBy?' · fondateur':'')+(u===currentUser?' (vous)':'')+'</span>' +
    '</div>'
  ).join('');
}
async function leaveGroupChat(){
  if(!currentGroupId) return;
  const ok = confirm('Quitter ce groupe ?');
  if(!ok) return;
  const g = await safeGet('group:' + currentGroupId, true);
  if(!g) return;
  g.members = g.members.filter(u => u !== currentUser);
  await saveWithRetry('group:' + currentGroupId, g, true);
  showToast('Vous avez quitté le groupe');
  currentGroupId = null;
  go('messages');
}

async function sendThreadMessage(){
  const input = document.getElementById('thread-input');
  const text = input.value.trim();
  if(!text || !currentThreadPartner) return;
  if(await isBlockedEitherWay(currentThreadPartner)){ showToast('Impossible d’envoyer ce message'); return; }
  const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
  const msgs = (await safeGet(key, true)) || [];
  msgs.push({from: currentUser, text, ts: new Date().toISOString()});
  await saveWithRetry(key, msgs, true);
  await createNotification(currentThreadPartner, 'message', currentUser, null, text.slice(0,60));
  input.value = '';
  await renderThreadMessages();
}
const MAX_CHAT_MEDIA_SIZE = 2 * 1024 * 1024;
async function sendThreadPhoto(){
  const fileInput = document.getElementById('thread-photo-input');
  const file = fileInput.files[0];
  if(!file || !currentThreadPartner) return;
  if(file.size > MAX_CHAT_MEDIA_SIZE){ showToast('Photo trop lourde (2 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
    const msgs = (await safeGet(key, true)) || [];
    msgs.push({from: currentUser, type: 'photo', mediaData: dataUrl, text: '📷 Photo', ts: new Date().toISOString()});
    await saveWithRetry(key, msgs, true);
    await createNotification(currentThreadPartner, 'message', currentUser, null, '📷 Photo');
    await renderThreadMessages();
  }catch(e){
    showToast('Impossible d’envoyer cette photo');
  }
  fileInput.value = '';
}
let voiceRecorder = null;
let voiceChunks = [];
let isRecordingVoice = false;
async function toggleVoiceRecording(){
  const btn = document.getElementById('thread-voice-btn');
  if(!isRecordingVoice){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      showToast('Micro indisponible sur cet appareil');
      return;
    }
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceChunks = [];
      voiceRecorder = new MediaRecorder(stream);
      voiceRecorder.ondataavailable = (e) => { if(e.data.size > 0) voiceChunks.push(e.data); };
      voiceRecorder.onstop = async () => {
        const blob = new Blob(voiceChunks, { type: 'audio/webm' });
        if(blob.size > MAX_CHAT_MEDIA_SIZE){ showToast('Note vocale trop longue (2 Mo max)'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
          const msgs = (await safeGet(key, true)) || [];
          msgs.push({from: currentUser, type: 'voice', mediaData: reader.result, text: '🎤 Note vocale', ts: new Date().toISOString()});
          await saveWithRetry(key, msgs, true);
          await createNotification(currentThreadPartner, 'message', currentUser, null, '🎤 Note vocale');
          await renderThreadMessages();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      voiceRecorder.start();
      isRecordingVoice = true;
      btn.textContent = '⏹️';
      btn.style.color = 'var(--coral)';
      showToast('Enregistrement en cours...');
    }catch(e){
      showToast('Micro indisponible ou refusé');
    }
  } else {
    if(voiceRecorder) voiceRecorder.stop();
    isRecordingVoice = false;
    btn.textContent = '🎤';
    btn.style.color = 'var(--cream)';
  }
}

