/* ---------- LIVE ---------- */
const LIVE_FOLLOWER_THRESHOLD = 1000;
/* ---------- ABONNEMENT PREMIUM ---------- */
const DEFAULT_PREMIUM_PRICE = 2000;
const PREMIUM_DURATION_DAYS = 30;
async function getPremiumPrice(){
  const price = await safeGet('settings:premium_price', true);
  return (typeof price === 'number') ? price : DEFAULT_PREMIUM_PRICE;
}
async function isUserPremium(username){
  const sub = await safeGet('subscription:' + username, true);
  if(!sub) return false;
  return new Date(sub.expiresAt) > new Date();
}
async function fetchPremiumUsernames(){
  const keys = await safeList('subscription:', true);
  const active = new Set();
  for(const k of keys){
    const sub = await safeGet(k, true);
    if(sub && new Date(sub.expiresAt) > new Date()) active.add(sub.username);
  }
  return active;
}
async function subscribeToPremium(){
  const price = await getPremiumPrice();
  const id = 'premiumreq_' + Date.now();
  await saveWithRetry('premiumrequest:' + id, {
    id, username: currentUser, country: currentUserCountry, price, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  if(await isAutoApprovePremiumEnabled()){
    await approvePremiumRequest(id);
    await logAdminAction('Abonnement Premium approuvé automatiquement', '@' + currentUser + ' — ' + price.toLocaleString('fr-FR') + ' FCFA');
    showToast('Abonnement Premium activé automatiquement ✓');
    await renderProfile();
    return;
  }
  const instructions = await getPaymentInstructions(currentUserCountry);
  alert('Pour activer votre abonnement Premium (' + price.toLocaleString('fr-FR') + ' FCFA) :\n\n' + instructions + '\n\nVotre abonnement sera activé dès que votre paiement sera vérifié.');
  showToast('Demande envoyée — en attente de validation du paiement ✓');
  await renderProfile();
}
async function fetchPremiumRequests(){
  const keys = await safeList('premiumrequest:', true);
  const requests = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) requests.push(r); }
  requests.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return requests;
}
async function approvePremiumRequest(id){
  const req = await safeGet('premiumrequest:' + id, true);
  if(!req) return;
  const existing = await safeGet('subscription:' + req.username, true);
  const startBase = (existing && new Date(existing.expiresAt) > new Date()) ? new Date(existing.expiresAt) : new Date();
  const expiresAt = new Date(startBase.getTime() + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);
  await saveWithRetry('subscription:' + req.username, {
    username: req.username, country: req.country, price: req.price,
    startedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(),
    cancelled: false,
    createdAt: (existing ? existing.createdAt : new Date().toISOString())
  }, true);
  await saveWithRetry('premiumpurchase:' + req.username + '__' + Date.now(), { username: req.username, price: req.price, country: req.country, purchasedAt: new Date().toISOString() }, true);
  const paymentId = 'premiumpay_' + Date.now();
  await saveWithRetry('premiumpayment:' + paymentId, {
    id: paymentId, username: req.username, country: req.country, amount: req.price, createdAt: new Date().toISOString()
  }, true);
  req.status = 'approved';
  await saveWithRetry('premiumrequest:' + id, req, true);
  showToast('Paiement validé — abonnement activé ✓');
  await logAdminAction('Paiement Premium validé', '@' + req.username + ' — ' + req.price.toLocaleString('fr-FR') + ' FCFA');
  await loadPremiumRequestsAdmin();
  await loadAdminPremiumList();
}
async function rejectPremiumRequest(id){
  await window.storage.delete('premiumrequest:' + id, true).catch(() => {});
  showToast('Demande rejetée');
  await loadPremiumRequestsAdmin();
}
async function loadPremiumRequestsAdmin(){
  const el = document.getElementById('admin-premium-requests');
  if(!el) return;
  let requests = (await fetchPremiumRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  if(requests.length === 0){ el.innerHTML = '<div class="empty">Aucune demande en attente.</div>'; return; }
  el.innerHTML = requests.map(r =>
    '<div class="card">' +
    '<p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.username)+' — '+r.price.toLocaleString('fr-FR')+' FCFA'+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="approvePremiumRequest(\''+r.id+'\')">✓ Paiement reçu, activer</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectPremiumRequest(\''+r.id+'\')">✕ Rejeter</button>' +
    '</div></div>'
  ).join('');
}
async function loadPremiumCard(){
  const el = document.getElementById('premium-card');
  if(!el) return;
  const price = await getPremiumPrice();
  const sub = await safeGet('subscription:' + currentUser, true);
  const active = sub && new Date(sub.expiresAt) > new Date();
  const pendingReq = (await fetchPremiumRequests()).find(r => r.username === currentUser && r.status === 'pending');
  if(active && sub.cancelled){
    el.innerHTML = '<p style="margin:0 0 10px; font-size:13px; color:var(--gold);">⏳ Abonnement annulé — accès Premium conservé jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', puis ne sera pas renouvelé.</p>' +
      '<button class="btn btn-outline" onclick="reactivatePremiumSubscription()">Réactiver le renouvellement</button>';
  } else if(active){
    el.innerHTML = '<p style="margin:0 0 10px; font-size:13px; color:var(--lagoon);">✓ Premium actif jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + '</p>' +
      '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.6);">Badge vérifié, aucune publicité dans votre fil, statistiques avancées débloquées.</p>' +
      '<button class="btn btn-outline" style="margin-bottom:8px;" onclick="subscribeToPremium()">Renouveler pour ' + PREMIUM_DURATION_DAYS + ' jours de plus</button>' +
      '<button class="btn btn-outline" style="border-color:var(--coral); color:var(--coral); width:100%;" onclick="cancelPremiumSubscription()">Annuler mon abonnement</button>';
  } else if(pendingReq){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Paiement en attente de vérification ('+pendingReq.price.toLocaleString('fr-FR')+' FCFA). Votre abonnement s’activera dès validation.</p>';
  } else {
    el.innerHTML = '<p style="margin:0 0 10px; font-size:13px;">Badge vérifié ✓, aucune publicité, statistiques avancées.</p>' +
      '<p style="margin:0 0 10px; font-size:18px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">' + (await formatPriceIndicative(price)) + ' / mois</p>' +
      '<button class="btn btn-primary" onclick="subscribeToPremium()">⭐ S’abonner à Premium</button>';
  }
}
async function cancelPremiumSubscription(){
  const sub = await safeGet('subscription:' + currentUser, true);
  if(!sub) return;
  if(!confirm('Annuler votre abonnement Premium ? Vous garderez l’accès jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', mais il ne sera plus renouvelé après cette date.')) return;
  sub.cancelled = true;
  await saveWithRetry('subscription:' + currentUser, sub, true);
  showToast('Abonnement annulé — accès conservé jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR'));
  await loadPremiumCard();
}
async function reactivatePremiumSubscription(){
  const sub = await safeGet('subscription:' + currentUser, true);
  if(!sub) return;
  sub.cancelled = false;
  await saveWithRetry('subscription:' + currentUser, sub, true);
  showToast('Renouvellement réactivé ✓');
  await loadPremiumCard();
}
async function loadPremiumStatsCard(){
  const el = document.getElementById('premium-stats-card');
  if(!el) return;
  const active = await isUserPremium(currentUser);
  if(!active){ el.innerHTML = ''; return; }
  const myPosts = (await fetchPosts()).filter(p => p.userId === currentUser);
  const totalLikes = myPosts.reduce((s,p) => s + (p.likes ? p.likes.length : 0), 0);
  const totalComments = myPosts.reduce((s,p) => s + (p.comments ? p.comments.length : 0), 0);
  const totalFavorites = myPosts.reduce((s,p) => s + (p.favoritedBy ? p.favoritedBy.length : 0), 0);
  el.innerHTML = '<div class="card" style="margin-top:10px;">' +
    '<p style="margin:0 0 6px; font-size:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.05em;">📊 Statistiques avancées (Premium)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">❤️ '+totalLikes+' j’aime au total</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">💬 '+totalComments+' commentaire(s) au total</p>' +
    '<p style="margin:0; font-size:13px;">🔖 '+totalFavorites+' mise(s) en favori au total</p>' +
    '<button class="btn btn-outline btn-sm" style="width:100%; margin-top:10px;" onclick="go(\'audience-insights\')">🌍 Voir la répartition de mon audience</button>' +
    '</div>';
}

/* ---------- BADGE VÉRIFIÉ À L'UNITÉ ---------- */
async function isUserVerifiedBadge(username){
  const u = await safeGet('user:' + username, true);
  return !!(u && u.verifiedBadge);
}
/* ---------- COMPTE BUSINESS ---------- */
async function requestBusinessAccount(){
  const sector = document.getElementById('business-sector-input').value.trim();
  const website = document.getElementById('business-website-input').value.trim();
  if(!sector){ showToast('Renseignez au moins votre secteur d’activité'); return; }
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.businessAccountStatus === 'pending'){ showToast('Une demande est déjà en cours'); return; }
  const meUpdated = me || {username: currentUser, createdAt: new Date().toISOString()};
  meUpdated.businessAccountStatus = 'pending';
  meUpdated.businessSector = sector;
  meUpdated.businessWebsite = website || null;
  await saveWithRetry('user:' + currentUser, meUpdated, true);
  showToast('Demande envoyée ✓ — en attente de validation');
  await logAdminAction('Nouvelle demande de compte Business', '@' + currentUser + ' — ' + sector);
  await renderBusinessAccountCard();
}
async function renderBusinessAccountCard(){
  const el = document.getElementById('business-account-status-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const status = me && me.businessAccountStatus;
  if(status === 'verified'){
    el.innerHTML = '<p style="margin:0 0 4px; font-size:12.5px; color:var(--lagoon);">✓ Compte Business vérifié</p>' +
      '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Secteur : '+escapeHtml(me.businessSector)+(me.businessWebsite ? ' · '+escapeHtml(me.businessWebsite) : '')+'</p>';
  } else if(status === 'pending'){
    el.innerHTML = '<p style="margin:0; font-size:12.5px; color:var(--gold);">⏳ Demande en cours d’examen par l’équipe Suktum.</p>';
  } else {
    el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Une catégorie distincte pour les entreprises, avec des informations professionnelles validées par Suktum.</p>' +
      (status === 'rejected' ? '<p style="margin:0 0 10px; font-size:12px; color:var(--coral);">✕ Demande refusée'+(me.businessRejectReason ? ' : '+escapeHtml(me.businessRejectReason) : '')+'. Vous pouvez la soumettre à nouveau.</p>' : '') +
      '<label style="margin-top:0;">Secteur d’activité</label>' +
      '<input type="text" id="business-sector-input" placeholder="Ex : Mode, Restauration, Technologie">' +
      '<label>Site web (facultatif)</label>' +
      '<input type="text" id="business-website-input" placeholder="https://...">' +
      '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="requestBusinessAccount()">Demander le statut Business</button>';
  }
}
async function fetchPendingBusinessAccountRequests(){
  const users = await fetchUsers();
  return users.filter(u => u.businessAccountStatus === 'pending');
}
async function approveBusinessAccount(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.businessAccountStatus = 'verified';
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'business_account_approved', 'Suktum', null, null);
  showToast('Compte Business accordé ✓');
  await logAdminAction('Compte Business accordé', '@' + username);
  await renderBusinessAccountRequestsAdmin();
}
async function rejectBusinessAccount(username){
  const reason = prompt('Motif du refus (facultatif) :');
  if(reason === null) return;
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.businessAccountStatus = 'rejected';
  u.businessRejectReason = reason.trim() || null;
  await saveWithRetry('user:' + username, u, true);
  showToast('Demande refusée');
  await logAdminAction('Compte Business refusé', '@' + username);
  await renderBusinessAccountRequestsAdmin();
}
async function renderBusinessAccountRequestsAdmin(){
  const el = document.getElementById('business-account-requests-admin-list');
  if(!el) return;
  const requests = await fetchPendingBusinessAccountRequests();
  el.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : requests.map(u =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(u.username)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(u.businessSector||'—')+(u.businessWebsite ? ' · '+escapeHtml(u.businessWebsite) : '')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="approveBusinessAccount(\''+escapeHtml(u.username)+'\')">✓ Accorder</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="rejectBusinessAccount(\''+escapeHtml(u.username)+'\')">✕ Refuser</button>' +
    '</div></div>'
  ).join('');
}
async function requestVerifiedBadge(){
  const price = await getBadgePrice();
  const instructions = await getPaymentInstructions(currentUserCountry);
  const id = 'badgereq_' + Date.now();
  await saveWithRetry('badgerequest:' + id, {
    id, username: currentUser, country: currentUserCountry, price, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  alert('Pour obtenir votre badge vérifié permanent (' + price.toLocaleString('fr-FR') + ' FCFA, paiement unique) :\n\n' + instructions + '\n\nVotre badge apparaîtra dès que votre paiement sera vérifié.');
  showToast('Demande envoyée — en attente de validation ✓');
  await renderProfile();
}
async function fetchBadgeRequests(){
  const keys = await safeList('badgerequest:', true);
  const requests = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) requests.push(r); }
  return requests;
}
async function approveBadgeRequest(id){
  const req = await safeGet('badgerequest:' + id, true);
  if(!req) return;
  const u = await safeGet('user:' + req.username, true);
  if(u){ u.verifiedBadge = true; await saveWithRetry('user:' + req.username, u, true); }
  const paymentId = 'badgepay_' + Date.now();
  await saveWithRetry('badgepayment:' + paymentId, {id: paymentId, username: req.username, country: req.country, amount: req.price, createdAt: new Date().toISOString()}, true);
  req.status = 'approved';
  await saveWithRetry('badgerequest:' + id, req, true);
  showToast('Badge vérifié activé ✓');
  await logAdminAction('Badge vérifié validé', '@' + req.username + ' — ' + req.price.toLocaleString('fr-FR') + ' FCFA');
  await loadAdminBadgeRequests();
}
async function rejectBadgeRequest(id){
  await window.storage.delete('badgerequest:' + id, true).catch(() => {});
  showToast('Demande rejetée');
  await loadAdminBadgeRequests();
}
async function loadAdminBadgeRequests(){
  const el = document.getElementById('admin-badge-requests');
  if(!el) return;
  let requests = (await fetchBadgeRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  if(requests.length === 0){ el.innerHTML = '<div class="empty">Aucune demande en attente.</div>'; return; }
  el.innerHTML = requests.map(r =>
    '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.username)+' — '+r.price.toLocaleString('fr-FR')+' FCFA'+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveBadgeRequest(\''+r.id+'\')">✓ Paiement reçu, activer</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectBadgeRequest(\''+r.id+'\')">✕ Rejeter</button></div></div>'
  ).join('');
}
async function fetchBadgePayments(){
  const keys = await safeList('badgepayment:', true);
  const payments = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) payments.push(p); }
  return payments;
}

