/* ---------- BIBLIOTHÈQUE DE BROUILLONS VIDÉO ---------- */
/* ---------- PARTENARIATS VENDEUR-CRÉATEUR (AFFILIATION) ---------- */
/* ---------- PARCOURS D'APPRENTISSAGE STRUCTURÉ ---------- */
async function renderLearningPathsBrowse(){
  const me = await safeGet('user:' + currentUser, true);
  const canCreate = !!(me && me.isTrainer && me.trainerVerified);
  const createSection = document.getElementById('create-learning-path-section');
  if(createSection){
    createSection.style.display = canCreate ? 'block' : 'none';
    if(canCreate){
      const myCourses = (await fetchCourses(true)).filter(c => c.trainerUsername === currentUser);
      const checkboxesEl = document.getElementById('new-path-course-checkboxes');
      checkboxesEl.innerHTML = myCourses.length === 0 ? '<p style="font-size:11.5px; color:rgba(245,239,227,0.4);">Créez d’abord au moins un cours.</p>' : myCourses.map(c =>
        '<div style="display:flex; align-items:center; gap:8px; padding:4px 0;"><input type="checkbox" class="path-course-checkbox" value="'+c.id+'" style="width:auto;"><label style="margin:0; font-size:12.5px;">'+escapeHtml(c.title)+'</label></div>'
      ).join('');
    }
  }
  const el = document.getElementById('learning-paths-list');
  const keys = await safeList('learningpath:', true);
  const paths = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) paths.push(p); }
  paths.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = paths.length === 0 ? '<div class="empty">Aucun parcours pour l’instant.</div>' : paths.map(p =>
    '<div class="card" style="cursor:pointer; margin-bottom:10px;" onclick="openLearningPathDetail(\''+p.id+'\')">' +
    '<strong style="font-size:13.5px;">'+escapeHtml(p.title)+'</strong>' +
    '<p style="margin:4px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(p.description||'')+'</p>' +
    '<p style="margin:4px 0 0; font-size:11.5px; color:var(--gold);">👨‍🏫 @'+escapeHtml(p.trainerUsername)+' · '+p.courseIds.length+' cours</p>' +
    '</div>'
  ).join('');
}
async function createLearningPath(){
  const title = document.getElementById('new-path-title').value.trim();
  const description = document.getElementById('new-path-desc').value.trim();
  const courseIds = Array.from(document.querySelectorAll('.path-course-checkbox:checked')).map(cb => cb.value);
  if(!title || courseIds.length === 0){ showToast('Renseignez un titre et au moins un cours'); return; }
  const id = 'path_' + Date.now();
  await saveWithRetry('learningpath:' + id, {
    id, title, description, trainerUsername: currentUser, courseIds, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-path-title').value = '';
  document.getElementById('new-path-desc').value = '';
  showToast('Parcours créé ✓');
  await renderLearningPathsBrowse();
}
let currentLearningPathId = null;
async function openLearningPathDetail(pathId){
  currentLearningPathId = pathId;
  const path = await safeGet('learningpath:' + pathId, true);
  if(!path) return;
  go('learning-path-detail');
  document.getElementById('learning-path-detail-title').textContent = path.title;
  document.getElementById('learning-path-detail-desc').textContent = path.description || '';
  const coursesWithStatus = [];
  let completedCount = 0;
  for(const courseId of path.courseIds){
    const c = await safeGet('course:' + courseId, true);
    if(!c) continue;
    const certCode = await safeGet('certcodelookup:' + courseId + '__' + currentUser, true);
    const completed = !!certCode;
    if(completed) completedCount++;
    coursesWithStatus.push({ course: c, completed });
  }
  const progressPercent = coursesWithStatus.length > 0 ? Math.round(completedCount / coursesWithStatus.length * 100) : 0;
  document.getElementById('learning-path-progress-bar').innerHTML =
    '<p style="margin:0 0 6px; font-size:12.5px;">'+completedCount+' / '+coursesWithStatus.length+' cours terminés</p>' +
    '<div style="background:rgba(245,239,227,0.1); border-radius:8px; height:10px; overflow:hidden;"><div style="background:var(--lagoon); height:100%; width:'+progressPercent+'%;"></div></div>';
  document.getElementById('learning-path-courses-list').innerHTML = coursesWithStatus.map((item, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;" onclick="openCourseDetail(\''+item.course.id+'\')">' +
    '<span style="font-size:16px;">'+(item.completed ? '✅' : (i+1)+'.')+'</span>' +
    '<span style="flex:1; font-size:13px;">'+escapeHtml(item.course.title)+'</span>' +
    '</div>'
  ).join('');
}
async function fetchAffiliatePartnerships(username){
  const keys = await safeList('affiliatepartnership:', true);
  const list = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p && (!username || p.creatorUsername === username)) list.push(p); }
  return list;
}
async function renderAffiliatePartnershipsList(){
  const el = document.getElementById('affiliate-partnerships-list');
  if(!el) return;
  const products = (await fetchProducts()).filter(p => p.affiliateCommissionPercent && p.sellerUsername !== currentUser);
  const myPartnerships = await fetchAffiliatePartnerships(currentUser);
  const acceptedProductIds = new Set(myPartnerships.map(p => p.productId));
  const platformFeePercent = await getAffiliatePlatformFeePercent();
  el.innerHTML = products.length === 0 ? '<div class="empty">Aucun partenariat proposé pour l’instant.</div>' : products.map(p => {
    const alreadyAccepted = acceptedProductIds.has(p.id);
    const netPercentForCreator = (p.affiliateCommissionPercent * (100 - platformFeePercent) / 100).toFixed(1);
    return '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">' +
      (p.image ? '<img src="'+p.image+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">' : '') +
      '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">Vendu par @'+escapeHtml(p.sellerUsername)+' · '+p.affiliateCommissionPercent+'% de commission</p>' +
      '<p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.45);">Dont '+platformFeePercent+'% reversés à Suktum — vous touchez réellement '+netPercentForCreator+'% net</p></div>' +
      (alreadyAccepted ? '<span style="font-size:11px; color:var(--lagoon);">✓ Accepté</span>' : '<button class="btn btn-outline btn-sm" onclick="acceptAffiliatePartnership(\''+p.id+'\')">Accepter</button>') +
      '</div>';
  }).join('');
}
async function acceptAffiliatePartnership(productId){
  if(!requireAccount('Créez un compte pour accepter un partenariat')) return;
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  await saveWithRetry('affiliatepartnership:' + productId + '__' + currentUser, {
    productId, creatorUsername: currentUser, sellerUsername: p.sellerUsername, commissionPercent: p.affiliateCommissionPercent,
    createdAt: new Date().toISOString()
  }, true);
  await createNotification(p.sellerUsername, 'affiliate_accepted', currentUser, productId, p.name);
  showToast('Partenariat accepté ✓ — vous pouvez maintenant taguer ce produit dans vos vidéos');
  await renderAffiliatePartnershipsList();
}
async function renderMyAffiliatePartnerships(){
  const el = document.getElementById('my-affiliate-partnerships-list');
  if(!el) return;
  const myPartnerships = await fetchAffiliatePartnerships(currentUser);
  if(myPartnerships.length === 0){ el.innerHTML = '<div class="empty">Aucun partenariat accepté pour l’instant.</div>'; return; }
  const allSales = await fetchAffiliateSales();
  el.innerHTML = await Promise.all(myPartnerships.map(async part => {
    const product = await safeGet('product:' + part.productId, true);
    const mySales = allSales.filter(s => s.productId === part.productId && s.creatorUsername === currentUser);
    const totalEarned = mySales.reduce((s,x) => s + x.commissionAmount, 0);
    return '<div class="card" style="margin-bottom:10px;"><strong style="font-size:13px;">'+escapeHtml(product ? product.name : part.productId)+'</strong>' +
      '<p style="margin:4px 0 0; font-size:12px; color:var(--gold);">'+part.commissionPercent+'% · '+mySales.length+' vente(s) via vos vidéos · '+totalEarned.toLocaleString('fr-FR')+' FCFA gagnés</p></div>';
  })).then(arr => arr.join(''));
}
async function fetchAffiliateSales(){
  const keys = await safeList('affiliatesale:', true);
  const list = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) list.push(s); }
  return list;
}
async function saveCurrentVideoAsDraft(){
  if(!originalSelectedFile || !originalSelectedFile.type.startsWith('video')){ showToast('Choisissez d’abord une vidéo à enregistrer'); return; }
  showToast('Enregistrement du brouillon...');
  const dataUrl = await readFileAsDataURL(originalSelectedFile);
  const id = 'videodraft_' + Date.now();
  const caption = document.getElementById('publish-caption').value.trim();
  await saveWithRetry('videodraft:' + currentUser + '__' + id, {
    id, dataUrl, caption, createdAt: new Date().toISOString()
  }, false);
  showToast('Brouillon vidéo enregistré ✓');
}
async function fetchVideoDrafts(){
  const keys = await safeList('videodraft:' + currentUser + '__', false);
  const drafts = [];
  for(const k of keys){ const d = await safeGet(k, false); if(d) drafts.push(d); }
  drafts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return drafts;
}
async function renderVideoDraftsLibrary(){
  const el = document.getElementById('video-drafts-list');
  if(!el) return;
  const drafts = await fetchVideoDrafts();
  el.innerHTML = drafts.length === 0 ? '<div class="empty">Aucun brouillon vidéo pour l’instant.</div>' : drafts.map(d =>
    '<div class="card" style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">' +
    '<video src="'+d.dataUrl+'" muted style="width:70px; height:100px; object-fit:cover; border-radius:8px; flex-shrink:0;"></video>' +
    '<div style="flex:1; min-width:0;"><p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'+escapeHtml(d.caption||'(sans légende)')+'</p>' +
    '<button class="btn btn-outline btn-sm" style="margin-bottom:6px; width:100%;" onclick="loadVideoDraftForPublish(\''+d.id+'\')">Continuer et publier</button>' +
    '<button class="btn btn-outline btn-sm" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="deleteVideoDraft(\''+d.id+'\')">🗑️ Supprimer</button></div>' +
    '</div>'
  ).join('');
}
async function loadVideoDraftForPublish(draftId){
  const draft = await safeGet('videodraft:' + currentUser + '__' + draftId, false);
  if(!draft) return;
  const blob = await (await fetch(draft.dataUrl)).blob();
  const file = new File([blob], 'brouillon.mp4', { type: blob.type || 'video/mp4' });
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('publish-file').files = dt.files;
  document.getElementById('publish-caption').value = draft.caption || '';
  go('publish');
  await onPublishFileSelected();
  showToast('Brouillon chargé — prêt à publier');
}
async function deleteVideoDraft(draftId){
  await window.storage.delete('videodraft:' + currentUser + '__' + draftId, false).catch(() => {});
  showToast('Brouillon supprimé');
  await renderVideoDraftsLibrary();
}
async function renderSellerDeliveryEstimate(sellerUsername){
  const allOrders = await fetchOrders();
  const sellerDelivered = allOrders.filter(o => o.sellerUsername === sellerUsername && o.shipmentStage === 'delivered' && o.deliveredAt);
  if(sellerDelivered.length === 0){
    return '<p style="margin:8px 0 0; font-size:11.5px; color:rgba(245,239,227,0.4);">⏱️ Pas encore d’historique de livraison pour ce vendeur.</p>';
  }
  const avgDays = sellerDelivered.reduce((sum,o) => sum + (new Date(o.deliveredAt) - new Date(o.createdAt)) / (24*60*60*1000), 0) / sellerDelivered.length;
  return '<p style="margin:8px 0 0; font-size:11.5px; color:var(--gold);">⏱️ Délai habituel de ce vendeur : environ ' + avgDays.toFixed(1) + ' jour(s), basé sur ses ' + sellerDelivered.length + ' dernière(s) livraison(s).</p>';
}
function renderShipmentProgressBar(stage){
  const stages = [
    { id: 'prepared', label: 'Préparée', emoji: '📦' },
    { id: 'shipped', label: 'Expédiée', emoji: '🚚' },
    { id: 'delivered', label: 'Livrée', emoji: '✓' },
  ];
  const currentIndex = stages.findIndex(s => s.id === stage);
  if(currentIndex === -1){
    return '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">⏳ En attente de préparation par le vendeur</p>';
  }
  return '<div style="display:flex; align-items:center; gap:4px;">' +
    stages.map((s, i) => {
      const reached = i <= currentIndex;
      return '<div style="flex:1; text-align:center;">' +
        '<div style="width:26px; height:26px; border-radius:50%; margin:0 auto 4px; display:flex; align-items:center; justify-content:center; font-size:13px; background:'+(reached?'var(--lagoon)':'rgba(245,239,227,0.12)')+';">'+s.emoji+'</div>' +
        '<span style="font-size:10px; color:'+(reached?'var(--lagoon)':'rgba(245,239,227,0.4)')+';">'+s.label+'</span>' +
        '</div>' +
        (i < stages.length - 1 ? '<div style="flex:0.4; height:2px; background:'+(i < currentIndex ? 'var(--lagoon)' : 'rgba(245,239,227,0.12)')+'; margin-bottom:16px;"></div>' : '');
    }).join('') +
    '</div>';
}
async function setOrderShipmentStage(orderId, stage){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.sellerUsername !== currentUser) return;
  o.shipmentStage = stage;
  if(stage === 'delivered' && !o.deliveredAt) o.deliveredAt = new Date().toISOString();
  await saveWithRetry('order:' + orderId, o, true);
  showToast('Suivi mis à jour ✓');
  await createNotification(o.buyerUsername, 'shipment_update', currentUser, orderId, o.productName + '__' + stage);
  if(stage === 'delivered'){
    await createNotification(o.buyerUsername, 'satisfaction_survey', currentUser, orderId, 'order');
  }
  await renderSellerDashboard();
}
function renderShipmentStageControls(orderId, currentStage){
  const stages = [
    { id: 'prepared', label: '📦 Préparée' },
    { id: 'shipped', label: '🚚 Expédiée' },
    { id: 'delivered', label: '✓ Livrée' },
  ];
  return '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
    stages.map(s => '<button class="btn '+(currentStage===s.id?'btn-primary':'btn-outline')+' btn-sm" onclick="setOrderShipmentStage(\''+orderId+'\', \''+s.id+'\')">'+s.label+'</button>').join('') +
    '</div>';
}
/* ---------- LISTE DE SOUHAITS BOUTIQUE ---------- */
/* ---------- SYSTÈME D'ÉCHANGE / TROC ---------- */
async function proposeBarterExchange(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p || !p.sellerUsername) return;
  if(p.sellerUsername === currentUser){ showToast('C’est votre propre produit'); return; }
  await openThread(p.sellerUsername);
  const input = document.getElementById('thread-input');
  if(input && !input.value) input.value = 'Bonjour ! Votre produit « ' + p.name + ' » m’intéresse pour un échange. Voici ce que je propose en retour : ';
}
async function toggleWishlist(productId){
  const list = (await safeGet('wishlist:' + currentUser, true)) || [];
  const idx = list.indexOf(productId);
  if(idx === -1){
    list.push(productId);
    showToast('Ajouté à votre liste de souhaits ❤️');
  }else{
    list.splice(idx, 1);
    showToast('Retiré de votre liste de souhaits');
  }
  await saveWithRetry('wishlist:' + currentUser, list, true);
  await renderShop();
}
async function renderWishlistScreen(){
  const el = document.getElementById('wishlist-list');
  if(!el) return;
  await loadWishlistVisibilityToggle();
  const list = (await safeGet('wishlist:' + currentUser, true)) || [];
  if(list.length === 0){ el.innerHTML = '<div class="empty">Aucun produit dans votre liste de souhaits — appuyez sur 🤍 sur un produit pour l’ajouter ici.</div>'; return; }
  const allProducts = await fetchProducts();
  const products = list.map(id => allProducts.find(p => p.id === id)).filter(Boolean);
  el.innerHTML = products.map(p =>
    '<div class="card" style="display:flex; gap:12px; align-items:center;">' +
    (p.image ? '<img src="'+p.image+'" style="width:56px; height:56px; border-radius:10px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-family:\'Baloo 2\';">'+escapeHtml(p.name)+'</strong>' +
    '<div class="price-tag" style="margin-top:6px; display:inline-block;">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</div></div>' +
    '<span onclick="toggleWishlist(\''+p.id+'\')" style="font-size:20px; cursor:pointer; padding:4px;">❤️</span>' +
    '<button class="btn btn-primary btn-sm" onclick="openOrderScreen(\''+p.id+'\')">Commander</button>' +
    '</div>'
  ).join('');
}
async function findWishlisters(productId){
  const keys = await safeList('wishlist:', true);
  const wishlisters = [];
  for(const k of keys){
    const list = await safeGet(k, true);
    if(Array.isArray(list) && list.includes(productId)) wishlisters.push(k.replace('wishlist:', ''));
  }
  return wishlisters;
}
async function restockProduct(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  const newStockRaw = prompt('Nouvelle quantité en stock pour "' + p.name + '" (actuellement ' + (p.stock || 0) + ') :', p.stock || 0);
  if(newStockRaw === null) return;
  const newStock = parseInt(newStockRaw, 10);
  if(isNaN(newStock) || newStock < 0){ showToast('Entrez une quantité valide'); return; }
  const wasOutOfStock = !p.stock || p.stock <= 0;
  p.stock = newStock;
  await saveWithRetry('product:' + productId, p, true);
  if(wasOutOfStock && newStock > 0){
    const wishlisters = await findWishlisters(productId);
    for(const t of wishlisters){
      await createNotification(t, 'back_in_stock', currentUser, productId, p.name);
    }
    showToast('Retour en stock annoncé à ' + wishlisters.length + ' personne(s) ✓');
  } else {
    showToast('Stock mis à jour ✓');
  }
  await renderSellerDashboard();
}
async function announcePriceDrop(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  const newPriceRaw = prompt('Nouveau prix pour "' + p.name + '" (actuellement ' + p.price.toLocaleString('fr-FR') + ' FCFA) :', p.price);
  if(newPriceRaw === null) return;
  const newPrice = parseInt(newPriceRaw, 10);
  if(isNaN(newPrice) || newPrice <= 0 || newPrice >= p.price){ showToast('Entrez un prix inférieur au prix actuel'); return; }
  const oldPrice = p.price;
  p.price = newPrice;
  if(!p.priceHistory) p.priceHistory = [];
  p.priceHistory.push({oldPrice, newPrice, changedAt: new Date().toISOString()});
  await saveWithRetry('product:' + productId, p, true);

  const me = await safeGet('user:' + currentUser, true);
  const followers = (me && me.followers) || [];
  const orders = (await fetchOrders()).filter(o => o.productId === productId);
  const customers = [...new Set(orders.map(o => o.buyerUsername))];
  const wishlisters = await findWishlisters(productId);
  const targets = [...new Set([...followers, ...customers, ...wishlisters])];
  for(const t of targets){
    await createNotification(t, 'price_drop', currentUser, null, p.name + ' : ' + oldPrice.toLocaleString('fr-FR') + ' → ' + newPrice.toLocaleString('fr-FR') + ' FCFA');
  }
  showToast('Baisse de prix annoncée à ' + targets.length + ' personne(s) ✓');
  await renderSellerDashboard();
}

async function exportMySeriesRatings(){
  const mySeries = (await fetchAllSeries()).filter(s => s.createdBy === currentUser);
  if(mySeries.length === 0){ showToast('Vous n’avez pas encore créé de série'); return; }
  let text = 'AVIS SUR MES SÉRIES — SUKTUM\n';
  text += 'Généré le ' + new Date().toLocaleString('fr-FR') + '\n\n';
  let totalRatings = 0;
  for(const s of mySeries){
    const ratings = await fetchSeriesRatings(s.id);
    if(ratings.length === 0) continue;
    totalRatings += ratings.length;
    const avg = (ratings.reduce((sum,r) => sum + r.stars, 0) / ratings.length).toFixed(1);
    text += '« ' + s.title + ' » — Moyenne : ' + avg + '/5 (' + ratings.length + ' avis)\n';
    ratings.forEach(r => {
      text += '  @' + r.username + ' — ' + '⭐'.repeat(r.stars) + (r.comment ? ' — ' + r.comment : '') + ' (' + new Date(r.createdAt).toLocaleDateString('fr-FR') + ')\n';
    });
    text += '\n';
  }
  if(totalRatings === 0){ showToast('Aucun avis pour l’instant sur vos séries'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'avis-series-suktum-' + new Date().toISOString().slice(0,10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export téléchargé ✓');
}
async function openCreatorStatsPrint(){
  go('creator-stats-print');
  const el = document.getElementById('creator-stats-print-content');
  const posts = (await fetchPosts()).filter(p => p.userId === currentUser);
  const now = new Date().toLocaleDateString('fr-FR');
  if(posts.length === 0){
    el.innerHTML = '<p style="margin:0; font-size:13px;">Aucune publication pour l’instant.</p>';
    return;
  }
  const totalViews = posts.reduce((s,p) => s + (p.views||0), 0);
  const totalLikes = posts.reduce((s,p) => s + (p.likes?p.likes.length:0), 0);
  const totalComments = posts.reduce((s,p) => s + (p.comments?p.comments.length:0), 0);
  const bestPost = [...posts].sort((a,b) => (b.views||0) - (a.views||0))[0];
  const hourCounts = new Array(24).fill(0);
  posts.forEach(p => {
    const h = new Date(p.createdAt).getHours();
    const engagement = (p.views||0) + (p.likes?p.likes.length:0)*3;
    hourCounts[h] += engagement;
  });
  let bestHour = 0, bestScore = -1;
  hourCounts.forEach((score, h) => { if(score > bestScore){ bestScore = score; bestHour = h; } });
  el.innerHTML =
    '<div style="text-align:center; margin-bottom:20px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">SUKTUM</p>' +
    '<h2 style="margin:6px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Statistiques créateur</h2>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">@'+escapeHtml(currentUser)+' · Généré le '+now+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 4px; font-size:13px;">📊 <strong>'+posts.length+'</strong> publication(s)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">👁️ <strong>'+totalViews.toLocaleString('fr-FR')+'</strong> vue(s) au total</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">❤️ <strong>'+totalLikes.toLocaleString('fr-FR')+'</strong> j’aime</p>' +
    '<p style="margin:0; font-size:13px;">💬 <strong>'+totalComments.toLocaleString('fr-FR')+'</strong> commentaire(s)</p>' +
    '</div>' +
    (bestPost ? '<div class="card" style="margin-bottom:16px;"><p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">🏆 Meilleure publication</p><p style="margin:0; font-size:13px;">'+(bestPost.views||0)+' vue(s)'+(bestPost.caption ? ' — « '+escapeHtml(bestPost.caption.slice(0,60))+(bestPost.caption.length>60?'…':'')+' »' : '')+'</p></div>' : '') +
    (bestScore > 0 ? '<div class="card"><p style="margin:0; font-size:13px;">⏰ Meilleur moment pour publier : autour de '+bestHour+'h</p></div>' : '');
}
/* ---------- SYSTÈME DE NIVEAUX CRÉATEUR ---------- */
const FAQ_ITEMS = [
  {q: 'Comment commander un produit ?', a: 'Ouvrez la boutique (icône 🛍️), choisissez un produit, appuyez sur "Commander", puis suivez les instructions de paiement affichées selon votre pays.'},
  {q: 'Comment débloquer un compte ?', a: 'Allez dans Paramètres → Comptes bloqués, puis appuyez sur "Débloquer" à côté du compte concerné.'},
  {q: 'Comment vendre mes propres produits ?', a: 'Si la marketplace est ouverte, une section "Vendre un produit" apparaît dans Paramètres → Gestion, monétisation & publicité.'},
  {q: 'Comment démarrer un live ?', a: 'Il faut au moins 1000 abonnés. Rendez-vous sur votre Profil, section "🔴 Live".'},
  {q: 'Ma publication a disparu, pourquoi ?', a: 'Elle a peut-être été suspendue par la modération pour non-respect des règles, ou elle est programmée pour plus tard.'},
  {q: 'Comment supprimer mon compte ?', a: 'Paramètres → Mon compte → "Supprimer définitivement mon compte".'},
  {q: 'J’ai changé de téléphone, comment retrouver mon compte ?', a: 'Réinstallez Suktum et connectez-vous avec le même compte Google que la première fois — votre compte sera retrouvé automatiquement.'},
  {q: 'Comment fonctionnent les points de fidélité ?', a: 'Vous gagnez 1 point tous les 100 FCFA dépensés en boutique. Chaque point vaut 5 FCFA de réduction, utilisable à votre prochaine commande.'}
];
/* ---------- ASSISTANT INTÉGRÉ — RÉPONSES AUX QUESTIONS COURANTES ---------- */
function askFaqAssistant(){
  const input = document.getElementById('faq-assistant-input');
  const question = input.value.trim();
  const el = document.getElementById('faq-assistant-answer');
  if(!question){ showToast('Écrivez votre question'); return; }
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
  const questionWords = normalize(question).split(/\s+/).filter(w => w.length > 2);
  let bestMatch = null;
  let bestScore = 0;
  FAQ_ITEMS.forEach(item => {
    const itemWords = normalize(item.q).split(/\s+/).filter(w => w.length > 2);
    const score = questionWords.filter(w => itemWords.some(iw => iw.includes(w) || w.includes(iw))).length;
    if(score > bestScore){ bestScore = score; bestMatch = item; }
  });
  if(bestMatch && bestScore > 0){
    el.innerHTML = '<div class="card" style="border-color:var(--lagoon);"><p style="margin:0 0 4px; font-size:12.5px; color:var(--lagoon); font-weight:600;">'+escapeHtml(bestMatch.q)+'</p><p style="margin:0; font-size:13px;">'+escapeHtml(bestMatch.a)+'</p></div>';
  } else {
    el.innerHTML = '<div class="card"><p style="margin:0; font-size:13px; color:rgba(245,239,227,0.6);">Je n’ai pas de réponse toute prête pour cette question — créez un ticket ci-dessous, l’équipe Suktum vous répondra directement.</p></div>';
  }
  input.value = '';
}
const CREATOR_LEVELS = [
  { name: 'Débutant', emoji: '🌱', min: 0 },
  { name: 'Bronze', emoji: '🥉', min: 20 },
  { name: 'Argent', emoji: '🥈', min: 100 },
  { name: 'Or', emoji: '🥇', min: 400 },
  { name: 'Légende', emoji: '👑', min: 1000 },
];
/* ---------- AGENDA PERSONNEL UNIFIÉ ---------- */
async function renderMyAgenda(){
  const el = document.getElementById('my-agenda-list');
  if(!el) return;
  el.innerHTML = '<p style="font-size:12.5px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const items = [];

  // Cours à horaire fixe (élève inscrit, ou formateur du cours)
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseIds.add(e.courseId);
  }
  const allCourses = await fetchCourses(true);
  allCourses.filter(c => c.trainerUsername === currentUser).forEach(c => myCourseIds.add(c.id));
  for(const courseId of myCourseIds){
    const c = allCourses.find(x => x.id === courseId);
    if(!c || c.scheduleDay === null || c.scheduleDay === undefined || !c.scheduleTime) continue;
    const next = nextOccurrenceOf(c.scheduleDay, c.scheduleTime);
    items.push({ type: 'course', title: '📚 ' + c.title, date: next, detail: 'Cours à horaire fixe' });
  }

  // Conférences programmées (formateurs qu'on suit via ses cours, ou les siennes)
  const lives = (await fetchLives()).filter(l => l.isEducational && l.status === 'approved' && l.scheduledTime && new Date(l.scheduledTime) > new Date());
  const myTrainerUsernames = new Set([...myCourseIds].map(id => allCourses.find(c => c.id === id)).filter(Boolean).map(c => c.trainerUsername));
  lives.filter(l => myTrainerUsernames.has(l.username)).forEach(l => {
    items.push({ type: 'conference', title: '🔴 Conférence de @' + l.username, date: new Date(l.scheduledTime), detail: 'Live éducatif' });
  });

  // Événements communautaires auxquels on participe
  const events = (await fetchCommunityEvents()).filter(e => e.participants.includes(currentUser) && new Date(e.date) > new Date());
  events.forEach(e => {
    items.push({ type: 'event', title: '🎪 ' + e.title, date: new Date(e.date), detail: e.location || 'Événement communautaire' });
  });

  items.sort((a,b) => a.date - b.date);

  el.innerHTML = items.length === 0 ? '<div class="empty">Rien de programmé pour l’instant.</div>' : items.map(i =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(i.title)+'</p>' +
    '<p style="margin:0 0 2px; font-size:12.5px; color:var(--gold);">⏰ '+i.date.toLocaleString('fr-FR', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+escapeHtml(i.detail)+'</p></div>'
  ).join('');
}
async function renderCreatorLevelCard(){
  const el = document.getElementById('creator-level-card');
  if(!el) return;
  const posts = (await fetchPosts()).filter(p => p.userId === currentUser);
  const totalLikes = posts.reduce((s,p) => s + (p.likes?p.likes.length:0), 0);
  const totalComments = posts.reduce((s,p) => s + (p.comments?p.comments.length:0), 0);
  const me = await safeGet('user:' + currentUser, true);
  const followerCount = (me && me.followers) ? me.followers.length : 0;
  const score = posts.length * 2 + totalLikes + totalComments * 3 + followerCount * 2;

  let currentLevel = CREATOR_LEVELS[0];
  let nextLevel = null;
  for(let i = 0; i < CREATOR_LEVELS.length; i++){
    if(score >= CREATOR_LEVELS[i].min) currentLevel = CREATOR_LEVELS[i];
    else { nextLevel = CREATOR_LEVELS[i]; break; }
  }
  const progressPct = nextLevel ? Math.min(100, Math.round((score - currentLevel.min) / (nextLevel.min - currentLevel.min) * 100)) : 100;

  el.innerHTML =
    '<div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">' +
    '<span style="font-size:32px;">'+currentLevel.emoji+'</span>' +
    '<div><strong style="font-size:16px; font-family:\'Baloo 2\';">'+currentLevel.name+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+score.toLocaleString('fr-FR')+' points d’activité</p></div>' +
    '</div>' +
    (nextLevel
      ? '<div style="background:rgba(245,239,227,0.12); border-radius:8px; height:8px; overflow:hidden; margin-bottom:6px;"><div style="background:var(--gold); height:100%; width:'+progressPct+'%;"></div></div>' +
        '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+(nextLevel.min - score).toLocaleString('fr-FR')+' points avant '+nextLevel.emoji+' '+nextLevel.name+'</p>'
      : '<p style="margin:0; font-size:11px; color:var(--gold);">🎉 Niveau maximum atteint !</p>') +
    '<p style="margin:10px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Calculé à partir de vos publications, j’aime reçus, commentaires reçus, et abonnés.</p>';
}
/* ---------- OBJECTIF PERSONNEL DE CONTENU ---------- */
async function saveContentGoal(){
  const value = parseInt(document.getElementById('content-goal-input').value, 10);
  if(isNaN(value) || value <= 0){ showToast('Entrez un objectif valide'); return; }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.weeklyContentGoal = value;
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Objectif enregistré ✓');
  await renderContentGoalCard();
}
function getWeekStartDate(){
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0,0,0,0);
  return monday;
}
async function renderDailyStreakCard(){
  const el = document.getElementById('daily-streak-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const streak = (me && me.currentStreak) || 0;
  const longest = (me && me.longestStreak) || 0;
  el.innerHTML = streak > 0
    ? '<p style="margin:0 0 4px; font-size:18px; font-family:\'Baloo 2\';">🔥 ' + streak + ' jour' + (streak > 1 ? 's' : '') + ' de suite</p>' +
      '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Record personnel : ' + longest + ' jour' + (longest > 1 ? 's' : '') + '</p>'
    : '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.5);">Revenez demain pour commencer votre série !</p>';
}
async function renderContentGoalCard(){
  const el = document.getElementById('content-goal-card');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const goal = me && me.weeklyContentGoal;
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser && p.status === 'published');
  const weekStart = getWeekStartDate();
  const postedThisWeek = myPosts.filter(p => new Date(p.createdAt) >= weekStart).length;
  if(!goal){
    el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Fixez-vous un rythme de publication hebdomadaire — un vrai suivi honnête, jamais une pression.</p>' +
      '<label style="margin-top:0;">Vidéos/publications par semaine</label>' +
      '<input type="number" id="content-goal-input" min="1" placeholder="Ex : 3">' +
      '<button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="saveContentGoal()">Fixer mon objectif</button>';
  } else {
    const pct = Math.min(100, Math.round(postedThisWeek / goal * 100));
    el.innerHTML = '<p style="margin:0 0 8px; font-size:13px;">'+postedThisWeek+' / '+goal+' publication(s) cette semaine</p>' +
      '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; overflow:hidden; margin-bottom:10px;"><div style="background:'+(postedThisWeek>=goal?'var(--lagoon)':'var(--gold)')+'; height:100%; width:'+pct+'%;"></div></div>' +
      (postedThisWeek >= goal ? '<p style="margin:0 0 10px; font-size:12px; color:var(--lagoon);">🎉 Objectif atteint cette semaine !</p>' : '') +
      '<label style="margin-top:0;">Modifier l’objectif</label>' +
      '<input type="number" id="content-goal-input" min="1" value="'+goal+'">' +
      '<button class="btn btn-outline btn-sm" style="margin-top:10px;" onclick="saveContentGoal()">Mettre à jour</button>';
  }
}
async function snapshotFollowerCountIfNeeded(){
  if(!currentUser) return;
  const todayKey = new Date().toISOString().slice(0,10);
  const existing = await safeGet('followersnapshot:' + currentUser + '__' + todayKey, false).catch(() => null);
  if(existing) return;
  const me = await safeGet('user:' + currentUser, true);
  const count = (me && me.followers) ? me.followers.length : 0;
  await saveWithRetry('followersnapshot:' + currentUser + '__' + todayKey, { count, date: todayKey }, false);
}
async function renderCreatorGrowthTrend(){
  const el = document.getElementById('creator-growth-trend-card');
  if(!el || !currentUser) return;
  await snapshotFollowerCountIfNeeded();
  const keys = await safeList('followersnapshot:' + currentUser + '__', false);
  const snapshots = [];
  for(const k of keys){ const s = await safeGet(k, false).catch(() => null); if(s) snapshots.push(s); }
  snapshots.sort((a,b) => new Date(a.date) - new Date(b.date));
  const recent = snapshots.slice(-14);
  if(recent.length < 2){
    el.innerHTML = '<p style="margin:0 0 8px; font-size:13px; font-weight:600;">📈 Tendance des abonnés</p><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Revenez demain pour voir votre première vraie tendance — au moins 2 jours de données sont nécessaires.</p>';
    return;
  }
  const maxCount = Math.max(...recent.map(s => s.count), 1);
  const change = recent[recent.length-1].count - recent[0].count;
  el.innerHTML = '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">📈 Tendance des abonnés ('+recent.length+' derniers jours)</p>' +
    '<p style="margin:0 0 10px; font-size:12px; color:'+(change >= 0 ? 'var(--lagoon)' : 'var(--coral)')+';">'+(change >= 0 ? '+' : '')+change+' abonné(s) sur cette période</p>' +
    '<div style="display:flex; align-items:flex-end; gap:3px; height:60px;">' +
    recent.map(s => '<div style="flex:1; background:var(--gold); border-radius:2px 2px 0 0; height:'+Math.max(4, Math.round((s.count / maxCount) * 60))+'px;" title="'+s.date+' — '+s.count+'"></div>').join('') +
    '</div>';
}
async function renderCreatorStatsCard(){
  const el = document.getElementById('creator-stats-card');
  if(!el) return;
  const posts = (await fetchPosts()).filter(p => p.userId === currentUser);
  if(posts.length === 0){ el.innerHTML = '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.5);">Publiez pour voir vos statistiques ici.</p>'; return; }
  const totalViews = posts.reduce((s,p) => s + (p.views||0), 0);
  const totalLikes = posts.reduce((s,p) => s + (p.likes?p.likes.length:0), 0);
  const totalComments = posts.reduce((s,p) => s + (p.comments?p.comments.length:0), 0);
  const bestPost = [...posts].sort((a,b) => (b.views||0) - (a.views||0))[0];

  let totalRate = 0, countedVideos = 0;
  const aggregateCountryCounts = {};
  for(const p of posts.filter(p => p.type === 'video')){
    const stats = await fetchVideoRetentionStats(p.id);
    if(stats.totalViewers === 0) continue;
    totalRate += stats.milestoneCounts['0.5'] / stats.totalViewers;
    countedVideos++;
    Object.keys(stats.countryCounts).forEach(country => {
      aggregateCountryCounts[country] = (aggregateCountryCounts[country] || 0) + stats.countryCounts[country];
    });
  }
  const avgWatchThrough = countedVideos > 0 ? Math.round((totalRate / countedVideos) * 100) : null;
  const topCountries = Object.entries(aggregateCountryCounts).sort((a,b) => b[1] - a[1]).slice(0,5);

  const followSourceKeys = await safeList('followsource:' + currentUser + '__', true);
  const followsByPost = {};
  for(const k of followSourceKeys){
    const rec = await safeGet(k, true).catch(() => null);
    if(rec && rec.sourcePostId) followsByPost[rec.sourcePostId] = (followsByPost[rec.sourcePostId] || 0) + 1;
  }
  const topConvertingPostId = Object.entries(followsByPost).sort((a,b) => b[1] - a[1])[0];
  const topConvertingPost = topConvertingPostId ? posts.find(p => p.id === topConvertingPostId[0]) : null;

  const hourCounts = new Array(24).fill(0);
  posts.forEach(p => {
    const h = new Date(p.createdAt).getHours();
    const engagement = (p.views||0) + (p.likes?p.likes.length:0)*3;
    hourCounts[h] += engagement;
  });
  let bestHour = 0, bestScore = -1;
  hourCounts.forEach((score, h) => { if(score > bestScore){ bestScore = score; bestHour = h; } });
  const hasEngagement = bestScore > 0;

  const me = await safeGet('user:' + currentUser, true);
  const followerUsernames = (me && me.followers) || [];
  const allUsers = await fetchUsers();
  const followerRecords = allUsers.filter(u => followerUsernames.includes(u.username));
  const ageCounts = {};
  let ageKnownCount = 0;
  followerRecords.forEach(u => { if(u.ageBracket){ ageCounts[u.ageBracket] = (ageCounts[u.ageBracket] || 0) + 1; ageKnownCount++; } });
  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'];
  const topAgeBracket = ageOrder.filter(a => ageCounts[a]).sort((a,b) => ageCounts[b] - ageCounts[a])[0];
  const genderCounts = {};
  let genderKnownCount = 0;
  followerRecords.forEach(u => { if(u.gender){ genderCounts[u.gender] = (genderCounts[u.gender] || 0) + 1; genderKnownCount++; } });
  const topGender = Object.keys(genderCounts).sort((a,b) => genderCounts[b] - genderCounts[a])[0];

  el.innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">👁️ <strong>'+totalViews.toLocaleString('fr-FR')+'</strong> vue(s) au total</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">❤️ <strong>'+totalLikes.toLocaleString('fr-FR')+'</strong> j’aime · 💬 <strong>'+totalComments.toLocaleString('fr-FR')+'</strong> commentaire(s)</p>' +
    (avgWatchThrough !== null ? '<p style="margin:0 0 4px; font-size:13px;">⏲️ En moyenne, <strong>'+avgWatchThrough+'%</strong> des spectateurs regardent au moins la moitié de vos vidéos</p>' : '') +
    (bestPost ? '<p style="margin:0 0 4px; font-size:12.5px; color:rgba(245,239,227,0.6);">🏆 Meilleure publication : '+(bestPost.views||0)+' vue(s)'+(bestPost.caption ? ' — « '+escapeHtml(bestPost.caption.slice(0,40))+(bestPost.caption.length>40?'…':'')+' »' : '')+'</p>' : '') +
    (hasEngagement ? '<p style="margin:8px 0 0; font-size:13px; color:var(--gold);">⏰ Meilleur moment pour publier : autour de '+bestHour+'h</p>' : '') +
    (topCountries.length > 0 ? '<p style="margin:8px 0 4px; font-size:13px;">🌍 Origine de votre public :</p>' + topCountries.map(([country, count]) => '<p style="margin:0 0 2px; font-size:12.5px; color:rgba(245,239,227,0.75);">• '+escapeHtml(country)+' — '+count+' spectateur(s)</p>').join('') : '') +
    (topConvertingPost ? '<p style="margin:8px 0 0; font-size:13px; color:var(--gold);">➕ Vidéo qui a le plus amené de nouveaux abonnés : « '+escapeHtml((topConvertingPost.caption||'').slice(0,40))+' » ('+topConvertingPostId[1]+' abonné(s))</p>' : '') +
    ((ageKnownCount > 0 || genderKnownCount > 0) ? '<p style="margin:8px 0 4px; font-size:13px;">👥 Profil de vos abonnés (déclaratif) :</p>' +
      (topAgeBracket ? '<p style="margin:0 0 2px; font-size:12.5px; color:rgba(245,239,227,0.75);">• Tranche d’âge la plus représentée : '+topAgeBracket+' ans ('+ageKnownCount+' abonné(s) renseigné(s) sur '+followerRecords.length+')</p>' : '') +
      (topGender ? '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.75);">• Genre le plus représenté : '+escapeHtml(topGender)+' ('+genderKnownCount+' abonné(s) renseigné(s) sur '+followerRecords.length+')</p>' : '') : '');
}
async function renderReferralLeaderboard(){
  const el = document.getElementById('referral-leaderboard');
  if(!el) return;
  const users = await fetchUsers();
  const top = users.filter(u => (u.referralCount||0) > 0).sort((a,b) => (b.referralCount||0) - (a.referralCount||0)).slice(0, 10);
  if(top.length === 0){ el.innerHTML = '<div class="empty">Personne n’a encore parrainé d’ami. Soyez le premier !</div>'; return; }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = top.map((u, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;'+(u.username===currentUser?' border-color:var(--gold);':'')+'">' +
    '<span style="font-size:15px; width:24px; text-align:center;">'+(medals[i] || (i+1))+'</span>' +
    smallAvatarBadge(u.username, 28) +
    '<span style="flex:1; font-size:13px;">@'+escapeHtml(u.username)+(u.username===currentUser?' (vous)':'')+'</span>' +
    '<strong style="font-size:13px; color:var(--gold);">'+(u.referralCount||0)+'</strong>' +
    '</div>'
  ).join('');
}
async function renderReferralCard(me){
  const el = document.getElementById('referral-card');
  if(!el) return;
  const count = (me && me.referralCount) || 0;
  el.innerHTML =
    '<p style="font-size:12.5px; color:rgba(245,239,227,0.6); margin:0 0 10px;">Partagez votre nom d’utilisateur — vos amis l’indiquent comme code de parrainage à l’inscription.</p>' +
    '<p style="font-size:15px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold); margin:0 0 10px;">Votre code : @'+escapeHtml(currentUser)+'</p>' +
    '<p style="font-size:13px; margin:0;">🎉 <strong>'+count+'</strong> ami(s) invité(s) avec succès</p>';
  await renderReferralLeaderboard();
  const qrImg = document.getElementById('profile-qr-code');
  if(qrImg){
    const profileText = 'Suktum — @' + currentUser;
    qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=' + encodeURIComponent(profileText);
  }
}
/* ---------- REÇU / FACTURE TÉLÉCHARGEABLE ---------- */
let currentReceiptOrderId = null;
async function verifyTransactionReference(){
  const raw = document.getElementById('verify-transaction-input').value.trim().toLowerCase();
  const el = document.getElementById('verify-transaction-result');
  if(!raw){ showToast('Entrez une référence de transaction'); return; }
  const o = await safeGet('order:' + raw, true).catch(() => null);
  if(!o || o.status !== 'fulfilled'){
    el.innerHTML = '<div class="card" style="border-color:var(--coral);"><p style="margin:0; font-size:13px; color:var(--coral);">✗ Aucune transaction confirmée ne correspond à cette référence.</p></div>';
    return;
  }
  const seller = o.sellerUsername ? await safeGet('user:' + o.sellerUsername, true).catch(() => null) : null;
  const sellerIsVerified = seller && seller.kycStatus === 'verified';
  el.innerHTML = '<div class="card" style="border-color:var(--lagoon);">' +
    '<p style="margin:0 0 10px; font-size:13.5px; color:var(--lagoon); font-weight:600;">✓ Transaction vérifiée — enregistrée sur Suktum</p>' +
    '<p style="margin:0 0 3px; font-size:12.5px;">Vendeur : '+(sellerIsVerified ? escapeHtml(seller.kycFullName)+' (identité vérifiée)' : '@'+escapeHtml(o.sellerUsername||'—'))+'</p>' +
    '<p style="margin:0 0 3px; font-size:12.5px;">Marchandise : '+escapeHtml(o.productName)+' × '+o.quantity+'</p>' +
    '<p style="margin:0 0 3px; font-size:12.5px;">Montant : '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:12.5px;">Date : '+new Date(o.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '</div>';
}
async function openOfficialInvoice(orderId){
  if(!orderId) return;
  const o = await safeGet('order:' + orderId, true);
  if(!o){ showToast('Commande introuvable'); return; }
  const seller = o.sellerUsername ? await safeGet('user:' + o.sellerUsername, true) : null;
  go('official-invoice');
  const el = document.getElementById('official-invoice-content');
  const now = new Date().toLocaleDateString('fr-FR');
  const sellerIsVerified = seller && seller.kycStatus === 'verified';
  el.innerHTML =
    '<div style="text-align:center; margin-bottom:20px; border-bottom:2px solid var(--gold); padding-bottom:14px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">Plateforme Suktum ⛵</p>' +
    '<h2 style="margin:8px 0 4px; font-size:19px; font-family:\'Baloo 2\';">Facture — Preuve d’achat</h2>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">Référence de transaction : '+o.id.toUpperCase()+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Émise le '+now+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:12px;">' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.5); text-transform:uppercase;">Vendeur</p>' +
    '<p style="margin:0 0 3px; font-size:13.5px; font-weight:600;">'+(sellerIsVerified ? escapeHtml(seller.kycFullName) : '@'+escapeHtml(o.sellerUsername||'—'))+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:'+(sellerIsVerified ? 'var(--lagoon)' : 'rgba(245,239,227,0.4)')+';">'+(sellerIsVerified ? '✓ Identité vérifiée par Suktum le '+new Date(seller.kycVerifiedAt).toLocaleDateString('fr-FR') : 'Identité non vérifiée auprès de Suktum')+'</p>' +
    (seller && seller.phone ? '<p style="margin:4px 0 0; font-size:12px;">Téléphone : '+escapeHtml(seller.phone)+'</p>' : '') +
    '</div>' +
    '<div class="card" style="margin-bottom:12px;">' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.5); text-transform:uppercase;">Acheteur</p>' +
    '<p style="margin:0 0 3px; font-size:13.5px; font-weight:600;">'+escapeHtml(o.buyerName||o.buyerUsername)+'</p>' +
    '<p style="margin:0 0 2px; font-size:12px;">Téléphone : '+escapeHtml(o.buyerPhone||'—')+'</p>' +
    '<p style="margin:0; font-size:12px;">Adresse : '+escapeHtml(o.buyerAddress||'—')+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:12px;">' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.5); text-transform:uppercase;">Marchandise</p>' +
    '<p style="margin:0 0 6px; font-size:13.5px;">'+escapeHtml(o.productName)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">Quantité : '+o.quantity+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">Prix unitaire : '+(o.unitPrice||0).toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:10px 0 0; font-size:16px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold);">Montant total : '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
    '</div>' +
    '<p style="margin:0; font-size:10.5px; color:rgba(245,239,227,0.5); line-height:1.5;">Ce document atteste qu’une transaction a été enregistrée sur la plateforme Suktum entre l’acheteur et le vendeur identifiés ci-dessus, à la date et pour le montant indiqués. Suktum agit en tant qu’intermédiaire de mise en relation ; les paiements sont traités directement entre les parties. Ce document peut être présenté comme preuve d’achat, notamment auprès des autorités douanières ou de transport, en complément des documents d’expédition habituels.</p>' +
    '<div class="card" style="margin-top:14px; border-color:var(--gold);"><p style="margin:0 0 4px; font-size:11.5px; font-weight:600;">🔍 Vérification de ce document</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.6);">Sur l’écran d’accueil de l’application Suktum, sélectionnez « Vérifier une facture » et entrez la référence : '+o.id+'</p></div>';
}
async function openOrderReceipt(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o){ showToast('Commande introuvable'); return; }
  currentReceiptOrderId = orderId;
  go('order-receipt');
  const el = document.getElementById('order-receipt-content');
  const now = new Date().toLocaleDateString('fr-FR');
  const stageLabels = { prepared: 'Préparée', shipped: 'Expédiée', delivered: 'Livrée' };
  el.innerHTML =
    '<div style="text-align:center; margin-bottom:20px;">' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">Suktum — ⛵ Notre pirogue</p>' +
    '<h2 style="margin:8px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Reçu de commande</h2>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">N° '+o.id.slice(-8).toUpperCase()+' · Édité le '+now+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">Acheteur</p>' +
    '<p style="margin:0 0 2px; font-size:13px;">'+escapeHtml(o.buyerName||o.buyerUsername)+'</p>' +
    '<p style="margin:0 0 2px; font-size:12px;">📞 '+escapeHtml(o.buyerPhone||'—')+'</p>' +
    '<p style="margin:0; font-size:12px;">📍 '+escapeHtml(o.buyerAddress||'—')+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">Vendeur</p>' +
    '<p style="margin:0; font-size:13px;">@'+escapeHtml(o.sellerUsername||'Suktum')+'</p>' +
    '</div>' +
    '<div class="card" style="margin-bottom:14px;">' +
    '<p style="margin:0 0 8px; font-size:13px; font-weight:600;">'+escapeHtml(o.productName)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">Quantité : '+o.quantity+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">Prix unitaire : '+(o.unitPrice||0).toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:10px 0 0; font-size:16px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold);">Total : '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
    '</div>' +
    (o.shipmentStage ? '<p style="margin:0 0 4px; font-size:12.5px;">📦 Statut déclaré par le vendeur : '+(stageLabels[o.shipmentStage]||o.shipmentStage)+'</p>' : '') +
    (o.buyerConfirmedReceipt ? '<p style="margin:0 0 14px; font-size:12.5px; color:var(--lagoon);">✓ Réception confirmée par vous-même le '+new Date(o.buyerConfirmedAt).toLocaleDateString('fr-FR')+'</p>' : '<div id="receipt-confirm-area" style="margin-bottom:14px;"></div>') +
    '<p style="margin:0; font-size:10.5px; color:rgba(245,239,227,0.4);">Ce reçu confirme une commande passée sur Suktum. Le paiement est traité manuellement entre l’acheteur et Suktum, selon les instructions fournies au moment de la commande.</p>';
  await renderReceiptConfirmArea(o);
  await renderRefundRequestArea(o);
}
async function renderReceiptConfirmArea(order){
  const el = document.getElementById('receipt-confirm-area');
  if(!el || order.buyerUsername !== currentUser || order.buyerConfirmedReceipt) return;
  if(order.status === 'cancelled'){ el.innerHTML = '<p style="margin:0; font-size:12.5px; color:var(--coral);">✕ Commande annulée le '+new Date(order.cancelledAt).toLocaleDateString('fr-FR')+'</p>'; return; }
  if(order.shipmentStage === 'shipped' || order.shipmentStage === 'delivered'){
    el.innerHTML = '<button class="btn btn-primary" style="width:100%; margin-bottom:8px;" onclick="confirmOrderReceipt(\''+order.id+'\')">✅ J’ai bien reçu ma commande</button>' +
      '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="reportNonReceipt(\''+order.id+'\')">❌ Je n’ai pas reçu ma commande</button>';
  } else {
    el.innerHTML = '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="cancelMyOrder(\''+order.id+'\')">✕ Annuler ma commande</button>' +
      '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:6px 0 0;">Possible tant que le vendeur n’a pas encore expédié votre colis.</p>';
  }
}
async function sellerCancelOrder(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.sellerUsername !== currentUser) return;
  if(o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered'){ showToast('Trop tard — cette commande a déjà été expédiée'); return; }
  const reason = prompt('Pourquoi annulez-vous cette commande de « '+o.productName+' » ? (rupture de stock, adresse incorrecte...)');
  if(reason === null || !reason.trim()) return;
  o.status = 'cancelled';
  o.cancelledAt = new Date().toISOString();
  o.cancelledBy = 'seller';
  o.cancellationReason = reason.trim();
  await saveWithRetry('order:' + orderId, o, true);
  showToast('Commande annulée ✓');
  await createNotification(o.buyerUsername, 'order_cancelled_by_seller', currentUser, orderId, o.productName + '__' + reason.trim());
  await renderSellerDashboard();
}
async function cancelMyOrder(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.buyerUsername !== currentUser) return;
  if(o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered'){ showToast('Trop tard — votre colis a déjà été expédié'); return; }
  const ok = confirm('Annuler définitivement cette commande de « '+o.productName+' » ?');
  if(!ok) return;
  o.status = 'cancelled';
  o.cancelledAt = new Date().toISOString();
  o.cancelledBy = 'buyer';
  await saveWithRetry('order:' + orderId, o, true);
  showToast('Commande annulée ✓');
  await createNotification(o.sellerUsername, 'order_cancelled', currentUser, orderId, o.productName);
  await openOrderReceipt(orderId);
}
async function checkVerifiedDeliveryBadge(sellerUsername){
  const allOrders = await fetchOrders();
  const sellerOrders = allOrders.filter(o => o.sellerUsername === sellerUsername && o.status === 'fulfilled' && (o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered'));
  if(sellerOrders.length < 5) return;
  const confirmedCount = sellerOrders.filter(o => o.buyerConfirmedReceipt).length;
  const confirmedRate = confirmedCount / sellerOrders.length;
  const qualifies = confirmedRate >= 0.8;
  const u = await safeGet('user:' + sellerUsername, true);
  if(!u) return;
  if(qualifies && !u.verifiedDeliveryBadge){
    u.verifiedDeliveryBadge = true;
    await saveWithRetry('user:' + sellerUsername, u, true);
    await createNotification(sellerUsername, 'verified_delivery_badge', 'Suktum', null, null);
  } else if(!qualifies && u.verifiedDeliveryBadge){
    u.verifiedDeliveryBadge = false;
    await saveWithRetry('user:' + sellerUsername, u, true);
    await createNotification(sellerUsername, 'verified_delivery_badge_lost', 'Suktum', null, Math.round(confirmedRate * 100) + '%');
  }
}
async function confirmOrderReceipt(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.buyerUsername !== currentUser) return;
  o.buyerConfirmedReceipt = true;
  o.buyerConfirmedAt = new Date().toISOString();
  await saveWithRetry('order:' + orderId, o, true);
  showToast('Réception confirmée ✓');
  await checkVerifiedDeliveryBadge(o.sellerUsername);
  await openOrderReceipt(orderId);
}
async function reportNonReceipt(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o || o.buyerUsername !== currentUser) return;
  const existing = await safeGet('refundrequest:' + orderId, true);
  if(existing){ showToast('Un signalement existe déjà pour cette commande'); return; }
  const ok = confirm('Signaler que vous n’avez pas reçu cette commande, malgré le statut déclaré par le vendeur ? Le vendeur et l’équipe Suktum en seront informés.');
  if(!ok) return;
  await saveWithRetry('refundrequest:' + orderId, {
    orderId, buyerUsername: currentUser, sellerUsername: o.sellerUsername, productName: o.productName,
    total: o.total, reason: 'Colis jamais reçu malgré le statut « '+(o.shipmentStage||'—')+' » déclaré par le vendeur', status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Signalement envoyé ✓');
  await logAdminAction('Non-réception signalée par l’acheteur', '@'+currentUser+' — commande de @'+o.sellerUsername+' ('+o.productName+')');
  await openOrderReceipt(orderId);
}
/* ---------- SUIVI DES DEMANDES DE REMBOURSEMENT ---------- */
async function renderRefundRequestArea(order){
  const el = document.getElementById('refund-request-area');
  if(!el || order.buyerUsername !== currentUser) { if(el) el.innerHTML = ''; return; }
  const existing = await safeGet('refundrequest:' + order.id, true);
  if(!existing){
    el.innerHTML = '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="requestRefund(\''+order.id+'\')">💰 Demander un remboursement</button>';
  } else {
    const statusLabels = { pending: '⏳ Demande envoyée — en attente de traitement', processing: '🔧 En cours de traitement', resolved: '✓ Traitée' };
    el.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:12.5px; color:var(--gold);">'+statusLabels[existing.status]+'</p>' +
      (existing.reason ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(existing.reason)+'</p>' : '') + '</div>';
  }
}
async function requestRefund(orderId){
  const order = await safeGet('order:' + orderId, true);
  if(!order || order.buyerUsername !== currentUser) return;
  const existing = await safeGet('refundrequest:' + orderId, true);
  if(existing){ showToast('Une demande existe déjà pour cette commande'); return; }
  const reason = prompt('Pourquoi souhaitez-vous être remboursé(e) ?');
  if(reason === null || !reason.trim()) return;
  await saveWithRetry('refundrequest:' + orderId, {
    orderId, buyerUsername: currentUser, sellerUsername: order.sellerUsername, productName: order.productName,
    total: order.total, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Demande envoyée ✓');
  if(order.sellerUsername) await createNotification(order.sellerUsername, 'refund_requested', currentUser, orderId, order.productName);
  await logAdminAction('Nouvelle demande de remboursement', '@' + currentUser + ' — ' + order.productName + ' (' + order.total.toLocaleString('fr-FR') + ' FCFA)');
  await openOrderReceipt(orderId);
}
/* ---------- SON D'ALERTE DU BACK-OFFICE ---------- */
async function loadAdminAlertSoundToggle(){
  const toggle = document.getElementById('admin-alert-sound-toggle');
  if(!toggle) return;
  const enabled = await safeGet('settings:adminAlertSoundEnabled', true);
  toggle.checked = enabled === null || enabled === undefined ? true : enabled;
}
async function toggleAdminAlertSound(){
  const enabled = document.getElementById('admin-alert-sound-toggle').checked;
  await saveWithRetry('settings:adminAlertSoundEnabled', enabled, true);
  showToast(enabled ? 'Son d’alerte activé ✓' : 'Son d’alerte désactivé');
}
function playAdminAlertSound(){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }catch(e){ /* synthèse audio indisponible sur cet appareil — échec silencieux, jamais bloquant */ }
}
async function checkAndPlayAdminAlertSound(){
  const enabled = await safeGet('settings:adminAlertSoundEnabled', true);
  if(enabled === false) return;
  const importantAlerts = await fetchImportantAlerts();
  const unseenImportant = importantAlerts.filter(a => !a.seen).length;
  const pendingRefunds = (await fetchRefundRequests()).filter(r => r.status !== 'resolved').length;
  const totalCount = unseenImportant + pendingRefunds;
  const lastCount = await safeGet('settings:lastAdminAlertSoundCount', false).catch(() => null);
  if(totalCount > (lastCount || 0)) playAdminAlertSound();
  await saveWithRetry('settings:lastAdminAlertSoundCount', totalCount, false);
}
async function fetchRefundRequests(){
  const keys = await safeList('refundrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function resolveRefundRequest(orderId, outcome){
  const r = await safeGet('refundrequest:' + orderId, true);
  if(!r) return;
  r.status = 'resolved';
  r.outcome = outcome;
  r.resolvedAt = new Date().toISOString();
  await saveWithRetry('refundrequest:' + orderId, r, true);
  if(outcome === 'rejected' && r.reason && r.reason.includes('jamais reçu')){
    const o = await safeGet('order:' + orderId, true);
    if(o && !o.buyerConfirmedReceipt){
      o.buyerConfirmedReceipt = true;
      o.buyerConfirmedAt = new Date().toISOString();
      o.buyerConfirmedByAdminOverride = true;
      await saveWithRetry('order:' + orderId, o, true);
      if(o.sellerUsername) await checkVerifiedDeliveryBadge(o.sellerUsername);
    }
  }
  showToast(outcome === 'upheld' ? 'Réclamation marquée fondée ✓' : 'Réclamation marquée infondée ✓');
  await logAdminAction('Litige résolu — ' + (outcome === 'upheld' ? 'réclamation fondée' : 'réclamation infondée'), '@' + r.buyerUsername + ' — ' + r.productName);
  await createNotification(r.buyerUsername, 'dispute_resolved_buyer', currentAdminName || 'Suktum', orderId, r.productName + '__' + outcome);
  if(r.sellerUsername) await createNotification(r.sellerUsername, 'dispute_resolved_seller', currentAdminName || 'Suktum', orderId, r.productName + '__' + outcome);
  await renderRefundRequestsAdmin();
}
async function setRefundRequestStatus(orderId, status){
  const r = await safeGet('refundrequest:' + orderId, true);
  if(!r) return;
  r.status = status;
  await saveWithRetry('refundrequest:' + orderId, r, true);
  showToast('Statut mis à jour ✓');
  await logAdminAction('Demande de remboursement — statut changé (' + status + ')', '@' + r.buyerUsername + ' — ' + r.productName);
  await renderRefundRequestsAdmin();
}
async function renderRefundRequestsAdmin(){
  const el = document.getElementById('refund-requests-admin-list');
  if(!el) return;
  const requests = (await fetchRefundRequests()).filter(r => r.status !== 'resolved');
  const now = new Date();
  const badgeEl = document.getElementById('stale-dispute-badge');
  const staleCount = requests.filter(r => Math.floor((now - new Date(r.createdAt)) / (24*60*60*1000)) >= 3).length;
  if(badgeEl) badgeEl.innerHTML = staleCount > 0 ? '<span style="background:var(--coral); color:#fff; font-size:11px; padding:2px 8px; border-radius:10px; font-family:inherit; text-transform:none;">'+staleCount+' en retard</span>' : '';
  el.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande de remboursement en attente.</div>' : requests.map(r => {
    const daysSince = Math.floor((now - new Date(r.createdAt)) / (24*60*60*1000));
    const isStale = daysSince >= 3;
    return '<div class="card" style="margin-bottom:10px; '+(isStale ? 'border-color:var(--coral);' : '')+'">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.buyerUsername)+'</strong> — '+escapeHtml(r.productName)+' ('+r.total.toLocaleString('fr-FR')+' FCFA)</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
    (isStale ? '<p style="margin:0 0 8px; font-size:11.5px; color:var(--coral);">⏰ En attente depuis '+daysSince+' jour(s) — nécessite une vraie réponse</p>' : '') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    (r.status === 'pending' ? '<button class="btn btn-outline btn-sm" onclick="setRefundRequestStatus(\''+r.orderId+'\', \'processing\')">🔧 En cours</button>' : '') +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--lagoon); color:var(--lagoon);" onclick="resolveRefundRequest(\''+r.orderId+'\', \'upheld\')">✓ Réclamation fondée</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:rgba(245,239,227,0.4); color:rgba(245,239,227,0.7);" onclick="resolveRefundRequest(\''+r.orderId+'\', \'rejected\')">✕ Réclamation infondée</button>' +
    (r.sellerUsername ? '<button class="btn btn-outline btn-sm" onclick="openSellerLedgerFor(\''+r.sellerUsername+'\')">📒 Historique du vendeur</button>' : '') +
    '</div></div>';
  }).join('');
}
async function saveSellerInternalNote(){
  const sellerUsername = document.getElementById('seller-ledger-search').value.trim();
  if(!sellerUsername) return;
  const text = document.getElementById('seller-internal-note-text').value.trim();
  if(text){
    await saveWithRetry('sellerinternalnote:' + sellerUsername, { text, updatedBy: currentUser, updatedAt: new Date().toISOString() }, true);
    showToast('Note enregistrée ✓');
  } else {
    await window.storage.delete('sellerinternalnote:' + sellerUsername, true).catch(() => {});
    showToast('Note effacée');
  }
}
async function openSellerLedgerFor(sellerUsername){
  go('seller-ledger');
  document.getElementById('seller-ledger-search').value = sellerUsername;
  await renderSellerLedger();
}
async function requestAccountDeletion(){
  const existing = await safeGet('accountdeletionrequest:' + currentUser, true).catch(() => null);
  if(existing && existing.status === 'pending'){ showToast('Vous avez déjà une demande de suppression en cours de traitement'); return; }
  const reason = prompt('Pourquoi souhaitez-vous supprimer votre compte ? (facultatif, aide notre équipe)');
  if(reason === null) return;
  await saveWithRetry('accountdeletionrequest:' + currentUser, {
    username: currentUser, reason: (reason || '').trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Demande envoyée — notre équipe la traitera sous peu ✓');
}
/* ---------- DEMANDES DE SUPPRESSION DE COMPTE (DROIT À L'OUBLI) — CÔTÉ ADMIN ---------- */
async function fetchAccountDeletionRequests(){
  const keys = await safeList('accountdeletionrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function renderAccountDeletionRequests(){
  const el = document.getElementById('account-deletion-requests-list');
  if(!el) return;
  const requests = (await fetchAccountDeletionRequests()).filter(r => r.status === 'pending');
  el.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : requests.map(r =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.username)+'</strong> — demandé le '+new Date(r.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    (r.reason ? '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' : '') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="processAccountDeletion(\''+escapeHtml(r.username)+'\')">🗑️ Supprimer définitivement</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectAccountDeletionRequest(\''+escapeHtml(r.username)+'\')">✕ Refuser</button>' +
    '</div></div>'
  ).join('');
}
async function processAccountDeletion(username){
  if(!confirm('Supprimer définitivement le compte @' + username + ' ? Son profil, ses publications et ses stories seront effacés — action irréversible. (Les commandes déjà passées et une archive des données d’identité sont conservées à des fins de preuve.)')) return;
  const u = await safeGet('user:' + username, true).catch(() => null);
  const note = await safeGet('sellerinternalnote:' + username, true).catch(() => null);
  await saveWithRetry('accountarchive:' + username, {
    username, kycStatus: u ? u.kycStatus : null, kycFullName: u ? u.kycFullName : null, kycVerifiedAt: u ? u.kycVerifiedAt : null,
    phone: u ? u.phone : null, country: u ? u.country : null, googleEmail: u ? u.googleEmail : null,
    accountCreatedAt: u ? u.createdAt : null, internalNote: note ? note.text : null,
    archivedAt: new Date().toISOString(), archivedBy: currentUser
  }, true);
  await window.storage.delete('user:' + username, true).catch(() => {});
  const posts = (await fetchPosts(true)).filter(p => p.userId === username);
  for(const p of posts){ await window.storage.delete('post:' + p.id, true).catch(() => {}); }
  await window.storage.delete('sellerinternalnote:' + username, true).catch(() => {});
  const blockedCommentKeys = await safeList('autoblockedcomment:', true);
  for(const k of blockedCommentKeys){ const b = await safeGet(k, true).catch(() => null); if(b && b.username === username) await window.storage.delete(k, true).catch(() => {}); }
  await cleanupFollowSourceRecords(username);
  const req = await safeGet('accountdeletionrequest:' + username, true);
  if(req){ req.status = 'completed'; req.completedAt = new Date().toISOString(); await saveWithRetry('accountdeletionrequest:' + username, req, true); }
  showToast('Compte @' + username + ' supprimé — archive de preuve conservée ✓');
  await logAdminAction('Compte supprimé (droit à l’oubli) — archive de preuve créée', '@' + username + ' — ' + posts.length + ' publication(s) effacée(s)');
  await renderAccountDeletionRequests();
}
async function rejectAccountDeletionRequest(username){
  const req = await safeGet('accountdeletionrequest:' + username, true);
  if(req){ req.status = 'rejected'; await saveWithRetry('accountdeletionrequest:' + username, req, true); }
  showToast('Demande refusée');
  await logAdminAction('Demande de suppression refusée', '@' + username);
  await renderAccountDeletionRequests();
}
async function downloadAllMyContent(){
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser && p.data);
  if(myPosts.length === 0){ showToast('Vous n’avez encore aucune publication'); return; }
  const totalFiles = myPosts.reduce((sum,p) => sum + (p.images && p.images.length > 1 ? p.images.length : 1), 0);
  showToast('Téléchargement de '+totalFiles+' fichier(s) en cours...');
  for(let i = 0; i < myPosts.length; i++){
    const post = myPosts[i];
    const filesToDownload = (post.images && post.images.length > 1) ? post.images : [post.data];
    for(let j = 0; j < filesToDownload.length; j++){
      try{
        const a = document.createElement('a');
        a.href = filesToDownload[j];
        a.download = 'suktum-' + post.userId + '-' + post.id + (filesToDownload.length > 1 ? '-' + (j+1) : '') + (post.type === 'video' ? '.mp4' : '.jpg');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }catch(e){ /* on continue avec les suivantes même si l’une échoue */ }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }
  showToast('Téléchargement terminé ✓');
}
async function exportMyData(){
  showToast('Préparation de vos données...');
  const me = await safeGet('user:' + currentUser, true);
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser);
  const myOrders = (await fetchOrders()).filter(o => o.buyerUsername === currentUser);
  const myGifts = (await fetchGifts()).filter(g => g.fromUser === currentUser);
  const dmKeys = await safeList('dm:', true);
  const myMessages = [];
  for(const k of dmKeys){
    const threadKey = k.replace('dm:', '');
    if(!threadKey.split('__').includes(currentUser)) continue;
    const msgs = await safeGet(k, true);
    if(msgs) myMessages.push({thread: threadKey, messages: msgs});
  }
  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: me,
    posts: myPosts,
    orders: myOrders,
    gifts: myGifts,
    conversations: myMessages
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'suktum-mes-donnees-' + currentUser + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Vos données ont été téléchargées ✓');
}
function switchProfileTab(tab){
  profileActiveTab = tab;
  ['posts','favorites','likes','private','duo'].forEach(t => {
    const btn = document.getElementById('profile-tab-' + t);
    btn.style.borderBottom = t === tab ? '2px solid var(--coral)' : '2px solid transparent';
    btn.style.color = t === tab ? 'var(--cream)' : 'rgba(245,239,227,0.5)';
  });
  renderProfileGrid();
}
let profileGridRenderedCount = 30;
const PROFILE_GRID_BATCH_SIZE = 30;
function renderProfileGridBatch(allItems, grid){
  const visibleItems = allItems.slice(0, profileGridRenderedCount);
  grid.innerHTML = visibleItems.map(p => {
    const media = p.type === 'video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" loading="lazy">';
    const scheduledBadge = (p.status === 'scheduled') ? '<div style="position:absolute; top:4px; right:4px; background:var(--gold); color:var(--night); font-size:9px; font-weight:700; padding:2px 6px; border-radius:8px;">⏳ Programmée</div>' : '';
    const repostBadge = p.__isMyRepost ? '<div style="position:absolute; top:4px; left:4px; background:rgba(11,46,61,0.8); color:var(--cream); font-size:9px; font-weight:700; padding:2px 6px; border-radius:8px;">🔁 @'+escapeHtml(p.userId)+'</div>' : '';
    return '<div class="thumb" style="cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' + media + scheduledBadge + repostBadge + smallWatermark() + '</div>';
  }).join('');
  if(allItems.length > profileGridRenderedCount){
    grid.insertAdjacentHTML('afterend', '<button class="btn btn-outline" id="profile-grid-load-more" style="width:100%; margin-top:10px;" onclick="loadMoreProfileGridItems()">Voir plus ('+(allItems.length - profileGridRenderedCount)+' restant(s))</button>');
  }
}
let profileGridAllItems = [];
function loadMoreProfileGridItems(){
  profileGridRenderedCount += PROFILE_GRID_BATCH_SIZE;
  const oldBtn = document.getElementById('profile-grid-load-more');
  if(oldBtn) oldBtn.remove();
  renderProfileGridBatch(profileGridAllItems, document.getElementById('profile-grid'));
}
async function renderProfileGrid(){
  const grid = document.getElementById('profile-grid');
  profileGridRenderedCount = PROFILE_GRID_BATCH_SIZE;
  const oldBtn = document.getElementById('profile-grid-load-more');
  if(oldBtn) oldBtn.remove();
  if(profileActiveTab === 'favorites'){
    const favPosts = (await fetchPosts()).filter(p => (p.favoritedBy || []).includes(currentUser));
    if(favPosts.length === 0){ grid.innerHTML = '<div class="empty">Aucun favori pour l’instant.<br>Appuyez sur 📑 sous une vidéo pour l’enregistrer ici.</div>'; return; }
    profileGridAllItems = favPosts;
    renderProfileGridBatch(favPosts, grid);
    return;
  }
  if(profileActiveTab === 'likes'){
    const likedPosts = (await fetchPosts()).filter(p => (p.likes || []).includes(currentUser));
    if(likedPosts.length === 0){ grid.innerHTML = '<div class="empty">Aucune vidéo likée pour l’instant.</div>'; return; }
    profileGridAllItems = likedPosts;
    renderProfileGridBatch(likedPosts, grid);
    return;
  }
  if(profileActiveTab === 'private'){
    const privatePosts = (await fetchPosts(true)).filter(p => p.userId === currentUser && p.postPrivacy === 'private');
    if(privatePosts.length === 0){ grid.innerHTML = '<div class="empty">Aucune publication privée pour l’instant.</div>'; return; }
    profileGridAllItems = privatePosts;
    renderProfileGridBatch(privatePosts, grid);
    return;
  }
  if(profileActiveTab === 'duo'){
    const duoPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser && (p.duoWithPostId || p.stitchWithUsername));
    if(duoPosts.length === 0){ grid.innerHTML = '<div class="empty">Aucun Duo ou Stitch pour l’instant.</div>'; return; }
    profileGridAllItems = duoPosts;
    renderProfileGridBatch(duoPosts, grid);
    return;
  }
  const posts = (await fetchPosts(true)).filter(p => p.userId === currentUser && !p.suspended);
  const myReposts = await fetchRepostsByUser(currentUser);
  const repostItems = [];
  for(const r of myReposts){
    const original = await safeGet('post:' + r.postId, true);
    if(original && !original.suspended) repostItems.push({ ...original, __repostAt: r.createdAt, __isMyRepost: true });
  }
  const combined = [...posts.map(p => ({...p, __repostAt: p.createdAt})), ...repostItems]
    .sort((a,b) => new Date(b.__repostAt) - new Date(a.__repostAt));
  if(combined.length === 0){ grid.innerHTML = '<div class="empty">Vous n’avez encore rien publié.</div>'; return; }
  profileGridAllItems = combined;
  renderProfileGridBatch(combined, grid);
}
async function downloadPostMedia(postId){
  const post = (await fetchPosts()).find(p => p.id === postId);
  if(!post){ showToast('Publication introuvable'); return; }
  if(post.downloadable === false){ showToast('Le créateur a désactivé le téléchargement'); return; }
  try{
    const a = document.createElement('a');
    a.href = post.data;
    a.download = 'suktum-' + post.userId + '-' + post.id + (post.type === 'video' ? '.mp4' : '.jpg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Téléchargement en cours ✓');
  }catch(e){
    showToast('Impossible de télécharger ce fichier');
  }
}
async function repostToProfile(postId){
  const existing = await safeGet('repost:' + postId + '__' + currentUser, true).catch(() => null);
  if(existing){ showToast('Déjà repartagé sur votre profil'); return; }
  await saveWithRetry('repost:' + postId + '__' + currentUser, {
    postId, repostedBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  const post = await safeGet('post:' + postId, true);
  if(post) await createNotification(post.userId, 'repost', currentUser, postId);
  showToast('Repartagé sur votre profil ✓');
}
async function fetchRepostsByUser(username){
  const keys = await safeList('repost:', true);
  const reposts = [];
  for(const k of keys){
    const r = await safeGet(k, true);
    if(r && r.repostedBy === username) reposts.push(r);
  }
  return reposts;
}
function openProfileEditMenu(){
  openGenericKebabMenu([
    { icon: '📝', label: 'Bio', action: 'closeGenericKebabMenu(); showProfileField(\'bio\')' },
    { icon: '🔗', label: 'Lien', action: 'closeGenericKebabMenu(); showProfileField(\'link\')' },
    { icon: '📞', label: 'Téléphone', action: 'closeGenericKebabMenu(); showProfileField(\'phone\')' },
    { icon: '📍', label: 'Ville / quartier', action: 'closeGenericKebabMenu(); showProfileField(\'city\')' },
    { icon: '➕', label: 'Plus d’informations', action: 'closeGenericKebabMenu(); showProfileField(\'more\')' }
  ]);
}
function showProfileField(field){
  document.getElementById('profile-fields-panel').style.display = 'block';
  ['bio','link','phone','city','more'].forEach(f => {
    document.getElementById('field-group-' + f).style.display = f === field ? 'block' : 'none';
  });
}
async function saveProfileBio(){
  const bio = document.getElementById('profile-bio-input').value.trim().slice(0, 200);
  let link = document.getElementById('profile-link-input').value.trim();
  if(link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  const phone = document.getElementById('profile-phone-input').value.trim();
  const city = document.getElementById('profile-city-input').value.trim();
  const originCountry = document.getElementById('profile-origin-country-input').value || null;
  const gender = document.getElementById('profile-gender-input').value || null;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.bio = bio;
  me.link = link;
  me.phone = phone;
  me.city = city;
  me.originCountry = originCountry;
  me.gender = gender;
  await saveWithRetry('user:' + currentUser, me, true);
  currentUserCity = city;
  showToast('Profil mis à jour ✓');
  await logUserActivity(currentUser, 'profil', 'Profil mis à jour');
  await renderProfile();
}
async function uploadProfilePhoto(){
  const fileInput = document.getElementById('profile-photo-input');
  const file = fileInput.files[0];
  if(!file) return;
  if(file.size > MAX_AUDIO_SIZE){ showToast('Photo trop lourde (1,5 Mo max)'); fileInput.value = ''; return; }
  try{
    const rawDataUrl = await readFileAsDataURL(file);
    const dataUrl = await compressImageDataUrl(rawDataUrl, 600, 0.8);
    const mediaCheck = await moderateImageWithCloudVision(dataUrl);
    if(mediaCheck.checked && mediaCheck.flagged){
      showToast('Cette photo ne peut pas être utilisée comme photo de profil');
      fileInput.value = '';
      return;
    }
    const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
    me.photo = dataUrl;
    await saveWithRetry('user:' + currentUser, me, true);
    showToast('Photo de profil mise à jour ✓');
    await renderProfile();
  }catch(e){
    showToast('Impossible de charger cette photo');
  }
  fileInput.value = '';
}
async function pauseMyAccount(){
  const ok = confirm('Mettre votre compte Suktum en pause ?\n\nVotre profil et vos publications deviendront invisibles pour les autres jusqu’à ce que vous vous reconnectiez avec le même nom.');
  if(!ok) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.paused = true;
  me.pausedAt = new Date().toISOString();
  await saveWithRetry('user:' + currentUser, me, true);
  await logoutAccount();
}
async function changeUsername(){
  const newNameRaw = document.getElementById('profile-username-input').value.trim();
  if(!newNameRaw){ showToast('Entrez un nouveau nom d’utilisateur'); return; }
  const usernameCheck = validateUsernameFormat(newNameRaw);
  if(!usernameCheck.valid){ showToast(usernameCheck.reason); return; }
  if(newNameRaw === currentUser){ showToast('C’est déjà votre nom actuel'); return; }
  const existing = await safeGet('user:' + newNameRaw, true);
  if(existing){ showToast('Ce nom d’utilisateur est déjà pris'); return; }
  const ok = confirm('Changer votre nom d’utilisateur de @' + currentUser + ' à @' + newNameRaw + ' ?\n\nVos publications et abonnements suivront. Certains anciens échanges (messages, commandes passées) pourront rester associés à votre ancien nom.');
  if(!ok) return;
  showToast('Changement en cours...');
  const oldName = currentUser;

  const me = await safeGet('user:' + oldName, true);
  if(me){
    me.username = newNameRaw;
    await saveWithRetry('user:' + newNameRaw, me, true);
    await window.storage.delete('user:' + oldName, true).catch(() => {});
  }

  const allPosts = await fetchPosts(true);
  for(const p of allPosts){
    let changed = false;
    if(p.userId === oldName){ p.userId = newNameRaw; changed = true; }
    if(p.likes && p.likes.includes(oldName)){ p.likes = p.likes.map(u => u === oldName ? newNameRaw : u); changed = true; }
    if(p.dislikes && p.dislikes.includes(oldName)){ p.dislikes = p.dislikes.map(u => u === oldName ? newNameRaw : u); changed = true; }
    if(p.favoritedBy && p.favoritedBy.includes(oldName)){ p.favoritedBy = p.favoritedBy.map(u => u === oldName ? newNameRaw : u); changed = true; }
    if(p.comments && p.comments.some(c => c.user === oldName)){ p.comments = p.comments.map(c => c.user === oldName ? {...c, user: newNameRaw} : c); changed = true; }
    if(changed) await saveWithRetry('post:' + p.id, p, true);
  }

  const allUsers = await fetchUsers();
  for(const u of allUsers){
    let changed = false;
    if(u.following && u.following.includes(oldName)){ u.following = u.following.map(x => x === oldName ? newNameRaw : x); changed = true; }
    if(u.followers && u.followers.includes(oldName)){ u.followers = u.followers.map(x => x === oldName ? newNameRaw : x); changed = true; }
    if(changed) await saveWithRetry('user:' + u.username, u, true);
  }

  const dmKeys = await safeList('dm:', true);
  for(const k of dmKeys){
    const threadKey = k.replace('dm:', '');
    const parties = threadKey.split('__');
    if(!parties.includes(oldName)) continue;
    const msgs = await safeGet(k, true);
    if(!msgs) continue;
    const newParties = parties.map(p => p === oldName ? newNameRaw : p).sort();
    const newKey = 'dm:' + newParties.join('__');
    const newMsgs = msgs.map(m => m.from === oldName ? {...m, from: newNameRaw} : m);
    await saveWithRetry(newKey, newMsgs, true);
    if(newKey !== k) await window.storage.delete(k, true).catch(() => {});
  }

  currentUser = newNameRaw;
  await saveWithRetry('settings:username', newNameRaw, false);
  document.getElementById('profile-username-input').value = '';
  showToast('Nom d’utilisateur changé ✓');
  await renderProfile();
}
async function renderFollowingList(){
  const el = document.getElementById('following-list-content');
  const me = await safeGet('user:' + currentUser, true);
  const following = (me && me.following) || [];
  if(following.length === 0){ el.innerHTML = '<div class="empty">Vous ne suivez encore personne.</div>'; return; }
  el.innerHTML = following.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' + smallAvatarBadge(u, 32) + '<strong style="font-size:13.5px;">@'+escapeHtml(u)+'</strong></div>'
  ).join('');
}
async function renderFollowersList(){
  const el = document.getElementById('followers-list-content');
  const me = await safeGet('user:' + currentUser, true);
  const followers = (me && me.followers) || [];
  if(followers.length === 0){ el.innerHTML = '<div class="empty">Aucun follower pour l’instant.</div>'; return; }
  el.innerHTML = followers.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">' + smallAvatarBadge(u, 32) + '<strong style="font-size:13.5px;">@'+escapeHtml(u)+'</strong></div>'
  ).join('');
}

