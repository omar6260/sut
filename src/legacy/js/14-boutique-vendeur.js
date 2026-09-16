/* ---------- VENDEUR DE SERVICES — GESTION DES CRÉNEAUX ---------- */
let serviceSlotsDraft = [];
/* ---------- COACH IA VENDEUR ---------- */
/* ---------- LIVRAISON GROUPÉE ENTRE VENDEURS ---------- */
/* ---------- APPEL VOCAL DIRECT ---------- */
async function startVoiceCall(otherUsername, contextLabel){
  if(!requireAccount('Créez un compte pour passer un appel')) return;
  if(!otherUsername || otherUsername === currentUser) return;
  const target = await safeGet('user:' + otherUsername, true);
  if(target && target.voiceCallsBlocked){
    showToast('Cette personne n’accepte pas les appels vocaux dans l’app.');
    return;
  }
  const roomParticipants = [currentUser, otherUsername].sort().join('-');
  const roomName = 'suktum-call-' + roomParticipants.replace(/[^a-zA-Z0-9-]/g, '');
  document.getElementById('voice-call-title').textContent = 'Appel avec @' + otherUsername;
  document.getElementById('voice-call-iframe').src = 'https://meet.jit.si/' + roomName + '#config.startAudioOnly=true&config.startWithVideoMuted=true&config.prejoinPageEnabled=false';
  go('voice-call');
  await createNotification(otherUsername, 'voice_call_started', currentUser, null, contextLabel || '');
  const callLogId = 'call_' + Date.now();
  await saveWithRetry('voicecalllog:' + callLogId, {
    id: callLogId, caller: currentUser, callee: otherUsername, context: contextLabel || null, createdAt: new Date().toISOString()
  }, true);
}
/* ---------- MODÈLE DE DESCRIPTION PRODUIT RÉUTILISABLE ---------- */
async function saveDescriptionAsTemplate(){
  const text = document.getElementById('seller-product-desc').value.trim();
  if(!text){ showToast('Écrivez une description avant de l’enregistrer comme modèle'); return; }
  const name = prompt('Nom de ce modèle (ex : "Vêtements traditionnels") :');
  if(!name || !name.trim()) return;
  const id = 'desctemplate_' + Date.now();
  await saveWithRetry('descriptiontemplate:' + currentUser + '__' + id, { id, name: name.trim(), text, createdAt: new Date().toISOString() }, true);
  showToast('Modèle enregistré ✓');
  await loadDescriptionTemplatesPicker();
}
async function applyDescriptionTemplate(){
  const picker = document.getElementById('seller-desc-template-picker');
  if(!picker.value) return;
  const template = await safeGet('descriptiontemplate:' + currentUser + '__' + picker.value, true);
  if(template) document.getElementById('seller-product-desc').value = template.text;
}
/* ---------- LIEN DE PAIEMENT PARTAGEABLE ---------- */
/* ---------- RÉCEMMENT VUS ---------- */
/* ---------- TRADUCTION DES MESSAGES PRIVÉS ---------- */
async function translateDirectMessage(index){
  const el = document.getElementById('dm-text-' + index);
  if(!el) return;
  if(el.dataset.translated === 'true'){
    el.innerHTML = el.dataset.original;
    el.dataset.translated = 'false';
    return;
  }
  const originalHtml = el.innerHTML;
  el.dataset.original = originalHtml;
  const key = 'dm:' + threadKeyFor(currentUser, currentThreadPartner);
  const msgs = (await safeGet(key, true)) || [];
  const message = msgs[index];
  if(!message || !message.text) return;
  el.innerHTML = originalHtml + ' ⏳';
  try{
    const prompt = "Traduis ce texte en français, sans aucun commentaire ni guillemets, juste la traduction directe :\n\n" + message.text;
    const translated = await callAIProvider(prompt, 300, await getGovernanceAIProvider());
    if(translated){
      el.innerHTML = escapeHtml(translated) + ' <span style="opacity:0.6; font-size:10.5px;">(traduit)</span>';
      el.dataset.translated = 'true';
    } else {
      el.innerHTML = originalHtml;
    }
  }catch(e){
    el.innerHTML = originalHtml;
    showToast('Traduction indisponible pour le moment');
  }
}
/* ---------- VENDEURS DE MON QUARTIER ---------- */
async function renderNearbySellers(){
  const el = document.getElementById('nearby-sellers-list');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.city || !me.city.trim()){
    el.innerHTML = '<div class="empty">Renseignez votre ville dans votre profil pour voir les vendeurs près de chez vous.</div>';
    return;
  }
  const allUsers = await fetchUsers();
  const allProducts = await fetchProducts();
  const productCountBySeller = {};
  allProducts.forEach(p => { if(p.sellerUsername) productCountBySeller[p.sellerUsername] = (productCountBySeller[p.sellerUsername]||0) + 1; });
  const nearbySellers = allUsers.filter(u =>
    u.username !== currentUser &&
    u.city && u.city.trim().toLowerCase() === me.city.trim().toLowerCase() &&
    productCountBySeller[u.username] > 0
  );
  if(nearbySellers.length === 0){
    el.innerHTML = '<div class="empty">Aucun vendeur actif trouvé à '+escapeHtml(me.city)+' pour l’instant.</div>';
    return;
  }
  nearbySellers.sort((a,b) => (productCountBySeller[b.username]||0) - (productCountBySeller[a.username]||0));
  el.innerHTML = nearbySellers.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' +
    smallAvatarBadge(u.username, 40) +
    '<div style="flex:1;"><strong style="font-size:13px;">'+(u.storefrontName ? '🏪 '+escapeHtml(u.storefrontName) : '@'+escapeHtml(u.username))+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">'+(productCountBySeller[u.username]||0)+' produit(s) · '+escapeHtml(u.city)+'</p></div>' +
    '</div>'
  ).join('');
}
async function renderRecentlyViewed(){
  const el = document.getElementById('recently-viewed-list');
  if(!el || !currentUser) return;
  const keys = await safeList('recentlyviewed:' + currentUser + '__', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(b.viewedAt) - new Date(a.viewedAt));
  const recent = entries.slice(0, 20);
  if(recent.length === 0){ el.innerHTML = '<div class="empty">Aucun produit consulté pour l’instant.</div>'; return; }
  const rows = [];
  for(const entry of recent){
    const p = await safeGet('product:' + entry.productId, true);
    if(!p) continue;
    rows.push('<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;" onclick="openOrderScreen(\''+p.id+'\')">' +
      (p.image ? '<img src="'+p.image+'" style="width:44px; height:44px; border-radius:6px; object-fit:cover;">' : '') +
      '<div style="flex:1;"><strong style="font-size:12.5px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</p></div></div>');
  }
  el.innerHTML = rows.length === 0 ? '<div class="empty">Aucun produit consulté pour l’instant.</div>' : rows.join('');
}
async function copyProductShareLink(productId){
  const url = window.location.origin + window.location.pathname + '?produit=' + productId;
  if(navigator.share){ navigator.share({title: 'Suktum', url}); return; }
  try{
    await navigator.clipboard.writeText(url);
    showToast('Lien du produit copié — partagez-le où vous voulez ⛵');
  }catch(e){
    showToast('Impossible de copier automatiquement — voici le lien : ' + url);
  }
}
async function loadDescriptionTemplatesPicker(){
  const picker = document.getElementById('seller-desc-template-picker');
  if(!picker) return;
  const keys = await safeList('descriptiontemplate:' + currentUser + '__', true);
  const templates = [];
  for(const k of keys){ const t = await safeGet(k, true); if(t) templates.push(t); }
  picker.innerHTML = '<option value="">— Utiliser un modèle enregistré —</option>' + templates.map(t => '<option value="'+t.id+'">'+escapeHtml(t.name)+'</option>').join('');
}
async function renderVoiceCallHistory(){
  const el = document.getElementById('voice-call-history-list');
  if(!el) return;
  const keys = await safeList('voicecalllog:', true);
  const calls = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c && (c.caller === currentUser || c.callee === currentUser)) calls.push(c); }
  calls.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = calls.length === 0 ? '<div class="empty">Aucun appel pour l’instant.</div>' : calls.map(c => {
    const otherParty = c.caller === currentUser ? c.callee : c.caller;
    const direction = c.caller === currentUser ? '📤 Appel passé à' : '📥 Appel reçu de';
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">'+direction+' @'+escapeHtml(otherParty)+'</p>' +
      (c.context ? '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">À propos de : '+escapeHtml(c.context)+'</p>' : '') +
      '<p style="margin:0; font-size:11px; color:var(--gold);">'+new Date(c.createdAt).toLocaleString('fr-FR')+'</p></div>';
  }).join('');
}
function endVoiceCall(){
  document.getElementById('voice-call-iframe').removeAttribute('src');
  go('shop');
}
async function joinDeliveryCircle(){
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.city || !me.city.trim()){ showToast('Renseignez votre ville dans votre profil avant de rejoindre un cercle'); return; }
  await saveWithRetry('deliverycircle:' + me.city.toLowerCase() + '__' + currentUser, { username: currentUser, city: me.city, joinedAt: new Date().toISOString() }, true);
  showToast('Vous avez rejoint le cercle de ' + me.city + ' ✓');
  await renderGroupedDelivery();
}
async function leaveDeliveryCircle(){
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.city) return;
  await window.storage.delete('deliverycircle:' + me.city.toLowerCase() + '__' + currentUser, true).catch(() => {});
  showToast('Vous avez quitté le cercle');
  await renderGroupedDelivery();
}
async function renderGroupedDelivery(){
  const joinAreaEl = document.getElementById('grouped-delivery-join-area');
  const membersEl = document.getElementById('grouped-delivery-members');
  const pendingEl = document.getElementById('grouped-delivery-pending');
  if(!joinAreaEl) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.city || !me.city.trim()){
    joinAreaEl.innerHTML = '<div class="card"><p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.5);">Renseignez votre ville dans votre profil pour rejoindre un cercle de livraison.</p></div>';
    membersEl.innerHTML = '';
    pendingEl.innerHTML = '';
    return;
  }
  const cityKey = me.city.toLowerCase();
  const myMembership = await safeGet('deliverycircle:' + cityKey + '__' + currentUser, true);
  joinAreaEl.innerHTML = myMembership
    ? '<div class="card"><p style="margin:0 0 8px; font-size:12.5px; color:var(--lagoon);">✓ Vous faites partie du cercle de '+escapeHtml(me.city)+'</p><button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="leaveDeliveryCircle()">Quitter le cercle</button></div>'
    : '<button class="btn btn-primary" style="width:100%;" onclick="joinDeliveryCircle()">Rejoindre le cercle de '+escapeHtml(me.city)+'</button>';
  if(!myMembership){ membersEl.innerHTML = ''; pendingEl.innerHTML = ''; return; }
  const keys = await safeList('deliverycircle:' + cityKey + '__', true);
  const members = [];
  for(const k of keys){ const m = await safeGet(k, true); if(m) members.push(m); }
  const otherMembers = members.filter(m => m.username !== currentUser);
  membersEl.innerHTML = otherMembers.length === 0
    ? '<div class="empty">Vous êtes seul(e) dans ce cercle pour l’instant.</div>'
    : otherMembers.map(m => '<div class="card" style="margin-bottom:6px;"><span style="font-size:13px;">@'+escapeHtml(m.username)+'</span></div>').join('');
  const memberUsernames = members.map(m => m.username);
  const allOrders = await fetchOrders();
  const pendingOrders = allOrders.filter(o => memberUsernames.includes(o.sellerUsername) && o.shipmentStage && o.shipmentStage !== 'delivered');
  pendingEl.innerHTML = pendingOrders.length === 0
    ? '<div class="empty">Aucune livraison en attente parmi les membres du cercle.</div>'
    : pendingOrders.map(o => '<div class="card" style="margin-bottom:6px;"><p style="margin:0; font-size:12.5px;">'+escapeHtml(o.productName)+' × '+o.quantity+' — vendu par @'+escapeHtml(o.sellerUsername)+'</p></div>').join('');
}
async function runSellerAICoach(){
  const statusEl = document.getElementById('seller-coach-status');
  statusEl.textContent = '⏳ Analyse de vos ventes en cours...';
  try{
    const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser);
    const allOrders = await fetchOrders();
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000);
    const myRecentOrders = allOrders.filter(o => o.sellerUsername === currentUser && new Date(o.createdAt) > monthAgo);
    if(myRecentOrders.length === 0 && myProducts.length === 0){
      statusEl.textContent = '✕ Pas encore assez de données — publiez au moins un produit pour recevoir des conseils.';
      return;
    }
    const revenueTotal = myRecentOrders.reduce((s,o) => s + (o.total||0), 0);
    const productSalesCounts = {};
    myRecentOrders.forEach(o => { productSalesCounts[o.productName] = (productSalesCounts[o.productName] || 0) + o.quantity; });
    const salesLines = Object.entries(productSalesCounts).map(([name, qty]) => '- ' + name + ' : ' + qty + ' vendu(s)').join('\n') || '(aucune vente ce mois-ci)';
    const outOfStockProducts = myProducts.filter(p => p.stock !== null && p.stock !== undefined && p.stock <= 0).map(p => p.name);
    const ratings = [];
    for(const o of myRecentOrders){
      const r = await safeGet('sellerrating:' + o.id, true);
      if(r) ratings.push(r.stars);
    }
    const avgRating = ratings.length > 0 ? (ratings.reduce((s,x) => s+x, 0) / ratings.length).toFixed(1) : null;

    const prompt = 'Tu conseilles un vendeur indépendant sur Suktum (marketplace sociale au Sénégal). Voici ses vraies données réelles des 30 derniers jours :\n\n' +
      'Chiffre d’affaires : ' + revenueTotal.toLocaleString('fr-FR') + ' FCFA sur ' + myRecentOrders.length + ' commande(s)\n' +
      'Produits publiés : ' + myProducts.length + '\n' +
      'Ventes par produit :\n' + salesLines + '\n' +
      (outOfStockProducts.length > 0 ? 'Produits en rupture de stock : ' + outOfStockProducts.join(', ') + '\n' : '') +
      (avgRating ? 'Note moyenne reçue : ' + avgRating + '/5 (' + ratings.length + ' avis)\n' : 'Aucun avis reçu pour l’instant.\n') +
      '\nÀ partir de ces vraies informations, donne 5 conseils concrets et courts pour vendre mieux le mois prochain. Reste factuel, ne suppose rien que ces données ne permettent pas de déduire, et signale si une information te manque pour juger d’un point.';

    const provider = await getGovernanceAIProvider();
    const aiResponse = await callAIProvider(prompt, 700, provider);
    if(!aiResponse){
      statusEl.textContent = '✕ Réponse indisponible pour le moment (connexion IA).';
      return;
    }
    await saveWithRetry('sellercoachreport:' + currentUser, { content: aiResponse, provider, generatedAt: new Date().toISOString() }, true);
    statusEl.textContent = '';
    await renderSellerAICoachReport();
  }catch(e){
    statusEl.textContent = '✕ Analyse indisponible pour le moment : ' + e.message;
  }
}
async function renderSellerAICoachReport(){
  const el = document.getElementById('seller-coach-report');
  if(!el) return;
  const report = await safeGet('sellercoachreport:' + currentUser, true);
  if(!report){
    el.innerHTML = '<div class="empty">Aucune analyse générée pour l’instant — cliquez sur "Analyser mes ventes" ci-dessus.</div>';
    return;
  }
  el.innerHTML = '<div class="card"><p style="margin:0 0 8px; font-size:11px; color:var(--gold);">Généré le ' + new Date(report.generatedAt).toLocaleString('fr-FR') + '</p>' +
    '<p style="margin:0; font-size:13px; white-space:pre-line; line-height:1.6;">' + escapeHtml(report.content) + '</p></div>';
}
function toggleAuctionFields(){
  const checked = document.getElementById('seller-product-auction-toggle').checked;
  document.getElementById('auction-fields').style.display = checked ? 'block' : 'none';
}
function toggleMysteryBoxFields(){
  const checked = document.getElementById('seller-product-mystery-toggle').checked;
  document.getElementById('mystery-box-fields').style.display = checked ? 'block' : 'none';
}
function toggleGuaranteeDaysField(){
  const checked = document.getElementById('seller-product-guarantee-toggle').checked;
  document.getElementById('guarantee-days-field').style.display = checked ? 'block' : 'none';
}
function toggleServiceSlotsUI(){
  const checked = document.getElementById('seller-product-is-service').checked;
  document.getElementById('service-slots-section').style.display = checked ? 'block' : 'none';
}
function generateRecurringSlots(){
  const targetDay = parseInt(document.getElementById('recurring-slot-day').value, 10);
  const startTime = document.getElementById('recurring-slot-start').value;
  const endTime = document.getElementById('recurring-slot-end').value;
  const durationMin = parseInt(document.getElementById('recurring-slot-duration').value, 10);
  const weeksCount = parseInt(document.getElementById('recurring-slot-weeks').value, 10);
  if(!startTime || !endTime){ showToast('Renseignez les heures de début et de fin'); return; }
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  if(endMinutes <= startMinutes){ showToast('L’heure de fin doit être après l’heure de début'); return; }
  let addedCount = 0;
  const now = new Date();
  for(let week = 0; week < weeksCount; week++){
    const dayDiff = (targetDay - now.getDay() + 7) % 7 + week * 7;
    const dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayDiff);
    for(let m = startMinutes; m < endMinutes; m += durationMin){
      const slot = new Date(dayDate);
      slot.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if(slot <= now) continue;
      const iso = slot.toISOString();
      if(!serviceSlotsDraft.includes(iso)){ serviceSlotsDraft.push(iso); addedCount++; }
    }
  }
  serviceSlotsDraft.sort();
  renderServiceSlotsDraft();
  showToast(addedCount + ' créneau(x) généré(s) ✓');
}
function addServiceSlotDraft(){
  const input = document.getElementById('new-service-slot-input');
  if(!input.value){ showToast('Choisissez une date et une heure'); return; }
  const iso = new Date(input.value).toISOString();
  if(serviceSlotsDraft.includes(iso)){ showToast('Ce créneau est déjà dans la liste'); return; }
  serviceSlotsDraft.push(iso);
  serviceSlotsDraft.sort();
  input.value = '';
  renderServiceSlotsDraft();
}
function removeServiceSlotDraft(iso){
  serviceSlotsDraft = serviceSlotsDraft.filter(s => s !== iso);
  renderServiceSlotsDraft();
}
function renderServiceSlotsDraft(){
  const el = document.getElementById('service-slots-draft-list');
  el.innerHTML = serviceSlotsDraft.length === 0 ? '<p style="font-size:11.5px; color:rgba(245,239,227,0.4); margin:0;">Aucun créneau ajouté pour l’instant.</p>' :
    serviceSlotsDraft.map(iso => '<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; font-size:12.5px;"><span>📅 '+new Date(iso).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</span><span onclick="removeServiceSlotDraft(\''+iso+'\')" style="color:var(--coral); cursor:pointer;">✕</span></div>').join('');
}
async function addSellerProduct(){
  const name = document.getElementById('seller-product-name').value.trim();
  const description = document.getElementById('seller-product-desc').value.trim();
  const price = parseInt(document.getElementById('seller-product-price').value, 10);
  const fileInput = document.getElementById('seller-product-image');
  if(!name || isNaN(price) || price <= 0){ showToast('Renseignez au moins le nom et un prix valide'); return; }
  const prohibitedKeywords = await getProhibitedProductKeywords();
  const matchedKeyword = containsForbiddenWord(name + ' ' + description, prohibitedKeywords);
  if(matchedKeyword){
    showToast('Ce produit ne peut pas être publié — il semble appartenir à une catégorie interdite sur Suktum.');
    await logAdminAction('Tentative de publication de produit bloquée (catégorie interdite)', '@' + currentUser + ' — « ' + name + ' » (mot détecté : ' + matchedKeyword + ')');
    return;
  }
  let image = null;
  let mediaCheck = { checked: false };
  if(fileInput.files[0]){
    try{ image = await readFileAsDataURL(fileInput.files[0]); image = await compressImageDataUrl(image, 1000, 0.75); }catch(e){ showToast('Impossible de charger la photo'); return; }
    mediaCheck = await moderateImageWithCloudVision(image);
  }
  const id = 'prod_' + Date.now();
  const category = document.getElementById('seller-product-category').value.trim();
  const isBarter = document.getElementById('seller-product-barter').checked;
  const isService = document.getElementById('seller-product-is-service').checked;
  const isAuction = document.getElementById('seller-product-auction-toggle').checked;
  const auctionStartBid = isAuction ? parseInt(document.getElementById('seller-product-auction-start-bid').value, 10) : null;
  const auctionDurationHours = isAuction ? parseInt(document.getElementById('seller-product-auction-duration').value, 10) : null;
  if(isAuction && (isNaN(auctionStartBid) || auctionStartBid <= 0 || isNaN(auctionDurationHours) || auctionDurationHours <= 0)){ showToast('Renseignez une mise de départ et une durée valides pour l’enchère'); return; }
  if(isAuction && isBarter){ showToast('Un produit ne peut pas être à la fois en troc et aux enchères'); return; }
  const isMysteryBox = document.getElementById('seller-product-mystery-toggle').checked;
  const mysteryValueRaw = document.getElementById('seller-product-mystery-value').value;
  const mysteryEstimatedValue = mysteryValueRaw === '' ? null : Math.max(0, parseInt(mysteryValueRaw, 10) || 0);
  if(isMysteryBox && isAuction){ showToast('Un colis mystère ne peut pas être vendu aux enchères'); return; }
  const auctionEndTime = isAuction ? new Date(Date.now() + auctionDurationHours*60*60*1000).toISOString() : null;
  const hasGuarantee = document.getElementById('seller-product-guarantee-toggle').checked;
  const guaranteeDaysRaw = document.getElementById('seller-product-guarantee-days').value;
  const guaranteeDays = hasGuarantee ? (parseInt(guaranteeDaysRaw, 10) || null) : null;
  if(hasGuarantee && !guaranteeDays){ showToast('Renseignez un nombre de jours pour la garantie'); return; }
  const stockRaw = document.getElementById('seller-product-stock').value;
  const stock = stockRaw === '' ? null : Math.max(0, parseInt(stockRaw, 10) || 0);
  const affiliateCommissionRaw = document.getElementById('seller-product-affiliate-commission').value;
  const affiliateCommissionPercent = affiliateCommissionRaw === '' ? null : Math.max(0, Math.min(100, parseInt(affiliateCommissionRaw, 10) || 0));
  const variants = Array.from(document.querySelectorAll('.product-variant-row')).map(row => ({
    name: row.querySelector('.variant-name-input').value.trim(),
    values: row.querySelector('.variant-values-input').value.split(',').map(v => v.trim()).filter(Boolean)
  })).filter(v => v.name && v.values.length > 0);
  await saveWithRetry('product:' + id, {
    id, name, description, price, category: category || null, image, sellerUsername: currentUser, country: currentUserCountry,
    isBarter, isService, serviceSlots: isService ? [...serviceSlotsDraft] : [], stock, variants,
    isAuction, auctionStartBid, auctionEndTime, auctionCurrentBid: auctionStartBid, auctionHighestBidder: null, auctionSettled: false,
    isMysteryBox, mysteryEstimatedValue,
    affiliateCommissionPercent, guaranteeDays,
    mediaFlagged: mediaCheck.checked && mediaCheck.flagged, mediaFlagReason: mediaCheck.reason || null,
    createdAt: new Date().toISOString()
  }, true);
  const meForFollowerAlert = await safeGet('user:' + currentUser, true);
  const followersForAlert = (meForFollowerAlert && meForFollowerAlert.followers) || [];
  for(const follower of followersForAlert){
    await createNotification(follower, 'new_product_from_followed_seller', currentUser, id, name);
  }
  document.getElementById('seller-product-auction-toggle').checked = false;
  document.getElementById('seller-product-mystery-toggle').checked = false;
  document.getElementById('mystery-box-fields').style.display = 'none';
  document.getElementById('seller-product-auction-start-bid').value = '';
  document.getElementById('seller-product-auction-duration').value = '';
  document.getElementById('auction-fields').style.display = 'none';
  document.getElementById('seller-product-guarantee-toggle').checked = false;
  document.getElementById('seller-product-guarantee-days').value = '';
  document.getElementById('guarantee-days-field').style.display = 'none';
  document.getElementById('seller-product-affiliate-commission').value = '';
  document.getElementById('seller-product-name').value = '';
  document.getElementById('seller-product-desc').value = '';
  document.getElementById('seller-product-price').value = '';
  document.getElementById('seller-product-category').value = '';
  document.getElementById('seller-product-category-suggestion').textContent = '';
  document.getElementById('seller-product-stock').value = '';
  document.getElementById('seller-product-variants-list').innerHTML = '';
  document.getElementById('seller-product-barter').checked = false;
  document.getElementById('seller-product-is-service').checked = false;
  serviceSlotsDraft = [];
  document.getElementById('service-slots-section').style.display = 'none';
  document.getElementById('service-slots-draft-list').innerHTML = '';
  fileInput.value = '';
  if(mediaCheck.checked && mediaCheck.flagged){
    await logAdminAction('Photo de produit signalée automatiquement (Google Cloud)', '@'+currentUser+' — '+mediaCheck.reason);
    showToast('Produit envoyé pour vérification avant d’être visible dans la boutique');
  } else {
    showToast('Produit publié dans votre boutique ✓');
  }
  await renderSellerDashboard();
}
/* ---------- MODE ABSENCE VENDEUR ---------- */
/* ---------- VITRINE DE BOUTIQUE PERSONNALISÉE ---------- */
async function saveSellerStorefront(){
  const name = document.getElementById('seller-storefront-name-input').value.trim();
  const tagline = document.getElementById('seller-storefront-tagline-input').value.trim();
  const fileInput = document.getElementById('seller-storefront-banner-input');
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.storefrontName = name || null;
  me.storefrontTagline = tagline || null;
  if(fileInput.files[0]){
    try{
      let banner = await readFileAsDataURL(fileInput.files[0]);
      banner = await compressImageDataUrl(banner, 1000, 0.75);
      me.storefrontBanner = banner;
    }catch(e){ showToast('Impossible de charger la bannière'); return; }
  }
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Vitrine enregistrée ✓');
}
async function loadSellerStorefrontForm(){
  const nameInput = document.getElementById('seller-storefront-name-input');
  if(!nameInput) return;
  const me = await safeGet('user:' + currentUser, true);
  nameInput.value = (me && me.storefrontName) || '';
  document.getElementById('seller-storefront-tagline-input').value = (me && me.storefrontTagline) || '';
}
async function toggleSellerVoiceCallsBlocked(){
  const blocked = document.getElementById('seller-block-voice-calls-toggle').checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.voiceCallsBlocked = blocked;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast(blocked ? 'Appels vocaux désactivés ✓' : 'Appels vocaux réactivés ✓');
}
async function loadSellerVoiceCallsBlockedToggle(){
  const toggle = document.getElementById('seller-block-voice-calls-toggle');
  if(!toggle) return;
  const me = await safeGet('user:' + currentUser, true);
  toggle.checked = !!(me && me.voiceCallsBlocked);
}
async function saveSellerLowStockThreshold(){
  const value = parseInt(document.getElementById('seller-low-stock-threshold-input').value, 10);
  if(isNaN(value) || value < 0){ showToast('Entrez un seuil valide'); return; }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.lowStockThreshold = value;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Seuil enregistré ✓');
}
async function loadSellerLowStockThreshold(){
  const input = document.getElementById('seller-low-stock-threshold-input');
  if(!input) return;
  const me = await safeGet('user:' + currentUser, true);
  input.value = (me && me.lowStockThreshold !== null && me.lowStockThreshold !== undefined) ? me.lowStockThreshold : 2;
}
async function toggleSellerAwayMode(){
  const isAway = document.getElementById('seller-away-mode-toggle').checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.awayMode = isAway;
  await saveWithRetry('user:' + currentUser, me, true);
  document.getElementById('seller-away-message-field').style.display = isAway ? 'block' : 'none';
  showToast(isAway ? 'Mode absence activé ✓' : 'Mode absence désactivé ✓');
}
async function saveSellerAwayMessage(){
  const message = document.getElementById('seller-away-message-input').value.trim();
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.awayMessage = message;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Message enregistré ✓');
}
async function loadSellerAwayMode(){
  const toggle = document.getElementById('seller-away-mode-toggle');
  if(!toggle) return;
  const me = await safeGet('user:' + currentUser, true);
  toggle.checked = !!(me && me.awayMode);
  document.getElementById('seller-away-message-field').style.display = toggle.checked ? 'block' : 'none';
  document.getElementById('seller-away-message-input').value = (me && me.awayMessage) || '';
}
async function saveSellerPaymentNumber(){
  const number = document.getElementById('seller-payment-number-input').value.trim();
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.sellerPaymentNumber = number;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Numéro de reversement enregistré ✓');
}
async function saveSellerWhatsApp(){
  const number = document.getElementById('seller-whatsapp-input').value.trim();
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.whatsappNumber = number;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Numéro WhatsApp enregistré ✓');
}
/* ---------- RAPPEL MÉTÉO POUR LES VENDEURS EN EXTÉRIEUR ---------- */
async function checkSellerWeatherAlert(){
  const el = document.getElementById('seller-weather-alert-banner');
  if(!el) return;
  el.innerHTML = '';
  const apiKey = await safeGet('settings:weatherApiKey', true);
  if(!apiKey) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.city) return;
  const todayKey = new Date().toISOString().slice(0,10);
  const cacheKey = 'weathercheck:' + currentUser + '__' + todayKey;
  let result = await safeGet(cacheKey, false).catch(() => null);
  if(!result){
    try{
      const response = await fetch('https://api.openweathermap.org/data/2.5/weather?q=' + encodeURIComponent(me.city) + '&appid=' + apiKey + '&units=metric&lang=fr');
      const data = await response.json();
      if(data.cod !== 200){ return; }
      const condition = (data.weather && data.weather[0] && data.weather[0].main) || '';
      const description = (data.weather && data.weather[0] && data.weather[0].description) || '';
      result = { condition, description, city: me.city };
      await saveWithRetry(cacheKey, result, false);
    }catch(e){
      return; // pas d'accès réseau ou clé invalide — on n'affiche rien plutôt que d'induire en erreur
    }
  }
  const badConditions = ['Rain', 'Thunderstorm', 'Drizzle', 'Extreme'];
  if(badConditions.includes(result.condition)){
    el.innerHTML = '<div class="card" style="border-color:var(--gold); margin-bottom:14px;"><p style="margin:0; font-size:12.5px; color:var(--gold);">🌦️ Météo à '+escapeHtml(result.city)+' aujourd’hui : '+escapeHtml(result.description)+' — pensez à protéger vos produits en extérieur.</p></div>';
  }
}
async function renderSellerCancellationStats(){
  const el = document.getElementById('seller-cancellation-stats');
  if(!el || !currentUser) return;
  const myOrders = (await fetchOrders()).filter(o => o.sellerUsername === currentUser);
  if(myOrders.length === 0){ el.innerHTML = ''; return; }
  const cancelledCount = myOrders.filter(o => o.status === 'cancelled' && o.cancelledBy === 'seller').length;
  if(cancelledCount === 0){ el.innerHTML = ''; return; }
  const rate = Math.round((cancelledCount / myOrders.length) * 100);
  el.innerHTML = '<div class="card" style="'+(rate >= 15 ? 'border-color:var(--coral);' : '')+'"><p style="margin:0; font-size:12.5px; color:'+(rate >= 15 ? 'var(--coral)' : 'rgba(245,239,227,0.6)')+';">✕ Vous avez annulé '+cancelledCount+' commande(s) sur '+myOrders.length+' ('+rate+'%)'+(rate >= 15 ? ' — un taux élevé peut affecter la confiance des acheteurs' : '')+'</p></div>';
}
async function renderSellerDashboard(){
  await checkSellerWeatherAlert();
  await renderSellerCancellationStats();
  await renderBundleDiscountStatus();
  await cleanupPastServiceSlots();
  await checkServiceSlotsReminder();
  await checkMonthlySellerReport();
  const meForWhatsApp = await safeGet('user:' + currentUser, true);
  const waInput = document.getElementById('seller-whatsapp-input');
  if(waInput) waInput.value = (meForWhatsApp && meForWhatsApp.whatsappNumber) || '';
  const paymentInput = document.getElementById('seller-payment-number-input');
  if(paymentInput) paymentInput.value = (meForWhatsApp && meForWhatsApp.sellerPaymentNumber) || '';
  await renderQuickRepliesManager();
  await renderSellerSalesGoal();
  await renderMyPromoCodes();
  await loadSellerAwayMode();
  await loadSellerLowStockThreshold();
  await loadSellerVoiceCallsBlockedToggle();
  await loadDescriptionTemplatesPicker();
  await loadSellerStorefrontForm();
  const allProducts = await fetchProducts();
  const myProducts = allProducts.filter(p => p.sellerUsername === currentUser);
  const allOrders = await fetchOrders();
  const myOrders = allOrders.filter(o => o.sellerUsername === currentUser);
  const disputedOrderIds = new Set();
  for(const o of myOrders){
    const rr = await safeGet('refundrequest:' + o.id, true);
    if(rr && rr.status === 'pending') disputedOrderIds.add(o.id);
  }

  const totalSales = myOrders.reduce((s,o) => s + o.total, 0);
  const totalEarnings = myOrders.filter(o => !disputedOrderIds.has(o.id)).reduce((s,o) => s + (o.netAmount || 0), 0);
  const totalPaidToMe = myOrders.filter(o => o.payoutStatus === 'paid' && !disputedOrderIds.has(o.id)).reduce((s,o) => s + (o.netAmount || 0), 0);
  const totalOwedToMe = totalEarnings - totalPaidToMe;
  const pendingCount = myOrders.filter(o => o.status === 'pending').length;
  document.getElementById('seller-revenue-summary').innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">🛍️ <strong>'+myProducts.length+'</strong> produit(s) en vente</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">🧾 <strong>'+myOrders.length+'</strong> commande(s), dont <strong>'+pendingCount+'</strong> en attente</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">💵 Ventes totales : <strong>'+totalSales.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:15px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">💰 Mes gains nets : '+totalEarnings.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0 0 4px; font-size:13px; color:var(--lagoon);">✓ Déjà reçu : '+totalPaidToMe.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:13px; color:var(--coral);">⏳ Reste à recevoir : '+totalOwedToMe.toLocaleString('fr-FR')+' FCFA</p>';

  const productsEl = document.getElementById('seller-products-list');
  if(myProducts.length === 0){ productsEl.innerHTML = '<div class="empty">Aucun produit pour l’instant.</div>'; }
  else{
    productsEl.innerHTML = myProducts.map(p =>
      '<div class="card" style="display:flex; gap:12px; align-items:center;">' +
      (p.image ? '<img src="'+p.image+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">' : '') +
      '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="font-size:12px; color:var(--gold); margin:3px 0 0;">'+p.price.toLocaleString('fr-FR')+' FCFA</p>' +
      (p.mediaFlagged ? '<p style="font-size:11px; color:var(--coral); margin:3px 0 0;">⏳ En attente de vérification</p>' : '') +
      '</div>' +
      '<button class="btn btn-outline btn-sm" onclick="announcePriceDrop(\''+p.id+'\')">📢 Baisse de prix</button>' +
      ((p.stock !== null && p.stock !== undefined) ? '<button class="btn btn-outline btn-sm" onclick="restockProduct(\''+p.id+'\')">📦 Réapprovisionner</button>' : '') +
      '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="deleteSellerProduct(\''+p.id+'\')">🗑️</button>' +
      '</div>'
    ).join('');
  }

  const ordersEl = document.getElementById('seller-orders-list');
  if(myOrders.length === 0){ ordersEl.innerHTML = '<div class="empty">Aucune commande pour l’instant.</div>'; }
  else{
    const quickReplies = await fetchQuickReplies();
    const buyerRatingsHtml = {};
    for(const o of myOrders){
      if(o.shipmentStage === 'delivered'){
        const existing = await safeGet('buyerrating:' + o.id, true);
        buyerRatingsHtml[o.id] = existing
          ? '<p style="margin-top:8px; font-size:12px; color:var(--gold);">Votre note pour cet acheteur : '+'⭐'.repeat(existing.stars)+'</p>'
          : '<div style="margin-top:8px;"><p style="margin:0 0 4px; font-size:12px;">Noter cet acheteur :</p><div>'+[1,2,3,4,5].map(n => '<span onclick="rateBuyerForOrder(\''+o.id+'\', '+n+')" style="font-size:20px; cursor:pointer;">⭐</span>').join('')+'</div></div>';
      }
    }
    ordersEl.innerHTML = myOrders.map(o =>
      '<div class="card" style="position:relative; padding-right:40px;">' +
      '<span onclick="openSellerOrderKebabMenu(\''+o.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
      (disputedOrderIds.has(o.id) ? '<p style="margin:0 0 6px; font-size:12px; color:var(--coral); font-weight:600;">🔒 En litige — ne pas considérer ce versement comme définitif tant que le remboursement n’est pas examiné</p>' : '') +
      '<p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(o.productName)+'</strong> × '+o.quantity+' — '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
      (o.selectedVariants ? '<p style="margin:0 0 4px; font-size:12px; color:var(--gold);">🎨 '+Object.entries(o.selectedVariants).map(([k,v]) => escapeHtml(k)+' : '+escapeHtml(v)).join(' · ')+'</p>' : '') +
      '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">@'+escapeHtml(o.buyerUsername)+' · '+(o.status === 'cancelled' ? '✕ Annulée par l’acheteur' : (o.status === 'fulfilled' ? '✓ Traitée' : '⏳ En attente'))+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">👤 '+escapeHtml(o.buyerName)+'</p>' +
      '<p style="margin:0 0 2px; font-size:12px;">📞 '+escapeHtml(o.buyerPhone)+'</p>' +
      '<p style="margin:0 0 8px; font-size:12px;">📍 '+escapeHtml(o.buyerAddress)+'</p>' +
      (quickReplies.length > 0 ? '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">' +
        quickReplies.map((r, i) => '<button class="btn btn-outline btn-sm" style="font-size:11px; padding:4px 8px;" onclick="useQuickReply(\''+escapeHtml(o.buyerUsername)+'\', '+i+')">⚡ '+escapeHtml(r.slice(0,20))+(r.length>20?'...':'')+'</button>').join('') +
        '</div>' : '') +
      '<p style="margin:2px 0 0; font-size:12px; color:'+(o.payoutStatus === 'paid' ? 'var(--lagoon)' : 'var(--gold)')+';">'+(o.payoutStatus === 'paid' ? '✓ Reversé' : '⏳ Reversement en attente')+'</p>' +
      '<div class="eyebrow" style="margin-top:10px;">📦 Suivi d’expédition</div>' +
      (o.status === 'cancelled' ? '<p style="margin:0; font-size:12px; color:var(--coral);">Cette commande a été annulée — aucune expédition à effectuer.</p>' : renderShipmentStageControls(o.id, o.shipmentStage)) +
      (buyerRatingsHtml[o.id] || '') +
      '</div>'
    ).join('');
  }
}
/* ---------- NOTATION VENDEUR + BADGE "VENDEUR RECOMMANDÉ" ---------- */
/* ---------- NOTATION DE L'ACHETEUR PAR LE VENDEUR ---------- */
async function rateBuyerForOrder(orderId, stars){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.sellerUsername !== currentUser || o.shipmentStage !== 'delivered') return;
  const existing = await safeGet('buyerrating:' + orderId, true);
  if(existing) return;
  await saveWithRetry('buyerrating:' + orderId, {
    buyerUsername: o.buyerUsername, sellerUsername: currentUser, stars, orderId,
    createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre note ⭐');
  await checkReliableBuyerBadge(o.buyerUsername);
  await renderSellerDashboard();
}
async function fetchBuyerRatings(buyerUsername){
  const keys = await safeList('buyerrating:', true);
  const ratings = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r && r.buyerUsername === buyerUsername) ratings.push(r); }
  return ratings;
}
async function checkReliableBuyerBadge(buyerUsername){
  const ratings = await fetchBuyerRatings(buyerUsername);
  if(ratings.length < 5) return;
  const avgStars = ratings.reduce((s,r) => s + r.stars, 0) / ratings.length;
  const qualifies = avgStars >= 4;
  const u = await safeGet('user:' + buyerUsername, true);
  if(!u) return;
  if(qualifies && !u.reliableBuyer){
    u.reliableBuyer = true;
    await saveWithRetry('user:' + buyerUsername, u, true);
    await createNotification(buyerUsername, 'reliable_buyer_badge', 'Suktum', null, null);
  } else if(!qualifies && u.reliableBuyer){
    u.reliableBuyer = false;
    await saveWithRetry('user:' + buyerUsername, u, true);
  }
}
async function rateSeries(seriesId, stars){
  const progress = await safeGet('seriesprogress:' + seriesId + '__' + currentUser, false).catch(() => null);
  const owned = await hasUserPurchasedSeries(seriesId, currentUser);
  if(!progress && !owned){ showToast('Regardez au moins un épisode avant de noter cette série'); return; }
  const existing = await safeGet('seriesrating:' + seriesId + '__' + currentUser, true).catch(() => null);
  if(existing){ showToast('Vous avez déjà noté cette série'); return; }
  const comment = prompt('Un commentaire à ajouter sur cette série ? (facultatif, laissez vide pour passer)');
  await saveWithRetry('seriesrating:' + seriesId + '__' + currentUser, {
    seriesId, username: currentUser, stars,
    comment: (comment && comment.trim()) ? comment.trim() : null,
    createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre note ⭐');
  await openSeriesDetail(seriesId);
}
async function fetchSeriesRatings(seriesId){
  const keys = await safeList('seriesrating:' + seriesId + '__', true);
  const ratings = [];
  for(const k of keys){ const r = await safeGet(k, true).catch(() => null); if(r) ratings.push(r); }
  return ratings;
}
async function rateSellerForOrder(orderId, stars){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.buyerUsername !== currentUser || o.shipmentStage !== 'delivered') return;
  const existing = await safeGet('sellerrating:' + orderId, true);
  if(existing) return;
  const comment = prompt('Un commentaire à ajouter sur ce vendeur ? (facultatif, laissez vide pour passer)');
  await saveWithRetry('sellerrating:' + orderId, {
    sellerUsername: o.sellerUsername, buyerUsername: currentUser, stars, orderId,
    comment: (comment && comment.trim()) ? comment.trim() : null,
    shippingDays: (o.deliveredAt && o.createdAt) ? Math.max(0, (new Date(o.deliveredAt) - new Date(o.createdAt)) / (24*60*60*1000)) : null,
    createdAt: new Date().toISOString()
  }, true);
  showToast('Merci pour votre note ⭐');
  await checkRecommendedSellerBadge(o.sellerUsername);
  await renderMyOrdersScreen();
}
async function fetchSellerRatings(sellerUsername){
  const keys = await safeList('sellerrating:', true);
  const ratings = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r && r.sellerUsername === sellerUsername) ratings.push(r); }
  return ratings;
}
/* ---------- VÉRIFICATION D'IDENTITÉ (KYC) POUR LES GROS VENDEURS ---------- */
/* ---------- CODE DE SÉCURITÉ (PIN) POUR COMPTES À FORTE VISIBILITÉ ---------- */
/* ---------- DOUBLE AUTHENTIFICATION (TOTP, RFC 6238) ---------- */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(bytes){
  let bits = '';
  for(const b of bytes) bits += b.toString(2).padStart(8, '0');
  let output = '';
  for(let i = 0; i + 5 <= bits.length; i += 5) output += BASE32_ALPHABET[parseInt(bits.slice(i, i+5), 2)];
  const remainder = bits.length % 5;
  if(remainder > 0){
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return output;
}
function base32Decode(str){
  const clean = str.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for(const c of clean){
    const idx = BASE32_ALPHABET.indexOf(c);
    if(idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for(let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i+8), 2));
  return new Uint8Array(bytes);
}
async function generateTotpSecret(){
  const randomBytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(randomBytes);
}
async function computeTotpCode(secretBase32, timeStepOverride){
  const key = base32Decode(secretBase32);
  const timeStep = timeStepOverride !== undefined ? timeStepOverride : Math.floor(Date.now() / 1000 / 30);
  const counterBuf = new ArrayBuffer(8);
  const counterView = new DataView(counterBuf);
  counterView.setUint32(4, timeStep, false);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuf);
  const hmac = new Uint8Array(signature);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff);
  return String(binCode % 1000000).padStart(6, '0');
}
async function start2FASetup(){
  const secret = await generateTotpSecret();
  pending2FASecret = secret;
  const backupCode = Math.random().toString(36).slice(2, 10).toUpperCase();
  pending2FABackupCode = backupCode;
  await render2FACard();
}
async function confirm2FASetup(){
  const entered = document.getElementById('totp-confirm-input').value.trim();
  if(!pending2FASecret){ return; }
  const valid = await verifyTotpCode(pending2FASecret, entered);
  if(!valid){ showToast('Code incorrect — vérifiez votre application d’authentification'); return; }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.totpSecret = pending2FASecret;
  me.totpBackupCode = pending2FABackupCode;
  await saveWithRetry('user:' + currentUser, me, true);
  pending2FASecret = null;
  pending2FABackupCode = null;
  showToast('Double authentification activée ✓');
  await render2FACard();
}
async function disable2FA(){
  if(!confirm('Désactiver la double authentification ? Votre compte sera protégé uniquement par le nom d’utilisateur et le code PIN si vous en avez un.')) return;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.totpSecret = null;
  me.totpBackupCode = null;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Double authentification désactivée');
  await render2FACard();
}
let pending2FASecret = null;
let pending2FABackupCode = null;
async function render2FACard(){
  const el = document.getElementById('two-factor-auth-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.totpSecret){
    el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:var(--lagoon);">✓ Double authentification activée — un code de votre application d’authentification sera demandé à chaque connexion.</p>' +
      '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="disable2FA()">Désactiver</button>';
  } else if(pending2FASecret){
    el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Entrez cette clé dans une application comme Google Authenticator, puis saisissez le code affiché pour confirmer.</p>' +
      '<div class="card" style="margin-bottom:10px;"><p style="margin:0; font-size:13px; font-family:monospace; word-break:break-all;">'+pending2FASecret+'</p></div>' +
      '<p style="font-size:11px; color:var(--gold); margin:0 0 10px;">🔑 Code de secours (à noter, en cas de perte de l’application) : <strong>'+pending2FABackupCode+'</strong></p>' +
      '<label style="margin-top:0;">Code à 6 chiffres</label>' +
      '<input type="text" id="totp-confirm-input" placeholder="000000" maxlength="6">' +
      '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="confirm2FASetup()">Confirmer et activer</button>';
  } else {
    el.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Ajoutez un vrai code temporaire à 6 chiffres, généré par une application d’authentification — distinct de votre code PIN.</p>' +
      '<button class="btn btn-primary btn-sm" onclick="start2FASetup()">Activer la double authentification</button>';
  }
}
async function verifyTotpCode(secretBase32, enteredCode){
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for(const offset of [-1, 0, 1]){
    const code = await computeTotpCode(secretBase32, currentStep + offset);
    if(code === enteredCode) return true;
  }
  return false;
}
async function isHighVisibilityAccount(u){
  return !!(u && (u.identityVerified || u.recommendedSeller || (u.isTrainer && u.trainerVerified)));
}
async function renderSecurityPinCard(){
  const el = document.getElementById('security-pin-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const eligible = await isHighVisibilityAccount(me);
  if(!eligible){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Réservé aux comptes à forte visibilité (identité vérifiée, vendeur recommandé, ou formateur vérifié).</p>';
    return;
  }
  if(me.securityPin){
    el.innerHTML = '<p style="font-size:12.5px; color:var(--lagoon); margin:0 0 10px;">✓ Un code de sécurité protège actuellement votre compte à la connexion.</p>' +
      '<button class="btn btn-outline btn-sm" onclick="removeSecurityPin()">Retirer le code de sécurité</button>';
  } else {
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.6); margin:0 0 10px;">Ajoutez un code demandé à chaque connexion sur un nouvel appareil, en plus de votre nom d’utilisateur.</p>' +
      '<input type="password" id="new-security-pin" placeholder="Code à 4-6 chiffres" inputmode="numeric" maxlength="6">' +
      '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="setSecurityPin()">Activer le code de sécurité</button>';
  }
}
async function setSecurityPin(){
  const pin = document.getElementById('new-security-pin').value.trim();
  if(!/^[0-9]{4,6}$/.test(pin)){ showToast('Le code doit contenir 4 à 6 chiffres'); return; }
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.securityPin = pin;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Code de sécurité activé ✓');
  await renderSecurityPinCard();
}
async function removeSecurityPin(){
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.securityPin = null;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Code de sécurité retiré');
  await renderSecurityPinCard();
}
async function submitKycVerification(){
  const fullName = document.getElementById('kyc-full-name').value.trim();
  const file = document.getElementById('kyc-document').files[0];
  if(!fullName || !file){ showToast('Renseignez votre nom complet et une photo de votre pièce'); return; }
  if(file.size > MAX_AUDIO_SIZE){ showToast('Fichier trop lourd (1,5 Mo max)'); return; }
  const document_data = await readFileAsDataURL(file);
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.kycStatus = 'pending';
  me.kycFullName = fullName;
  me.kycDocument = document_data;
  me.kycSubmittedAt = new Date().toISOString();
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Envoyé pour vérification ✓ — vous serez notifié(e) une fois traité');
  await logAdminAction('Nouvelle demande de vérification d’identité', '@' + currentUser);
  await renderKycStatusCard();
}
/* ---------- BADGE VÉRIFIÉ CRÉATEUR (LIBRE-SERVICE, ÉLIGIBILITÉ RÉELLE) ---------- */
const VERIFIED_BADGE_MIN_FOLLOWERS = 100;
async function requestAudienceCreatorBadge(){
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  const followerCount = (me.followers || []).length;
  if(followerCount < VERIFIED_BADGE_MIN_FOLLOWERS){ showToast('Vous n’avez pas encore assez d’abonnés réels pour demander ce badge'); return; }
  me.audienceCreatorBadgeStatus = 'pending';
  me.audienceCreatorBadgeRequestedAt = new Date().toISOString();
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Demande envoyée ✓ — vous serez notifié(e) une fois traitée');
  await logAdminAction('Nouvelle demande de badge vérifié', '@' + currentUser + ' (' + followerCount + ' abonnés)');
  await renderAudienceCreatorBadgeCard();
}
async function renderAudienceCreatorBadgeCard(){
  const el = document.getElementById('audience-creator-badge-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const followerCount = (me && me.followers || []).length;
  const status = me && me.audienceCreatorBadgeStatus;
  if(status === 'verified'){
    el.innerHTML = '<p style="font-size:12.5px; color:var(--lagoon); margin:0;">🌟 Créateur populaire le '+new Date(me.audienceCreatorBadgeVerifiedAt).toLocaleDateString('fr-FR')+'.</p>';
  } else if(status === 'pending'){
    el.innerHTML = '<p style="font-size:12.5px; color:var(--gold); margin:0;">⏳ Votre demande est en cours d’examen par l’équipe Suktum.</p>';
  } else if(followerCount < VERIFIED_BADGE_MIN_FOLLOWERS){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Réservé aux comptes ayant au moins '+VERIFIED_BADGE_MIN_FOLLOWERS+' abonnés réels — vous en avez actuellement '+followerCount+'.</p>';
  } else {
    el.innerHTML = (status === 'rejected' ? '<p style="font-size:12.5px; color:var(--coral); margin:0 0 10px;">✕ Demande refusée'+(me.audienceCreatorBadgeRejectReason ? ' : '+escapeHtml(me.audienceCreatorBadgeRejectReason) : '')+'. Vous pouvez la soumettre à nouveau.</p>' : '<p style="font-size:12px; color:rgba(245,239,227,0.6); margin:0 0 10px;">Vous avez '+followerCount+' abonnés réels — vous pouvez demander le badge vérifié.</p>') +
      '<button class="btn btn-primary btn-sm" onclick="requestAudienceCreatorBadge()">Demander le badge vérifié</button>';
  }
}
async function fetchPendingAudienceCreatorBadgeRequests(){
  const users = await fetchUsers();
  return users.filter(u => u.audienceCreatorBadgeStatus === 'pending');
}
async function approveAudienceCreatorBadge(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.audienceCreatorBadgeStatus = 'verified';
  u.audienceCreatorBadgeVerifiedAt = new Date().toISOString();
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'audience_creator_badge_approved', 'Suktum', null, null);
  showToast('Badge vérifié accordé ✓');
  await logAdminAction('Badge vérifié accordé', '@' + username);
  await renderAudienceCreatorBadgeRequestsAdmin();
}
async function rejectAudienceCreatorBadge(username){
  const reason = prompt('Motif du refus (facultatif) :');
  if(reason === null) return;
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.audienceCreatorBadgeStatus = 'rejected';
  u.audienceCreatorBadgeRejectReason = reason.trim() || null;
  await saveWithRetry('user:' + username, u, true);
  showToast('Demande refusée');
  await logAdminAction('Badge vérifié refusé', '@' + username);
  await renderAudienceCreatorBadgeRequestsAdmin();
}
async function renderAudienceCreatorBadgeRequestsAdmin(){
  const el = document.getElementById('audience-creator-badge-requests-admin-list');
  if(!el) return;
  const requests = await fetchPendingAudienceCreatorBadgeRequests();
  el.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : requests.map(u =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 8px; font-size:13px;"><strong>@'+escapeHtml(u.username)+'</strong> — '+((u.followers||[]).length)+' abonnés</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="approveAudienceCreatorBadge(\''+escapeHtml(u.username)+'\')">✓ Accorder</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="rejectAudienceCreatorBadge(\''+escapeHtml(u.username)+'\')">✕ Refuser</button>' +
    '</div></div>'
  ).join('');
}
async function renderKycStatusCard(){
  const el = document.getElementById('kyc-status-card');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.kycStatus || me.kycStatus === 'none') return;
  const statusLabels = {
    pending: '<p style="font-size:12.5px; color:var(--gold); margin:0;">⏳ Votre demande est en cours de vérification par l’équipe Suktum.</p>',
    verified: '<p style="font-size:12.5px; color:var(--lagoon); margin:0;">✓ Identité vérifiée le '+new Date(me.kycVerifiedAt).toLocaleDateString('fr-FR')+'.</p>',
    rejected: '<p style="font-size:12.5px; color:var(--coral); margin:0 0 10px;">✕ Vérification refusée'+(me.kycRejectReason ? ' : '+escapeHtml(me.kycRejectReason) : '')+'. Vous pouvez soumettre à nouveau.</p><label style="margin-top:0;">Nom complet</label><input type="text" id="kyc-full-name" placeholder="Comme sur votre pièce d’identité"><label>Photo de votre pièce d’identité</label><input type="file" id="kyc-document" accept="image/*"><button class="btn btn-primary" style="margin-top:10px;" onclick="submitKycVerification()">Envoyer pour vérification</button>'
  };
  el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.6); margin:0 0 10px;">Renforcez la confiance des acheteurs en vérifiant votre identité auprès de l’équipe Suktum.</p>' + (statusLabels[me.kycStatus] || '');
}
async function fetchPendingKycRequests(){
  const users = await fetchUsers();
  return users.filter(u => u.kycStatus === 'pending');
}
/* ---------- ANALYSE DE ROBUSTESSE DU CODE SOURCE (lit le vrai code en direct) ---------- */
async function runCodeRobustnessAnalysis(){
  const statusEl = document.getElementById('code-analysis-status');
  statusEl.textContent = '⏳ Analyse en cours...';
  try{
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => !s.src && s.textContent.length > 1000);
    const mainScript = scripts.reduce((longest, s) => (!longest || s.textContent.length > longest.textContent.length) ? s : longest, null);
    if(!mainScript){ statusEl.textContent = '✕ Impossible de récupérer le code source de l’application.'; return; }
    const source = mainScript.textContent;
    const lines = source.split('\n');

    const functionMatches = [];
    lines.forEach((line, i) => {
      const m = line.match(/^(async\s+)?function\s+([a-zA-Z0-9_]+)/);
      if(m) functionMatches.push({ name: m[2], line: i });
    });

    const nameCounts = {};
    functionMatches.forEach(f => { nameCounts[f.name] = (nameCounts[f.name] || 0) + 1; });
    const duplicates = Object.keys(nameCounts).filter(n => nameCounts[n] > 1);

    const lengths = functionMatches.map((f, i) => {
      const nextLine = (i + 1 < functionMatches.length) ? functionMatches[i+1].line : lines.length;
      return { name: f.name, length: nextLine - f.line };
    });
    const longest = [...lengths].sort((a,b) => b.length - a.length).slice(0, 8);

    const riskyPatternDefs = [
      { label: 'var (préférer let/const)', regex: /\bvar\s+/g },
      { label: 'document.write', regex: /document\.write\(/g },
      { label: 'eval(', regex: /\beval\(/g },
      { label: 'escape()/unescape() (dépréciés)', regex: /[^.](escape|unescape)\(/g },
      { label: 'requête synchrone potentielle (.open avec false)', regex: /\.open\([^,]+,[^,]+,\s*false\s*\)/g }
    ];
    const riskyResults = riskyPatternDefs.map(p => ({ label: p.label, count: (source.match(p.regex) || []).length })).filter(r => r.count > 0);

    const dependencySignatures = [
      { label: 'FFmpeg.wasm — montage/traitement vidéo', pattern: /ffmpeg/i },
      { label: 'Jitsi Meet — visioconférence des lives', pattern: /jit\.si|jitsi/i },
      { label: 'Google Identity Services — connexion Google', pattern: /accounts\.google\.com|google\.accounts\.id/i },
      { label: 'Google Cloud Vision API — modération image', pattern: /vision\.googleapis\.com/i },
      { label: 'Google Cloud Video Intelligence API — modération vidéo', pattern: /videointelligence\.googleapis\.com/i },
      { label: 'API Gemini (Google) — intelligence artificielle', pattern: /generativelanguage\.googleapis\.com/i },
      { label: 'API Claude (Anthropic) — intelligence artificielle', pattern: /api\.anthropic\.com/i }
    ];
    const dependenciesFound = dependencySignatures.filter(d => d.pattern.test(source));

    const todoCount = (source.match(/\/\/\s*(TODO|FIXME)/gi) || []).length;

    const report = {
      totalLines: lines.length, totalFunctions: functionMatches.length,
      duplicates, longest, riskyResults, dependenciesFound, todoCount,
      generatedAt: new Date().toISOString()
    };
    await saveWithRetry('codeanalysisreport:latest', report, true);
    renderCodeAnalysisReport(report);
    statusEl.textContent = '';
  }catch(e){
    statusEl.textContent = '✕ Analyse indisponible pour le moment : ' + e.message;
  }
}
/* ---------- AGENT IA — SUGGESTIONS TECHNIQUES (basé sur l'état réel de l'app) ---------- */
async function runAITechAgentAnalysis(){
  const statusEl = document.getElementById('ai-tech-agent-status');
  statusEl.textContent = '⏳ Analyse en cours — lecture du code, du journal et des tâches...';
  try{
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => !s.src && s.textContent.length > 1000);
    const mainScript = scripts.reduce((longest, s) => (!longest || s.textContent.length > longest.textContent.length) ? s : longest, null);
    const source = mainScript ? mainScript.textContent : '';
    const codeStats = 'Lignes de code : ' + source.split('\n').length;

    const changelogKeys = await safeList('internalchangelog:', true);
    let changelogEntries = [];
    for(const k of changelogKeys){ const e = await safeGet(k, true); if(e) changelogEntries.push(e); }
    changelogEntries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recentChangelog = changelogEntries.slice(0, 10).map(e => '- ' + e.title + (e.details ? ' : ' + e.details : '')).join('\n') || '(aucune entrée)';

    const taskKeys = await safeList('devtask:', true);
    let devTasks = [];
    for(const k of taskKeys){ const t = await safeGet(k, true); if(t) devTasks.push(t); }
    const pendingTasks = devTasks.filter(t => t.status !== 'done').map(t => '- [' + t.status + '] ' + t.title).join('\n') || '(aucune tâche en attente)';

    const codeReport = await safeGet('codeanalysisreport:latest', true).catch(() => null);
    const mechanicalSummary = codeReport
      ? 'Fonctions dupliquées détectées : ' + (codeReport.duplicates.join(', ') || 'aucune') + '. Motifs à risque : ' + (codeReport.riskyResults.map(r => r.label + ' (' + r.count + ')').join(', ') || 'aucun') + '. TODO/FIXME dans le code : ' + codeReport.todoCount + '.'
      : '(aucune analyse mécanique récente disponible — lancez "Analyse robustesse code source" pour l’enrichir)';

    const prompt = 'Tu conseilles l’équipe technique de Suktum (application sociale/marketplace/éducation pour le Sénégal, un seul fichier HTML, stockage clé-valeur prototype). ' +
      'Voici l’état réel actuel du projet :\n\n' + codeStats + '\n\n' +
      'Analyse mécanique du code :\n' + mechanicalSummary + '\n\n' +
      'Derniers changements notés (10 plus récents) :\n' + recentChangelog + '\n\n' +
      'Tâches de développement en attente ou en cours :\n' + pendingTasks + '\n\n' +
      'À partir de ces vraies informations, rédige un rapport court et concret (pas plus de 8 points) de suggestions pour réparer, améliorer ou faire évoluer l’application — priorise ce qui semble le plus urgent ou risqué. Reste factuel, ne suppose rien que ces informations ne permettent pas de déduire, et signale explicitement si une information te manque pour juger d’un point.';

    const provider = getAIProviderChoice('aitechagent');
    const aiResponse = await callAIProvider(prompt, 900, provider);
    if(!aiResponse){
      statusEl.textContent = '✕ Réponse indisponible pour le moment (connexion IA).';
      return;
    }
    await saveWithRetry('aitechreport:latest', {
      content: aiResponse, provider, generatedAt: new Date().toISOString(),
      generatedBy: currentTechTeamName || currentAdminName || 'Propriétaire'
    }, true);
    statusEl.textContent = '';
    await renderAITechAgentReport();
  }catch(e){
    statusEl.textContent = '✕ Analyse indisponible pour le moment : ' + e.message;
  }
}
async function renderAITechAgentReport(){
  const pickerEl = document.getElementById('aitechagent-provider-picker');
  if(pickerEl && !pickerEl.dataset.initialized){
    pickerEl.innerHTML = aiProviderChoiceHtml('aitechagent');
    setAIProviderChoice('aitechagent', 'claude');
    pickerEl.dataset.initialized = 'true';
  }
  const el = document.getElementById('ai-tech-agent-report');
  if(!el) return;
  const report = await safeGet('aitechreport:latest', true).catch(() => null);
  if(!report){
    el.innerHTML = '<div class="empty">Aucune analyse générée pour l’instant — cliquez sur "Générer l’analyse" ci-dessus.</div>';
    return;
  }
  el.innerHTML = '<div class="card">' +
    '<p style="margin:0 0 8px; font-size:11px; color:var(--gold);">Généré le ' + new Date(report.generatedAt).toLocaleString('fr-FR') + ' par ' + escapeHtml(report.generatedBy) + ' (IA : ' + report.provider + ')</p>' +
    '<p style="margin:0; font-size:13px; white-space:pre-line; line-height:1.6;">' + escapeHtml(report.content) + '</p>' +
    '</div>';
}
function renderCodeAnalysisReport(report){
  const el = document.getElementById('code-analysis-result');
  if(!el) return;
  el.innerHTML =
    '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:0 0 10px;">Dernière analyse : '+new Date(report.generatedAt).toLocaleString('fr-FR')+'</p>' +
    '<p style="font-size:12.5px; margin:0 0 10px;">📏 '+report.totalLines.toLocaleString('fr-FR')+' lignes · '+report.totalFunctions+' fonction(s) détectée(s)'+(report.todoCount > 0 ? ' · '+report.todoCount+' TODO/FIXME' : '')+'</p>' +
    (report.duplicates.length > 0
      ? '<div class="card" style="border-color:var(--coral); margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px; color:var(--coral); font-weight:600;">⚠️ Fonctions au nom dupliqué (risque réel — la seconde écrase silencieusement la première)</p><p style="margin:0; font-size:12px;">'+report.duplicates.map(escapeHtml).join(', ')+'</p></div>'
      : '<div class="card" style="border-color:var(--lagoon); margin-bottom:8px;"><p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Aucune fonction dupliquée détectée.</p></div>') +
    (report.riskyResults.length > 0
      ? '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 6px; font-size:12.5px; color:var(--gold); font-weight:600;">⚠️ Motifs risqués ou dépréciés détectés</p>' +
        report.riskyResults.map(r => '<p style="margin:0 0 2px; font-size:12px;">'+escapeHtml(r.label)+' — '+r.count+' occurrence(s)</p>').join('') + '</div>'
      : '<div class="card" style="border-color:var(--lagoon); margin-bottom:8px;"><p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Aucun motif risqué courant détecté.</p></div>') +
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 6px; font-size:12.5px; font-weight:600;">🔗 Dépendances externes détectées — à surveiller si dépréciées ou remplacées</p>' +
    (report.dependenciesFound.length === 0 ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Aucune détectée.</p>' :
      report.dependenciesFound.map(d => '<p style="margin:0 0 2px; font-size:12px;">• '+escapeHtml(d.label)+'</p>').join('')) + '</div>' +
    '<div class="card"><p style="margin:0 0 6px; font-size:12.5px; font-weight:600;">📐 Fonctions les plus longues — à surveiller en priorité (complexité)</p>' +
    report.longest.map(f => '<p style="margin:0 0 2px; font-size:12px;">'+escapeHtml(f.name)+' — '+f.length+' lignes</p>').join('') + '</div>';
}
async function renderAdminKycList(){
  const el = document.getElementById('admin-kyc-list');
  if(!el) return;
  const pending = await fetchPendingKycRequests();
  el.innerHTML = pending.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : pending.map(u =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;"><strong>@'+escapeHtml(u.username)+'</strong> — '+escapeHtml(u.kycFullName||'')+'</p>' +
    (u.kycDocument ? '<img src="'+u.kycDocument+'" style="width:100%; max-height:200px; object-fit:contain; border-radius:8px; margin-bottom:10px; background:#000;">' : '') +
    '<button class="btn btn-outline btn-sm" onclick="approveKyc(\''+escapeHtml(u.username)+'\')">✓ Valider</button> ' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="rejectKyc(\''+escapeHtml(u.username)+'\')">✕ Refuser</button></div>'
  ).join('');
}
async function approveKyc(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.kycStatus = 'verified';
  u.kycVerifiedAt = new Date().toISOString();
  u.identityVerified = true;
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'kyc_approved', 'Suktum', null, null);
  await logAdminAction('Identité vérifiée et validée', '@' + username);
  showToast('Identité validée ✓');
  await renderAdminKycList();
}
async function rejectKyc(username){
  const reason = prompt('Raison du refus (visible par le vendeur) :');
  if(reason === null) return;
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.kycStatus = 'rejected';
  u.kycRejectReason = reason.trim() || null;
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'kyc_rejected', 'Suktum', null, reason.trim() || '');
  await logAdminAction('Vérification d’identité refusée', '@' + username);
  showToast('Demande refusée');
  await renderAdminKycList();
}
async function checkActiveMemberBadge(username){
  const allPosts = await fetchPosts(true);
  const myPosts = allPosts.filter(p => p.userId === username && p.status === 'published');
  if(myPosts.length < 10) return;
  const totalLikesReceived = myPosts.reduce((s,p) => s + ((p.likes||[]).length), 0);
  const qualifies = totalLikesReceived >= 100;
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  if(qualifies && !u.activeMemberBadge){
    u.activeMemberBadge = true;
    await saveWithRetry('user:' + username, u, true);
    await createNotification(username, 'active_member_badge', 'Suktum', null, null);
  } else if(!qualifies && u.activeMemberBadge){
    u.activeMemberBadge = false;
    await saveWithRetry('user:' + username, u, true);
  }
}
async function checkRecommendedSellerBadge(sellerUsername){
  const ratings = await fetchSellerRatings(sellerUsername);
  if(ratings.length < 5) return; // pas assez d'avis pour juger équitablement
  const avgStars = ratings.reduce((s,r) => s + r.stars, 0) / ratings.length;
  const speedRatings = ratings.filter(r => r.shippingDays !== null);
  const avgSpeed = speedRatings.length > 0 ? speedRatings.reduce((s,r) => s + r.shippingDays, 0) / speedRatings.length : null;
  const qualifies = avgStars >= 4 && (avgSpeed === null || avgSpeed <= 5);
  const u = await safeGet('user:' + sellerUsername, true);
  if(!u) return;
  if(qualifies && !u.recommendedSeller){
    u.recommendedSeller = true;
    await saveWithRetry('user:' + sellerUsername, u, true);
    await createNotification(sellerUsername, 'recommended_seller_badge', 'Suktum', null, null);
  } else if(!qualifies && u.recommendedSeller){
    u.recommendedSeller = false;
    await saveWithRetry('user:' + sellerUsername, u, true);
  }
}
async function renderMyOrdersScreen(){
  const el = document.getElementById('my-orders-list');
  if(!el) return;
  const myOrders = (await fetchOrders()).filter(o => o.buyerUsername === currentUser);
  myOrders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const ratingsHtml = {};
  const deliveryEstimates = {};
  const deliveryOptionHtml = {};
  for(const o of myOrders){
    if(o.shipmentStage === 'delivered'){
      const existing = await safeGet('sellerrating:' + o.id, true);
      ratingsHtml[o.id] = existing
        ? '<p style="margin-top:8px; font-size:12px; color:var(--gold);">Votre note : '+'⭐'.repeat(existing.stars)+'</p>'
        : '<div style="margin-top:8px;"><p style="margin:0 0 4px; font-size:12px;">Noter ce vendeur :</p><div>'+[1,2,3,4,5].map(n => '<span onclick="rateSellerForOrder(\''+o.id+'\', '+n+')" style="font-size:20px; cursor:pointer;">⭐</span>').join('')+'</div></div>';
    } else {
      if(o.sellerUsername) deliveryEstimates[o.id] = await renderSellerDeliveryEstimate(o.sellerUsername);
      const yangoHere = await isYangoAvailableInCountry(o.country);
      if(yangoHere){
        deliveryOptionHtml[o.id] = '<button class="btn btn-outline btn-sm" style="margin-top:8px; width:100%;" onclick="requestYangoDelivery(\''+o.id+'\')">🚚 Demander une livraison Yango</button><div id="yango-status-'+o.id+'" style="margin-top:6px; font-size:11.5px; color:var(--gold);"></div>';
      } else {
        const seller = o.sellerUsername ? await safeGet('user:' + o.sellerUsername, true) : null;
        deliveryOptionHtml[o.id] = '<p style="margin-top:8px; font-size:11.5px; color:rgba(245,239,227,0.5);">🚚 Yango Delivery n’est pas encore présent dans ce pays.</p>' +
          (seller && seller.whatsappNumber ? '<a href="https://wa.me/'+seller.whatsappNumber.replace(/[^0-9+]/g, '').replace('+', '')+'" target="_blank" class="btn btn-outline btn-sm" style="width:100%; margin-top:4px; text-decoration:none; display:block; text-align:center; box-sizing:border-box;">💬 Coordonner la livraison avec le vendeur</a>' : '');
      }
    }
  }
  const reminderHtml = {};
  for(const o of myOrders){
    if(o.productId){
      const reminder = await safeGet('recurringreminder:' + currentUser + '__' + o.productId, true);
      reminderHtml[o.id] = reminder && reminder.active
        ? '<button class="btn btn-outline btn-sm" style="margin-top:8px; width:100%; border-color:var(--lagoon); color:var(--lagoon);" onclick="cancelRecurringReminder(\''+o.productId+'\')">🔔 Rappel mensuel actif — annuler</button>'
        : '<button class="btn btn-outline btn-sm" style="margin-top:8px; width:100%;" onclick="activateRecurringReminder(\''+o.productId+'\', \''+escapeHtml(o.productName).replace(/'/g,"\\'")+'\')">🔔 Me rappeler de recommander ceci</button>';
    }
  }
  el.innerHTML = myOrders.length === 0 ? '<div class="empty">Aucune commande pour l’instant.</div>' : myOrders.map(o =>
    '<div class="card" style="position:relative; padding-right:40px;">' +
    '<span onclick="openBuyerOrderKebabMenu(\''+o.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<p style="margin:0 0 8px; font-size:13px;"><strong>'+escapeHtml(o.productName)+'</strong> × '+o.quantity+' — '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
    renderShipmentProgressBar(o.shipmentStage) +
    (deliveryEstimates[o.id] || '') +
    (ratingsHtml[o.id] || '') +
    (deliveryOptionHtml[o.id] || '') +
    '</div>'
  ).join('');
}