/* ---------- BOOST DE PUBLICATIONS ---------- */
async function requestBoostPost(postId){
  const price24h = await getBoostPrice();
  const price3d = await getBoostPrice3d();
  const price7d = await getBoostPrice7d();
  const choice = prompt('Choisissez la durée du boost :\n1 = 24h (' + price24h.toLocaleString('fr-FR') + ' FCFA)\n2 = 3 jours (' + price3d.toLocaleString('fr-FR') + ' FCFA)\n3 = 7 jours (' + price7d.toLocaleString('fr-FR') + ' FCFA)', '1');
  if(choice === null) return;
  const durations = {'1': {hours: 24, price: price24h}, '2': {hours: 72, price: price3d}, '3': {hours: 168, price: price7d}};
  const selected = durations[choice.trim()];
  if(!selected){ showToast('Choix invalide'); return; }
  const instructions = await getPaymentInstructions(currentUserCountry);
  const id = 'boostreq_' + Date.now();
  await saveWithRetry('boostrequest:' + id, {
    id, postId, username: currentUser, country: currentUserCountry, price: selected.price, durationHours: selected.hours, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  alert('Pour booster votre publication (' + selected.price.toLocaleString('fr-FR') + ' FCFA) :\n\n' + instructions);
  showToast('Demande de boost envoyée — en attente de validation ✓');
}
async function fetchBoostRequests(){
  const keys = await safeList('boostrequest:', true);
  const requests = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) requests.push(r); }
  return requests;
}
async function approveBoostRequest(id){
  const req = await safeGet('boostrequest:' + id, true);
  if(!req) return;
  const hours = req.durationHours || 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await saveWithRetry('boost:' + req.postId, {postId: req.postId, username: req.username, expiresAt}, true);
  const paymentId = 'boostpay_' + Date.now();
  await saveWithRetry('boostpayment:' + paymentId, {id: paymentId, username: req.username, country: req.country, amount: req.price, createdAt: new Date().toISOString()}, true);
  req.status = 'approved';
  await saveWithRetry('boostrequest:' + id, req, true);
  showToast('Boost activé ✓');
  await logAdminAction('Boost validé', '@' + req.username + ' — ' + req.price.toLocaleString('fr-FR') + ' FCFA (' + hours + 'h)');
  await loadAdminBoostRequests();
}
async function rejectBoostRequest(id){
  await window.storage.delete('boostrequest:' + id, true).catch(() => {});
  showToast('Demande rejetée');
  await loadAdminBoostRequests();
}
async function loadAdminBoostRequests(){
  const el = document.getElementById('admin-boost-requests');
  if(!el) return;
  let requests = (await fetchBoostRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  if(requests.length === 0){ el.innerHTML = '<div class="empty">Aucune demande en attente.</div>'; return; }
  el.innerHTML = requests.map(r =>
    '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.username)+' — '+r.price.toLocaleString('fr-FR')+' FCFA'+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveBoostRequest(\''+r.id+'\')">✓ Paiement reçu, activer</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectBoostRequest(\''+r.id+'\')">✕ Rejeter</button></div></div>'
  ).join('');
}
async function fetchBoostPayments(){
  const keys = await safeList('boostpayment:', true);
  const payments = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) payments.push(p); }
  return payments;
}
async function isPostBoosted(postId){
  const b = await safeGet('boost:' + postId, true);
  return b && new Date(b.expiresAt) > new Date();
}
async function savePremiumPrice(){
  const price = parseInt(document.getElementById('premium-price-input').value, 10);
  if(isNaN(price) || price < 0){ showToast('Entrez un prix valide'); return; }
  await saveWithRetry('settings:premium_price', price, true);
  showToast('Prix Premium enregistré ✓');
}
async function loadPremiumPriceAdmin(){
  const input = document.getElementById('premium-price-input');
  if(!input) return;
  input.value = await getPremiumPrice();
}
/* ---------- NOUVEAUX SERVICES DE MONÉTISATION ---------- */
const DEFAULT_BADGE_PRICE = 10000;
const DEFAULT_BOOST_PRICE = 3000;
const DEFAULT_TICKET_COMMISSION = 20;
async function getBadgePrice(){ const p = await safeGet('settings:badge_price', true); return typeof p === 'number' ? p : DEFAULT_BADGE_PRICE; }
async function getBoostPrice(){ const p = await safeGet('settings:boost_price', true); return typeof p === 'number' ? p : DEFAULT_BOOST_PRICE; }
async function getBoostPrice3d(){ const p = await safeGet('settings:boost_price_3d', true); return typeof p === 'number' ? p : DEFAULT_BOOST_PRICE * 2; }
async function getBoostPrice7d(){ const p = await safeGet('settings:boost_price_7d', true); return typeof p === 'number' ? p : DEFAULT_BOOST_PRICE * 4; }
async function getTicketCommission(){ const p = await safeGet('settings:ticket_commission', true); return typeof p === 'number' ? p : DEFAULT_TICKET_COMMISSION; }
async function isMarketplaceOpen(){ const v = await safeGet('settings:marketplace_open', true); return v !== false; }
async function saveBadgePrice(){
  const price = parseInt(document.getElementById('badge-price-input').value, 10);
  if(isNaN(price) || price < 0){ showToast('Entrez un prix valide'); return; }
  await saveWithRetry('settings:badge_price', price, true);
  showToast('Prix du badge enregistré ✓');
}
async function saveBoostPrice(){
  const price = parseInt(document.getElementById('boost-price-input').value, 10);
  const price3d = parseInt(document.getElementById('boost-price-3d-input').value, 10);
  const price7d = parseInt(document.getElementById('boost-price-7d-input').value, 10);
  if(isNaN(price) || price < 0){ showToast('Entrez un prix 24h valide'); return; }
  await saveWithRetry('settings:boost_price', price, true);
  if(!isNaN(price3d) && price3d >= 0) await saveWithRetry('settings:boost_price_3d', price3d, true);
  if(!isNaN(price7d) && price7d >= 0) await saveWithRetry('settings:boost_price_7d', price7d, true);
  showToast('Prix du boost enregistrés ✓');
}
async function saveTicketCommission(){
  const rate = parseFloat(document.getElementById('ticket-commission-input').value);
  if(isNaN(rate) || rate < 0 || rate > 100){ showToast('Entrez un taux entre 0 et 100'); return; }
  await saveWithRetry('settings:ticket_commission', rate, true);
  showToast('Commission billets enregistrée ✓');
}
async function saveMarketplaceOpenSetting(){
  const enabled = document.getElementById('marketplace-open-toggle').checked;
  await saveWithRetry('settings:marketplace_open', enabled, true);
  document.getElementById('marketplace-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  showToast(enabled ? 'Marketplace ouverte activée ✓' : 'Marketplace ouverte désactivée');
}
async function loadNewMonetizationSettingsAdmin(){
  const badgeInput = document.getElementById('badge-price-input');
  if(!badgeInput) return;
  badgeInput.value = await getBadgePrice();
  document.getElementById('boost-price-input').value = await getBoostPrice();
  document.getElementById('boost-price-3d-input').value = await getBoostPrice3d();
  document.getElementById('boost-price-7d-input').value = await getBoostPrice7d();
  document.getElementById('ticket-commission-input').value = await getTicketCommission();
  const open = await isMarketplaceOpen();
  document.getElementById('marketplace-open-toggle').checked = open;
  document.getElementById('marketplace-toggle-visual').style.background = open ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
async function fetchPremiumPayments(){
  const keys = await safeList('premiumpayment:', true);
  const payments = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) payments.push(p); }
  return payments;
}
async function loadAdminPremiumList(){
  const summaryEl = document.getElementById('premium-summary-card');
  const listEl = document.getElementById('admin-premium-list');
  if(!summaryEl || !listEl) return;
  const keys = await safeList('subscription:', true);
  let subs = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) subs.push(s); }
  if(adminScope !== 'all') subs = subs.filter(s => s.country === adminScope);
  const activeSubs = subs.filter(s => new Date(s.expiresAt) > new Date());
  let payments = await fetchPremiumPayments();
  if(adminScope !== 'all') payments = payments.filter(p => p.country === adminScope);
  const totalRevenue = payments.reduce((s,p) => s + p.amount, 0);
  summaryEl.innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">⭐ <strong>'+activeSubs.length+'</strong> abonné(s) actif(s)</p>' +
    '<p style="margin:0; font-size:13px; color:var(--gold);">💰 Revenu Premium total : <strong>'+totalRevenue.toLocaleString('fr-FR')+' FCFA</strong></p>';
  if(activeSubs.length === 0){ listEl.innerHTML = '<div class="empty">Aucun abonné Premium actif.</div>'; return; }
  listEl.innerHTML = activeSubs.map(s =>
    '<div class="card" style="padding:10px 14px;"><p style="margin:0; font-size:12.5px;">✓ @'+escapeHtml(s.username)+' — jusqu’au '+new Date(s.expiresAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
async function openLiveQuickStartPanel(){
  if(!requireAccount('Créez un compte pour démarrer un live')) return;
  const el = document.getElementById('live-quickstart-panel-content');
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.liveRestrictedUntil && new Date(me.liveRestrictedUntil) > new Date()){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--coral);">🚫 Votre accès aux lives est temporairement restreint suite à un avertissement, jusqu’au '+new Date(me.liveRestrictedUntil).toLocaleDateString('fr-FR')+'.</p>' +
      '<button class="btn btn-outline btn-sm" style="margin-top:10px; width:100%;" onclick="closeLiveQuickStartPanel(); go(\'my-sanctions\')">Voir mes sanctions et faire appel</button>';
    document.getElementById('live-quickstart-panel-overlay').style.display = 'block';
    return;
  }
  const followerCount = (me && me.followers) ? me.followers.length : 0;
  const lives = await fetchLives();
  const myLive = lives.find(l => l.username === currentUser && (l.status === 'pending' || l.status === 'approved'));
  if(myLive){
    el.innerHTML = '<p style="margin:0 0 12px; font-size:13px;">'+(myLive.status === 'pending' ? '⏳ Votre demande est en attente de validation par l’équipe.' : '🔴 Vous êtes déjà en direct.')+'</p>' +
      (myLive.status === 'approved' ? '<button class="btn btn-primary" style="width:100%;" onclick="closeLiveQuickStartPanel(); openLiveView(\''+myLive.id+'\')">Rejoindre mon live</button>' : '');
    document.getElementById('live-quickstart-panel-overlay').style.display = 'block';
    return;
  }
  const authorizedOverride = me && me.liveAuthorizedOverride;
  const eligible = followerCount >= LIVE_FOLLOWER_THRESHOLD || authorizedOverride;
  const categoryOptions = '<option value="autre">Autre</option><option value="ecommerce">🛍️ E-commerce</option><option value="consultation">💬 Consultation</option><option value="education">🎓 Éducation</option><option value="cuisine">🍲 Cuisine</option><option value="musique">🎵 Musique</option><option value="mode">👗 Mode & Beauté</option><option value="sport">⚽ Sport</option><option value="talk">🎤 Discussion</option>';
  if(eligible){
    const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
    el.innerHTML = (authorizedOverride && followerCount < LIVE_FOLLOWER_THRESHOLD ? '<p style="margin:0 0 8px; font-size:12px; color:var(--gold);">✓ Autorisation spéciale accordée par l’administration.</p>' : '') +
      '<p style="margin:0 0 12px; font-size:11.5px; color:rgba(245,239,227,0.5);">Votre live sera d’abord soumis à l’administration avant d’être visible par tous. La caméra avant/arrière se change directement dans l’écran de diffusion une fois en direct.</p>' +
      '<label style="margin-top:0;">Titre du live</label>' +
      '<input type="text" id="live-title-input" placeholder="Ex : Vente flash de bijoux" maxlength="80">' +
      '<label>Catégorie</label>' +
      '<select id="live-category-select">'+categoryOptions+'</select>' +
      '<label>Programmer pour plus tard (optionnel)</label>' +
      '<input type="datetime-local" id="live-scheduled-time-input">' +
      '<p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Laissez vide pour démarrer immédiatement.</p>' +
      '<label>Visibilité</label>' +
      '<select id="live-visibility-select"><option value="public">🌍 Public</option><option value="followers">👥 Abonnés uniquement</option><option value="private">🔒 Privé (non listé)</option></select>' +
      (myProducts.length > 0 ? '<label>Lier un produit ou service (optionnel)</label><select id="live-linked-product-select"><option value="">Aucun</option>'+myProducts.map(p => '<option value="'+p.id+'">'+(p.isService ? '💬 ' : '🛍️ ')+escapeHtml(p.name)+'</option>').join('')+'</select>' : '') +
      '<label>Prix du billet (FCFA) — laissez à 0 pour un live gratuit</label>' +
      '<input type="number" id="live-ticket-price-input" value="0">' +
      '<div style="display:flex; align-items:center; gap:8px; margin-top:12px;">' +
      '<input type="checkbox" id="live-audio-only-checkbox" style="width:auto;">' +
      '<label style="margin:0; font-size:12.5px;" for="live-audio-only-checkbox">🎙️ Podcast (audio uniquement, caméra coupée)</label>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:8px; margin-top:10px;">' +
      '<input type="checkbox" id="live-comments-disabled-checkbox" style="width:auto;">' +
      '<label style="margin:0; font-size:12.5px;" for="live-comments-disabled-checkbox">🔒 Désactiver les commentaires pendant ce live</label>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:8px; margin-top:10px;">' +
      '<input type="checkbox" id="live-save-transcript-checkbox" style="width:auto;" checked>' +
      '<label style="margin:0; font-size:12.5px;" for="live-save-transcript-checkbox">📝 Sauvegarder le compte-rendu du chat après ce live</label>' +
      '</div>' +
      '<p style="margin:6px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Suktum ne peut pas encore enregistrer la vidéo elle-même pour un replay — seul le texte du chat peut être conservé.</p>' +
      '<button class="btn btn-primary" style="margin-top:14px; width:100%;" onclick="startLiveFromQuickPanel()">🔴 Démarrer maintenant</button>';
  } else {
    el.innerHTML = '<p style="margin:0 0 12px; font-size:13px; color:rgba(245,239,227,0.6);">Les lives sont réservés aux comptes ayant '+LIVE_FOLLOWER_THRESHOLD.toLocaleString('fr-FR')+' abonnés ou plus. Il vous manque '+(LIVE_FOLLOWER_THRESHOLD - followerCount).toLocaleString('fr-FR')+' abonné(s).</p>' +
      '<label style="margin-top:0;">Pourquoi souhaitez-vous démarrer un live sans avoir 1000 abonnés ?</label>' +
      '<textarea id="live-auth-reason-input" placeholder="Expliquez votre demande — visible par l’administration"></textarea>' +
      '<button class="btn btn-primary" style="margin-top:10px; width:100%;" onclick="sendLiveAuthRequestFromPanel()">Envoyer la demande d’autorisation</button>';
  }
  document.getElementById('live-quickstart-panel-overlay').style.display = 'block';
}
function closeLiveQuickStartPanel(){
  document.getElementById('live-quickstart-panel-overlay').style.display = 'none';
}
async function startLiveFromQuickPanel(){
  const roomName = 'Suktum-' + currentUser + '-' + Math.random().toString(36).slice(2, 8);
  const id = 'live_' + Date.now();
  const title = document.getElementById('live-title-input').value.trim().slice(0, 80);
  const ticketPrice = parseInt(document.getElementById('live-ticket-price-input').value, 10) || 0;
  const isAudioOnly = document.getElementById('live-audio-only-checkbox').checked;
  const category = document.getElementById('live-category-select').value;
  const scheduledTimeRaw = document.getElementById('live-scheduled-time-input').value;
  const visibility = document.getElementById('live-visibility-select').value;
  const linkedProductEl = document.getElementById('live-linked-product-select');
  const linkedProductId = linkedProductEl ? (linkedProductEl.value || null) : null;
  const commentsDisabled = document.getElementById('live-comments-disabled-checkbox').checked;
  const saveTranscript = document.getElementById('live-save-transcript-checkbox').checked;
  const isScheduledForLater = scheduledTimeRaw && new Date(scheduledTimeRaw) > new Date();
  const autoApprove = await isAutoApproveLivesEnabled();
  const liveRecord = {
    id, username: currentUser, country: currentUserCountry, roomUrl: 'https://meet.jit.si/' + roomName,
    title: title || null, ticketPrice, isAudioOnly, category, visibility, linkedProductId, commentsDisabled, saveTranscript,
    scheduledTime: isScheduledForLater ? new Date(scheduledTimeRaw).toISOString() : null,
    status: isScheduledForLater ? 'scheduled' : (autoApprove ? 'approved' : 'pending'), createdAt: new Date().toISOString()
  };
  await saveWithRetry('live:' + id, liveRecord, true);
  if(isScheduledForLater){
    await notifyFollowersOfScheduledLive(liveRecord);
  } else if(autoApprove){
    const savedLive = await safeGet('live:' + id, true);
    if(savedLive) await notifyFollowersOfNewLive(savedLive);
  }
  closeLiveQuickStartPanel();
  showToast(isScheduledForLater ? 'Live programmé pour le ' + new Date(scheduledTimeRaw).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) + ' ✓' : (autoApprove ? (isAudioOnly ? 'Podcast validé automatiquement — visible par tous ✓' : 'Live validé automatiquement — visible par tous ✓') : 'Demande envoyée — en attente de validation ✓'));
}
async function notifyFollowersOfScheduledLive(l){
  const author = await safeGet('user:' + l.username, true);
  if(!author || !author.followers || author.followers.length === 0) return;
  for(const followerUsername of author.followers){
    const pref = await safeGet('livenotifypref:' + followerUsername + '__' + l.username, false).catch(() => null);
    const notifyAll = !pref || pref.notifyAll !== false;
    if(notifyAll) await createNotification(followerUsername, 'live_scheduled', l.username, l.id, null);
  }
}
async function startScheduledLiveNow(liveId){
  const l = await safeGet('live:' + liveId, true);
  if(!l || l.username !== currentUser) return;
  const autoApprove = await isAutoApproveLivesEnabled();
  l.status = autoApprove ? 'approved' : 'pending';
  await saveWithRetry('live:' + liveId, l, true);
  if(autoApprove) await notifyFollowersOfNewLive(l);
  showToast(autoApprove ? 'Live démarré — visible par tous ✓' : 'Demande envoyée — en attente de validation ✓');
  openLiveView(liveId);
}
async function cancelScheduledLive(liveId){
  const l = await safeGet('live:' + liveId, true);
  if(!l || l.username !== currentUser) return;
  if(!confirm('Annuler ce live programmé ? Les personnes inscrites pour un rappel seront prévenues.')) return;
  const keys = await safeList('user:', true);
  for(const k of keys){
    const u = await safeGet(k, true).catch(() => null);
    if(u && (u.liveReminders || []).includes(liveId)){
      await createNotification(u.username, 'live_cancelled', currentUser, liveId, null);
    }
  }
  await window.storage.delete('live:' + liveId, true).catch(() => {});
  showToast('Live annulé');
  await renderScheduledLivesOnProfile(currentUser, 'my-scheduled-lives');
}
async function sendLiveAuthRequestFromPanel(){
  const reason = document.getElementById('live-auth-reason-input').value.trim();
  if(!reason){ showToast('Expliquez votre demande'); return; }
  const id = 'liveauthreq_' + Date.now();
  await saveWithRetry('liveauthrequest:' + id, {
    id, username: currentUser, country: currentUserCountry, reason, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  closeLiveQuickStartPanel();
  showToast('Demande envoyée — en attente de validation ✓');
}
async function loadLiveEligibilityCard(){
  const el = document.getElementById('live-eligibility-card');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  const followerCount = (me && me.followers) ? me.followers.length : 0;
  const lives = await fetchLives();
  const myLive = lives.find(l => l.username === currentUser && (l.status === 'pending' || l.status === 'approved'));
  if(myLive){
    const statusLabel = myLive.status === 'pending' ? '⏳ En attente de validation par l’équipe' : '🔴 En direct — validé, visible par tous';
    el.innerHTML = '<p style="margin:0 0 10px; font-size:13px;">'+statusLabel+'</p>' +
      '<button class="btn btn-outline" onclick="confirmEndMyLive(\''+myLive.id+'\')">Terminer mon live</button>';
    return;
  }
  const authorizedOverride = me && me.liveAuthorizedOverride;
  if(followerCount >= LIVE_FOLLOWER_THRESHOLD || authorizedOverride){
    el.innerHTML = (authorizedOverride && followerCount < LIVE_FOLLOWER_THRESHOLD ? '<p style="margin:0 0 8px; font-size:12px; color:var(--gold);">✓ Autorisation spéciale accordée par l’administration.</p>' : '') +
      '<p style="margin:0 0 10px; font-size:13px; color:var(--lagoon);">✓ Vous pouvez démarrer un live.</p>' +
      '<button class="btn btn-primary" onclick="openLiveQuickStartPanel()">🔴 Démarrer un live</button>';
  } else {
    el.innerHTML = '<p style="margin:0; font-size:13px; color:rgba(245,239,227,0.6);">Les lives sont réservés aux comptes ayant '+LIVE_FOLLOWER_THRESHOLD.toLocaleString('fr-FR')+' abonnés ou plus. Il vous manque '+(LIVE_FOLLOWER_THRESHOLD - followerCount).toLocaleString('fr-FR')+' abonné(s).</p>' +
      '<button class="btn btn-outline" style="margin-top:10px;" onclick="openLiveQuickStartPanel()">Demander une autorisation</button>';
  }
}
/* ---------- FIL DÉDIÉ AUX LIVES EN DIRECT ---------- */
const LIVE_CATEGORIES = { autre: 'Autre', ecommerce: '🛍️ E-commerce', consultation: '💬 Consultation', cuisine: '🍲 Cuisine', musique: '🎵 Musique', education: '🎓 Éducation', mode: '👗 Mode', sport: '⚽ Sport', talk: '🎤 Discussion' };
let currentLiveCategoryFilter = 'all';
async function openLivesFeed(){
  if(!requireAccount('Créez un compte pour regarder les lives')) return;
  go('lives-feed');
  await renderLivesFeedList();
}
function selectLiveCategoryFilter(cat){
  currentLiveCategoryFilter = cat;
  renderLivesFeedList();
}
async function isLiveVisibleToCurrentUser(l){
  if(l.username === currentUser) return true;
  if(!l.visibility || l.visibility === 'public') return true;
  if(l.visibility === 'private') return false;
  if(l.visibility === 'followers'){
    const streamer = await safeGet('user:' + l.username, true).catch(() => null);
    return !!(streamer && streamer.followers && streamer.followers.includes(currentUser));
  }
  return true;
}
async function renderLivesFeedList(){
  const tabsEl = document.getElementById('lives-category-tabs');
  const el = document.getElementById('lives-feed-list');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const approvedLives = (await fetchLives()).filter(l => l.status === 'approved');
  const visibilityChecks = await Promise.all(approvedLives.map(l => isLiveVisibleToCurrentUser(l)));
  const allLives = approvedLives.filter((l, i) => visibilityChecks[i]);
  tabsEl.innerHTML = '<button onclick="selectLiveCategoryFilter(\'all\')" style="flex-shrink:0; border:1px solid var(--line); border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(currentLiveCategoryFilter==='all'?'var(--coral)':'transparent')+'; color:'+(currentLiveCategoryFilter==='all'?'var(--night)':'var(--cream)')+';">Tous</button>' +
    Object.keys(LIVE_CATEGORIES).map(cat => '<button onclick="selectLiveCategoryFilter(\''+cat+'\')" style="flex-shrink:0; border:1px solid var(--line); border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(currentLiveCategoryFilter===cat?'var(--coral)':'transparent')+'; color:'+(currentLiveCategoryFilter===cat?'var(--night)':'var(--cream)')+'; margin-left:6px;">'+LIVE_CATEGORIES[cat]+'</button>').join('');
  const lives = currentLiveCategoryFilter === 'all' ? allLives : allLives.filter(l => (l.category || 'autre') === currentLiveCategoryFilter);
  if(lives.length === 0){
    el.innerHTML = '<div class="empty">'+(currentLiveCategoryFilter === 'all' ? 'Personne n’est en direct pour l’instant.<br>Revenez plus tard, ou lancez votre propre live depuis votre profil !' : 'Personne n’est en direct dans cette catégorie pour l’instant.')+'</div>';
    return;
  }
  el.innerHTML = lives.map(l =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openLiveView(\''+l.id+'\')">' +
    smallAvatarBadge(l.username, 40) +
    '<div style="flex:1;"><strong style="font-size:14px;">'+(l.isAudioOnly ? '🎙️ ' : '🔴 ')+'@'+escapeHtml(l.username)+'</strong>' +
    (l.title ? '<p style="margin:2px 0 0; font-size:12.5px; color:var(--cream);">'+escapeHtml(l.title)+'</p>' : '') +
    '<p style="margin:2px 0 0; font-size:11.5px; color:'+(l.isAudioOnly?'var(--lagoon)':'var(--coral)')+';">'+(l.isAudioOnly ? 'Podcast en direct' : 'Live en direct')+' · '+LIVE_CATEGORIES[l.category || 'autre']+(l.ticketPrice > 0 ? ' · 🎫 '+l.ticketPrice.toLocaleString('fr-FR')+' FCFA' : '')+'</p></div>' +
    '<span class="btn btn-primary btn-sm">Regarder</span>' +
    '</div>'
  ).join('');
}
async function fetchLives(){
  const keys = await safeList('live:', true);
  const lives = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) lives.push(l); }
  lives.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return lives;
}
async function startEducationalConference(){
  if(!(await requireEducationSubscription())) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.isTrainer){ showToast('Réservé aux formateurs validés'); return; }
  const scheduledTime = document.getElementById('conference-scheduled-time').value;
  const roomName = 'Suktum-Edu-' + currentUser + '-' + Math.random().toString(36).slice(2, 8);
  const id = 'live_' + Date.now();
  const autoApprove = await isAutoApproveLivesEnabled();
  await saveWithRetry('live:' + id, {
    id, username: currentUser, country: currentUserCountry, roomUrl: 'https://meet.jit.si/' + roomName,
    ticketPrice: 0, isEducational: true, scheduledTime: scheduledTime || null, reminderSent: false, status: autoApprove ? 'approved' : 'pending', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('conference-scheduled-time').value = '';
  if(autoApprove){
    showToast('Conférence validée automatiquement — visible par vos élèves ✓');
    await notifyStudentsTrainerIsLive(currentUser, id);
  } else {
    showToast('Demande de conférence envoyée — en attente de validation ✓');
  }
  await renderTrainerConferences();
}
async function renderTrainerConferences(){
  const el = document.getElementById('trainer-conferences-list');
  if(!el) return;
  const lives = await fetchLives();
  const myConfs = lives.filter(l => l.username === currentUser && l.isEducational);
  if(myConfs.length === 0){ el.innerHTML = ''; return; }
  const statusLabels = { pending: '⏳ En attente de validation', approved: '🔴 En direct — validée' };
  el.innerHTML = myConfs.map(l =>
    '<div class="card" style="display:flex; justify-content:space-between; align-items:center;">' +
    '<span style="font-size:12.5px;">'+(statusLabels[l.status]||l.status)+(l.scheduledTime ? ' · ⏰ '+new Date(l.scheduledTime).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) : '')+'</span>' +
    (l.status === 'approved' ? '<button class="btn btn-outline btn-sm" onclick="openLiveView(\''+l.id+'\')">Rejoindre</button>' : '') +
    '</div>'
  ).join('');
}
async function startLive(){
  const roomName = 'Suktum-' + currentUser + '-' + Math.random().toString(36).slice(2, 8);
  const id = 'live_' + Date.now();
  const ticketInput = document.getElementById('live-ticket-price-input');
  const ticketPrice = ticketInput ? (parseInt(ticketInput.value, 10) || 0) : 0;
  const audioOnlyCheckbox = document.getElementById('live-audio-only-checkbox');
  const isAudioOnly = !!(audioOnlyCheckbox && audioOnlyCheckbox.checked);
  const categorySelect = document.getElementById('live-category-select');
  const category = categorySelect ? categorySelect.value : 'autre';
  const autoApprove = await isAutoApproveLivesEnabled();
  await saveWithRetry('live:' + id, {
    id, username: currentUser, country: currentUserCountry, roomUrl: 'https://meet.jit.si/' + roomName,
    ticketPrice, isAudioOnly, category, status: autoApprove ? 'approved' : 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast(autoApprove ? (isAudioOnly ? 'Podcast validé automatiquement — visible par tous ✓' : 'Live validé automatiquement — visible par tous ✓') : 'Demande envoyée — en attente de validation ✓');
  await renderProfile();
}
async function confirmEndMyLive(id){
  const l = await safeGet('live:' + id, true);
  if(!l) return;
  if(!confirm('Terminer votre live maintenant ? Un résumé de la session s’affichera ensuite.')) return;

  const viewerKeys = await safeList('liveviewer:' + id + '__', true);
  const chatKeys = await safeList('livechatmsg:' + id + '__', true);
  const durationMs = Date.now() - new Date(l.createdAt).getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));
  const peakViewers = Math.max(l.peakViewers || 0, viewerKeys.length);

  const allOrders = await fetchOrders().catch(() => []);
  const liveOrders = allOrders.filter(o => o.sourceLiveId === id);
  const allBookings = (await safeList('servicebooking:', true));
  let liveBookings = [];
  for(const k of allBookings){ const b = await safeGet(k, true).catch(() => null); if(b && b.sourceLiveId === id) liveBookings.push(b); }
  const revenue = liveOrders.reduce((s,o) => s + o.total, 0) + liveBookings.reduce((s,b) => s + b.price, 0);

  await endMyLive(id);

  window.__lastLiveDashboardData = {
    title: l.title, peakViewers, durationMin, messageCount: chatKeys.length, likes: l.liveLikes || 0,
    revenue, salesCount: liveOrders.length + liveBookings.length, endedAt: new Date().toISOString()
  };
  showPostLiveDashboard();
}
function showPostLiveDashboard(){
  const d = window.__lastLiveDashboardData;
  if(!d) return;
  const el = document.getElementById('post-live-dashboard-content');
  el.innerHTML = (d.title ? '<p style="margin:0 0 16px; font-size:14px; color:rgba(245,239,227,0.6);">'+escapeHtml(d.title)+'</p>' : '') +
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">👁️ Pic de spectateurs</p><p style="margin:0; font-size:24px; font-weight:700;">'+d.peakViewers+'</p></div>' +
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">⏱️ Durée totale</p><p style="margin:0; font-size:24px; font-weight:700;">'+d.durationMin+' min</p></div>' +
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">💬 Messages échangés</p><p style="margin:0; font-size:24px; font-weight:700;">'+d.messageCount+'</p></div>' +
    (d.revenue > 0
      ? '<div class="card" style="margin-bottom:10px; border-color:var(--gold);"><p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">💰 Chiffre d’affaires généré (produit/service épinglé)</p><p style="margin:0; font-size:24px; font-weight:700; color:var(--gold);">'+d.revenue.toLocaleString('fr-FR')+' FCFA</p><p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+d.salesCount+' vente(s)/réservation(s)</p></div>'
      : '<p style="margin:0 0 16px; font-size:12px; color:rgba(245,239,227,0.4);">Aucune vente attribuée à ce live.</p>') +
    '<button class="btn btn-outline" style="width:100%; margin-top:6px;" onclick="downloadPostLiveReport()">📥 Télécharger le rapport détaillé</button>' +
    '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="closePostLiveDashboard()">Fermer</button>';
  document.getElementById('post-live-dashboard-overlay').style.display = 'block';
}
function closePostLiveDashboard(){
  document.getElementById('post-live-dashboard-overlay').style.display = 'none';
  window.__lastLiveDashboardData = null;
}
async function downloadPostLiveReport(){
  const d = window.__lastLiveDashboardData;
  if(!d) return;
  const text = 'Suktum — Rapport de live\n\n' +
    (d.title ? 'Titre : ' + d.title + '\n' : '') +
    'Terminé le : ' + new Date(d.endedAt).toLocaleString('fr-FR') + '\n\n' +
    'Pic de spectateurs : ' + d.peakViewers + '\n' +
    'Durée totale : ' + d.durationMin + ' minute(s)\n' +
    'Messages échangés : ' + d.messageCount + '\n' +
    'J’aime reçus : ' + d.likes + '\n' +
    'Chiffre d’affaires généré : ' + d.revenue.toLocaleString('fr-FR') + ' FCFA (' + d.salesCount + ' vente(s)/réservation(s))';
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Rapport copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function endMyLive(id){
  const staleChatKeys = await safeList('livechatmsg:' + id + '__', true);
  const chatMessages = [];
  for(const k of staleChatKeys){ const m = await safeGet(k, true); if(m) chatMessages.push(m); }
  const liveForTranscriptCheck = await safeGet('live:' + id, true).catch(() => null);
  const shouldSaveTranscript = !liveForTranscriptCheck || liveForTranscriptCheck.saveTranscript !== false;
  if(chatMessages.length > 0 && shouldSaveTranscript){
    chatMessages.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    await saveWithRetry('livechattranscript:' + id, {
      liveId: id, streamerUsername: currentUser, messages: chatMessages, savedAt: new Date().toISOString()
    }, true);
  }
  const liveBeforeEnd = await safeGet('live:' + id, true).catch(() => null);
  const staleViewerKeys = await safeList('liveviewer:' + id + '__', true);
  if(liveBeforeEnd){
    await saveWithRetry('livehistory:' + id, {
      id, username: liveBeforeEnd.username, title: liveBeforeEnd.title || null, category: liveBeforeEnd.category || 'autre',
      isAudioOnly: !!liveBeforeEnd.isAudioOnly, viewerCount: staleViewerKeys.length, hasTranscript: chatMessages.length > 0 && shouldSaveTranscript,
      startedAt: liveBeforeEnd.createdAt, endedAt: new Date().toISOString()
    }, true);
  }
  if(liveBeforeEnd && liveBeforeEnd.isEducational){
    const attendees = staleViewerKeys.map(k => k.replace('liveviewer:' + id + '__', ''));
    await saveWithRetry('conferenceattendance:' + id, {
      liveId: id, trainerUsername: currentUser, scheduledTime: liveBeforeEnd.scheduledTime || null,
      attendees, endedAt: new Date().toISOString()
    }, true);
  }
  await window.storage.delete('live:' + id, true).catch(() => {});
  const staleRequestKeys = await safeList('livespeakrequest:' + id + '__', true);
  for(const k of staleRequestKeys){ await window.storage.delete(k, true).catch(() => {}); }
  const staleInviteKeys = await safeList('liveinvite:' + id + '__', true);
  for(const k of staleInviteKeys){ await window.storage.delete(k, true).catch(() => {}); }
  for(const k of staleChatKeys){ await window.storage.delete(k, true).catch(() => {}); }
  for(const k of staleViewerKeys){ await window.storage.delete(k, true).catch(() => {}); }
  showToast('Live terminé' + (chatMessages.length > 0 ? ' — compte-rendu du chat conservé' : ''));
  await renderProfile();
}
async function checkLivesBanner(){
  const el = document.getElementById('lives-banner');
  if(!el) return;
  const allLives = await fetchLives();
  const approvedLives = allLives.filter(l => l.status === 'approved');
  const visibilityChecks = await Promise.all(approvedLives.map(l => isLiveVisibleToCurrentUser(l)));
  const me = currentUser ? await safeGet('user:' + currentUser, true) : null;
  const myMutedForLives = new Set((me && me.muted) || []);
  const lives = approvedLives.filter((l, i) => visibilityChecks[i] && !myMutedForLives.has(l.username));
  const myFollowing = new Set((me && me.following) || []);
  const upcoming = allLives.filter(l => l.status === 'scheduled' && l.scheduledTime && new Date(l.scheduledTime) > new Date() && myFollowing.has(l.username));
  if(lives.length === 0 && upcoming.length === 0){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = lives.map(l =>
    '<div class="card" style="border-color:var(--coral); padding:8px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:6px;" onclick="openLiveView(\''+l.id+'\')">' +
    '<span style="display:flex; align-items:center; gap:8px; font-size:12.5px;">' + smallAvatarBadge(l.username, 26) +
    (l.isAudioOnly ? '🎙️ @' : '🔴 @')+escapeHtml(l.username)+(l.isAudioOnly ? ' anime un podcast' : ' est en direct')+'</span>' +
    '<span style="font-size:11px; color:var(--coral); font-weight:600;">Regarder</span>' +
    '</div>'
  ).join('') + upcoming.map(l =>
    '<div class="card" style="border-color:var(--gold); padding:8px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:6px;" onclick="openUserProfile(\''+escapeHtml(l.username)+'\')">' +
    '<span style="display:flex; align-items:center; gap:8px; font-size:12.5px;">' + smallAvatarBadge(l.username, 26) +
    '⏰ @'+escapeHtml(l.username)+' bientôt en direct</span>' +
    '<span style="font-size:11px; color:var(--gold); font-weight:600;" id="feed-countdown-'+l.id+'" data-scheduled="'+l.scheduledTime+'">--:--</span>' +
    '</div>'
  ).join('');
  if(upcoming.length > 0){
    if(feedCountdownInterval) clearInterval(feedCountdownInterval);
    const updateFeedCountdowns = () => {
      upcoming.forEach(l => {
        const countdownEl = document.getElementById('feed-countdown-' + l.id);
        if(!countdownEl) return;
        const diffMs = new Date(l.scheduledTime).getTime() - Date.now();
        if(diffMs <= 0){ countdownEl.textContent = 'Bientôt'; return; }
        const totalSec = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        countdownEl.textContent = (hours > 0 ? hours + 'h ' : '') + minutes + 'min';
      });
    };
    updateFeedCountdowns();
    feedCountdownInterval = setInterval(updateFeedCountdowns, 30000);
  }
}
let feedCountdownInterval = null;
let currentLiveView = null;
let currentJitsiApi = null;
let isLivePipActive = false;
let livePipLiveIdBeforeMinimize = null;
/* ---------- SONDAGE INSTANTANÉ DANS UN LIVE ---------- */
let livePollRefreshInterval = null;
async function renderLivePollSection(){
  const el = document.getElementById('live-poll-section');
  if(!el || !currentLiveView) return;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  currentLiveView = l;
  const isOwner = l.username === currentUser;
  const poll = l.currentPoll;

  if(!poll || !poll.active){
    el.innerHTML = isOwner ? (
      '<div class="card" style="margin-bottom:10px;">' +
      '<label style="margin-top:0;">🗳️ Lancer un sondage instantané</label>' +
      '<input type="text" id="live-poll-question-input" placeholder="Votre question...">' +
      '<input type="text" id="live-poll-option-0" placeholder="Option 1" style="margin-top:8px;">' +
      '<input type="text" id="live-poll-option-1" placeholder="Option 2" style="margin-top:8px;">' +
      '<input type="text" id="live-poll-option-2" placeholder="Option 3 (optionnel)" style="margin-top:8px;">' +
      '<button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="launchLivePoll()">Lancer le sondage</button>' +
      '</div>'
    ) : '';
    return;
  }

  const totalVotes = poll.options.reduce((s,o) => s + o.votes.length, 0);
  const hasVoted = poll.options.some(o => o.votes.includes(currentUser));
  el.innerHTML = '<div class="card" style="margin-bottom:10px; border-color:var(--gold);">' +
    '<p style="margin:0 0 10px; font-size:13px; font-weight:600;">🗳️ '+escapeHtml(poll.question)+'</p>' +
    poll.options.map((o, i) => {
      const pct = totalVotes > 0 ? Math.round(o.votes.length / totalVotes * 100) : 0;
      return (hasVoted || isOwner)
        ? '<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;"><span>'+escapeHtml(o.text)+'</span><span>'+pct+'%</span></div>' +
          '<div style="background:rgba(245,239,227,0.12); border-radius:6px; height:8px; overflow:hidden;"><div style="background:var(--lagoon); height:100%; width:'+pct+'%;"></div></div></div>'
        : '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:6px; text-align:left;" onclick="voteLivePoll('+i+')">'+escapeHtml(o.text)+'</button>';
    }).join('') +
    '<p style="margin:6px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+totalVotes+' vote(s)</p>' +
    (isOwner ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="endLivePoll()">Terminer le sondage</button>' : '') +
    '</div>';
}
async function launchLivePoll(){
  const question = document.getElementById('live-poll-question-input').value.trim();
  const opt0 = document.getElementById('live-poll-option-0').value.trim();
  const opt1 = document.getElementById('live-poll-option-1').value.trim();
  const opt2 = document.getElementById('live-poll-option-2').value.trim();
  if(!question || !opt0 || !opt1){ showToast('Renseignez la question et au moins 2 options'); return; }
  const options = [opt0, opt1].concat(opt2 ? [opt2] : []).map(text => ({ text, votes: [] }));
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  l.currentPoll = { question, options, active: true, createdAt: new Date().toISOString() };
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  showToast('Sondage lancé ✓');
  await renderLivePollSection();
}
async function voteLivePoll(optionIndex){
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l || !l.currentPoll || !l.currentPoll.active) return;
  if(l.currentPoll.options.some(o => o.votes.includes(currentUser))) return; // déjà voté
  l.currentPoll.options[optionIndex].votes.push(currentUser);
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  await renderLivePollSection();
}
async function endLivePoll(){
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l || !l.currentPoll) return;
  l.currentPoll.active = false;
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  showToast('Sondage terminé');
  await renderLivePollSection();
}
async function openLiveView(liveId){
  const lives = await fetchLives();
  const l = lives.find(x => x.id === liveId);
  if(!l){ showToast('Ce live n’est plus disponible'); return; }
  if(!(await isLiveVisibleToCurrentUser(l))){ showToast('Ce live n’est pas accessible pour vous'); return; }
  if((l.bannedUsers || []).includes(currentUser)){ showToast('Vous avez été exclu(e) de ce live'); return; }
  if(l.username !== currentUser && (l.peakViewers || 0) >= 50){
    const meForQuarantine = currentUser ? await safeGet('user:' + currentUser, true) : null;
    if(await isAccountInQuarantine(meForQuarantine)){ showToast('Les nouveaux comptes très actifs ne peuvent pas encore rejoindre les lives à forte audience'); return; }
  }
  currentLiveView = l;
  document.getElementById('live-view-title').innerHTML = smallAvatarBadge(l.username, 24) + ' 🔴 @' + escapeHtml(l.username);
  document.getElementById('live-view-subtitle').textContent = l.title || '';
  document.getElementById('gift-status').textContent = '';
  const linkedProductEl = document.getElementById('live-linked-product-card');
  if(linkedProductEl){
    if(l.linkedProductId){
      const linkedProduct = await safeGet('product:' + l.linkedProductId, true).catch(() => null);
      linkedProductEl.innerHTML = linkedProduct ? '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:12px; border-color:var(--gold);">' +
        (linkedProduct.image ? '<img src="'+linkedProduct.image+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">' : '') +
        '<div style="flex:1;"><p style="margin:0; font-size:13px; font-weight:600;">'+escapeHtml(linkedProduct.name)+'</p><p style="margin:2px 0 0; font-size:12px; color:var(--gold);">'+linkedProduct.price.toLocaleString('fr-FR')+' FCFA</p></div>' +
        '<button class="btn btn-primary btn-sm" onclick="currentPurchaseSourceLiveId=\''+l.id+'\'; '+(linkedProduct.isService ? 'openServiceBookingPicker(\''+linkedProduct.id+'\')' : 'openOrderScreen(\''+linkedProduct.id+'\')')+'">'+(linkedProduct.isService ? 'Réserver' : 'Acheter')+'</button></div>' : '';
    } else {
      linkedProductEl.innerHTML = '';
    }
  }
  document.getElementById('live-tap-like-count').textContent = l.liveLikes || 0;
  liveTapLikeBuffer = 0;

  const isOwner = l.username === currentUser;
  const isInCooldown = l.chatCooldownUntil && new Date(l.chatCooldownUntil) > new Date();
  const chatInputEl = document.getElementById('live-chat-input');
  if(chatInputEl){
    chatInputEl.style.display = ((l.commentsDisabled && !isOwner) || isInCooldown) ? 'none' : '';
    chatInputEl.placeholder = isInCooldown ? 'Chat en pause suite à des signalements' : (l.commentsDisabled && !isOwner) ? 'Commentaires désactivés' : 'Écrire dans le chat...';
  }
  if(!isOwner){
    const myInvite = await safeGet('liveinvite:' + liveId + '__' + currentUser, true);
    if(myInvite && !myInvite.joinedAt){
      myInvite.joinedAt = new Date().toISOString();
      await saveWithRetry('liveinvite:' + liveId + '__' + currentUser, myInvite, true);
    }
    wasActiveLiveGuestThisSession = !!myInvite;
  }
  const needsTicket = l.ticketPrice > 0 && !isOwner;
  if(needsTicket){
    const ticket = await safeGet('ticket:' + liveId + '__' + currentUser, true);
    if(!ticket || ticket.status !== 'approved'){
      const pendingReq = ticket && ticket.status === 'pending';
      document.getElementById('live-view-embed').innerHTML =
        '<div class="card" style="text-align:center;">' +
        '<p style="margin:0 0 10px; font-size:14px;">🎟️ Ce live est payant : <strong style="color:var(--gold);">'+l.ticketPrice.toLocaleString('fr-FR')+' FCFA</strong></p>' +
        (pendingReq
          ? '<p style="margin:0; font-size:12.5px; color:var(--gold);">⏳ Votre billet est en attente de validation.</p>'
          : '<button class="btn btn-primary" onclick="buyLiveTicket(\''+liveId+'\')">Acheter mon billet</button>') +
        '</div>';
      go('live-view');
      return;
    }
  }
  const isGuest = await hasLiveInvite(l.id, currentUser);
  const joinAsFullParticipant = isOwner || isGuest;
  const startWithVideoMuted = l.isAudioOnly || !(joinAsFullParticipant && !joinHideAppearance);
  const embedEl = document.getElementById('live-view-embed');
  embedEl.innerHTML =
    (l.isAudioOnly ? '<div class="card" style="text-align:center; margin-bottom:10px; border-color:var(--lagoon);"><p style="margin:0; font-size:12.5px; color:var(--lagoon);">🎙️ Podcast — audio uniquement</p></div>' : '') +
    '<div id="live-jitsi-container" style="position:relative; width:100%; padding-bottom:130%; border-radius:14px; overflow:hidden;"></div>';
  if(currentJitsiApi){ try{ currentJitsiApi.dispose(); }catch(e){} currentJitsiApi = null; }
  const roomName = l.roomUrl.replace('https://meet.jit.si/', '');
  if(window.JitsiMeetExternalAPI){
    currentJitsiApi = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName,
      parentNode: document.getElementById('live-jitsi-container'),
      width: '100%', height: '100%',
      configOverwrite: { startWithVideoMuted, prejoinPageEnabled: false },
      interfaceConfigOverwrite: { filmStripOnly: false }
    });
    currentJitsiApi.addEventListener('videoConferenceLeft', () => { clearLiveViewerHeartbeat(); renderLiveViewerCount(); });
  }
  if(isGuest){
    document.getElementById('live-pinned-product').insertAdjacentHTML('beforebegin',
      '<div class="card" style="border-color:var(--lagoon); margin-bottom:10px;"><p style="margin:0; font-size:12.5px; color:var(--lagoon);">🎥 Vous êtes invité(e) en duplex — votre caméra est active pour tous.</p></div>');
  }
  if(joinAsFullParticipant){
    document.getElementById('live-pinned-product').insertAdjacentHTML('beforebegin',
      '<div class="card" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">' +
      '<span style="font-size:12.5px;">🙈 Masquer mon apparence (caméra coupée)</span>' +
      '<label class="switch" style="position:relative; display:inline-block; width:42px; height:24px;">' +
      '<input type="checkbox" id="hide-appearance-toggle" '+(joinHideAppearance?'checked':'')+' onchange="toggleHideAppearance()" style="opacity:0; width:0; height:0;">' +
      '<span id="hide-appearance-visual" style="position:absolute; inset:0; background:'+(joinHideAppearance?'var(--lagoon)':'rgba(245,239,227,0.2)')+'; border-radius:30px;"></span>' +
      '</label></div>');
  }
  await renderLiveProductPinControls();
  await renderLiveModerationSettings();
  await renderLiveBrandOverlayControls();
  await renderLiveBrandOverlay(l);
  await renderLiveStreamerInviteControls();
  await renderLiveGuestRoster();
  await renderLiveTopGifters();
  await renderLiveRecentDonors();
  await renderLiveEarningsDashboard();
  await renderLiveBattleControls();
  const reportBtn = document.getElementById('report-live-btn');
  if(reportBtn) reportBtn.style.display = isOwner ? 'none' : 'block';
  await renderLivePinnedProduct();
  await renderLivePollSection();
  await renderLiveChat();
  await renderLiveSpeakRequestArea();
  await renderLiveSpeakRequestsStreamerList();
  await renderLiveGuestRoster();
  await renderLiveMuteEveryoneControl();
  await sendLiveViewerHeartbeat();
  await renderLiveViewerCount();
  if(livePollRefreshInterval) clearInterval(livePollRefreshInterval);
  livePollRefreshInterval = setInterval(async () => {
    if(!currentLiveView) return;
    const stillExists = await safeGet('live:' + currentLiveView.id, true);
    if(!stillExists){
      showToast('Ce live est terminé');
      if(isLivePipActive){ closeLivePip(); } else { clearInterval(livePollRefreshInterval); livePollRefreshInterval = null; clearLiveViewerHeartbeat(); if(currentJitsiApi){ try{ currentJitsiApi.dispose(); }catch(e){} currentJitsiApi = null; } go('feed'); }
      currentLiveView = null;
      return;
    }
    renderLivePollSection(); renderLiveChat(); renderLiveSpeakRequestsStreamerList(); renderLiveGuestRoster(); checkIfRemovedFromLiveGuestSpeaking(); sendLiveViewerHeartbeat(); renderLiveViewerCount(); checkForNewLiveGifts();
  }, 3000);
  await updateGiftButtonLabels('gift');
  seenLiveGiftIds = new Set();
  go('live-view');
}
/* ---------- BATTLES EN DIRECT ENTRE DEUX STREAMERS ---------- */
async function renderLiveBattleControls(){
  const el = document.getElementById('live-battle-controls');
  if(!el || !currentLiveView) return;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  const isOwner = l.username === currentUser;
  if(!isOwner){ el.innerHTML = ''; return; }
  const allLives = (await fetchLives()).filter(x => x.status === 'approved' && x.username !== currentUser);
  if(allLives.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card" style="margin-bottom:10px;"><label style="margin-top:0;">⚔️ Défier un autre streamer en battle</label>' +
    '<select id="battle-challenge-target"><option value="">Choisir...</option>' +
    allLives.map(x => '<option value="'+x.id+'">@'+escapeHtml(x.username)+'</option>').join('') +
    '</select><button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="challengeToBattle()">Envoyer le défi</button></div>';
}
async function challengeToBattle(){
  const targetLiveId = document.getElementById('battle-challenge-target').value;
  if(!targetLiveId){ showToast('Choisissez un streamer à défier'); return; }
  const targetLive = await safeGet('live:' + targetLiveId, true);
  if(!targetLive){ showToast('Ce live n’existe plus'); return; }
  const id = 'battle_' + Date.now();
  await saveWithRetry('battle:' + id, {
    id, streamerA: currentUser, streamerB: targetLive.username, liveIdA: currentLiveView.id, liveIdB: targetLiveId,
    status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await createNotification(targetLive.username, 'battle_challenge', currentUser, id);
  showToast('Défi envoyé à @' + targetLive.username + ' ✓');
}
async function acceptBattle(battleId){
  const b = await safeGet('battle:' + battleId, true);
  if(!b || b.streamerB !== currentUser) return;
  b.status = 'active';
  b.startedAt = new Date().toISOString();
  await saveWithRetry('battle:' + battleId, b, true);
  await createNotification(b.streamerA, 'battle_accepted', currentUser, battleId);
  await openLiveBattle(battleId);
}
async function declineBattle(battleId){
  const b = await safeGet('battle:' + battleId, true);
  if(!b || b.streamerB !== currentUser) return;
  b.status = 'declined';
  await saveWithRetry('battle:' + battleId, b, true);
  showToast('Défi refusé');
}
let currentBattleId = null;
let battleRefreshInterval = null;
async function openLiveBattle(battleId){
  const b = await safeGet('battle:' + battleId, true);
  if(!b){ showToast('Battle introuvable'); return; }
  currentBattleId = battleId;
  go('live-battle');
  const liveA = await safeGet('live:' + b.liveIdA, true);
  const liveB = await safeGet('live:' + b.liveIdB, true);
  if(liveA) document.getElementById('battle-iframe-a').src = liveA.roomUrl;
  if(liveB) document.getElementById('battle-iframe-b').src = liveB.roomUrl;
  document.getElementById('battle-support-a-btn').textContent = '🎁 Soutenir @' + b.streamerA + ' (500 FCFA)';
  document.getElementById('battle-support-b-btn').textContent = '🎁 Soutenir @' + b.streamerB + ' (500 FCFA)';
  const isParticipant = (currentUser === b.streamerA || currentUser === b.streamerB);
  document.getElementById('battle-end-controls').innerHTML = (isParticipant && b.status === 'active')
    ? '<button class="btn btn-outline btn-sm" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="endBattle(\''+battleId+'\')">🏁 Terminer le battle</button>'
    : '';
  await renderBattleScore();
  if(battleRefreshInterval) clearInterval(battleRefreshInterval);
  battleRefreshInterval = setInterval(renderBattleScore, 4000);
}
async function fetchBattleGifts(battleId){
  const keys = await safeList('gift:', true);
  const gifts = [];
  for(const k of keys){ const g = await safeGet(k, true); if(g && g.battleId === battleId) gifts.push(g); }
  return gifts;
}
async function renderBattleScore(){
  const el = document.getElementById('battle-score-bar');
  if(!el || !currentBattleId) return;
  const b = await safeGet('battle:' + currentBattleId, true);
  if(!b) return;
  const gifts = await fetchBattleGifts(currentBattleId);
  const scoreA = gifts.filter(g => g.battleSide === 'A').reduce((s,g) => s + g.amount, 0);
  const scoreB = gifts.filter(g => g.battleSide === 'B').reduce((s,g) => s + g.amount, 0);
  const total = scoreA + scoreB;
  const pctA = total > 0 ? Math.round(scoreA / total * 100) : 50;
  el.innerHTML = '<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>@'+escapeHtml(b.streamerA)+' — '+scoreA.toLocaleString('fr-FR')+' FCFA</span><span>@'+escapeHtml(b.streamerB)+' — '+scoreB.toLocaleString('fr-FR')+' FCFA</span></div>' +
    '<div style="background:var(--coral); border-radius:8px; height:10px; overflow:hidden; display:flex;"><div style="background:var(--lagoon); width:'+pctA+'%;"></div></div>' +
    (b.status === 'finished' ? '<p style="margin:8px 0 0; font-size:13px; color:var(--gold); text-align:center;">🏆 '+(b.winner ? 'Vainqueur : @'+escapeHtml(b.winner) : 'Égalité')+'</p>' : '');
}
async function sendBattleGift(side, amount){
  if(!requireAccount('Créez un compte pour soutenir un camp')) return;
  const b = await safeGet('battle:' + currentBattleId, true);
  if(!b || b.status !== 'active'){ showToast('Ce battle est terminé'); return; }
  const toUser = side === 'A' ? b.streamerA : b.streamerB;
  const rate = await getGiftCommissionRate();
  const commissionAmount = Math.round(amount * rate / 100);
  const netAmount = amount - commissionAmount;
  const id = 'gift_' + Date.now();
  await saveWithRetry('gift:' + id, {
    id, postId: null, fromUser: currentUser, toUser, battleId: currentBattleId, battleSide: side,
    country: currentUserCountry, amount, commissionRate: rate, commissionAmount, netAmount,
    createdAt: new Date().toISOString()
  }, true);
  showToast('Soutien envoyé à @' + toUser + ' ✓');
  await renderBattleScore();
}
async function endBattle(battleId){
  const b = await safeGet('battle:' + battleId, true);
  if(!b || (currentUser !== b.streamerA && currentUser !== b.streamerB)) return;
  const gifts = await fetchBattleGifts(battleId);
  const scoreA = gifts.filter(g => g.battleSide === 'A').reduce((s,g) => s + g.amount, 0);
  const scoreB = gifts.filter(g => g.battleSide === 'B').reduce((s,g) => s + g.amount, 0);
  b.status = 'finished';
  b.endedAt = new Date().toISOString();
  b.winner = scoreA > scoreB ? b.streamerA : (scoreB > scoreA ? b.streamerB : null);
  await saveWithRetry('battle:' + battleId, b, true);
  const otherStreamer = currentUser === b.streamerA ? b.streamerB : b.streamerA;
  await createNotification(otherStreamer, 'battle_finished', currentUser, battleId, b.winner || 'égalité');
  document.getElementById('battle-end-controls').innerHTML = '';
  await renderBattleScore();
  if(battleRefreshInterval){ clearInterval(battleRefreshInterval); battleRefreshInterval = null; }
}
/* ---------- LIVE À PLUSIEURS INVITÉS — ROSTER VISIBLE PAR TOUS ---------- */
async function renderLiveGuestRoster(){
  const l = currentLiveView;
  const el = document.getElementById('live-guest-roster');
  if(!el || !l) return;
  const keys = await safeList('liveinvite:' + l.id + '__', true);
  const activeGuests = [];
  for(const k of keys){
    const inv = await safeGet(k, true);
    if(inv && inv.joinedAt) activeGuests.push(inv.username);
  }
  if(activeGuests.length === 0){ el.innerHTML = ''; return; }
  const isOwner = l.username === currentUser;
  const coModerators = l.coModerators || [];
  el.innerHTML = '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 '+(isOwner?'6px':'0')+'; font-size:12.5px; color:var(--lagoon);">🎙️ En direct avec '+activeGuests.map(u => '@'+escapeHtml(u)+(coModerators.includes(u) ? ' 🛡️' : '')).join(', ')+'</p>' +
    (isOwner ? activeGuests.map(u => '<div style="display:inline-block; margin:4px 6px 0 0;"><span onclick="removeLiveGuest(\''+escapeHtml(u)+'\')" style="font-size:11px; color:var(--coral); cursor:pointer; margin-right:8px;">Retirer @'+escapeHtml(u)+'</span><span onclick="toggleLiveCoModerator(\''+escapeHtml(u)+'\')" style="font-size:11px; color:var(--gold); cursor:pointer;">'+(coModerators.includes(u) ? 'Retirer la co-animation' : '🛡️ Rendre co-animateur')+'</span></div>').join('') : '') +
    '</div>';
}
/* ---------- CHAT EN DIRECT + MODE "ABONNÉS UNIQUEMENT" ---------- */
async function fetchLiveChatMessages(liveId){
  const keys = await safeList('livechatmsg:' + liveId + '__', true);
  const msgs = [];
  for(const k of keys){ const m = await safeGet(k, true); if(m) msgs.push({...m, key: k}); }
  msgs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return msgs.slice(-30);
}
function containsLink(text){
  return /https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,}/i.test(text);
}
async function isAccountInQuarantine(u){
  if(!u) return false;
  const accountAgeMs = Date.now() - new Date(u.createdAt).getTime();
  if(accountAgeMs > 60*60*1000) return false; // quarantaine limitée à la première heure du compte
  return (u.earlyActivityCount || 0) >= 8; // pic d'activité réel dans cette première heure
}
async function trackEarlyActivity(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  const accountAgeMs = Date.now() - new Date(u.createdAt).getTime();
  if(accountAgeMs > 60*60*1000) return; // ne compte que la première heure
  u.earlyActivityCount = (u.earlyActivityCount || 0) + 1;
  await saveWithRetry('user:' + username, u, true);
}
async function canSendLiveChat(l){
  if(l.chatCooldownUntil && new Date(l.chatCooldownUntil) > new Date()) return false;
  if((l.mutedUsers || []).includes(currentUser)) return false;
  if(!l.subscribersOnlyChat) return true;
  if(l.username === currentUser) return true;
  const streamer = await safeGet('user:' + l.username, true);
  return !!(streamer && (streamer.followers || []).includes(currentUser));
}
async function isLiveChatModerator(l){
  if(!l || !currentUser) return false;
  if(l.username === currentUser) return true;
  return (l.chatModerators || []).includes(currentUser);
}
async function renderLiveChat(){
  const l = currentLiveView;
  if(!l) return;
  const msgsEl = document.getElementById('live-chat-messages');
  const msgs = await fetchLiveChatMessages(l.id);
  const isStreamer = await isLiveChatModerator(l);
  if(msgsEl){
    msgsEl.innerHTML = msgs.length === 0 ? '<p style="font-size:12px; color:rgba(245,239,227,0.4); margin:0;">Aucun message pour l’instant.</p>' : msgs.map(m =>
      '<div style="display:flex; align-items:flex-start; gap:6px; margin-bottom:4px;'+(l.pinnedChatKey === m.key ? ' background:rgba(242,183,5,0.1); border-radius:6px; padding:4px;' : '')+'">' +
      (l.pinnedChatKey === m.key ? '<span style="font-size:11px;">📌</span>' : '') +
      '<p style="margin:0; font-size:12.5px; flex:1;"><span style="color:var(--lagoon); cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(m.username)+'\')">@'+escapeHtml(m.username)+'</span> '+escapeHtml(m.text)+'</p>' +
      (isStreamer ? '<span onclick="openLiveChatModerationMenu(\''+m.key+'\')" style="font-size:15px; cursor:pointer; padding:2px 4px; flex-shrink:0;">⋮</span>' : '') +
      '</div>'
    ).join('');
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  const canSend = await canSendLiveChat(l);
  const inputArea = document.getElementById('live-chat-input-area');
  const restrictedMsg = document.getElementById('live-chat-restricted-message');
  if(inputArea) inputArea.style.display = canSend ? 'flex' : 'none';
  if(restrictedMsg) restrictedMsg.style.display = canSend ? 'none' : 'block';
  const toggleEl = document.getElementById('live-chat-subscribers-toggle');
  if(toggleEl){
    toggleEl.innerHTML = (l.username === currentUser)
      ? '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><input type="checkbox" id="subscribers-only-toggle" style="width:auto;" '+(l.subscribersOnlyChat ? 'checked' : '')+' onchange="toggleSubscribersOnlyChat()"><label style="margin:0; font-size:12px;" for="subscribers-only-toggle">🔒 Chat réservé à mes abonnés</label></div>'
      : '';
  }
}
async function openLiveChatModerationMenu(msgKey){
  const l = currentLiveView;
  if(!l || !(await isLiveChatModerator(l))) return;
  const msg = await safeGet(msgKey, true);
  const items = [];
  items.push({ icon: l.pinnedChatKey === msgKey ? '📌' : '📌', label: l.pinnedChatKey === msgKey ? 'Désépingler' : 'Épingler ce message', action: 'closeGenericKebabMenu(); toggleLiveChatPin(\''+msgKey+'\')' });
  items.push({ icon: '🗑️', label: 'Supprimer ce message', action: 'closeGenericKebabMenu(); deleteLiveChatMessage(\''+msgKey+'\')' });
  if(msg && msg.username !== l.username){
    const isMuted = (l.mutedUsers || []).includes(msg.username);
    items.push({ icon: isMuted ? '🔊' : '🔇', label: isMuted ? 'Réactiver le chat de @'+msg.username : 'Rendre muet @'+msg.username, action: 'closeGenericKebabMenu(); toggleMuteLiveUser(\''+msg.username+'\')' });
    items.push({ icon: '🚫', label: 'Exclure @'+msg.username+' du live', action: 'closeGenericKebabMenu(); kickUserFromLive(\''+msg.username+'\')' });
  }
  openGenericKebabMenu(items);
}
async function toggleLiveChatPin(msgKey){
  const l = currentLiveView;
  if(!l || !(await isLiveChatModerator(l))) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  fresh.pinnedChatKey = fresh.pinnedChatKey === msgKey ? null : msgKey;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  await renderLiveChat();
}
async function deleteLiveChatMessage(msgKey){
  const l = currentLiveView;
  if(!l || !(await isLiveChatModerator(l))) return;
  await window.storage.delete(msgKey, true).catch(() => {});
  if(l.pinnedChatKey === msgKey){
    const fresh = await safeGet('live:' + l.id, true);
    if(fresh){ fresh.pinnedChatKey = null; await saveWithRetry('live:' + l.id, fresh, true); currentLiveView = fresh; }
  }
  showToast('Message supprimé');
  await renderLiveChat();
}
async function toggleMuteLiveUser(username){
  const l = currentLiveView;
  if(!l || !(await isLiveChatModerator(l)) || username === l.username) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  const muted = new Set(fresh.mutedUsers || []);
  const wasMuted = muted.has(username);
  if(wasMuted) muted.delete(username); else muted.add(username);
  fresh.mutedUsers = Array.from(muted);
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast(wasMuted ? '@'+username+' peut de nouveau écrire' : '@'+username+' a été rendu(e) muet(te)');
  await renderLiveChat();
}
async function kickUserFromLive(username){
  const l = currentLiveView;
  if(!l || !(await isLiveChatModerator(l)) || username === l.username) return;
  if(!confirm('Exclure @'+username+' de ce live ? Cette personne ne pourra plus le rejoindre.')) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  const banned = new Set(fresh.bannedUsers || []);
  banned.add(username);
  fresh.bannedUsers = Array.from(banned);
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  await window.storage.delete('liveviewer:' + l.id + '__' + username, true).catch(() => {});
  showToast('@'+username+' a été exclu(e) du live');
}
async function toggleSubscribersOnlyChat(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  fresh.subscribersOnlyChat = document.getElementById('subscribers-only-toggle').checked;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast(fresh.subscribersOnlyChat ? 'Chat réservé aux abonnés ✓' : 'Chat ouvert à tous');
  await renderLiveChat();
}
async function sendLiveChatMessage(){
  const l = currentLiveView;
  if(!l) return;
  if(!requireAccount('Créez un compte pour discuter en direct')) return;
  if(l.commentsDisabled && l.username !== currentUser){ showToast('Les commentaires sont désactivés pour ce live'); return; }
  const canSend = await canSendLiveChat(l);
  if(!canSend){ showToast('Ce chat est réservé aux abonnés du streamer'); return; }
  const input = document.getElementById('live-chat-input');
  const text = input.value.trim();
  if(!text) return;
  const platformWords = await getForbiddenWords();
  const allBlockedWords = platformWords.concat(l.customBlacklist || []);
  if(containsForbiddenWord(text, allBlockedWords)){ showToast('Ce message contient un mot non autorisé'); return; }
  const me = await safeGet('user:' + currentUser, true);
  if(containsLink(text) && (await isAccountInQuarantine(me))){ showToast('Les nouveaux comptes très actifs ne peuvent pas encore partager de liens'); return; }
  const id = 'livechatmsg_' + Date.now();
  await saveWithRetry('livechatmsg:' + l.id + '__' + id, {
    liveId: l.id, username: currentUser, text: text.slice(0, 200), createdAt: new Date().toISOString()
  }, true);
  input.value = '';
  await renderLiveChat();
  await trackEarlyActivity(currentUser);
}
async function renderLiveBrandOverlayControls(){
  const l = currentLiveView;
  const el = document.getElementById('live-brand-overlay-controls');
  if(!el) return;
  if(!l || l.username !== currentUser){ el.innerHTML = ''; return; }
  const brand = l.brandOverlay || { enabled: false, color: '#E8552F', showLogo: false };
  el.innerHTML = '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 8px; font-size:12.5px; font-weight:600;">🎨 Habillage visuel de marque</p>' +
    '<p style="margin:0 0 8px; font-size:10.5px; color:rgba(245,239,227,0.4);">Un cadre visuel affiché uniquement sur l’écran Suktum — pas un filtre appliqué à la vidéo elle-même.</p>' +
    '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">' +
    '<input type="checkbox" id="brand-overlay-enabled-checkbox" style="width:auto;" '+(brand.enabled ? 'checked' : '')+'>' +
    '<label style="margin:0; font-size:12.5px;" for="brand-overlay-enabled-checkbox">Activer le cadre de marque</label>' +
    '</div>' +
    '<label style="margin-top:0;">Couleur de marque</label>' +
    '<input type="color" id="brand-overlay-color-input" value="'+brand.color+'">' +
    '<div style="display:flex; align-items:center; gap:8px; margin-top:8px;">' +
    '<input type="checkbox" id="brand-overlay-logo-checkbox" style="width:auto;" '+(brand.showLogo ? 'checked' : '')+'>' +
    '<label style="margin:0; font-size:12.5px;" for="brand-overlay-logo-checkbox">Afficher mon avatar en filigrane</label>' +
    '</div>' +
    '<button class="btn btn-outline btn-sm" style="margin-top:10px; width:100%;" onclick="saveLiveBrandOverlay()">Appliquer</button>' +
    '</div>';
}
async function saveLiveBrandOverlay(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  fresh.brandOverlay = {
    enabled: document.getElementById('brand-overlay-enabled-checkbox').checked,
    color: document.getElementById('brand-overlay-color-input').value,
    showLogo: document.getElementById('brand-overlay-logo-checkbox').checked
  };
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast('Habillage mis à jour ✓');
  await renderLiveBrandOverlay(fresh);
}
async function renderLiveBrandOverlay(l){
  const el = document.getElementById('live-brand-overlay');
  if(!el) return;
  const brand = l.brandOverlay;
  if(!brand || !brand.enabled){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.innerHTML = '<div style="position:absolute; inset:0; border:4px solid '+brand.color+'; border-radius:14px;"></div>' +
    (brand.showLogo ? '<div style="position:absolute; bottom:10px; right:10px;">' + smallAvatarBadge(l.username, 40) + '</div>' : '');
}
async function renderLiveModerationSettings(){
  const l = currentLiveView;
  const el = document.getElementById('live-moderation-settings');
  if(!el) return;
  if(!l || l.username !== currentUser){ el.innerHTML = ''; return; }
  const chatModerators = l.chatModerators || [];
  const blacklist = l.customBlacklist || [];
  el.innerHTML = '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 8px; font-size:12.5px; font-weight:600;">🛡️ Modérateurs désignés</p>' +
    (chatModerators.length === 0 ? '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun pour l’instant.</p>' :
      chatModerators.map(m => '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;"><span style="flex:1; font-size:12.5px;">@'+escapeHtml(m)+'</span><span onclick="removeLiveChatModerator(\''+escapeHtml(m)+'\')" style="font-size:12px; color:var(--coral); cursor:pointer;">Retirer</span></div>').join('')) +
    '<div style="display:flex; gap:6px; margin-top:6px;"><input type="text" id="new-live-chat-moderator-input" placeholder="Nom d’utilisateur" style="margin:0; flex:1;"><button class="btn btn-outline btn-sm" onclick="addLiveChatModerator()">Ajouter</button></div>' +
    '</div>' +
    '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 8px; font-size:12.5px; font-weight:600;">🚫 Liste noire personnalisée</p>' +
    (blacklist.length === 0 ? '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun mot ajouté. Les mots interdits de la plateforme s’appliquent déjà.</p>' :
      '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.6);">'+blacklist.map(w => escapeHtml(w)).join(', ')+'</p>') +
    '<div style="display:flex; gap:6px;"><input type="text" id="new-live-blacklist-word-input" placeholder="Ajouter un mot" style="margin:0; flex:1;"><button class="btn btn-outline btn-sm" onclick="addLiveBlacklistWord()">Ajouter</button></div>' +
    '</div>';
}
async function addLiveChatModerator(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const username = document.getElementById('new-live-chat-moderator-input').value.trim();
  if(!username || username === currentUser) return;
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe pas'); return; }
  const fresh = await safeGet('live:' + l.id, true);
  const chatModerators = new Set(fresh.chatModerators || []);
  chatModerators.add(username);
  fresh.chatModerators = Array.from(chatModerators);
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast('@'+username+' est maintenant modérateur ✓');
  await renderLiveModerationSettings();
}
async function removeLiveChatModerator(username){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  fresh.chatModerators = (fresh.chatModerators || []).filter(m => m !== username);
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  await renderLiveModerationSettings();
}
async function addLiveBlacklistWord(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const word = document.getElementById('new-live-blacklist-word-input').value.trim().toLowerCase();
  if(!word) return;
  const fresh = await safeGet('live:' + l.id, true);
  const blacklist = new Set(fresh.customBlacklist || []);
  blacklist.add(word);
  fresh.customBlacklist = Array.from(blacklist);
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast('Mot ajouté à la liste noire ✓');
  await renderLiveModerationSettings();
}
async function renderLiveProductPinControls(){
  const l = currentLiveView;
  const el = document.getElementById('live-product-pin-controls');
  if(!el) return;
  if(!l || l.username !== currentUser){ el.innerHTML = ''; return; }
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
  if(myProducts.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">' +
    '<select id="live-pin-product-select" style="margin:0; flex:1;"><option value="">Aucun produit épinglé</option>' +
    myProducts.map(p => '<option value="'+p.id+'" '+(l.linkedProductId === p.id ? 'selected' : '')+'>'+(p.isService ? '💬 ' : '🛍️ ')+escapeHtml(p.name)+'</option>').join('') +
    '</select>' +
    '<button class="btn btn-outline btn-sm" onclick="updateLivePinnedProduct()">📌</button></div>';
}
async function updateLivePinnedProduct(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  fresh.linkedProductId = document.getElementById('live-pin-product-select').value || null;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast(fresh.linkedProductId ? 'Produit épinglé ✓' : 'Produit retiré');
  await openLiveView(l.id);
}
async function renderLiveStreamerInviteControls(){
  const l = currentLiveView;
  const el = document.getElementById('live-streamer-invite-controls');
  if(!el) return;
  if(!l || l.username !== currentUser){ el.innerHTML = ''; return; }
  const activeCount = await countActiveLiveGuests(l.id);
  el.innerHTML = '<button class="btn btn-outline" style="margin-bottom:10px; width:100%;" onclick="go(\'live-invite\')">🎥 Inviter des amis en duplex</button>' +
    '<div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;"><label style="margin:0; font-size:12px; flex:1;">🔢 Invités simultanés max</label><input type="number" id="live-max-guests-input" min="1" max="12" value="'+(l.maxGuests || 4)+'" style="margin:0; width:60px;" onchange="updateLiveMaxGuests()"></div>' +
    '<p style="font-size:11px; color:rgba(245,239,227,0.5); margin:0 0 10px;">'+activeCount+' invité(s) actuellement en parole sur '+(l.maxGuests || 4)+' max.</p>' +
    '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:0 0 10px;">Pour couper le micro ou retirer un invité, utilisez les contrôles du salon vidéo lui-même — vous en êtes le modérateur.</p>';
}
let currentPurchaseSourceLiveId = null;
let joinHideAppearance = false;
function toggleHideAppearance(){
  joinHideAppearance = document.getElementById('hide-appearance-toggle').checked;
  document.getElementById('hide-appearance-visual').style.background = joinHideAppearance ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  if(currentLiveView) openLiveView(currentLiveView.id);
}
async function hasLiveInvite(liveId, username){
  const invite = await safeGet('liveinvite:' + liveId + '__' + username, true);
  return !!invite;
}
async function renderLiveInvitePicker(){
  const el = document.getElementById('live-invite-friends-list');
  const me = await safeGet('user:' + currentUser, true);
  const following = (me && me.following) || [];
  if(following.length === 0){
    el.innerHTML = '<div class="empty">Vous ne suivez encore personne à inviter.</div>';
    return;
  }
  const invitesSent = [];
  for(const u of following){
    const inv = await safeGet('liveinvite:' + currentLiveView.id + '__' + u, true);
    if(inv) invitesSent.push(u);
  }
  el.innerHTML = following.map(u =>
    '<div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
    '<span style="display:flex; align-items:center; gap:10px; font-size:13px;">' + smallAvatarBadge(u, 30) + '@'+escapeHtml(u) + '</span>' +
    (invitesSent.includes(u)
      ? '<span style="font-size:11.5px; color:var(--lagoon);">✓ Invité(e)</span>'
      : '<button class="btn btn-primary btn-sm" onclick="inviteLiveGuest(\''+escapeHtml(u)+'\')">Inviter</button>') +
    '</div>'
  ).join('');
}
/* ---------- DEMANDE DE PAROLE EN LIVE (VIEWER → STREAMER) ---------- */
async function renderLiveSpeakRequestArea(){
  const l = currentLiveView;
  const el = document.getElementById('live-speak-request-viewer-area');
  if(!el || !l) return;
  if(l.username === currentUser){ el.innerHTML = ''; return; }
  if(!currentUser){ el.innerHTML = ''; return; }
  const existingInvite = await safeGet('liveinvite:' + l.id + '__' + currentUser, true);
  if(existingInvite){ el.innerHTML = ''; return; }
  const existingRequest = await safeGet('livespeakrequest:' + l.id + '__' + currentUser, true);
  el.innerHTML = existingRequest
    ? '<p style="font-size:11.5px; color:var(--gold); margin:0;">🖐️ Demande de parole envoyée — en attente de réponse du streamer</p>'
    : '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="requestToSpeakLive()">🖐️ Demander la parole</button>';
}
async function requestToSpeakLive(){
  if(!requireAccount('Créez un compte pour demander la parole')) return;
  const l = currentLiveView;
  if(!l) return;
  await saveWithRetry('livespeakrequest:' + l.id + '__' + currentUser, {
    liveId: l.id, username: currentUser, createdAt: new Date().toISOString()
  }, true);
  showToast('Demande envoyée ✓');
  await createNotification(l.username, 'live_speak_request', currentUser, l.id, null);
  await renderLiveSpeakRequestArea();
}
async function renderLiveSpeakRequestsStreamerList(){
  const l = currentLiveView;
  const el = document.getElementById('live-speak-requests-streamer-list');
  if(!el || !l || !(await isLiveModerator(l, currentUser))){ if(el) el.innerHTML = ''; return; }
  const keys = await safeList('livespeakrequest:' + l.id + '__', true);
  const requests = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) requests.push(r); }
  if(requests.length === 0){ el.innerHTML = ''; return; }
  requests.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  el.innerHTML = '<div class="card"><p style="margin:0 0 8px; font-size:12.5px; font-weight:600;">🖐️ Demandes de parole ('+requests.length+')</p>' +
    requests.map(r => '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="flex:1; font-size:13px;">@'+escapeHtml(r.username)+'</span>' +
      '<button class="btn btn-primary btn-sm" onclick="acceptLiveSpeakRequest(\''+escapeHtml(r.username)+'\')">Accepter</button>' +
      '<button class="btn btn-outline btn-sm" onclick="declineLiveSpeakRequest(\''+escapeHtml(r.username)+'\')">Refuser</button></div>'
    ).join('') + '</div>';
}
async function renderLiveMuteEveryoneControl(){
  const l = currentLiveView;
  const el = document.getElementById('live-mute-everyone-area');
  if(!el || !l) return;
  const isMod = await isLiveModerator(l, currentUser);
  el.innerHTML = isMod
    ? '<button class="btn btn-outline btn-sm" style="width:100%;" onclick="muteEveryoneInLive()">🔇 Couper le micro de tout le monde</button>'
    : '';
}
function muteEveryoneInLive(){
  if(!currentJitsiApi){ showToast('Le salon vidéo n’est pas encore prêt'); return; }
  currentJitsiApi.executeCommand('muteEveryone', 'audio');
  showToast('Micro coupé pour tout le monde ✓');
}
async function isLiveModerator(l, username){
  if(!l || !username) return false;
  if(l.username === username) return true;
  return (l.coModerators || []).includes(username);
}
async function toggleLiveCoModerator(username){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  if(!fresh.coModerators) fresh.coModerators = [];
  const idx = fresh.coModerators.indexOf(username);
  if(idx === -1){
    fresh.coModerators.push(username);
    showToast('@' + username + ' est maintenant co-animateur(trice) avec pouvoir de modération ✓');
    await createNotification(username, 'live_comod_granted', currentUser, l.id, null);
  } else {
    fresh.coModerators.splice(idx, 1);
    showToast('@' + username + ' n’est plus co-animateur(trice)');
  }
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  await renderLiveGuestRoster();
}
async function countActiveLiveGuests(liveId){
  const keys = await safeList('liveinvite:' + liveId + '__', true);
  let count = 0;
  for(const k of keys){ const inv = await safeGet(k, true); if(inv && inv.joinedAt) count++; }
  return count;
}
async function updateLiveMaxGuests(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const val = parseInt(document.getElementById('live-max-guests-input').value, 10);
  if(isNaN(val) || val < 1) return;
  const fresh = await safeGet('live:' + l.id, true);
  if(!fresh) return;
  fresh.maxGuests = val;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast('Limite mise à jour : ' + val + ' invité(s) max ✓');
}
async function acceptLiveSpeakRequest(username){
  const l = currentLiveView;
  if(!l || !(await isLiveModerator(l, currentUser))) return;
  const activeCount = await countActiveLiveGuests(l.id);
  if(activeCount >= (l.maxGuests || 4)){ showToast('Limite d’invités simultanés atteinte — retirez d’abord quelqu’un ou augmentez la limite'); return; }
  await window.storage.delete('livespeakrequest:' + l.id + '__' + username, true).catch(() => {});
  await inviteLiveGuest(username);
  await renderLiveSpeakRequestsStreamerList();
}
async function declineLiveSpeakRequest(username){
  const l = currentLiveView;
  if(!l || !(await isLiveModerator(l, currentUser))) return;
  await window.storage.delete('livespeakrequest:' + l.id + '__' + username, true).catch(() => {});
  showToast('Demande refusée');
  await createNotification(username, 'live_speak_declined', currentUser, l.id, null);
  await renderLiveSpeakRequestsStreamerList();
}
async function removeLiveGuest(username){
  const l = currentLiveView;
  if(!l || !(await isLiveModerator(l, currentUser))) return;
  if(!confirm('Retirer @' + username + ' de la parole ?')) return;
  await window.storage.delete('liveinvite:' + l.id + '__' + username, true).catch(() => {});
  showToast('@' + username + ' retiré(e) de la parole ✓');
  await createNotification(username, 'live_guest_removed', currentUser, l.id, null);
  await renderLiveGuestRoster();
}
/* ---------- COMPTEUR DE SPECTATEURS EN TEMPS RÉEL ---------- */
const LIVE_VIEWER_ACTIVE_THRESHOLD_MS = 8000;
async function sendLiveViewerHeartbeat(){
  const l = currentLiveView;
  if(!l || !currentUser) return;
  await saveWithRetry('liveviewer:' + l.id + '__' + currentUser, { lastSeenAt: new Date().toISOString() }, true);
}
async function renderLiveViewerCount(){
  const l = currentLiveView;
  const el = document.getElementById('live-viewer-count');
  if(!el || !l) return;
  const keys = await safeList('liveviewer:' + l.id + '__', true);
  let count = 0;
  for(const k of keys){
    const v = await safeGet(k, true);
    if(v && (Date.now() - new Date(v.lastSeenAt).getTime()) < LIVE_VIEWER_ACTIVE_THRESHOLD_MS) count++;
  }
  el.textContent = count > 0 ? '👁️ ' + count : '';
  if(l.username === currentUser && count > (l.peakViewers || 0)){
    const fresh = await safeGet('live:' + l.id, true);
    if(fresh && count > (fresh.peakViewers || 0)){
      fresh.peakViewers = count;
      await saveWithRetry('live:' + l.id, fresh, true);
      currentLiveView = fresh;
    }
  }
}
async function renderLiveChatTranscriptsList(){
  const el = document.getElementById('live-chat-transcripts-list');
  if(!el || !currentUser) return;
  const keys = await safeList('livechattranscript:', true);
  const transcripts = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t && t.streamerUsername === currentUser) transcripts.push(t); }
  transcripts.sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt));
  if(transcripts.length === 0){ el.innerHTML = '<div class="empty">Aucun compte-rendu pour l’instant.</div>'; return; }
  el.innerHTML = transcripts.map(t =>
    '<div class="card" style="margin-bottom:8px; cursor:pointer;" onclick="openLiveChatTranscriptDetail(\''+t.liveId+'\')">' +
    '<p style="margin:0 0 4px; font-size:13px;">Live du '+new Date(t.savedAt).toLocaleString('fr-FR')+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+t.messages.length+' message(s)</p></div>'
  ).join('');
}
async function openLiveChatTranscriptDetail(liveId){
  const t = await safeGet('livechattranscript:' + liveId, true);
  if(!t) return;
  const isOwner = t.streamerUsername === currentUser;
  const streamer = isOwner ? null : await safeGet('user:' + t.streamerUsername, true).catch(() => null);
  const isFollower = streamer && streamer.followers && streamer.followers.includes(currentUser);
  if(!isOwner && !isFollower) return;
  go('live-chat-transcript-detail');
  document.getElementById('live-chat-transcript-detail-title').textContent = '💬 Live du ' + new Date(t.savedAt).toLocaleDateString('fr-FR');
  const el = document.getElementById('live-chat-transcript-detail-messages');
  el.innerHTML = t.messages.map(m =>
    '<p style="margin:0 0 6px; font-size:13px;"><span style="color:rgba(245,239,227,0.4); font-size:11px; margin-right:6px;">'+new Date(m.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</span><strong style="color:var(--lagoon);">@'+escapeHtml(m.username)+'</strong> '+escapeHtml(m.text)+'</p>'
  ).join('');
}
async function clearLiveViewerHeartbeat(){
  const l = currentLiveView;
  if(!l || !currentUser) return;
  await window.storage.delete('liveviewer:' + l.id + '__' + currentUser, true).catch(() => {});
}
async function checkIfRemovedFromLiveGuestSpeaking(){
  const l = currentLiveView;
  if(!l || !currentUser || l.username === currentUser) return;
  if(!wasActiveLiveGuestThisSession) return;
  const invite = await safeGet('liveinvite:' + l.id + '__' + currentUser, true);
  if(!invite){
    wasActiveLiveGuestThisSession = false;
    showToast('Le streamer vous a retiré(e) de la parole');
  }
}
let wasActiveLiveGuestThisSession = false;
async function inviteLiveGuest(username){
  if(!currentLiveView) return;
  await saveWithRetry('liveinvite:' + currentLiveView.id + '__' + username, {
    liveId: currentLiveView.id, username, invitedBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  await createNotification(username, 'live_invite', currentUser, currentLiveView.id, currentUser);
  showToast('@' + username + ' a été invité(e) ✓');
  await renderLiveInvitePicker();
}
async function renderLivePinnedProduct(){
  const l = currentLiveView;
  if(!l) return;
  const pinnedEl = document.getElementById('live-pinned-product');
  const controlsEl = document.getElementById('live-streamer-pin-controls');
  const isOwner = l.username === currentUser;

  if(l.pinnedProductId){
    const product = await safeGet('product:' + l.pinnedProductId, true);
    if(product){
      const flashSale = l.flashSale && l.flashSale.productId === l.pinnedProductId && new Date(l.flashSale.expiresAt) > new Date() ? l.flashSale : null;
      pinnedEl.innerHTML = '<div class="card" style="display:flex; gap:12px; align-items:center; border-color:var(--gold); margin-bottom:10px;">' +
        (product.image ? '<img src="'+product.image+'" style="width:52px; height:52px; border-radius:8px; object-fit:cover;">' : '') +
        '<div style="flex:1;"><strong style="font-size:13px;">📌 '+escapeHtml(product.name)+'</strong>' +
        (flashSale
          ? '<p style="font-size:12.5px; margin:2px 0 0;"><span style="text-decoration:line-through; color:rgba(245,239,227,0.4);">'+product.price.toLocaleString('fr-FR')+'</span> <strong style="color:var(--coral);">'+flashSale.discountedPrice.toLocaleString('fr-FR')+' FCFA</strong></p><p id="flash-sale-countdown" style="font-size:11.5px; color:var(--coral); margin:2px 0 0;">🔥 Vente flash — se termine dans <span id="flash-sale-timer"></span></p>'
          : '<p style="font-size:12.5px; color:var(--gold); margin:2px 0 0;">'+product.price.toLocaleString('fr-FR')+' FCFA</p>') +
        '</div>' +
        '<button class="btn btn-primary btn-sm" onclick="openOrderScreen(\''+product.id+'\')">Commander</button></div>';
      if(flashSale) startFlashSaleCountdown(flashSale.expiresAt);
    } else { pinnedEl.innerHTML = ''; }
  } else {
    pinnedEl.innerHTML = '';
  }

  if(isOwner){
    const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
    if(myProducts.length === 0){ controlsEl.innerHTML = ''; return; }
    controlsEl.innerHTML = '<select id="live-pin-select" style="margin-bottom:8px;">' +
      '<option value="">— Choisir un produit à épingler —</option>' +
      myProducts.map(p => '<option value="'+p.id+'"'+(l.pinnedProductId === p.id ? ' selected' : '')+'>'+escapeHtml(p.name)+'</option>').join('') +
      '</select>' +
      '<div style="display:flex; gap:8px;">' +
      '<button class="btn btn-outline btn-sm" onclick="pinLiveProduct()">📌 Épingler</button>' +
      (l.pinnedProductId ? '<button class="btn btn-outline btn-sm" onclick="unpinLiveProduct()">Retirer</button>' : '') +
      '</div>' +
      (l.pinnedProductId && !(l.flashSale && l.flashSale.productId === l.pinnedProductId && new Date(l.flashSale.expiresAt) > new Date())
        ? '<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--line);"><label style="margin-top:0; font-size:12px;">🔥 Prix flash (FCFA)</label><input type="number" id="flash-sale-price-input" placeholder="Ex : 4000" style="margin-bottom:6px;"><label style="font-size:12px;">Durée (minutes)</label><input type="number" id="flash-sale-duration-input" placeholder="Ex : 10" style="margin-bottom:8px;"><button class="btn btn-outline btn-sm" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="startLiveFlashSale()">Activer la vente flash</button></div>'
        : '');
  } else {
    controlsEl.innerHTML = '';
  }
}
/* ---------- VENTE FLASH EN DIRECT ---------- */
let flashSaleTimerInterval = null;
async function startLiveFlashSale(){
  if(!currentLiveView) return;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l || !l.pinnedProductId) return;
  const product = await safeGet('product:' + l.pinnedProductId, true);
  if(!product) return;
  const discountedPrice = parseInt(document.getElementById('flash-sale-price-input').value, 10);
  const durationMin = parseInt(document.getElementById('flash-sale-duration-input').value, 10);
  if(isNaN(discountedPrice) || discountedPrice <= 0 || discountedPrice >= product.price){ showToast('Le prix flash doit être positif et inférieur au prix normal'); return; }
  if(isNaN(durationMin) || durationMin <= 0){ showToast('Renseignez une durée valide'); return; }
  l.flashSale = {
    productId: l.pinnedProductId, discountedPrice, originalPrice: product.price,
    expiresAt: new Date(Date.now() + durationMin * 60 * 1000).toISOString()
  };
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  currentLiveView = l;
  showToast('Vente flash activée ✓');
  await renderLivePinnedProduct();
}
function startFlashSaleCountdown(expiresAt){
  if(flashSaleTimerInterval) clearInterval(flashSaleTimerInterval);
  const update = () => {
    const remainingMs = new Date(expiresAt) - Date.now();
    const el = document.getElementById('flash-sale-timer');
    if(!el){ clearInterval(flashSaleTimerInterval); return; }
    if(remainingMs <= 0){
      clearInterval(flashSaleTimerInterval);
      renderLivePinnedProduct();
      return;
    }
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    el.textContent = minutes + ':' + String(seconds).padStart(2, '0');
  };
  update();
  flashSaleTimerInterval = setInterval(update, 1000);
}
async function pinLiveProduct(){
  const productId = document.getElementById('live-pin-select').value;
  if(!productId || !currentLiveView) return;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  l.pinnedProductId = productId;
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  currentLiveView = l;
  showToast('Produit épinglé ✓');
  await renderLivePinnedProduct();
}
async function unpinLiveProduct(){
  if(!currentLiveView) return;
  const l = await safeGet('live:' + currentLiveView.id, true);
  if(!l) return;
  l.pinnedProductId = null;
  await saveWithRetry('live:' + currentLiveView.id, l, true);
  currentLiveView = l;
  showToast('Produit retiré');
  await renderLivePinnedProduct();
}
async function buyLiveTicket(liveId){
  const lives = await fetchLives();
  const l = lives.find(x => x.id === liveId);
  if(!l) return;
  const instructions = await getPaymentInstructions(currentUserCountry);
  await saveWithRetry('ticket:' + liveId + '__' + currentUser, {
    liveId, username: currentUser, streamerUsername: l.username, country: currentUserCountry,
    price: l.ticketPrice, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  alert('Pour accéder à ce live payant (' + l.ticketPrice.toLocaleString('fr-FR') + ' FCFA) :\n\n' + instructions);
  showToast('Demande de billet envoyée — en attente de validation ✓');
  await openLiveView(liveId);
}
async function fetchTicketRequests(){
  const keys = await safeList('ticket:', true);
  const tickets = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) tickets.push(t); }
  return tickets;
}
async function approveTicketRequest(liveId, username){
  const key = 'ticket:' + liveId + '__' + username;
  const t = await safeGet(key, true);
  if(!t) return;
  const rate = await getTicketCommission();
  const commissionAmount = Math.round(t.price * rate / 100);
  t.status = 'approved';
  t.commissionRate = rate;
  t.commissionAmount = commissionAmount;
  t.netAmount = t.price - commissionAmount;
  await saveWithRetry(key, t, true);
  const paymentId = 'ticketpay_' + Date.now();
  await saveWithRetry('ticketpayment:' + paymentId, {id: paymentId, username, country: t.country, amount: t.price, commissionAmount, createdAt: new Date().toISOString()}, true);
  showToast('Billet validé ✓');
  await logAdminAction('Billet de live validé', '@' + username + ' — ' + t.price.toLocaleString('fr-FR') + ' FCFA');
  await loadAdminTicketRequests();
}
async function rejectTicketRequest(liveId, username){
  await window.storage.delete('ticket:' + liveId + '__' + username, true).catch(() => {});
  showToast('Demande rejetée');
  await loadAdminTicketRequests();
}
async function loadAdminTicketRequests(){
  const el = document.getElementById('admin-ticket-requests');
  if(!el) return;
  let tickets = (await fetchTicketRequests()).filter(t => t.status === 'pending');
  if(adminScope !== 'all') tickets = tickets.filter(t => t.country === adminScope);
  if(tickets.length === 0){ el.innerHTML = '<div class="empty">Aucune demande en attente.</div>'; return; }
  el.innerHTML = tickets.map(t =>
    '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(t.username)+' → live de @'+escapeHtml(t.streamerUsername)+' — '+t.price.toLocaleString('fr-FR')+' FCFA</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveTicketRequest(\''+t.liveId+'\', \''+escapeHtml(t.username)+'\')">✓ Paiement reçu, activer</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectTicketRequest(\''+t.liveId+'\', \''+escapeHtml(t.username)+'\')">✕ Rejeter</button></div></div>'
  ).join('');
}
async function fetchTicketPayments(){
  const keys = await safeList('ticketpayment:', true);
  const payments = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) payments.push(p); }
  return payments;
}

/* ---------- CADEAUX VIRTUELS / POURBOIRES (monétisation des lives) ---------- */
const DEFAULT_GIFT_COMMISSION_RATE = 35;
async function getGiftCommissionRate(){
  const rate = await safeGet('settings:gift_commission_rate', true);
  return (typeof rate === 'number') ? rate : DEFAULT_GIFT_COMMISSION_RATE;
}
let currentTipPostId = null;
async function openTipScreen(postId){
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post){ showToast('Publication introuvable'); return; }
  if(post.userId === currentUser){ showToast('Vous ne pouvez pas vous envoyer un pourboire'); return; }
  currentTipPostId = postId;
  document.getElementById('tip-target-label').textContent = 'À @' + post.userId + ' pour cette publication';
  document.getElementById('tip-status').textContent = '';
  await updateGiftButtonLabels('posttip');
  go('send-tip');
}
/* ---------- DON DIRECT ENTRE UTILISATEURS ---------- */
function toggleDirectGiftPicker(){
  const el = document.getElementById('direct-gift-picker');
  if(el.style.display === 'block'){ el.style.display = 'none'; return; }
  if(currentViewedProfileUsername === currentUser){ showToast('Vous ne pouvez pas vous envoyer un don à vous-même'); return; }
  el.innerHTML = '<div class="card" style="display:flex; flex-direction:column; gap:8px;">' +
    '<button class="btn btn-outline btn-sm" onclick="sendDirectGift(100)">🎈 100 FCFA</button>' +
    '<button class="btn btn-outline btn-sm" onclick="sendDirectGift(500)">🌟 500 FCFA</button>' +
    '<button class="btn btn-outline btn-sm" onclick="sendDirectGift(1000)">💎 1 000 FCFA</button>' +
    '<button class="btn btn-primary btn-sm" onclick="sendDirectGift(5000)">👑 5 000 FCFA</button>' +
    '</div>';
  el.style.display = 'block';
}
/* ---------- CAGNOTTES COMMUNAUTAIRES ---------- */
async function createCagnotte(){
  if(!requireAccount('Créez un compte pour lancer une cagnotte')) return;
  const title = document.getElementById('new-cagnotte-title').value.trim();
  const description = document.getElementById('new-cagnotte-description').value.trim();
  const goal = parseInt(document.getElementById('new-cagnotte-goal').value, 10);
  if(!title || !description || isNaN(goal) || goal <= 0){ showToast('Renseignez un titre, une description et un objectif valide'); return; }
  const id = 'cagnotte_' + Date.now();
  await saveWithRetry('cagnotte:' + id, {
    id, creator: currentUser, title, description, goal, country: currentUserCountry,
    status: 'active', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-cagnotte-title').value = '';
  document.getElementById('new-cagnotte-description').value = '';
  document.getElementById('new-cagnotte-goal').value = '';
  showToast('Cagnotte lancée ✓');
  await logAdminAction('Nouvelle cagnotte communautaire', '@' + currentUser + ' — ' + title);
  openCagnotteDetail(id);
}
async function fetchCagnotteContributions(cagnotteId){
  const keys = await safeList('cagnottecontribution:' + cagnotteId + '__', true);
  const list = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c) list.push(c); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderCagnottesBrowse(){
  const el = document.getElementById('cagnottes-browse-list');
  if(!el) return;
  const keys = await safeList('cagnotte:', true);
  const cagnottes = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c && c.status === 'active') cagnottes.push(c); }
  cagnottes.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(cagnottes.length === 0){ el.innerHTML = '<div class="empty">Aucune cagnotte active pour l’instant.</div>'; return; }
  const rows = [];
  for(const c of cagnottes){
    const contributions = await fetchCagnotteContributions(c.id);
    const collected = contributions.reduce((s,x) => s + x.amount, 0);
    const percent = Math.min(100, Math.round(collected / c.goal * 100));
    rows.push('<div class="card" style="cursor:pointer; margin-bottom:10px;" onclick="openCagnotteDetail(\''+c.id+'\')">' +
      '<strong style="font-size:13px;">'+escapeHtml(c.title)+'</strong>' +
      '<p style="margin:4px 0 6px; font-size:11.5px; color:var(--gold);">Par @'+escapeHtml(c.creator)+'</p>' +
      '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; margin-bottom:6px; overflow:hidden;"><div style="background:var(--lagoon); height:100%; width:'+percent+'%;"></div></div>' +
      '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">'+collected.toLocaleString('fr-FR')+' / '+c.goal.toLocaleString('fr-FR')+' FCFA ('+percent+'%)</p></div>');
  }
  el.innerHTML = rows.join('');
}
let currentCagnotteId = null;
async function openCagnotteDetail(id){
  currentCagnotteId = id;
  go('cagnotte-detail');
  await renderCagnotteDetail();
}
async function renderCagnotteDetail(){
  const c = await safeGet('cagnotte:' + currentCagnotteId, true);
  if(!c) return;
  document.getElementById('cagnotte-detail-title').textContent = c.title;
  document.getElementById('cagnotte-detail-creator').textContent = 'Lancée par @' + c.creator;
  document.getElementById('cagnotte-detail-description').textContent = c.description;
  const contributions = await fetchCagnotteContributions(c.id);
  const collected = contributions.reduce((s,x) => s + x.amount, 0);
  const percent = Math.min(100, Math.round(collected / c.goal * 100));
  document.getElementById('cagnotte-detail-progress').innerHTML =
    '<div style="background:rgba(245,239,227,0.1); border-radius:8px; height:12px; margin-bottom:8px; overflow:hidden;"><div style="background:var(--lagoon); height:100%; width:'+percent+'%;"></div></div>' +
    '<p style="margin:0; font-size:14px; font-weight:700; color:var(--gold);">'+collected.toLocaleString('fr-FR')+' FCFA collectés</p>' +
    '<p style="margin:2px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">sur un objectif de '+c.goal.toLocaleString('fr-FR')+' FCFA ('+percent+'%)</p>';
  const contribEl = document.getElementById('cagnotte-detail-contribute');
  if(c.status !== 'active'){
    contribEl.innerHTML = '<p style="font-size:12.5px; color:rgba(245,239,227,0.5);">Cette cagnotte est clôturée.</p>';
  } else if(c.creator === currentUser){
    contribEl.innerHTML = '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="closeCagnotte()">Clôturer la cagnotte</button>';
  } else {
    contribEl.innerHTML = '<label style="margin-top:0;">Montant à contribuer (FCFA)</label>' +
      '<input type="number" id="cagnotte-contribution-amount" placeholder="Ex : 2000">' +
      '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="contributeToCagnotte()">💝 Contribuer</button>';
  }
  document.getElementById('cagnotte-detail-contributors').innerHTML = contributions.length === 0
    ? '<div class="empty">Aucune contribution pour l’instant — soyez le premier.</div>'
    : contributions.map(x => '<div class="card" style="display:flex; justify-content:space-between; margin-bottom:6px;"><span style="font-size:13px;">@'+escapeHtml(x.contributor)+'</span><span style="font-size:13px; color:var(--gold);">'+x.amount.toLocaleString('fr-FR')+' FCFA</span></div>').join('');
}
async function contributeToCagnotte(){
  if(!requireAccount('Créez un compte pour contribuer')) return;
  const amount = parseInt(document.getElementById('cagnotte-contribution-amount').value, 10);
  if(isNaN(amount) || amount <= 0){ showToast('Entrez un montant valide'); return; }
  const c = await safeGet('cagnotte:' + currentCagnotteId, true);
  if(!c || c.status !== 'active') return;
  const id = 'contrib_' + Date.now();
  await saveWithRetry('cagnottecontribution:' + currentCagnotteId + '__' + id, {
    contributor: currentUser, amount, createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre contribution ✓');
  await createNotification(c.creator, 'cagnotte_contribution', currentUser, currentCagnotteId, amount.toLocaleString('fr-FR'));
  await renderCagnotteDetail();
}
async function closeCagnotte(){
  const c = await safeGet('cagnotte:' + currentCagnotteId, true);
  if(!c || c.creator !== currentUser) return;
  if(!confirm('Clôturer cette cagnotte ? Plus personne ne pourra contribuer après.')) return;
  c.status = 'closed';
  await saveWithRetry('cagnotte:' + currentCagnotteId, c, true);
  showToast('Cagnotte clôturée');
  await renderCagnotteDetail();
}
async function sendDirectGift(amount){
  if(!requireAccount('Créez un compte pour envoyer un don')) return;
  const toUser = currentViewedProfileUsername;
  if(!toUser || toUser === currentUser) return;
  const rate = await getGiftCommissionRate();
  const commissionAmount = Math.round(amount * rate / 100);
  const netAmount = amount - commissionAmount;
  const id = 'gift_' + Date.now();
  await saveWithRetry('gift:' + id, {
    id, postId: null, fromUser: currentUser, toUser,
    country: currentUserCountry, amount, commissionRate: rate, commissionAmount, netAmount,
    createdAt: new Date().toISOString()
  }, true);
  document.getElementById('direct-gift-picker').style.display = 'none';
  showToast('💝 Don de ' + amount.toLocaleString('fr-FR') + ' FCFA envoyé à @' + toUser + ' ✓');
  await createNotification(toUser, 'direct_gift', currentUser, null, amount.toLocaleString('fr-FR'));
}
async function sendPostTip(amount){
  if(!currentTipPostId) return;
  const post = (await fetchPosts()).find(p => p.id === currentTipPostId);
  if(!post) return;
  const rate = await getGiftCommissionRate();
  const commissionAmount = Math.round(amount * rate / 100);
  const netAmount = amount - commissionAmount;
  const id = 'gift_' + Date.now();
  await saveWithRetry('gift:' + id, {
    id, postId: currentTipPostId, fromUser: currentUser, toUser: post.userId,
    country: currentUserCountry, amount, commissionRate: rate, commissionAmount, netAmount,
    createdAt: new Date().toISOString()
  }, true);
  document.getElementById('tip-status').textContent = '💰 Pourboire de ' + amount.toLocaleString('fr-FR') + ' FCFA envoyé à @' + post.userId + ' ✓';
  showToast('Merci pour votre soutien ⛵');
  await createNotification(post.userId, 'post_tip', currentUser, currentTipPostId, amount.toLocaleString('fr-FR'));
}
function showFloatingAnimation(emoji, container){
  if(!container) return;
  const el = document.createElement('div');
  el.textContent = emoji;
  const startX = 20 + Math.random() * 60;
  el.style.cssText = 'position:absolute; left:' + startX + '%; bottom:80px; font-size:28px; z-index:80; pointer-events:none; animation:floatUpFade 1.8s ease-out forwards;';
  container.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}
let seenLiveGiftIds = new Set();
async function checkForNewLiveGifts(){
  if(!currentLiveView) return;
  const keys = await safeList('gift:', true);
  for(const k of keys){
    const g = await safeGet(k, true).catch(() => null);
    if(!g || g.liveId !== currentLiveView.id) continue;
    if(seenLiveGiftIds.has(g.id)) continue;
    seenLiveGiftIds.add(g.id);
    if(g.fromUser === currentUser) continue;
    const emoji = g.amount >= 5000 ? '👑' : g.amount >= 1000 ? '💎' : g.amount >= 500 ? '🌟' : '🎈';
    const floatContainer = document.getElementById('live-gift-float-container');
    showFloatingAnimation(emoji, floatContainer);
    await renderLiveTopGifters();
    await renderLiveRecentDonors();
    await renderLiveEarningsDashboard();
    await checkRewardTierMilestone(currentLiveView);
  }
}
async function sendGift(amount){
  if(!currentLiveView){ showToast('Aucun live sélectionné'); return; }
  const statusEl = document.getElementById('gift-status');
  const rate = await getGiftCommissionRate();
  const commissionAmount = Math.round(amount * rate / 100);
  const netAmount = amount - commissionAmount;
  const id = 'gift_' + Date.now();
  await saveWithRetry('gift:' + id, {
    id, liveId: currentLiveView.id, fromUser: currentUser, toUser: currentLiveView.username,
    country: currentUserCountry, amount, commissionRate: rate, commissionAmount, netAmount,
    createdAt: new Date().toISOString()
  }, true);
  statusEl.textContent = '🎁 Cadeau de ' + amount.toLocaleString('fr-FR') + ' FCFA envoyé à @' + currentLiveView.username + ' ✓';
  showToast('Merci pour votre soutien ⛵');
  const giftEmoji = amount >= 5000 ? '👑' : amount >= 1000 ? '💎' : amount >= 500 ? '🌟' : '🎈';
  const floatContainer = document.getElementById('live-gift-float-container');
  for(let i = 0; i < 3; i++){ setTimeout(() => showFloatingAnimation(giftEmoji, floatContainer), i * 150); }
  await renderLiveTopGifters();
  await renderLiveRecentDonors();
  await renderLiveEarningsDashboard();
  await checkRewardTierMilestone(currentLiveView);
}
async function renderLiveRecentDonors(){
  const el = document.getElementById('live-recent-donors');
  if(!el || !currentLiveView) return;
  const allGifts = await fetchGifts();
  const liveGifts = allGifts.filter(g => g.liveId === currentLiveView.id);
  liveGifts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = liveGifts.slice(0, 5);
  el.innerHTML = recent.length === 0 ? '<div class="empty">Aucun cadeau envoyé pour l’instant.</div>' : recent.map(g =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">' +
    smallAvatarBadge(g.fromUser, 26) +
    '<span style="flex:1; font-size:12.5px;">@'+escapeHtml(g.fromUser)+'</span>' +
    '<span style="font-size:12px; color:var(--gold); font-weight:600;">'+g.amount.toLocaleString('fr-FR')+' FCFA</span>' +
    '</div>'
  ).join('');
}
async function renderLiveTopGifters(){
  const el = document.getElementById('live-top-gifters');
  if(!el || !currentLiveView) return;
  const allGifts = await fetchGifts();
  const liveGifts = allGifts.filter(g => g.liveId === currentLiveView.id);
  const totalsByUser = {};
  liveGifts.forEach(g => { totalsByUser[g.fromUser] = (totalsByUser[g.fromUser] || 0) + g.amount; });
  const ranked = Object.entries(totalsByUser).sort((a,b) => b[1] - a[1]).slice(0, 5);
  el.innerHTML = ranked.length === 0 ? '<div class="empty">Aucun cadeau envoyé pour l’instant — soyez le premier !</div>' : ranked.map(([username, total], i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<span style="font-size:15px; font-family:\'Baloo 2\'; font-weight:700; width:20px;">'+['🥇','🥈','🥉','4.','5.'][i]+'</span>' +
    smallAvatarBadge(username, 28) +
    '<span style="flex:1; font-size:13px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(username)+'\')">@'+escapeHtml(username)+'</span>' +
    '<span style="font-size:12.5px; color:var(--gold); font-weight:600;">'+total.toLocaleString('fr-FR')+' FCFA</span>' +
    '</div>'
  ).join('');
}
async function renderLiveEarningsDashboard(){
  const l = currentLiveView;
  const el = document.getElementById('live-earnings-dashboard');
  if(!el) return;
  if(!l || l.username !== currentUser){ el.innerHTML = ''; return; }
  const allGifts = await fetchGifts();
  const liveGifts = allGifts.filter(g => g.liveId === l.id);
  const grossTotal = liveGifts.reduce((s,g) => s + g.amount, 0);
  const netTotal = liveGifts.reduce((s,g) => s + g.netAmount, 0);
  const tiers = l.rewardTiers || [];
  el.innerHTML = '<div class="eyebrow" style="margin-top:16px;">💰 Gains de cette session</div>' +
    '<div class="card" style="margin-bottom:10px; border-color:var(--gold);">' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">Total net (après commission) — '+liveGifts.length+' cadeau(x)</p>' +
    '<p style="margin:0; font-size:22px; font-weight:700; color:var(--gold);">'+netTotal.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:4px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">Total brut : '+grossTotal.toLocaleString('fr-FR')+' FCFA</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 8px; font-size:12.5px; font-weight:600;">🎯 Paliers de récompenses</p>' +
    (tiers.length === 0 ? '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun palier configuré.</p>' :
      tiers.slice().sort((a,b) => a.threshold - b.threshold).map((t,i) => {
        const reached = grossTotal >= t.threshold;
        return '<div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">' +
          '<span style="font-size:12px; color:'+(reached ? 'var(--lagoon)' : 'rgba(245,239,227,0.4)')+';">'+(reached ? '✓' : '○')+' '+t.threshold.toLocaleString('fr-FR')+' FCFA — '+escapeHtml(t.reward)+'</span>' +
          '<span onclick="removeLiveRewardTier('+i+')" style="font-size:11px; color:var(--coral); cursor:pointer; margin-left:auto;">Retirer</span></div>';
      }).join('')) +
    '<div style="display:flex; gap:6px; margin-top:6px;">' +
    '<input type="number" id="new-tier-threshold-input" placeholder="Montant" style="margin:0; flex:1;">' +
    '<input type="text" id="new-tier-reward-input" placeholder="Récompense" style="margin:0; flex:2;">' +
    '<button class="btn btn-outline btn-sm" onclick="addLiveRewardTier()">Ajouter</button>' +
    '</div></div>';
}
async function addLiveRewardTier(){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const threshold = parseInt(document.getElementById('new-tier-threshold-input').value, 10);
  const reward = document.getElementById('new-tier-reward-input').value.trim();
  if(!threshold || threshold <= 0 || !reward){ showToast('Renseignez un montant et une récompense'); return; }
  const fresh = await safeGet('live:' + l.id, true);
  const tiers = fresh.rewardTiers || [];
  tiers.push({ threshold, reward });
  fresh.rewardTiers = tiers;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  showToast('Palier ajouté ✓');
  await renderLiveEarningsDashboard();
}
async function removeLiveRewardTier(index){
  const l = currentLiveView;
  if(!l || l.username !== currentUser) return;
  const fresh = await safeGet('live:' + l.id, true);
  const tiers = (fresh.rewardTiers || []).slice().sort((a,b) => a.threshold - b.threshold);
  tiers.splice(index, 1);
  fresh.rewardTiers = tiers;
  await saveWithRetry('live:' + l.id, fresh, true);
  currentLiveView = fresh;
  await renderLiveEarningsDashboard();
}
async function checkRewardTierMilestone(l){
  const tiers = l.rewardTiers || [];
  if(tiers.length === 0) return;
  const allGifts = await fetchGifts();
  const liveGifts = allGifts.filter(g => g.liveId === l.id);
  const grossTotal = liveGifts.reduce((s,g) => s + g.amount, 0);
  const previousTotal = grossTotal - liveGifts[0].amount;
  const justCrossed = tiers.find(t => previousTotal < t.threshold && grossTotal >= t.threshold);
  if(justCrossed && l.username === currentUser){
    showToast('🎉 Palier atteint : ' + justCrossed.reward + ' !');
  }
}
async function fetchGifts(){
  const keys = await safeList('gift:', true);
  const gifts = [];
  for(const k of keys){ const g = await safeGet(k, true); if(g) gifts.push(g); }
  gifts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return gifts;
}

/* ---------- PUBLICITÉ CIBLÉE DANS LE FIL ---------- */
async function createAdCampaign(){
  const advertiserName = document.getElementById('ad-advertiser').value.trim();
  const caption = document.getElementById('ad-caption').value.trim();
  const hashtagsRaw = document.getElementById('ad-hashtags').value.trim();
  const country = document.getElementById('ad-country').value;
  const budget = parseInt(document.getElementById('ad-budget').value, 10);
  const cpm = parseInt(document.getElementById('ad-cpm').value, 10) || 5000;
  const mediaFile = document.getElementById('ad-media').files[0];
  if(!advertiserName || !mediaFile || isNaN(budget) || budget <= 0){
    showToast('Renseignez au moins l’annonceur, un média et un budget valide');
    return;
  }
  if(mediaFile.size > MAX_FILE_SIZE){ showToast('Média trop lourd (3,5 Mo max)'); return; }
  const targetHashtags = extractHashtags(hashtagsRaw);
  const targetCategoryInput = document.getElementById('ad-target-category').value.trim();
  const mediaData = await readFileAsDataURL(mediaFile);
  const id = 'ad_' + Date.now();
  await saveWithRetry('ad:' + id, {
    id, advertiserName, type: mediaFile.type.startsWith('video') ? 'video' : 'image',
    mediaData, caption, targetHashtags, targetCategory: targetCategoryInput || null, country, budget, cpm,
    spent: 0, impressions: 0, status: 'active', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('ad-advertiser').value = '';
  document.getElementById('ad-caption').value = '';
  document.getElementById('ad-hashtags').value = '';
  document.getElementById('ad-target-category').value = '';
  document.getElementById('ad-budget').value = '';
  document.getElementById('ad-media').value = '';
  showToast('Campagne créée ✓');
  await loadAdminAdsList();
}

/* ---------- PUBLICITÉ EN LIBRE-SERVICE (utilisateurs) ---------- */
/* ---------- TARIF PUBLICITÉ EN LIBRE-SERVICE (réglable) ---------- */
/* ---------- FONDS DE RÉCOMPENSE CRÉATEUR (BASÉ SUR LES VUES) ---------- */
async function saveCreatorFundSettings(){
  const rate = parseInt(document.getElementById('creator-fund-rate-input').value, 10);
  const budget = parseInt(document.getElementById('creator-fund-budget-input').value, 10);
  if(isNaN(rate) || rate < 0 || isNaN(budget) || budget < 0){ showToast('Entrez des valeurs valides'); return; }
  await saveWithRetry('settings:creatorFundRatePer1000Views', rate, true);
  await saveWithRetry('settings:creatorFundBudget', budget, true);
  showToast('Réglages enregistrés ✓');
}
async function loadCreatorFundSettings(){
  const rateInput = document.getElementById('creator-fund-rate-input');
  if(!rateInput) return;
  rateInput.value = (await safeGet('settings:creatorFundRatePer1000Views', true)) || '';
  document.getElementById('creator-fund-budget-input').value = (await safeGet('settings:creatorFundBudget', true)) || '';
}
async function computeCreatorFundDistribution(){
  const rate = (await safeGet('settings:creatorFundRatePer1000Views', true)) || 0;
  const budget = (await safeGet('settings:creatorFundBudget', true)) || 0;
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const allPosts = await fetchPosts(true);
  const thisMonthPosts = allPosts.filter(p => p.status === 'published' && p.createdAt.slice(0,7) === monthKey);
  const viewsByCreator = {};
  const postsByCreator = {};
  thisMonthPosts.forEach(p => {
    viewsByCreator[p.userId] = (viewsByCreator[p.userId] || 0) + (p.views || 0);
    if(!postsByCreator[p.userId]) postsByCreator[p.userId] = [];
    if(p.type === 'video') postsByCreator[p.userId].push(p.id);
  });
  const qualityMultiplierByCreator = {};
  for(const username of Object.keys(viewsByCreator)){
    const videoIds = postsByCreator[username] || [];
    let totalRate = 0, counted = 0;
    for(const postId of videoIds){
      const stats = await fetchVideoRetentionStats(postId);
      if(stats.totalViewers === 0) continue;
      totalRate += stats.milestoneCounts['0.5'] / stats.totalViewers;
      counted++;
    }
    qualityMultiplierByCreator[username] = counted > 0 ? (0.5 + (totalRate / counted)) : 1;
  }
  let entries = Object.entries(viewsByCreator).map(([username, views]) => ({
    username, views, qualityMultiplier: qualityMultiplierByCreator[username],
    rawAmount: Math.round(views / 1000 * rate * qualityMultiplierByCreator[username])
  }));
  const totalRaw = entries.reduce((s,e) => s + e.rawAmount, 0);
  const scale = (budget > 0 && totalRaw > budget) ? budget / totalRaw : 1;
  entries = entries.filter(e => e.rawAmount > 0).map(e => ({ ...e, finalAmount: Math.round(e.rawAmount * scale) }));
  entries.sort((a,b) => b.finalAmount - a.finalAmount);
  return { monthKey, rate, budget, totalRaw, scale, entries };
}
async function previewCreatorFundDistribution(){
  const el = document.getElementById('creator-fund-preview');
  const { monthKey, rate, budget, totalRaw, scale, entries } = await computeCreatorFundDistribution();
  if(!rate){ el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5);">Renseignez d’abord un taux avant de calculer.</p>'; return; }
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune vue enregistrée ce mois-ci.</div>'; return; }
  el.innerHTML = '<p style="font-size:11.5px; color:var(--gold); margin:0 0 8px;">'+(scale < 1 ? '⚠️ Le budget ('+budget.toLocaleString('fr-FR')+' FCFA) est insuffisant pour couvrir '+totalRaw.toLocaleString('fr-FR')+' FCFA calculés — répartition proportionnelle appliquée.' : 'Budget suffisant pour couvrir la répartition complète.')+'</p>' +
    '<p style="font-size:11px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Un vrai bonus honnête s’applique selon le taux réel de visionnage jusqu’à la moitié (×0,5 à ×1,5) — jamais juste le nombre de vues brutes.</p>' +
    entries.map(e => '<div class="card" style="display:flex; justify-content:space-between; margin-bottom:6px;"><span style="font-size:12.5px;">@'+escapeHtml(e.username)+' — '+e.views.toLocaleString('fr-FR')+' vues · qualité ×'+e.qualityMultiplier.toFixed(2)+'</span><span style="font-size:12.5px; color:var(--gold);">'+e.finalAmount.toLocaleString('fr-FR')+' FCFA</span></div>').join('') +
    '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="confirmCreatorFundDistribution()">✓ Confirmer et distribuer</button>';
}
async function confirmCreatorFundDistribution(){
  if(!confirm('Distribuer le fonds de récompense de ce mois ? Chaque créateur recevra une vraie notification avec son montant — le paiement reste manuel, comme pour tous les reversements.')) return;
  const { monthKey, entries } = await computeCreatorFundDistribution();
  for(const e of entries){
    await saveWithRetry('creatorfundpayout:' + monthKey + '__' + e.username, {
      username: e.username, monthKey, views: e.views, amount: e.finalAmount, status: 'pending', createdAt: new Date().toISOString()
    }, true);
    await createNotification(e.username, 'creator_fund_payout', 'Suktum', null, e.finalAmount.toLocaleString('fr-FR'));
  }
  showToast('Fonds distribué à ' + entries.length + ' créateur(s) ✓');
  await logAdminAction('Fonds de récompense créateur distribué', entries.length + ' créateur(s) — ' + monthKey);
  document.getElementById('creator-fund-preview').innerHTML = '<p style="font-size:12px; color:var(--lagoon);">✓ Distribué à '+entries.length+' créateur(s).</p>';
}
async function getSelfServeCpm(){
  const rate = await safeGet('settings:selfServeCpm', true);
  return (typeof rate === 'number' && rate > 0) ? rate : 5000;
}
async function setSelfServeCpm(){
  const rate = parseInt(document.getElementById('self-serve-cpm-input').value, 10);
  if(isNaN(rate) || rate <= 0){ showToast('Entrez un tarif valide'); return; }
  await saveWithRetry('settings:selfServeCpm', rate, true);
  showToast('Tarif enregistré ✓');
}
async function loadSelfServeCpm(){
  const input = document.getElementById('self-serve-cpm-input');
  if(!input) return;
  input.value = await getSelfServeCpm();
}
async function submitSelfServeAd(){
  const statusEl = document.getElementById('myad-status');
  const advertiserName = document.getElementById('myad-advertiser').value.trim();
  const caption = document.getElementById('myad-caption').value.trim();
  const hashtagsRaw = document.getElementById('myad-hashtags').value.trim();
  const budget = parseInt(document.getElementById('myad-budget').value, 10);
  const mediaFile = document.getElementById('myad-media').files[0];
  if(!advertiserName || !mediaFile || isNaN(budget) || budget <= 0){
    statusEl.textContent = 'Renseignez au moins l’annonceur, un média et un budget valide.';
    return;
  }
  if(mediaFile.size > MAX_FILE_SIZE){ statusEl.textContent = 'Média trop lourd (3,5 Mo max).'; return; }
  const targetHashtags = extractHashtags(hashtagsRaw);
  const targetCategoryInput = document.getElementById('myad-target-category').value.trim();
  const mediaData = await readFileAsDataURL(mediaFile);
  const cpm = await getSelfServeCpm();
  const id = 'ad_' + Date.now();
  await saveWithRetry('ad:' + id, {
    id, advertiserName, type: mediaFile.type.startsWith('video') ? 'video' : 'image',
    mediaData, caption, targetHashtags, targetCategory: targetCategoryInput || null, country: currentUserCountry, budget, cpm,
    spent: 0, impressions: 0, status: 'pending_review', createdBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('myad-advertiser').value = '';
  document.getElementById('myad-caption').value = '';
  document.getElementById('myad-hashtags').value = '';
  document.getElementById('myad-target-category').value = '';
  document.getElementById('myad-budget').value = '';
  document.getElementById('myad-media').value = '';
  statusEl.textContent = '✓ Campagne envoyée — en attente de validation avant diffusion.';
  showToast('Campagne soumise ✓');
  await renderMyAdsList();
}
async function renderMyAdsList(){
  const el = document.getElementById('my-ads-list');
  if(!el) return;
  const ads = (await fetchAds()).filter(a => a.createdBy === currentUser);
  if(ads.length === 0){ el.innerHTML = '<div class="empty">Aucune campagne pour l’instant.</div>'; return; }
  const statusLabels = {pending_review: '⏳ En attente de validation', active: '🟢 Active', paused: '⏸ En pause', rejected: '✕ Refusée'};
  el.innerHTML = ads.map(a =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(a.advertiserName)+'</strong> — '+(statusLabels[a.status]||a.status)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.55);">👁️ '+(a.impressions||0)+' vue(s) · 💰 '+Math.round(a.spent||0).toLocaleString('fr-FR')+' / '+a.budget.toLocaleString('fr-FR')+' FCFA</p></div>'
  ).join('');
}
async function approveSelfServeAd(id){
  const a = await safeGet('ad:' + id, true);
  if(!a) return;
  a.status = 'active';
  await saveWithRetry('ad:' + id, a, true);
  showToast('Campagne validée — diffusion active ✓');
  await logAdminAction('Publicité utilisateur validée', a.advertiserName + ' (@' + a.createdBy + ')');
  if(a.createdBy) await createNotification(a.createdBy, 'ad_approved', 'Suktum', null, a.advertiserName);
  await loadSelfServeAdsQueue();
}
async function rejectSelfServeAd(id){
  const a = await safeGet('ad:' + id, true);
  if(a){ a.status = 'rejected'; await saveWithRetry('ad:' + id, a, true); }
  showToast('Campagne refusée');
  await logAdminAction('Publicité utilisateur refusée', a ? a.advertiserName + ' (@' + a.createdBy + ')' : id);
  if(a && a.createdBy) await createNotification(a.createdBy, 'ad_rejected', 'Suktum', null, a.advertiserName);
  await loadSelfServeAdsQueue();
}
async function loadSelfServeAdsQueue(){
  const el = document.getElementById('self-serve-ads-queue');
  if(!el) return;
  let ads = (await fetchAds()).filter(a => a.status === 'pending_review');
  if(adminScope !== 'all') ads = ads.filter(a => !a.country || a.country === adminScope);
  if(ads.length === 0){ el.innerHTML = '<div class="empty">Aucune campagne en attente.</div>'; return; }
  el.innerHTML = ads.map(a =>
    '<div class="card"><p style="margin:0 0 8px; font-size:13px;"><strong>'+escapeHtml(a.advertiserName)+'</strong> — par @'+escapeHtml(a.createdBy)+(a.country ? ' · '+escapeHtml(a.country) : '')+'</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.55);">'+escapeHtml(a.caption||'')+' — Budget : '+a.budget.toLocaleString('fr-FR')+' FCFA</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="approveSelfServeAd(\''+a.id+'\')">✓ Valider</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectSelfServeAd(\''+a.id+'\')">✕ Refuser</button>' +
    '</div></div>'
  ).join('');
}
async function fetchAds(){
  const keys = await safeList('ad:', true);
  const ads = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a) ads.push(a); }
  return ads;
}
async function loadAdminAdsList(){
  const countrySel = document.getElementById('ad-country');
  if(countrySel && countrySel.options.length <= 1){
    COUNTRY_LIST.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; countrySel.appendChild(o); });
  }
  const el = document.getElementById('admin-ads-list');
  if(!el) return;
  await activateScheduledAdsIfDue();
  const allAds = await fetchAds();
  const ads = allAds.filter(a => !a.archived);
  if(ads.length === 0){ el.innerHTML = '<div class="empty">Aucune campagne pour l’instant.</div>'; return; }
  el.innerHTML = ads.map(a => {
    const spentPct = a.budget > 0 ? Math.min(100, Math.round(a.spent / a.budget * 100)) : 0;
    const exhausted = a.spent >= a.budget;
    return '<div class="card" style="position:relative; padding-right:40px;">' +
      '<span onclick="openAdCampaignKebabMenu(\''+a.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
      '<p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(a.advertiserName)+'</strong>'+(a.country ? ' — '+escapeHtml(a.country) : ' — Tous pays')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.55);">'+(a.targetHashtags||[]).join(' ')+'</p>' +
      (a.status === 'scheduled' ? '<p style="margin:0 0 4px; font-size:12px; color:var(--gold);">📅 Programmée pour le '+new Date(a.scheduledFor).toLocaleDateString('fr-FR')+'</p>' : '') +
      '<p style="margin:0 0 8px; font-size:12px;">👁️ '+a.impressions+' vue(s) · 💰 '+a.spent.toLocaleString('fr-FR')+' / '+a.budget.toLocaleString('fr-FR')+' FCFA ('+spentPct+'%)</p>' +
      '<p style="margin:0 0 8px; font-size:12px; color:var(--lagoon);">🔗 '+(a.clicks||0)+' clic(s) · 🛒 '+(a.conversions||0)+' conversion(s)</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
      (a.status === 'active'
        ? '<button class="btn btn-outline btn-sm" onclick="toggleAdStatus(\''+a.id+'\', \'paused\')">⏸ Mettre en pause</button>'
        : a.status !== 'scheduled' ? '<button class="btn btn-outline btn-sm" onclick="toggleAdStatus(\''+a.id+'\', \'active\')" '+(exhausted?'disabled':'')+'>▶️ Réactiver</button>' : '') +
      '<button class="btn btn-outline btn-sm" onclick="deleteAdCampaign(\''+a.id+'\')">✕ Supprimer</button>' +
      '</div>' +
      (exhausted ? '<p style="margin:8px 0 0; font-size:11.5px; color:var(--coral);">Budget épuisé</p>' : '') +
      '</div>';
  }).join('');
}
async function scheduleAdDiffusion(id){
  const a = await safeGet('ad:' + id, true);
  if(!a) return;
  const dateStr = prompt('Programmer la diffusion à partir de quelle date ? (AAAA-MM-JJ)', new Date().toISOString().slice(0,10));
  if(!dateStr) return;
  const scheduledDate = new Date(dateStr + 'T00:00:00');
  if(isNaN(scheduledDate.getTime())){ showToast('Date invalide'); return; }
  a.scheduledFor = scheduledDate.toISOString();
  a.status = scheduledDate > new Date() ? 'scheduled' : 'active';
  await saveWithRetry('ad:' + id, a, true);
  showToast(a.status === 'scheduled' ? 'Diffusion programmée pour le ' + scheduledDate.toLocaleDateString('fr-FR') + ' ✓' : 'Date déjà passée — campagne activée immédiatement');
  await loadAdminAdsList();
}
async function activateScheduledAdsIfDue(){
  const ads = await fetchAds();
  for(const a of ads){
    if(a.status === 'scheduled' && a.scheduledFor && new Date(a.scheduledFor) <= new Date()){
      a.status = 'active';
      await saveWithRetry('ad:' + a.id, a, true);
    }
  }
}
async function editAdTargetCategory(id){
  const a = await safeGet('ad:' + id, true);
  if(!a) return;
  const newCategory = prompt('Nouvelle catégorie ciblée (doit correspondre exactement à une vraie catégorie de la boutique) :', a.targetCategory || '');
  if(newCategory === null) return;
  a.targetCategory = newCategory.trim() || null;
  await saveWithRetry('ad:' + id, a, true);
  showToast('Cible mise à jour ✓');
  await loadAdminAdsList();
}
async function archiveAdCampaign(id){
  const a = await safeGet('ad:' + id, true);
  if(!a) return;
  a.archived = true;
  a.status = 'paused';
  await saveWithRetry('ad:' + id, a, true);
  showToast('Campagne archivée — les données sont conservées');
  await loadAdminAdsList();
}
async function openAdCampaignKebabMenu(id){
  const items = [];
  items.push({ icon: '📅', label: 'Programmer la diffusion', action: 'closeGenericKebabMenu(); scheduleAdDiffusion(\''+id+'\')' });
  items.push({ icon: '🎯', label: 'Modifier la catégorie ciblée', action: 'closeGenericKebabMenu(); editAdTargetCategory(\''+id+'\')' });
  items.push({ icon: '🗄️', label: 'Archiver', action: 'closeGenericKebabMenu(); archiveAdCampaign(\''+id+'\')' });
  openGenericKebabMenu(items);
}
async function toggleAdStatus(id, status){
  const a = await safeGet('ad:' + id, true);
  if(!a) return;
  a.status = status;
  await saveWithRetry('ad:' + id, a, true);
  await loadAdminAdsList();
}
async function deleteAdCampaign(id){
  await window.storage.delete('ad:' + id, true).catch(() => {});
  showToast('Campagne supprimée');
  await loadAdminAdsList();
}
const adImpressionsCountedThisSession = new Set();
async function buildUserMarketplaceProfile(){
  const weights = {};
  if(!currentUser) return weights;
  const products = await fetchProducts();
  const productById = {};
  products.forEach(p => { productById[p.id] = p; });

  const recentlyViewedKeys = await safeList('recentlyviewed:' + currentUser + '__', true);
  for(const k of recentlyViewedKeys){
    const rv = await safeGet(k, true);
    if(!rv) continue;
    const p = productById[rv.productId];
    if(!p || !p.category) continue;
    const daysAgo = (Date.now() - new Date(rv.viewedAt).getTime()) / (24*60*60*1000);
    if(daysAgo > 14) continue;
    weights[p.category] = (weights[p.category] || 0) + 1;
  }

  const wishlist = (await safeGet('wishlist:' + currentUser, true)) || [];
  wishlist.forEach(productId => {
    const p = productById[productId];
    if(!p || !p.category) return;
    weights[p.category] = (weights[p.category] || 0) + 3;
  });

  return weights;
}
async function pickAdForFeed(){
  if(await isUserPremium(currentUser)) return null;
  const ads = (await fetchAds()).filter(a => a.status === 'active' && a.spent < a.budget);
  const eligible = ads.filter(a => !a.country || a.country === currentUserCountry);
  if(eligible.length === 0) return null;
  const profile = await buildUserContentProfile();
  const marketplaceProfile = await buildUserMarketplaceProfile();
  const lookalikeScores = await computeAdLookalikeScores();
  const AD_COOLDOWN_MS = 30 * 60 * 1000;
  const scored = [];
  for(const a of eligible){
    if(currentUser){
      const seenRecord = await safeGet('adseenby:' + a.id + '__' + currentUser, false).catch(() => null);
      if(seenRecord && seenRecord.lastShownAt && (Date.now() - new Date(seenRecord.lastShownAt).getTime()) < AD_COOLDOWN_MS) continue;
    }
    let score = (a.targetHashtags || []).reduce((s,t) => s + (profile[t] || 0), 0);
    score += (lookalikeScores[a.id] || 0) * 1.5;
    if(a.targetCategory) score += (marketplaceProfile[a.targetCategory] || 0) * 2;
    scored.push({ad: a, score});
  }
  const positiveOnly = scored.filter(x => x.score >= 0);
  if(positiveOnly.length === 0) return null;
  positiveOnly.sort((x,y) => y.score - x.score);
  return positiveOnly[0].ad;
}
async function recordAdImpression(ad){
  if(adImpressionsCountedThisSession.has(ad.id)) return;
  adImpressionsCountedThisSession.add(ad.id);
  const fresh = await safeGet('ad:' + ad.id, true);
  if(!fresh) return;
  fresh.impressions = (fresh.impressions || 0) + 1;
  fresh.spent = (fresh.spent || 0) + (fresh.cpm / 1000);
  if(fresh.spent >= fresh.budget && fresh.status !== 'paused'){
    fresh.status = 'paused';
    if(fresh.createdBy) await createNotification(fresh.createdBy, 'ad_budget_spent', 'Suktum', null, fresh.advertiserName + '__' + fresh.impressions);
  }
  await saveWithRetry('ad:' + ad.id, fresh, true);
  if(currentUser){
    const seenKey = 'adseenby:' + ad.id + '__' + currentUser;
    const seenRecord = (await safeGet(seenKey, false).catch(() => null)) || { count: 0 };
    seenRecord.count = (seenRecord.count || 0) + 1;
    seenRecord.lastShownAt = new Date().toISOString();
    await saveWithRetry(seenKey, seenRecord, false);
  }
}
async function toggleAdLike(adId){
  if(!requireAccount('Créez un compte pour réagir à une publicité')) return;
  const ad = await safeGet('ad:' + adId, true);
  if(!ad) return;
  if(!ad.likes) ad.likes = [];
  const idx = ad.likes.indexOf(currentUser);
  if(idx === -1) ad.likes.push(currentUser); else ad.likes.splice(idx, 1);
  await saveWithRetry('ad:' + adId, ad, true);
  await renderFeed();
}
async function computeAdLookalikeScores(){
  if(!currentUser) return {};
  const posts = await fetchPosts();
  const userLikedPostSets = {};
  posts.forEach(p => {
    (p.likes || []).forEach(u => {
      if(!userLikedPostSets[u]) userLikedPostSets[u] = new Set();
      userLikedPostSets[u].add(p.id);
    });
  });
  const myLikedPostIds = userLikedPostSets[currentUser] || new Set();
  if(myLikedPostIds.size === 0) return {};
  const similarUsers = new Set();
  Object.entries(userLikedPostSets).forEach(([u, likedSet]) => {
    if(u === currentUser) return;
    if([...likedSet].some(id => myLikedPostIds.has(id))) similarUsers.add(u);
  });
  if(similarUsers.size === 0) return {};
  const allAds = await fetchAds();
  const scores = {};
  allAds.forEach(a => {
    (a.likes || []).forEach(u => {
      if(similarUsers.has(u)) scores[a.id] = (scores[a.id] || 0) + 1;
    });
  });
  return scores;
}
function renderAdCard(ad){
  const media = ad.type === 'video'
    ? '<video src="'+ad.mediaData+'" loop muted playsinline autoplay onclick="this.muted=!this.muted"></video>'
    : '<img src="'+ad.mediaData+'">';
  const liked = currentUser && (ad.likes || []).includes(currentUser);
  return '<div class="feed-card">' + media +
    '<div style="position:absolute; top:16px; left:16px; z-index:3; background:var(--gold); color:var(--night); font-family:\'Baloo 2\'; font-weight:700; font-size:10.5px; padding:3px 10px; border-radius:12px;">Sponsorisé</div>' +
    '<button onclick="toggleAdLike(\''+ad.id+'\')" style="position:absolute; top:16px; right:16px; z-index:3; background:rgba(11,46,61,0.55); border:none; border-radius:50%; width:36px; height:36px; font-size:16px;">'+(liked ? '❤️' : '🤍')+'</button>' +
    '<div class="overlay"><p class="username">'+escapeHtml(ad.advertiserName)+'</p><p class="caption"><span id="caption-text-'+ad.id+'" data-raw-caption="'+escapeHtml(ad.caption||'')+'">'+renderCaptionWithToggle(ad.caption, ad.id)+'</span></p>' +
    (ad.targetCategory ? '<button onclick="event.stopPropagation(); trackAdClickAndDiscover(\''+ad.id+'\', \''+escapeHtml(ad.targetCategory).replace(/'/g,"\\'")+'\')" class="btn btn-primary btn-sm" style="margin-top:8px;">🔗 Découvrir</button>' : '') +
    '</div>' +
    '</div>';
}

/* ---------- MODÉRATION DES LIVES (admin) ---------- */
async function loadLivesQueue(){
  const el = document.getElementById('admin-lives-list');
  if(!el) return;
  let lives = (await fetchLives()).filter(l => l.status === 'pending');
  if(adminScope !== 'all') lives = lives.filter(l => l.country === adminScope);
  if(lives.length === 0){ el.innerHTML = '<div class="empty">Aucun live en attente.</div>'; return; }
  const rows = [];
  for(const l of lives){
    const u = await safeGet('user:' + l.username, true);
    const followerCount = (u && u.followers) ? u.followers.length : 0;
    const isEligibleNormally = followerCount >= LIVE_FOLLOWER_THRESHOLD;
    const eligibilityLabel = isEligibleNormally
      ? '<span style="color:var(--lagoon);">✓ '+followerCount.toLocaleString('fr-FR')+' abonné(s) — éligible normalement</span>'
      : '<span style="color:var(--gold);">🔓 '+followerCount.toLocaleString('fr-FR')+' abonné(s) seulement — via autorisation spéciale</span>';
    rows.push(
      '<div class="card">' +
      '<p style="margin:0 0 4px; font-size:13px; display:flex; align-items:center; gap:8px;">' + smallAvatarBadge(l.username, 24) + '<strong>@'+escapeHtml(l.username)+'</strong> demande à démarrer un live'+(l.country ? ' — '+escapeHtml(l.country) : '')+'</p>' +
      '<p style="margin:0 0 10px; font-size:12px;">'+eligibilityLabel+'</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
      '<button class="btn btn-outline btn-sm" onclick="approveLive(\''+l.id+'\')">✓ Valider</button>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectLive(\''+l.id+'\')">✕ Refuser</button>' +
      '</div></div>'
    );
  }
  el.innerHTML = rows.join('');
}
async function approveLive(id){
  const l = await safeGet('live:' + id, true);
  if(!l) return;
  l.status = 'approved';
  await saveWithRetry('live:' + id, l, true);
  showToast('Live validé — visible par tous ✓');
  await logAdminAction('Live validé', '@' + l.username);
  if(l.isEducational){
    await notifyStudentsTrainerIsLive(l.username, l.id);
  }
  await notifyFollowersOfNewLive(l);
  await loadLivesQueue();
  await loadActiveLivesAdmin();
}
async function rejectLive(id){
  await window.storage.delete('live:' + id, true).catch(() => {});
  showToast('Live refusé');
  await loadLivesQueue();
  await loadActiveLivesAdmin();
}
async function loadActiveLivesAdmin(){
  const el = document.getElementById('admin-active-lives-list');
  if(!el) return;
  let lives = (await fetchLives()).filter(l => l.status === 'approved');
  if(adminScope !== 'all') lives = lives.filter(l => l.country === adminScope);
  if(lives.length === 0){ el.innerHTML = '<div class="empty">Aucun live en cours.</div>'; return; }
  const rows = [];
  for(const l of lives){
    const u = await safeGet('user:' + l.username, true);
    const followerCount = (u && u.followers) ? u.followers.length : 0;
    const badge = followerCount >= LIVE_FOLLOWER_THRESHOLD
      ? '<span style="font-size:10.5px; color:var(--lagoon);">✓ '+followerCount.toLocaleString('fr-FR')+'</span>'
      : '<span style="font-size:10.5px; color:var(--gold);">🔓 '+followerCount.toLocaleString('fr-FR')+'</span>';
    rows.push(
      '<div class="card" style="display:flex; justify-content:space-between; align-items:center;">' +
      '<span style="font-size:13px; display:flex; align-items:center; gap:8px;">' + smallAvatarBadge(l.username, 24) + '🔴 @'+escapeHtml(l.username)+' '+badge+'</span>' +
      '<button class="btn btn-outline btn-sm" onclick="rejectLive(\''+l.id+'\')">Terminer</button>' +
      '</div>'
    );
  }
  el.innerHTML = rows.join('');
}

