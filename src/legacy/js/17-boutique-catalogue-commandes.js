/* ---------- SHOP ---------- */
async function fetchProducts(){
  const keys = await safeList('product:', true);
  const products = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) products.push(p); }
  return products;
}
/* ---------- COMMANDES & COMMISSION AUTOMATIQUE ---------- */
async function openCustomerHistory(buyerUsername){
  go('customer-history');
  document.getElementById('customer-history-title').textContent = 'Historique — @' + buyerUsername;
  const orderKeys = await safeList('order:', true);
  const orders = [];
  for(const k of orderKeys){
    const o = await safeGet(k, true).catch(() => null);
    if(o && o.buyerUsername === buyerUsername && o.sellerUsername === currentUser) orders.push(o);
  }
  orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const bookingKeys = await safeList('servicebooking:', true);
  const bookings = [];
  for(const k of bookingKeys){
    const b = await safeGet(k, true).catch(() => null);
    if(b && b.buyerUsername === buyerUsername && b.sellerUsername === currentUser) bookings.push(b);
  }
  bookings.sort((a,b) => new Date(b.slot) - new Date(a.slot));
  const totalSpent = orders.filter(o => o.status !== 'cancelled').reduce((s,o) => s + o.total, 0) + bookings.filter(b => b.status !== 'cancelled').reduce((s,b) => s + b.price, 0);
  document.getElementById('customer-history-summary').innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">🛒 '+orders.length+' commande(s) · 📅 '+bookings.length+' réservation(s)</p>' +
    '<p style="margin:0; font-size:15px; font-weight:700; color:var(--gold);">'+totalSpent.toLocaleString('fr-FR')+' FCFA dépensés au total avec vous</p>';
  const ordersEl = document.getElementById('customer-history-orders');
  ordersEl.innerHTML = orders.length === 0 ? '<div class="empty">Aucune commande pour l’instant.</div>' : orders.map(o =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(o.productName)+'</strong> × '+o.quantity+' — '+o.total.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+new Date(o.createdAt).toLocaleDateString('fr-FR')+' — '+(o.status === 'cancelled' ? '✕ Annulée' : o.status === 'fulfilled' ? '✓ Traitée' : '⏳ En attente')+'</p></div>'
  ).join('');
  const bookingsEl = document.getElementById('customer-history-bookings');
  bookingsEl.innerHTML = bookings.length === 0 ? '<div class="empty">Aucune réservation pour l’instant.</div>' : bookings.map(b =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(b.productName)+'</strong> — '+b.price.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+new Date(b.slot).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
let currentOrderProduct = null;
/* ---------- MODÉRATION AUTOMATIQUE DES MÉDIAS — GOOGLE CLOUD VISION / VIDEO INTELLIGENCE ---------- */
async function saveGoogleCloudModerationKeys(){
  const visionKey = document.getElementById('gcv-vision-key-input').value.trim();
  const videoKey = document.getElementById('gcv-video-key-input').value.trim();
  await saveWithRetry('settings:gcvVisionKey', visionKey || null, true);
  await saveWithRetry('settings:gcvVideoKey', videoKey || null, true);
  document.getElementById('gcv-vision-key-input').value = '';
  document.getElementById('gcv-video-key-input').value = '';
  showToast('Clés enregistrées ✓');
  await loadGoogleCloudModerationStatus();
}
async function loadGoogleCloudModerationStatus(){
  const el = document.getElementById('gcv-keys-status');
  if(!el) return;
  const visionKey = await safeGet('settings:gcvVisionKey', true);
  const videoKey = await safeGet('settings:gcvVideoKey', true);
  const parts = [];
  parts.push(visionKey ? '✓ Cloud Vision configurée' : '○ Cloud Vision non configurée (photos non vérifiées)');
  parts.push(videoKey ? '✓ Video Intelligence configurée' : '○ Video Intelligence non configurée (vidéos non vérifiées)');
  el.textContent = parts.join(' · ');
}

/**
 * Analyse une image avec Google Cloud Vision (SafeSearch Detection).
 * Retourne { checked: false } si aucune clé n'est configurée — la publication continue normalement.
 * Retourne { checked: true, flagged: bool, reason: string } si l'analyse a bien eu lieu.
 * Ne bloque jamais silencieusement : en cas d'erreur réseau/API, on laisse aussi passer (checked: false)
 * plutôt que de bloquer une publication légitime à cause d'un problème technique.
 */
/**
 * Analyse une photo de produit pour suggérer une catégorie, via Google Cloud Vision LABEL_DETECTION.
 * Réutilise la même clé déjà configurée pour la modération (settings:gcvVisionKey) — jamais bloquant,
 * jamais de fausse suggestion si la clé n'est pas configurée ou en cas d'erreur technique : silence honnête.
 */
async function analyzeProductPhotoLabels(dataUrl){
  const apiKey = await safeGet('settings:gcvVisionKey', true);
  if(!apiKey) return { checked: false };
  try{
    const base64Data = dataUrl.split(',')[1];
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64Data }, features: [{ type: 'LABEL_DETECTION', maxResults: 5 }] }]
      })
    });
    const data = await response.json();
    const labels = data.responses && data.responses[0] && data.responses[0].labelAnnotations;
    if(!labels || labels.length === 0) return { checked: true, topLabel: null };
    return { checked: true, topLabel: labels[0].description };
  }catch(e){
    return { checked: false };
  }
}
function addProductVariantRow(){
  const listEl = document.getElementById('seller-product-variants-list');
  const row = document.createElement('div');
  row.className = 'product-variant-row';
  row.style.cssText = 'display:flex; gap:6px; margin-top:6px; align-items:center;';
  row.innerHTML = '<input type="text" class="variant-name-input" placeholder="Ex : Taille" style="flex:1; margin:0;">' +
    '<input type="text" class="variant-values-input" placeholder="Ex : S, M, L" style="flex:2; margin:0;">' +
    '<span onclick="this.parentElement.remove()" style="cursor:pointer; font-size:18px; color:var(--coral); flex-shrink:0;">✕</span>';
  listEl.appendChild(row);
}
async function suggestProductCategoryFromPhoto(){
  const fileInput = document.getElementById('seller-product-image');
  const suggestionEl = document.getElementById('seller-product-category-suggestion');
  if(!fileInput.files[0]){ suggestionEl.textContent = ''; return; }
  suggestionEl.textContent = '⏳ Analyse de la photo...';
  try{
    let dataUrl = await readFileAsDataURL(fileInput.files[0]);
    dataUrl = await compressImageDataUrl(dataUrl, 600, 0.6);
    const result = await analyzeProductPhotoLabels(dataUrl);
    if(!result.checked){ suggestionEl.textContent = ''; return; }
    if(!result.topLabel){ suggestionEl.textContent = 'Aucune suggestion de catégorie pour cette photo.'; return; }
    suggestionEl.innerHTML = '📸 Catégorie suggérée : <strong>' + escapeHtml(result.topLabel) + '</strong> — <span style="text-decoration:underline; cursor:pointer;" onclick="applyProductCategorySuggestion(\'' + escapeHtml(result.topLabel).replace(/'/g, "\\'") + '\')">utiliser</span>';
  }catch(e){
    suggestionEl.textContent = '';
  }
}
function applyProductCategorySuggestion(label){
  document.getElementById('seller-product-category').value = label;
  showToast('Catégorie appliquée ✓');
}
async function moderateImageWithCloudVision(dataUrl){
  const apiKey = await safeGet('settings:gcvVisionKey', true);
  if(!apiKey) return { checked: false };
  try{
    const base64Data = dataUrl.split(',')[1];
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64Data }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }]
      })
    });
    const data = await response.json();
    const result = data.responses && data.responses[0] && data.responses[0].safeSearchAnnotation;
    if(!result) return { checked: false };
    const unsafeLevels = ['LIKELY', 'VERY_LIKELY'];
    const flaggedCategory = ['adult', 'violence', 'racy'].find(cat => unsafeLevels.includes(result[cat]));
    return { checked: true, flagged: !!flaggedCategory, reason: flaggedCategory ? ('Contenu détecté : ' + flaggedCategory) : null, confidence: flaggedCategory ? result[flaggedCategory] : null };
  }catch(e){
    return { checked: false };
  }
}

/**
 * Analyse une vidéo avec Google Cloud Video Intelligence (Explicit Content Detection).
 * Même comportement de repli honnête que moderateImageWithCloudVision — jamais bloquant
 * sans clé configurée, et jamais bloquant en cas d'erreur technique.
 * Video Intelligence fonctionne de façon asynchrone (l'analyse prend du temps) : on lance
 * l'opération, puis on interroge son statut jusqu'à obtenir un résultat.
 */
async function moderateVideoWithVideoIntelligence(dataUrl){
  const apiKey = await safeGet('settings:gcvVideoKey', true);
  if(!apiKey) return { checked: false };
  try{
    const base64Data = dataUrl.split(',')[1];
    const startResponse = await fetch('https://videointelligence.googleapis.com/v1/videos:annotate?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputContent: base64Data, features: ['EXPLICIT_CONTENT_DETECTION'] })
    });
    const startData = await startResponse.json();
    const operationName = startData.name;
    if(!operationName) return { checked: false };
    let attempts = 0;
    while(attempts < 20){
      await new Promise(r => setTimeout(r, 3000));
      const pollResponse = await fetch('https://videointelligence.googleapis.com/v1/operations/' + operationName + '?key=' + apiKey);
      const pollData = await pollResponse.json();
      if(pollData.done){
        const frames = pollData.response && pollData.response.annotationResults && pollData.response.annotationResults[0] && pollData.response.annotationResults[0].explicitAnnotation && pollData.response.annotationResults[0].explicitAnnotation.frames;
        if(!frames) return { checked: false };
        const unsafeLevels = ['LIKELY', 'VERY_LIKELY'];
        const flaggedFrame = frames.find(f => unsafeLevels.includes(f.pornographyLikelihood));
        return { checked: true, flagged: !!flaggedFrame, reason: flaggedFrame ? 'Contenu explicite détecté dans la vidéo' : null, confidence: flaggedFrame ? flaggedFrame.pornographyLikelihood : null };
      }
      attempts++;
    }
    return { checked: false };
  }catch(e){
    return { checked: false };
  }
}
/* ---------- ROUTAGE IA — CLAUDE OU GEMINI AU CHOIX ---------- */
/* ---------- LIVRAISON — YANGO DELIVERY FOR BUSINESS ---------- */
async function saveYangoApiKey(){
  const key = document.getElementById('yango-key-input').value.trim();
  await saveWithRetry('settings:yangoApiKey', key || null, true);
  document.getElementById('yango-key-input').value = '';
  showToast('Clé enregistrée ✓');
  await loadYangoKeyStatus();
}
async function loadYangoKeyStatus(){
  const el = document.getElementById('yango-key-status');
  if(!el) return;
  const key = await safeGet('settings:yangoApiKey', true);
  el.textContent = key ? '✓ Clé Yango Delivery configurée' : '○ Clé Yango Delivery non configurée — le bouton de livraison expliquera cela clairement aux acheteurs';
  await renderYangoCountryCheckboxes();
}
async function renderYangoCountryCheckboxes(){
  const el = document.getElementById('yango-country-checkboxes');
  if(!el) return;
  const configured = await safeGet('settings:yangoCountries', true);
  const enabledCountries = configured || ['Sénégal', 'Côte d’Ivoire'];
  el.innerHTML = COUNTRY_LIST.filter(c => c !== 'Autre').map(c =>
    '<div style="display:flex; align-items:center; gap:8px; padding:3px 0;"><input type="checkbox" class="yango-country-checkbox" value="'+escapeHtml(c)+'" '+(enabledCountries.includes(c) ? 'checked' : '')+' style="width:auto;"><label style="margin:0; font-size:12.5px;">'+escapeHtml(c)+'</label></div>'
  ).join('');
}
async function saveYangoCountries(){
  const countries = Array.from(document.querySelectorAll('.yango-country-checkbox:checked')).map(cb => cb.value);
  await saveWithRetry('settings:yangoCountries', countries, true);
  showToast('Pays Yango enregistrés ✓');
}
async function isYangoAvailableInCountry(country){
  const configured = await safeGet('settings:yangoCountries', true);
  const enabledCountries = configured || ['Sénégal', 'Côte d’Ivoire'];
  return enabledCountries.includes(country);
}
/**
 * Demande une livraison Yango pour une commande. Tant qu'aucune clé n'est configurée par
 * l'expert en charge de l'hébergement, ceci reste honnêtement indisponible plutôt que de
 * simuler une fausse réussite — repli identique au pattern déjà utilisé pour Google Cloud
 * Vision/Video Intelligence.
 */
async function requestYangoDelivery(orderId){
  const statusEl = document.getElementById('yango-status-' + orderId);
  const apiKey = await safeGet('settings:yangoApiKey', true);
  if(!apiKey){
    if(statusEl) statusEl.textContent = 'La livraison Yango n’est pas encore activée sur Suktum — contactez le vendeur directement en attendant.';
    else showToast('Livraison Yango pas encore activée');
    return;
  }
  const o = await safeGet('order:' + orderId, true);
  if(!o) return;
  if(statusEl) statusEl.textContent = '⏳ Demande en cours...';
  try{
    const response = await fetch('https://b2b.taxi.yandex.net/api/b2b/platform/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        items: [{ pickup_point: 1, droppoff_point: 2, title: o.productName, quantity: o.quantity }],
        route_points: [
          { coordinates: [0, 0], type: 'source', address: { fullname: 'Adresse du vendeur (à compléter)' } },
          { coordinates: [0, 0], type: 'destination', address: { fullname: o.buyerAddress || '' }, contact: { phone: o.buyerPhone || '', name: o.buyerName || o.buyerUsername } }
        ]
      })
    });
    const data = await response.json();
    if(data && data.id){
      o.yangoRequestId = data.id;
      await saveWithRetry('order:' + orderId, o, true);
      if(statusEl) statusEl.textContent = '✓ Livraison Yango demandée (réf. ' + data.id + ')';
      showToast('Livraison Yango demandée ✓');
    } else {
      if(statusEl) statusEl.textContent = 'Demande envoyée, en attente de confirmation de Yango.';
    }
  }catch(e){
    if(statusEl) statusEl.textContent = 'Impossible de contacter Yango pour le moment — réessayez plus tard.';
  }
}
async function saveWeatherApiKey(){
  const key = document.getElementById('weather-key-input').value.trim();
  await saveWithRetry('settings:weatherApiKey', key || null, true);
  document.getElementById('weather-key-input').value = '';
  showToast('Clé enregistrée ✓');
  await loadWeatherKeyStatus();
}
async function loadWeatherKeyStatus(){
  const el = document.getElementById('weather-key-status');
  if(!el) return;
  const key = await safeGet('settings:weatherApiKey', true);
  el.textContent = key ? '✓ Clé configurée — l’alerte météo est active pour les vendeurs.' : 'Aucune clé configurée — l’alerte météo est désactivée pour l’instant.';
}
async function saveGeminiApiKey(){
  const key = document.getElementById('gemini-key-input').value.trim();
  await saveWithRetry('settings:geminiApiKey', key || null, true);
  document.getElementById('gemini-key-input').value = '';
  showToast('Clé enregistrée ✓');
  await loadGeminiKeyStatus();
}
async function loadGeminiKeyStatus(){
  const el = document.getElementById('gemini-key-status');
  if(!el) return;
  const key = await safeGet('settings:geminiApiKey', true);
  el.textContent = key ? '✓ Clé Gemini configurée' : '○ Clé Gemini non configurée — le choix « Gemini » reviendra automatiquement à Claude tant qu’aucune clé n’est renseignée';
}
/**
 * Appelle Claude ou Gemini selon le choix demandé, et retourne le texte de la réponse.
 * Si Gemini est choisi mais qu'aucune clé n'est configurée, ou en cas d'erreur avec Gemini,
 * on retombe automatiquement sur Claude plutôt que de faire échouer la fonctionnalité —
 * l'application doit rester utilisable même avant l'ajout d'une vraie clé Gemini par l'expert.
 */
async function callAIProviderStrict(systemInstruction, userContent, maxTokens, provider){
  if(provider === 'gemini'){
    const geminiKey = await safeGet('settings:geminiApiKey', true);
    if(geminiKey){
      try{
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: [{ text: userContent }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0 }
          })
        });
        const data = await response.json();
        const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
        if(text) return text.trim();
      }catch(e){ /* repli silencieux vers Claude ci-dessous */ }
    }
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, temperature: 0, system: systemInstruction, messages: [{ role: "user", content: userContent }] })
  });
  const data = await response.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}
async function getContentEmbedding(text){
  const geminiKey = await safeGet('settings:geminiApiKey', true);
  if(!geminiKey) return null;
  try{
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 2000) }] } })
    });
    const data = await response.json();
    return (data.embedding && data.embedding.values) || null;
  }catch(e){ return null; }
}
function cosineSimilarity(a, b){
  if(!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for(let i = 0; i < a.length; i++){ dot += a[i]*b[i]; normA += a[i]*a[i]; normB += b[i]*b[i]; }
  if(normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
async function callAIProvider(prompt, maxTokens, provider){
  if(provider === 'gemini'){
    const geminiKey = await safeGet('settings:geminiApiKey', true);
    if(geminiKey){
      try{
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } })
        });
        const data = await response.json();
        const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(p => p.text).join('');
        if(text) return text.trim();
      }catch(e){ /* repli silencieux vers Claude ci-dessous */ }
    }
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}
function aiProviderChoiceHtml(idPrefix){
  return '<div style="display:flex; gap:6px; margin-bottom:8px;">' +
    '<button type="button" id="'+idPrefix+'-claude-btn" class="btn btn-outline btn-sm" style="flex:1;" onclick="setAIProviderChoice(\''+idPrefix+'\', \'claude\')">Claude</button>' +
    '<button type="button" id="'+idPrefix+'-gemini-btn" class="btn btn-outline btn-sm" style="flex:1; border-color:var(--gold); color:var(--gold);" onclick="setAIProviderChoice(\''+idPrefix+'\', \'gemini\')">Gemini</button>' +
    '</div>';
}
const aiProviderChoices = {};
function setAIProviderChoice(idPrefix, provider){
  aiProviderChoices[idPrefix] = provider;
  const claudeBtn = document.getElementById(idPrefix + '-claude-btn');
  const geminiBtn = document.getElementById(idPrefix + '-gemini-btn');
  if(claudeBtn) claudeBtn.style.cssText = 'flex:1;' + (provider === 'claude' ? ' border-color:var(--gold); color:var(--gold);' : '');
  if(geminiBtn) geminiBtn.style.cssText = 'flex:1;' + (provider === 'gemini' ? ' border-color:var(--gold); color:var(--gold);' : '');
}
function getAIProviderChoice(idPrefix){
  return aiProviderChoices[idPrefix] || 'gemini';
}
const DEFAULT_COMMISSION_RATE = 5;
const DEFAULT_AFFILIATE_PLATFORM_FEE = 20;
async function getAffiliatePlatformFeePercent(){
  const rate = await safeGet('settings:affiliatePlatformFeePercent', true);
  return (typeof rate === 'number') ? rate : DEFAULT_AFFILIATE_PLATFORM_FEE;
}
async function getCommissionRate(){
  const rate = await safeGet('settings:commission_rate', true);
  return (typeof rate === 'number') ? rate : DEFAULT_COMMISSION_RATE;
}
async function openOrderScreen(productId){
  const products = await fetchProducts();
  const p = products.find(x => x.id === productId);
  if(!p){ showToast('Produit introuvable'); return; }
  if(currentUser) await saveWithRetry('recentlyviewed:' + currentUser + '__' + productId, { productId, viewedAt: new Date().toISOString() }, true);
  currentOrderProduct = p;
  const negotiatedPriceForThisOrder = currentOrderNegotiatedPrice;
  currentOrderNegotiatedPrice = null;
  const auctionWinningBidForThisOrder = currentOrderAuctionWinningBid;
  currentOrderAuctionWinningBid = null;
  currentAppliedPromoCode = null;
  const promoCodeInput = document.getElementById('order-promo-code-input');
  const promoCodeStatus = document.getElementById('order-promo-code-status');
  if(promoCodeInput) promoCodeInput.value = '';
  if(promoCodeStatus) promoCodeStatus.textContent = '';
  const activeScreen = document.querySelector('.screen.active');
  const onLiveScreen = activeScreen && activeScreen.id === 'screen-live-view';
  const activeFlashSale = (onLiveScreen && currentLiveView && currentLiveView.flashSale && currentLiveView.flashSale.productId === productId && new Date(currentLiveView.flashSale.expiresAt) > new Date())
    ? currentLiveView.flashSale : null;
  currentOrderFlashSalePrice = activeFlashSale ? activeFlashSale.discountedPrice : null;
  currentOrderNegotiatedPriceApplied = activeFlashSale ? null : negotiatedPriceForThisOrder;
  currentOrderAuctionWinningBidApplied = (activeFlashSale || negotiatedPriceForThisOrder) ? null : auctionWinningBidForThisOrder;
  document.getElementById('order-product-name').textContent = p.isMysteryBox ? '🎁 Colis mystère' : p.name;
  const variantsEl = document.getElementById('order-product-variants');
  if(variantsEl){
    variantsEl.innerHTML = (p.variants && p.variants.length > 0) ? p.variants.map(v =>
      '<label style="margin-top:0;">'+escapeHtml(v.name)+'</label>' +
      '<select class="order-variant-select" data-variant-name="'+escapeHtml(v.name)+'">' + v.values.map(val => '<option value="'+escapeHtml(val)+'">'+escapeHtml(val)+'</option>').join('') + '</select>'
    ).join('') : '';
  }
  const awayBannerEl = document.getElementById('order-seller-away-banner');
  if(awayBannerEl){
    const sellerForAway = p.sellerUsername ? await safeGet('user:' + p.sellerUsername, true) : null;
    if(sellerForAway && sellerForAway.awayMode){
      awayBannerEl.style.display = 'block';
      awayBannerEl.textContent = '🌴 Ce vendeur est actuellement absent — ' + (sellerForAway.awayMessage || 'les réponses peuvent être différées.');
    } else {
      awayBannerEl.style.display = 'none';
    }
  }
  document.getElementById('order-product-price').textContent = activeFlashSale
    ? '🔥 ' + activeFlashSale.discountedPrice.toLocaleString('fr-FR') + ' FCFA (au lieu de ' + p.price.toLocaleString('fr-FR') + ' FCFA)'
    : negotiatedPriceForThisOrder
      ? '🤝 ' + negotiatedPriceForThisOrder.toLocaleString('fr-FR') + ' FCFA (prix négocié)'
      : auctionWinningBidForThisOrder
        ? '🔨 ' + auctionWinningBidForThisOrder.toLocaleString('fr-FR') + ' FCFA (mise gagnante)'
        : (p.price||0).toLocaleString('fr-FR') + ' FCFA';
  document.getElementById('order-quantity').value = 1;
  document.getElementById('order-name').value = '';
  document.getElementById('order-phone').value = '';
  document.getElementById('order-address').value = '';
  const waWrapper = document.getElementById('order-whatsapp-btn-wrapper');
  const voiceCallWrapper = document.getElementById('order-voice-call-btn-wrapper');
  if(p.sellerUsername){
    const seller = await safeGet('user:' + p.sellerUsername, true);
    if(seller && seller.whatsappNumber){
      const cleanNumber = seller.whatsappNumber.replace(/[^0-9+]/g, '').replace('+', '');
      waWrapper.innerHTML = '<a href="https://wa.me/'+cleanNumber+'" target="_blank" class="btn btn-outline" style="width:100%; margin-top:14px; text-decoration:none; display:block; text-align:center; box-sizing:border-box;">💬 Contacter le vendeur sur WhatsApp</a>';
    } else {
      waWrapper.innerHTML = '';
    }
    if(voiceCallWrapper){
      voiceCallWrapper.innerHTML = seller && seller.voiceCallsBlocked
        ? '<p style="margin-top:10px; font-size:11.5px; color:rgba(245,239,227,0.4); text-align:center;">📞 Ce vendeur n’accepte pas les appels vocaux dans l’app.</p>'
        : '<button class="btn btn-outline" style="width:100%; margin-top:10px;" onclick="startVoiceCall(\''+escapeHtml(p.sellerUsername)+'\', \''+escapeHtml(p.name).replace(/'/g,"\\'")+'\')">📞 Appeler le vendeur dans l’app</button>';
    }
  } else {
    waWrapper.innerHTML = '';
    if(voiceCallWrapper) voiceCallWrapper.innerHTML = '';
  }
  updateOrderTotal();
  document.getElementById('order-quantity').oninput = updateOrderTotal;
  await renderLoyaltyPointsRedeemOption();
  go('order');
}
const LOYALTY_POINT_VALUE_FCFA = 5;
const LOYALTY_POINTS_PER_100_FCFA = 1;
async function getReferralRewardPoints(){
  const stored = await safeGet('settings:referralRewardPoints', true);
  return stored === null || stored === undefined ? 10 : stored;
}
async function saveReferralRewardPoints(){
  const value = parseInt(document.getElementById('referral-reward-points-input').value, 10);
  if(isNaN(value) || value < 0){ showToast('Entrez un nombre de points valide'); return; }
  await saveWithRetry('settings:referralRewardPoints', value, true);
  showToast('Récompense de parrainage enregistrée ✓ (' + value + ' point(s))');
}
async function loadReferralRewardPoints(){
  const input = document.getElementById('referral-reward-points-input');
  if(!input) return;
  input.value = await getReferralRewardPoints();
}
async function fetchLoyaltyPoints(username){
  return (await safeGet('loyaltypoints:' + username, true)) || 0;
}
async function renderLoyaltyPointsRedeemOption(){
  const section = document.getElementById('loyalty-points-redeem-section');
  const label = document.getElementById('loyalty-points-label');
  if(!section || !currentUser) return;
  const points = await fetchLoyaltyPoints(currentUser);
  if(points <= 0){ section.style.display = 'none'; return; }
  section.style.display = 'block';
  document.getElementById('use-loyalty-points-toggle').checked = false;
  label.textContent = '🎯 Utiliser mes ' + points + ' points de fidélité (= ' + (points * LOYALTY_POINT_VALUE_FCFA).toLocaleString('fr-FR') + ' FCFA de réduction)';
  await updateOrderTotal();
}
function toggleLoyaltyPointsUsage(){
  updateOrderTotal();
}
async function computeLoyaltyDiscount(subtotal){
  const toggle = document.getElementById('use-loyalty-points-toggle');
  if(!toggle || !toggle.checked || !currentUser) return { discount: 0, pointsUsed: 0 };
  const points = await fetchLoyaltyPoints(currentUser);
  const maxDiscountFromPoints = points * LOYALTY_POINT_VALUE_FCFA;
  const discount = Math.min(maxDiscountFromPoints, subtotal);
  const pointsUsed = Math.ceil(discount / LOYALTY_POINT_VALUE_FCFA);
  return { discount, pointsUsed };
}
/* ---------- NÉGOCIATION DE PRIX ---------- */
let currentOrderFlashSalePrice = null;
let currentOrderNegotiatedPriceApplied = null;
let currentNegotiationId = null;
let currentOrderNegotiatedPrice = null;
let currentOrderAuctionWinningBidApplied = null;
async function openPriceNegotiation(productId){
  if(!requireAccount('Créez un compte pour négocier un prix')) return;
  const product = await safeGet('product:' + productId, true);
  if(!product) return;
  if(product.sellerUsername === currentUser){ showToast('Vous ne pouvez pas négocier votre propre produit'); return; }
  currentNegotiationId = productId + '__' + currentUser;
  const existing = await safeGet('negotiation:' + currentNegotiationId, true);
  if(!existing){
    await saveWithRetry('negotiation:' + currentNegotiationId, {
      id: currentNegotiationId, productId, sellerUsername: product.sellerUsername, buyerUsername: currentUser,
      offers: [], status: 'pending', createdAt: new Date().toISOString()
    }, true);
  }
  go('price-negotiation');
  await renderPriceNegotiation();
}
async function submitNegotiationOffer(){
  const amountInput = document.getElementById('negotiation-offer-amount');
  const amount = parseInt(amountInput.value, 10);
  if(isNaN(amount) || amount <= 0){ showToast('Entrez un montant valide'); return; }
  const neg = await safeGet('negotiation:' + currentNegotiationId, true);
  if(!neg) return;
  neg.offers.push({ by: currentUser, amount, createdAt: new Date().toISOString() });
  neg.status = 'pending';
  await saveWithRetry('negotiation:' + currentNegotiationId, neg, true);
  const otherParty = currentUser === neg.buyerUsername ? neg.sellerUsername : neg.buyerUsername;
  await createNotification(otherParty, 'negotiation_offer', currentUser, neg.productId, amount.toLocaleString('fr-FR'));
  showToast('Offre envoyée ✓');
  await renderPriceNegotiation();
}
async function respondToNegotiation(action){
  const neg = await safeGet('negotiation:' + currentNegotiationId, true);
  if(!neg || neg.offers.length === 0) return;
  const lastOffer = neg.offers[neg.offers.length - 1];
  if(action === 'accept'){
    neg.status = 'accepted';
    await saveWithRetry('negotiation:' + currentNegotiationId, neg, true);
    const otherParty = currentUser === neg.buyerUsername ? neg.sellerUsername : neg.buyerUsername;
    await createNotification(otherParty, 'negotiation_accepted', currentUser, neg.productId, lastOffer.amount.toLocaleString('fr-FR'));
    showToast('Offre acceptée ✓');
  } else {
    neg.status = 'rejected';
    await saveWithRetry('negotiation:' + currentNegotiationId, neg, true);
    const otherParty = currentUser === neg.buyerUsername ? neg.sellerUsername : neg.buyerUsername;
    await createNotification(otherParty, 'negotiation_rejected', currentUser, neg.productId, null);
    showToast('Offre refusée');
  }
  await renderPriceNegotiation();
}
async function proceedToNegotiatedOrder(){
  const neg = await safeGet('negotiation:' + currentNegotiationId, true);
  if(!neg || neg.status !== 'accepted' || neg.offers.length === 0) return;
  currentOrderNegotiatedPrice = neg.offers[neg.offers.length - 1].amount;
  await openOrderScreen(neg.productId);
}
async function renderPriceNegotiation(){
  const neg = await safeGet('negotiation:' + currentNegotiationId, true);
  if(!neg) return;
  const product = await safeGet('product:' + neg.productId, true);
  document.getElementById('negotiation-product-info').innerHTML = product
    ? '<div class="card"><strong style="font-size:13px;">'+escapeHtml(product.name)+'</strong><p style="margin:4px 0 0; font-size:12px; color:var(--gold);">Prix affiché : '+(product.price||0).toLocaleString('fr-FR')+' FCFA</p></div>'
    : '';
  const threadEl = document.getElementById('negotiation-thread');
  threadEl.innerHTML = neg.offers.length === 0
    ? '<div class="empty">Aucune offre pour l’instant — proposez un prix.</div>'
    : neg.offers.map(o => '<div class="card" style="margin-bottom:6px; '+(o.by === currentUser ? 'border-color:var(--lagoon);' : '')+'"><p style="margin:0; font-size:13px;">@'+escapeHtml(o.by)+' propose <strong style="color:var(--gold);">'+o.amount.toLocaleString('fr-FR')+' FCFA</strong></p></div>').join('');
  const actionEl = document.getElementById('negotiation-action-area');
  if(neg.status === 'accepted'){
    actionEl.innerHTML = '<p style="font-size:13px; color:var(--lagoon); margin:0 0 10px;">✓ Offre acceptée à '+neg.offers[neg.offers.length-1].amount.toLocaleString('fr-FR')+' FCFA</p>' +
      (neg.buyerUsername === currentUser ? '<button class="btn btn-primary" style="width:100%;" onclick="proceedToNegotiatedOrder()">Commander à ce prix</button>' : '');
  } else if(neg.status === 'rejected'){
    actionEl.innerHTML = '<p style="font-size:13px; color:var(--coral); margin:0 0 10px;">Cette offre a été refusée.</p>' +
      '<label style="margin-top:0;">Nouvelle proposition (FCFA)</label><input type="number" id="negotiation-offer-amount" placeholder="Ex : 5000">' +
      '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="submitNegotiationOffer()">Proposer</button>';
  } else if(neg.offers.length > 0 && neg.offers[neg.offers.length-1].by !== currentUser){
    actionEl.innerHTML = '<div style="display:flex; gap:8px; margin-bottom:10px;"><button class="btn btn-primary" style="flex:1;" onclick="respondToNegotiation(\'accept\')">✓ Accepter</button><button class="btn btn-outline" style="flex:1; border-color:var(--coral); color:var(--coral);" onclick="respondToNegotiation(\'reject\')">✕ Refuser</button></div>' +
      '<label style="margin-top:0;">Ou faire une contre-offre (FCFA)</label><input type="number" id="negotiation-offer-amount" placeholder="Ex : 5000">' +
      '<button class="btn btn-outline" style="width:100%; margin-top:10px;" onclick="submitNegotiationOffer()">Contre-offrir</button>';
  } else {
    actionEl.innerHTML = '<label style="margin-top:0;">Votre offre (FCFA)</label><input type="number" id="negotiation-offer-amount" placeholder="Ex : 5000">' +
      '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="submitNegotiationOffer()">Proposer</button>';
  }
}
/* ---------- CODES PROMO CRÉÉS PAR LE VENDEUR ---------- */
async function saveBundleDiscount(){
  const minItems = parseInt(document.getElementById('bundle-discount-min-items').value, 10);
  const percent = parseInt(document.getElementById('bundle-discount-percent').value, 10);
  if(isNaN(minItems) || minItems < 2){ showToast('Le nombre d’articles minimum doit être au moins 2'); return; }
  if(isNaN(percent) || percent < 1 || percent > 90){ showToast('La réduction doit être entre 1 et 90%'); return; }
  await saveWithRetry('bundlediscount:' + currentUser, { minItems, percent, updatedAt: new Date().toISOString() }, true);
  showToast('Réduction sur lot enregistrée ✓');
  await renderBundleDiscountStatus();
}
async function renderBundleDiscountStatus(){
  const el = document.getElementById('bundle-discount-status');
  if(!el) return;
  const b = await safeGet('bundlediscount:' + currentUser, true);
  el.textContent = b ? 'Actif : ' + b.percent + '% de réduction dès ' + b.minItems + ' articles de votre boutique dans une même commande.' : 'Aucune réduction sur lot configurée pour l’instant.';
  if(b){
    document.getElementById('bundle-discount-min-items').value = b.minItems;
    document.getElementById('bundle-discount-percent').value = b.percent;
  }
}
async function createPromoCode(){
  const code = document.getElementById('new-promo-code-text').value.trim().toUpperCase();
  const type = document.getElementById('new-promo-code-type').value;
  const value = parseFloat(document.getElementById('new-promo-code-value').value);
  if(!code || isNaN(value) || value <= 0){ showToast('Renseignez un code et une valeur valide'); return; }
  if(type === 'percent' && value > 100){ showToast('Un pourcentage ne peut pas dépasser 100'); return; }
  await saveWithRetry('promocode:' + currentUser + '__' + code, {
    sellerUsername: currentUser, code, discountType: type, discountValue: value, active: true, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-promo-code-text').value = '';
  document.getElementById('new-promo-code-value').value = '';
  showToast('Code promo créé ✓');
  await renderMyPromoCodes();
}
async function copyPromoCodeToClipboard(code){
  if(navigator.clipboard){ await navigator.clipboard.writeText(code); showToast('Code copié ✓'); return; }
  showToast('Copie indisponible sur cet appareil');
}
async function editPromoCodeExpiry(code){
  const promo = await safeGet('promocode:' + currentUser + '__' + code, true);
  if(!promo) return;
  const currentDate = promo.expiresAt ? new Date(promo.expiresAt).toISOString().slice(0,10) : '';
  const dateStr = prompt('Date de validité (AAAA-MM-JJ) — laisser vide pour aucune date d’expiration :', currentDate);
  if(dateStr === null) return;
  if(!dateStr.trim()){
    promo.expiresAt = null;
    showToast('Aucune date d’expiration ✓');
  } else {
    const newDate = new Date(dateStr + 'T23:59:59');
    if(isNaN(newDate.getTime())){ showToast('Date invalide'); return; }
    promo.expiresAt = newDate.toISOString();
    showToast('Validité mise à jour jusqu’au ' + newDate.toLocaleDateString('fr-FR') + ' ✓');
  }
  await saveWithRetry('promocode:' + currentUser + '__' + code, promo, true);
  await renderMyPromoCodes();
}
async function duplicatePromoCode(code){
  const promo = await safeGet('promocode:' + currentUser + '__' + code, true);
  if(!promo) return;
  const newCode = prompt('Nom du nouveau code dupliqué (doit être différent) :', code + '2');
  if(!newCode || !newCode.trim()) return;
  const newCodeUpper = newCode.trim().toUpperCase();
  if(newCodeUpper === code){ showToast('Le nouveau code doit être différent de l’original'); return; }
  const existing = await safeGet('promocode:' + currentUser + '__' + newCodeUpper, true).catch(() => null);
  if(existing){ showToast('Ce code existe déjà'); return; }
  await saveWithRetry('promocode:' + currentUser + '__' + newCodeUpper, {
    sellerUsername: currentUser, code: newCodeUpper, discountType: promo.discountType, discountValue: promo.discountValue,
    expiresAt: promo.expiresAt || null, active: true, createdAt: new Date().toISOString()
  }, true);
  showToast('Code dupliqué : ' + newCodeUpper + ' ✓');
  await renderMyPromoCodes();
}
async function openPromoCodeKebabMenu(code){
  const promo = await safeGet('promocode:' + currentUser + '__' + code, true);
  if(!promo) return;
  const items = [];
  items.push({ icon: '📋', label: 'Copier le code', action: 'closeGenericKebabMenu(); copyPromoCodeToClipboard(\''+code+'\')' });
  items.push({ icon: '📅', label: 'Modifier la date de validité', action: 'closeGenericKebabMenu(); editPromoCodeExpiry(\''+code+'\')' });
  items.push({ icon: '📑', label: 'Dupliquer', action: 'closeGenericKebabMenu(); duplicatePromoCode(\''+code+'\')' });
  items.push({ icon: promo.active ? '⏸' : '▶️', label: promo.active ? 'Désactiver' : 'Réactiver', action: 'closeGenericKebabMenu(); togglePromoCodeActive(\''+code+'\')' });
  openGenericKebabMenu(items);
}
async function togglePromoCodeActive(code){
  const promo = await safeGet('promocode:' + currentUser + '__' + code, true);
  if(!promo) return;
  promo.active = !promo.active;
  await saveWithRetry('promocode:' + currentUser + '__' + code, promo, true);
  await renderMyPromoCodes();
}
async function renderMyPromoCodes(){
  const el = document.getElementById('my-promo-codes-list');
  if(!el) return;
  const keys = await safeList('promocode:' + currentUser + '__', true);
  const codes = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) codes.push(p); }
  el.innerHTML = codes.length === 0 ? '<div class="empty">Aucun code promo créé pour l’instant.</div>' : codes.map(p =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:8px;">' +
    '<span onclick="openPromoCodeKebabMenu(\''+p.code+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<strong style="font-size:13px;">'+escapeHtml(p.code)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">'+(p.discountType === 'percent' ? p.discountValue+'%' : p.discountValue.toLocaleString('fr-FR')+' FCFA')+' de réduction</p>' +
    (p.expiresAt ? '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">Valide jusqu’au '+new Date(p.expiresAt).toLocaleDateString('fr-FR')+'</p>' : '') +
    '<p style="margin:4px 0 0; font-size:11.5px; color:'+(p.active ? 'var(--lagoon)' : 'var(--coral)')+';">'+(p.active ? '✓ Actif' : '⏸ Inactif')+'</p></div>'
  ).join('');
}
let currentAppliedPromoCode = null;
async function applyPromoCode(){
  const codeInput = document.getElementById('order-promo-code-input');
  const statusEl = document.getElementById('order-promo-code-status');
  const code = codeInput.value.trim().toUpperCase();
  if(!code || !currentOrderProduct){ return; }
  const promo = await safeGet('promocode:' + currentOrderProduct.sellerUsername + '__' + code, true);
  const isExpired = promo && promo.expiresAt && new Date(promo.expiresAt) < new Date();
  if(!promo || !promo.active || isExpired){
    statusEl.textContent = isExpired ? '✕ Ce code a expiré.' : '✕ Ce code n’est pas valide pour ce vendeur.';
    statusEl.style.color = 'var(--coral)';
    currentAppliedPromoCode = null;
  } else {
    statusEl.textContent = '✓ Code appliqué : ' + (promo.discountType === 'percent' ? promo.discountValue+'%' : promo.discountValue.toLocaleString('fr-FR')+' FCFA') + ' de réduction.';
    statusEl.style.color = 'var(--lagoon)';
    currentAppliedPromoCode = code;
  }
  await updateOrderTotal();
}
/* ---------- "JE RECHERCHE..." (ANNONCE INVERSÉE) ---------- */
async function createWantedListing(){
  if(!requireAccount('Créez un compte pour publier une recherche')) return;
  const title = document.getElementById('new-wanted-title').value.trim();
  const details = document.getElementById('new-wanted-details').value.trim();
  if(!title){ showToast('Décrivez ce que vous recherchez'); return; }
  const id = 'wanted_' + Date.now();
  await saveWithRetry('wantedlisting:' + id, {
    id, author: currentUser, title, details, country: currentUserCountry, status: 'active', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-wanted-title').value = '';
  document.getElementById('new-wanted-details').value = '';
  showToast('Recherche publiée ✓');
  openWantedListingDetail(id);
}
/* ---------- ENCHÈRES ---------- */
let currentAuctionProductId = null;
async function fetchAuctionBidHistory(productId){
  const keys = await safeList('auctionbid:' + productId + '__', true);
  const list = [];
  for(const k of keys){ const b = await safeGet(k, true); if(b) list.push(b); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function openAuctionDetail(productId){
  currentAuctionProductId = productId;
  go('auction-detail');
  await renderAuctionDetail();
}
async function placeBid(){
  if(!requireAccount('Créez un compte pour enchérir')) return;
  const p = await safeGet('product:' + currentAuctionProductId, true);
  if(!p || !p.isAuction) return;
  if(new Date(p.auctionEndTime) <= new Date()){ showToast('Cette enchère est terminée'); await renderAuctionDetail(); return; }
  if(p.sellerUsername === currentUser){ showToast('Vous ne pouvez pas enchérir sur votre propre produit'); return; }
  const amount = parseInt(document.getElementById('auction-bid-amount').value, 10);
  const minBid = p.auctionCurrentBid + 1;
  if(isNaN(amount) || amount < minBid){ showToast('Votre mise doit être d’au moins ' + minBid.toLocaleString('fr-FR') + ' FCFA'); return; }
  const previousBidder = p.auctionHighestBidder;
  p.auctionCurrentBid = amount;
  p.auctionHighestBidder = currentUser;
  await saveWithRetry('product:' + currentAuctionProductId, p, true);
  await saveWithRetry('auctionbid:' + currentAuctionProductId + '__' + Date.now(), { bidder: currentUser, amount, createdAt: new Date().toISOString() }, true);
  if(previousBidder && previousBidder !== currentUser){
    await createNotification(previousBidder, 'auction_outbid', currentUser, currentAuctionProductId, amount.toLocaleString('fr-FR'));
  }
  showToast('Mise enregistrée ✓');
  await renderAuctionDetail();
}
let currentOrderAuctionWinningBid = null;
async function proceedToAuctionCheckout(){
  const p = await safeGet('product:' + currentAuctionProductId, true);
  if(!p || p.auctionHighestBidder !== currentUser) return;
  currentOrderAuctionWinningBid = p.auctionCurrentBid;
  p.auctionSettled = true;
  await saveWithRetry('product:' + currentAuctionProductId, p, true);
  await openOrderScreen(currentAuctionProductId);
}
async function renderAuctionDetail(){
  const p = await safeGet('product:' + currentAuctionProductId, true);
  if(!p) return;
  document.getElementById('auction-detail-title').textContent = p.name;
  const isEnded = new Date(p.auctionEndTime) <= new Date();
  const statusEl = document.getElementById('auction-detail-status');
  const bidAreaEl = document.getElementById('auction-detail-bid-area');
  statusEl.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">Mise actuelle</p>' +
    '<p style="margin:0 0 8px; font-size:20px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold);">'+p.auctionCurrentBid.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:12px; color:'+(isEnded?'var(--coral)':'rgba(245,239,227,0.6)')+';">'+(isEnded ? '⏱️ Enchère terminée' : '⏱️ Se termine le '+new Date(p.auctionEndTime).toLocaleString('fr-FR'))+'</p>' +
    (p.auctionHighestBidder ? '<p style="margin:6px 0 0; font-size:12px; color:var(--lagoon);">Meilleure offre : @'+escapeHtml(p.auctionHighestBidder)+'</p>' : '') +
    '</div>';
  if(isEnded){
    if(p.auctionHighestBidder === currentUser && !p.auctionSettled){
      bidAreaEl.innerHTML = '<p style="font-size:13px; color:var(--lagoon); margin:0 0 10px;">🎉 Vous avez remporté cette enchère !</p><button class="btn btn-primary" style="width:100%;" onclick="proceedToAuctionCheckout()">Commander à ce prix</button>';
    } else if(p.auctionSettled){
      bidAreaEl.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Commande déjà passée par le gagnant.</p>';
    } else if(!p.auctionHighestBidder){
      bidAreaEl.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Aucune offre n’a été faite avant la fin de l’enchère.</p>';
    } else {
      bidAreaEl.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Cette enchère a été remportée par @'+escapeHtml(p.auctionHighestBidder)+'.</p>';
    }
  } else if(p.sellerUsername === currentUser){
    bidAreaEl.innerHTML = '<p style="font-size:12.5px; color:rgba(245,239,227,0.5);">C’est votre propre enchère — vous ne pouvez pas y participer.</p>';
  } else {
    bidAreaEl.innerHTML = '<label style="margin-top:0;">Votre mise (minimum '+(p.auctionCurrentBid+1).toLocaleString('fr-FR')+' FCFA)</label>' +
      '<input type="number" id="auction-bid-amount" placeholder="Ex : '+(p.auctionCurrentBid+1)+'">' +
      '<button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="placeBid()">🔨 Enchérir</button>';
  }
  const history = await fetchAuctionBidHistory(p.id);
  document.getElementById('auction-detail-history').innerHTML = history.length === 0
    ? '<div class="empty">Aucune mise pour l’instant — soyez le premier à enchérir.</div>'
    : history.map(b => '<div class="card" style="display:flex; justify-content:space-between; margin-bottom:6px;"><span style="font-size:13px;">@'+escapeHtml(b.bidder)+'</span><span style="font-size:13px; color:var(--gold);">'+b.amount.toLocaleString('fr-FR')+' FCFA</span></div>').join('');
}
async function fetchWantedResponses(listingId){
  const keys = await safeList('wantedresponse:' + listingId + '__', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderWantedListingsBrowse(){
  const el = document.getElementById('wanted-listings-list');
  if(!el) return;
  const keys = await safeList('wantedlisting:', true);
  const listings = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l && l.status === 'active' && l.country === currentUserCountry) listings.push(l); }
  listings.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(listings.length === 0){ el.innerHTML = '<div class="empty">Aucune recherche active pour l’instant.</div>'; return; }
  const rows = [];
  for(const l of listings){
    const responses = await fetchWantedResponses(l.id);
    rows.push('<div class="card" style="cursor:pointer; margin-bottom:10px;" onclick="openWantedListingDetail(\''+l.id+'\')">' +
      '<strong style="font-size:13px;">'+escapeHtml(l.title)+'</strong>' +
      '<p style="margin:4px 0 0; font-size:11.5px; color:var(--gold);">Par @'+escapeHtml(l.author)+' · '+responses.length+' réponse(s)</p></div>');
  }
  el.innerHTML = rows.join('');
}
let currentWantedListingId = null;
async function openWantedListingDetail(id){
  currentWantedListingId = id;
  go('wanted-listing-detail');
  await renderWantedListingDetail();
}
async function respondToWantedListing(){
  if(!requireAccount('Créez un compte pour répondre')) return;
  const listing = await safeGet('wantedlisting:' + currentWantedListingId, true);
  if(!listing) return;
  const text = document.getElementById('wanted-response-text').value.trim();
  if(!text){ showToast('Écrivez votre réponse'); return; }
  const id = currentWantedListingId + '__' + currentUser;
  await saveWithRetry('wantedresponse:' + id, { listingId: currentWantedListingId, author: currentUser, text, createdAt: new Date().toISOString() }, true);
  document.getElementById('wanted-response-text').value = '';
  showToast('Réponse envoyée ✓');
  await createNotification(listing.author, 'wanted_response', currentUser, currentWantedListingId, text.slice(0,60));
  await renderWantedListingDetail();
}
async function closeWantedListing(){
  const listing = await safeGet('wantedlisting:' + currentWantedListingId, true);
  if(!listing || listing.author !== currentUser) return;
  if(!confirm('Marquer cette recherche comme trouvée ? Elle ne sera plus visible dans les recherches actives.')) return;
  listing.status = 'closed';
  await saveWithRetry('wantedlisting:' + currentWantedListingId, listing, true);
  showToast('Recherche clôturée ✓');
  await renderWantedListingDetail();
}
async function renderWantedListingDetail(){
  const listing = await safeGet('wantedlisting:' + currentWantedListingId, true);
  if(!listing) return;
  document.getElementById('wanted-detail-title').textContent = listing.title;
  document.getElementById('wanted-detail-author').textContent = 'Recherché par @' + listing.author + (listing.status === 'closed' ? ' — Trouvé ✓' : '');
  document.getElementById('wanted-detail-details').textContent = listing.details || '';
  const responseArea = document.getElementById('wanted-detail-respond-area');
  if(listing.status === 'closed'){
    responseArea.innerHTML = '';
  } else if(listing.author === currentUser){
    responseArea.innerHTML = '<button class="btn btn-outline" style="width:100%; border-color:var(--coral); color:var(--coral);" onclick="closeWantedListing()">✓ Marquer comme trouvé</button>';
  } else {
    responseArea.innerHTML = '<label style="margin-top:0;">Vous avez ça ? Répondez :</label><textarea id="wanted-response-text" placeholder="Décrivez ce que vous proposez, avec le prix..."></textarea><button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="respondToWantedListing()">Répondre</button>';
  }
  const responses = await fetchWantedResponses(listing.id);
  document.getElementById('wanted-detail-responses').innerHTML = responses.length === 0
    ? '<div class="empty">Aucune réponse pour l’instant.</div>'
    : responses.map(r => '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(r.text)+'</p><p style="margin:0; font-size:10.5px; color:var(--gold);">— @'+escapeHtml(r.author)+'</p></div>').join('');
}
async function fetchMyReceivedNegotiations(){
  const keys = await safeList('negotiation:', true);
  const list = [];
  for(const k of keys){ const n = await safeGet(k, true); if(n && n.sellerUsername === currentUser) list.push(n); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderMyNegotiations(){
  const el = document.getElementById('my-negotiations-list');
  if(!el) return;
  const negotiations = await fetchMyReceivedNegotiations();
  const pending = negotiations.filter(n => n.status === 'pending' && n.offers.length > 0);
  el.innerHTML = pending.length === 0 ? '<div class="empty">Aucune offre en attente pour l’instant.</div>' : await Promise.all(pending.map(async n => {
    const product = await safeGet('product:' + n.productId, true);
    const lastOffer = n.offers[n.offers.length - 1];
    return '<div class="card" style="cursor:pointer; margin-bottom:8px;" onclick="currentNegotiationId=\''+n.id+'\'; go(\'price-negotiation\'); renderPriceNegotiation();"><strong style="font-size:13px;">'+escapeHtml(product ? product.name : n.productId)+'</strong><p style="margin:4px 0 0; font-size:12.5px; color:var(--gold);">@'+escapeHtml(lastOffer.by)+' propose '+lastOffer.amount.toLocaleString('fr-FR')+' FCFA</p></div>';
  })).then(arr => arr.join(''));
}
async function updateOrderTotal(){
  if(!currentOrderProduct) return;
  const qty = Math.max(1, parseInt(document.getElementById('order-quantity').value, 10) || 1);
  const unitPrice = currentOrderFlashSalePrice || currentOrderNegotiatedPriceApplied || currentOrderAuctionWinningBidApplied || currentOrderProduct.price;
  let subtotal = unitPrice * qty;
  let promoDiscount = 0;
  if(currentAppliedPromoCode){
    const promo = await safeGet('promocode:' + currentOrderProduct.sellerUsername + '__' + currentAppliedPromoCode, true);
    if(promo && promo.active){
      promoDiscount = promo.discountType === 'percent' ? Math.round(subtotal * promo.discountValue / 100) : Math.min(promo.discountValue, subtotal);
      subtotal -= promoDiscount;
    }
  }
  const { discount } = await computeLoyaltyDiscount(subtotal);
  const total = subtotal - discount;
  document.getElementById('order-total').textContent = total.toLocaleString('fr-FR') + ' FCFA' +
    (promoDiscount > 0 ? ' (−' + promoDiscount.toLocaleString('fr-FR') + ' FCFA promo)' : '') +
    (discount > 0 ? ' (−' + discount.toLocaleString('fr-FR') + ' FCFA fidélité)' : '');
}
async function submitOrder(){
  if(!currentOrderProduct) return;
  const frozen = await safeGet('settings:transactionsFrozen', true);
  if(frozen){ showToast('Les nouvelles commandes sont temporairement suspendues par la direction — réessayez plus tard'); return; }
  const readOnlyCountries = (await safeGet('settings:readOnlyCountries', true)) || [];
  if(readOnlyCountries.includes(currentUserCountry)){ showToast('Les commandes sont temporairement en lecture seule pour ' + currentUserCountry + ' — réessayez plus tard'); return; }
  const readOnlyDomains = (await safeGet('settings:readOnlyDomains', true)) || [];
  if(readOnlyDomains.includes('marketplace')){ showToast('Le département Marketplace est temporairement en lecture seule — réessayez plus tard'); return; }
  const me = await safeGet('user:' + currentUser, true);
  if(await isAccountInQuarantine(me)){ showToast('Les nouveaux comptes très actifs doivent patienter avant leur premier achat — réessayez dans quelques minutes'); return; }
  const name = document.getElementById('order-name').value.trim();
  const phone = document.getElementById('order-phone').value.trim();
  const address = document.getElementById('order-address').value.trim();
  const qty = Math.max(1, parseInt(document.getElementById('order-quantity').value, 10) || 1);
  if(!name || !phone || !address){ showToast('Renseignez votre nom, téléphone et adresse'); return; }
  const freshProduct = await safeGet('product:' + currentOrderProduct.id, true);
  if(freshProduct && freshProduct.stock !== null && freshProduct.stock !== undefined){
    if(freshProduct.stock <= 0){ showToast('Ce produit est en rupture de stock'); go('shop'); return; }
    if(qty > freshProduct.stock){ showToast('Il ne reste que ' + freshProduct.stock + ' en stock'); return; }
  }
  let unitPrice = currentOrderProduct.price;
  if(currentOrderFlashSalePrice && currentLiveView){
    const freshLive = await safeGet('live:' + currentLiveView.id, true);
    if(freshLive && freshLive.flashSale && freshLive.flashSale.productId === currentOrderProduct.id && new Date(freshLive.flashSale.expiresAt) > new Date()){
      unitPrice = freshLive.flashSale.discountedPrice;
    } else {
      showToast('La vente flash est terminée — prix normal appliqué');
    }
  } else if(currentOrderNegotiatedPriceApplied){
    const negotiationId = currentOrderProduct.id + '__' + currentUser;
    const freshNegotiation = await safeGet('negotiation:' + negotiationId, true);
    if(freshNegotiation && freshNegotiation.status === 'accepted' && freshNegotiation.offers.length > 0 && freshNegotiation.offers[freshNegotiation.offers.length-1].amount === currentOrderNegotiatedPriceApplied){
      unitPrice = currentOrderNegotiatedPriceApplied;
    } else {
      showToast('Ce prix négocié n’est plus valide — prix normal appliqué');
    }
  } else if(currentOrderAuctionWinningBidApplied){
    const freshProduct = await safeGet('product:' + currentOrderProduct.id, true);
    if(freshProduct && freshProduct.isAuction && freshProduct.auctionHighestBidder === currentUser && freshProduct.auctionCurrentBid === currentOrderAuctionWinningBidApplied && new Date(freshProduct.auctionEndTime) <= new Date()){
      unitPrice = currentOrderAuctionWinningBidApplied;
    } else {
      showToast('Cette mise gagnante n’est plus valide — commande annulée');
      currentOrderAuctionWinningBidApplied = null;
      return;
    }
  }
  currentOrderNegotiatedPriceApplied = null;
  currentOrderAuctionWinningBidApplied = null;
  let subtotal = unitPrice * qty;
  let promoDiscount = 0;
  let appliedPromoCodeForOrder = null;
  if(currentAppliedPromoCode){
    const promo = await safeGet('promocode:' + currentOrderProduct.sellerUsername + '__' + currentAppliedPromoCode, true);
    if(promo && promo.active){
      promoDiscount = promo.discountType === 'percent' ? Math.round(subtotal * promo.discountValue / 100) : Math.min(promo.discountValue, subtotal);
      subtotal -= promoDiscount;
      appliedPromoCodeForOrder = currentAppliedPromoCode;
    } else {
      showToast('Le code promo n’est plus valide — non appliqué');
    }
  }
  currentAppliedPromoCode = null;
  const { discount, pointsUsed } = await computeLoyaltyDiscount(subtotal);
  const total = subtotal - discount;
  const commissionRate = await getCommissionRate();
  const commissionAmount = Math.round(total * commissionRate / 100);
  const netAmount = total - commissionAmount;
  const id = 'order_' + Date.now();
  const selectedVariants = {};
  document.querySelectorAll('.order-variant-select').forEach(sel => { selectedVariants[sel.dataset.variantName] = sel.value; });
  await saveWithRetry('order:' + id, {
    id, productId: currentOrderProduct.id, productName: currentOrderProduct.name,
    unitPrice, quantity: qty, total, subtotal, loyaltyDiscount: discount, loyaltyPointsUsed: pointsUsed,
    promoCodeApplied: appliedPromoCodeForOrder, promoDiscount, selectedVariants: Object.keys(selectedVariants).length > 0 ? selectedVariants : null,
    buyerUsername: currentUser, buyerName: name, buyerPhone: phone, buyerAddress: address,
    sellerUsername: currentOrderProduct.sellerUsername || null,
    country: currentUserCountry, commissionRate, commissionAmount, netAmount,
    status: 'pending', createdAt: new Date().toISOString(), sourceLiveId: currentPurchaseSourceLiveId
  }, true);
  currentPurchaseSourceLiveId = null;
  await checkBigOrderAlert(id, total, currentOrderProduct.name, currentUser);
  await logUserActivity(currentUser, 'achats', 'Commande passée : ' + currentOrderProduct.name + ' — ' + total.toLocaleString('fr-FR') + ' FCFA');
  currentOrderFlashSalePrice = null;
  if(pendingAffiliateCreator){
    const product = await safeGet('product:' + currentOrderProduct.id, true);
    if(product && product.affiliateCommissionPercent){
      const grossAffiliateCommission = Math.round(total * product.affiliateCommissionPercent / 100);
      const platformFeePercent = await getAffiliatePlatformFeePercent();
      const platformFeeAmount = Math.round(grossAffiliateCommission * platformFeePercent / 100);
      const creatorNetAmount = grossAffiliateCommission - platformFeeAmount;
      await saveWithRetry('affiliatesale:' + id, {
        orderId: id, productId: currentOrderProduct.id, creatorUsername: pendingAffiliateCreator,
        sellerUsername: currentOrderProduct.sellerUsername, grossCommissionAmount: grossAffiliateCommission,
        platformFeePercent, platformFeeAmount, commissionAmount: creatorNetAmount,
        createdAt: new Date().toISOString()
      }, true);
      await createNotification(pendingAffiliateCreator, 'affiliate_sale', currentUser, currentOrderProduct.id, creatorNetAmount.toLocaleString('fr-FR'));
    }
    pendingAffiliateCreator = null;
  }
  if(pointsUsed > 0){
    const currentPoints = await fetchLoyaltyPoints(currentUser);
    await saveWithRetry('loyaltypoints:' + currentUser, Math.max(0, currentPoints - pointsUsed), true);
  }
  const earnedPoints = Math.floor(total / 100) * LOYALTY_POINTS_PER_100_FCFA;
  if(earnedPoints > 0){
    const pointsAfterEarning = (await fetchLoyaltyPoints(currentUser)) + earnedPoints;
    await saveWithRetry('loyaltypoints:' + currentUser, pointsAfterEarning, true);
  }
  if(freshProduct && freshProduct.stock !== null && freshProduct.stock !== undefined){
    freshProduct.stock = Math.max(0, freshProduct.stock - qty);
    await saveWithRetry('product:' + freshProduct.id, freshProduct, true);
    if(freshProduct.stock === 0 && freshProduct.sellerUsername){
      await createNotification(freshProduct.sellerUsername, 'stock_out', currentUser, freshProduct.id, freshProduct.name);
    } else if(freshProduct.sellerUsername){
      const sellerForThreshold = await safeGet('user:' + freshProduct.sellerUsername, true);
      const threshold = (sellerForThreshold && sellerForThreshold.lowStockThreshold !== null && sellerForThreshold.lowStockThreshold !== undefined) ? sellerForThreshold.lowStockThreshold : 2;
      if(freshProduct.stock <= threshold){
        await createNotification(freshProduct.sellerUsername, 'stock_low', currentUser, freshProduct.id, freshProduct.name + '__' + freshProduct.stock);
      }
    }
  }
  const instructions = await getPaymentInstructions(currentUserCountry);
  showToast('Commande envoyée ✓ Référence : ' + id.slice(-6).toUpperCase() + (earnedPoints > 0 ? ' — +' + earnedPoints + ' points fidélité' : ''));
  alert('Pour finaliser votre commande :\n\n' + instructions);
  currentOrderProduct = null;
  go('shop');
}
async function fetchOrders(){
  const keys = await safeList('order:', true);
  const orders = [];
  for(const k of keys){ const o = await safeGet(k, true); if(o) orders.push(o); }
  orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return orders;
}
async function renderSellerLeaderboard(){
  const el = document.getElementById('seller-leaderboard-list');
  if(!el) return;
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const allOrders = await fetchOrders();
  const allProducts = await fetchProducts();
  const categoryByProductId = {};
  allProducts.forEach(p => { if(p.category) categoryByProductId[p.id] = p.category; });
  const categoryFilterEl = document.getElementById('seller-leaderboard-category-filter');
  let selectedCategory = '';
  if(categoryFilterEl){
    const realCategories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
    if(categoryFilterEl.dataset.populated !== String(realCategories.length)){
      categoryFilterEl.innerHTML = '<option value="">Toutes catégories</option>' + realCategories.map(c => '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
      categoryFilterEl.dataset.populated = String(realCategories.length);
    }
    selectedCategory = categoryFilterEl.value;
  }
  let thisMonthOrders = allOrders.filter(o => o.sellerUsername && o.createdAt.slice(0,7) === monthKey);
  if(selectedCategory) thisMonthOrders = thisMonthOrders.filter(o => categoryByProductId[o.productId] === selectedCategory);
  const bySeller = {};
  for(const o of thisMonthOrders){
    if(!bySeller[o.sellerUsername]) bySeller[o.sellerUsername] = { volume: 0, count: 0 };
    bySeller[o.sellerUsername].volume += o.total;
    bySeller[o.sellerUsername].count += 1;
  }
  const ranked = Object.keys(bySeller).map(u => ({ username: u, ...bySeller[u] })).sort((a,b) => b.volume - a.volume);
  if(ranked.length === 0){ el.innerHTML = '<div class="empty">Aucune vente enregistrée ce mois-ci pour l’instant'+(selectedCategory ? ' dans cette catégorie' : '')+'.</div>'; return; }
  const medals = ['🥇','🥈','🥉'];
  el.innerHTML = ranked.map((s, i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(s.username)+'\')">' +
    '<span style="font-size:16px; width:26px; text-align:center;">'+(medals[i]||(i+1))+'</span>' +
    smallAvatarBadge(s.username, 32) +
    '<div style="flex:1;"><strong style="font-size:13px;">@'+escapeHtml(s.username)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+s.count+' vente(s) ce mois-ci</p></div>' +
    '</div>'
  ).join('');
}
function toggleShopFiltersPanel(){
  const panel = document.getElementById('shop-filters-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function openMyShopDrawer(){
  go('my-shop-drawer');
}
async function renderFeaturedProductsCarousel(){
  const el = document.getElementById('featured-products-carousel');
  if(!el) return;
  const allProducts = await fetchProducts();
  const orderKeys = await safeList('order:', true);
  const orderCountByProduct = {};
  for(const k of orderKeys){
    const o = await safeGet(k, true).catch(() => null);
    if(o && o.productId) orderCountByProduct[o.productId] = (orderCountByProduct[o.productId] || 0) + 1;
  }
  const products = allProducts
    .filter(p => (!p.country || !currentUserCountry || p.country === currentUserCountry) && (p.stock === undefined || p.stock === null || p.stock > 0))
    .map(p => ({ p, orders: orderCountByProduct[p.id] || 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);
  if(products.length === 0){ el.innerHTML = '<div class="empty">Aucun produit pour l’instant.</div>'; return; }
  el.innerHTML = products.map(({p, orders}) =>
    '<div class="card" style="min-width:130px; flex-shrink:0; cursor:pointer;" onclick="openOrderScreen(\''+p.id+'\')">' +
    (p.image ? '<img src="'+p.image+'" style="width:100%; height:90px; object-fit:cover; border-radius:8px; margin-bottom:6px;">' : '') +
    '<p style="margin:0; font-size:12px; font-weight:600;">'+escapeHtml(p.name.slice(0,24))+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</p>' +
    (orders > 0 ? '<p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">'+orders+' commande(s)</p>' : '') +
    '</div>'
  ).join('');
}
async function renderTopSellersCarousel(){
  const el = document.getElementById('top-sellers-carousel');
  if(!el) return;
  const allUsers = await fetchUsers();
  const allProducts = await fetchProducts();
  const orderKeys = await safeList('order:', true);
  const orderCountBySeller = {};
  for(const k of orderKeys){
    const o = await safeGet(k, true).catch(() => null);
    if(o && o.sellerUsername) orderCountBySeller[o.sellerUsername] = (orderCountBySeller[o.sellerUsername] || 0) + 1;
  }
  const sellers = allUsers.filter(u => allProducts.some(p => p.sellerUsername === u.username) && orderCountBySeller[u.username] > 0);
  sellers.sort((a, b) => (orderCountBySeller[b.username]||0) - (orderCountBySeller[a.username]||0));
  const top = sellers.slice(0, 10);
  if(top.length === 0){ el.innerHTML = '<div class="empty">Aucune vente enregistrée pour l’instant.</div>'; return; }
  el.innerHTML = top.map(u =>
    '<div class="card" style="min-width:110px; flex-shrink:0; text-align:center; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' +
    smallAvatarBadge(u.username, 48) +
    '<p style="margin:6px 0 0; font-size:12px; font-weight:600;">'+(u.storefrontName ? escapeHtml(u.storefrontName.slice(0,16)) : '@'+escapeHtml(u.username.slice(0,14)))+'</p>' +
    '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">'+(orderCountBySeller[u.username]||0)+' vente(s)</p>' +
    '</div>'
  ).join('');
}
async function renderNearbySellersCarousel(){
  const el = document.getElementById('nearby-sellers-carousel');
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
  if(nearbySellers.length === 0){ el.innerHTML = '<div class="empty">Aucun vendeur actif trouvé à '+escapeHtml(me.city)+' pour l’instant.</div>'; return; }
  nearbySellers.sort((a,b) => (productCountBySeller[b.username]||0) - (productCountBySeller[a.username]||0));
  el.innerHTML = nearbySellers.slice(0, 10).map(u =>
    '<div class="card" style="min-width:110px; flex-shrink:0; text-align:center; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' +
    smallAvatarBadge(u.username, 48) +
    '<p style="margin:6px 0 0; font-size:12px; font-weight:600;">'+(u.storefrontName ? escapeHtml(u.storefrontName.slice(0,16)) : '@'+escapeHtml(u.username.slice(0,14)))+'</p>' +
    '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">'+(productCountBySeller[u.username]||0)+' produit(s)</p>' +
    '</div>'
  ).join('');
}
async function renderShop(){
  const loyaltyCard = document.getElementById('shop-loyalty-points-card');
  if(loyaltyCard && currentUser){
    const points = await fetchLoyaltyPoints(currentUser);
    if(points > 0){
      loyaltyCard.style.display = 'block';
      loyaltyCard.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">🎯 '+points+' points de fidélité (= '+(points*LOYALTY_POINT_VALUE_FCFA).toLocaleString('fr-FR')+' FCFA) — utilisables à la commande</p>';
    } else {
      loyaltyCard.style.display = 'none';
    }
  }
  const el = document.getElementById('shop-list');
  const allProducts = await fetchProducts();
  const allUsersForShop = await fetchUsers();
  const whatsappBySeller = {};
  allUsersForShop.forEach(u => { if(u.whatsappNumber) whatsappBySeller[u.username] = u.whatsappNumber; });
  const lowStockThresholdBySeller = {};
  allUsersForShop.forEach(u => { lowStockThresholdBySeller[u.username] = (u.lowStockThreshold !== null && u.lowStockThreshold !== undefined) ? u.lowStockThreshold : 2; });
  const suspendedSellers = new Set(allUsersForShop.filter(u => u.shopSuspended).map(u => u.username));
  let products = allProducts.filter(p => (!p.country || !currentUserCountry || p.country === currentUserCountry) && !(p.sellerUsername && suspendedSellers.has(p.sellerUsername)) && !p.mediaFlagged);
  const searchInput = document.getElementById('shop-search-input');
  const priceMinInput = document.getElementById('shop-price-min');
  const priceMaxInput = document.getElementById('shop-price-max');
  const typeInput = document.getElementById('shop-type-filter');
  const searchQuery = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const priceMin = priceMinInput && priceMinInput.value !== '' ? parseFloat(priceMinInput.value) : null;
  const priceMax = priceMaxInput && priceMaxInput.value !== '' ? parseFloat(priceMaxInput.value) : null;
  const typeFilter = typeInput ? typeInput.value : 'all';
  if(searchQuery) products = products.filter(p => p.name.toLowerCase().includes(searchQuery));
  if(priceMin !== null) products = products.filter(p => (p.price||0) >= priceMin);
  if(priceMax !== null) products = products.filter(p => (p.price||0) <= priceMax);
  if(typeFilter === 'sale') products = products.filter(p => !p.isBarter);
  if(typeFilter === 'barter') products = products.filter(p => p.isBarter);
  const categoryInput = document.getElementById('shop-category-filter');
  if(categoryInput){
    const realCategories = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
    if(categoryInput.dataset.populated !== String(realCategories.length)){
      categoryInput.innerHTML = '<option value="">Toutes les catégories</option>' + realCategories.map(c => '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join('');
      categoryInput.dataset.populated = String(realCategories.length);
    }
    if(categoryInput.value) products = products.filter(p => p.category === categoryInput.value);
  }
  const nearbyOnly = document.getElementById('shop-nearby-filter');
  if(nearbyOnly && nearbyOnly.checked){
    if(!currentUserCity){
      showToast('Ajoutez votre quartier/ville dans votre profil pour utiliser ce filtre');
      nearbyOnly.checked = false;
    } else {
      const cityBySeller = {};
      allUsersForShop.forEach(u => { cityBySeller[u.username] = u.city || ''; });
      products = products.filter(p => p.sellerUsername && cityBySeller[p.sellerUsername] && cityBySeller[p.sellerUsername].toLowerCase() === currentUserCity.toLowerCase());
    }
  }
  if(products.length === 0){
    el.innerHTML = '<div class="empty">'+((searchQuery || priceMin !== null || priceMax !== null || typeFilter !== 'all' || (nearbyOnly && nearbyOnly.checked)) ? 'Aucun produit ne correspond à votre recherche.' : 'Aucun produit disponible dans votre pays pour l’instant.<br>Revenez bientôt !')+'</div>';
    return;
  }
  const activeStories = await fetchActiveStories();
  const sellersWithStory = new Set(activeStories.map(s => s.userId));
  const myWishlist = new Set((await safeGet('wishlist:' + currentUser, true)) || []);
  el.innerHTML = products.map(p =>
    '<div class="card" style="display:flex; gap:12px; align-items:center; position:relative; padding-right:40px;">' +
    '<span onclick="openProductActionsMenu(\''+p.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    (p.image ? '<img src="'+p.image+'" style="width:56px; height:56px; border-radius:10px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-family:\'Baloo 2\';" id="product-desc-'+p.id+'">'+escapeHtml(p.name)+'</strong>' +
    ' <span onclick="translateProduct(\''+p.id+'\')" style="color:var(--lagoon); font-size:10.5px; cursor:pointer;">🌐 Traduire</span>' +
    (p.country ? '<span style="font-size:11px; color:rgba(245,239,227,0.5); margin-left:6px;">('+escapeHtml(p.country)+')</span>' : '') +
    (p.sellerUsername && sellersWithStory.has(p.sellerUsername) ? '<span onclick="openStoryViewer(\''+escapeHtml(p.sellerUsername)+'\')" style="cursor:pointer; margin-left:6px; font-size:11px; color:var(--coral);">🔴 Story</span>' : '') +
    (p.isAuction
      ? '<div style="margin-top:6px; display:inline-block; background:rgba(255,107,74,0.15); color:var(--coral); border-radius:6px; padding:3px 8px; font-size:11px;">🔨 Enchère — '+p.auctionCurrentBid.toLocaleString('fr-FR')+' FCFA'+(new Date(p.auctionEndTime) <= new Date() ? ' (terminée)' : '')+'</div>'
      : p.isBarter
      ? '<div style="margin-top:6px; display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); border-radius:6px; padding:3px 8px; font-size:11px;">🔁 À échanger</div>'
      : p.isService
        ? '<div style="margin-top:6px; display:inline-block; background:rgba(242,183,5,0.15); color:var(--gold); border-radius:6px; padding:3px 8px; font-size:11px;">🛠️ Service — '+(p.price||0).toLocaleString('fr-FR')+' FCFA</div>'
        : '<div class="price-tag" style="margin-top:6px; display:inline-block;">'+ (p.price||0).toLocaleString('fr-FR') +' FCFA</div>'
          + (p.priceHistory && p.priceHistory.length > 0 ? ' <span style="font-size:11px; color:rgba(245,239,227,0.4); text-decoration:line-through;">'+p.priceHistory[p.priceHistory.length-1].oldPrice.toLocaleString('fr-FR')+' FCFA</span>' : '')) +
    (!p.isBarter && !p.isService && p.stock !== null && p.stock !== undefined
      ? '<p style="margin:4px 0 0; font-size:10.5px; color:'+(p.stock<=0?'var(--coral)':p.stock<=(lowStockThresholdBySeller[p.sellerUsername]||2)?'var(--gold)':'rgba(245,239,227,0.4)')+';">'+(p.stock<=0?'Rupture de stock':'Stock : '+p.stock)+'</p>'
      : '') +
    (p.guaranteeDays
      ? '<p style="margin:4px 0 0; font-size:10.5px; color:var(--lagoon);">✅ Satisfait ou remboursé sous '+p.guaranteeDays+' jour(s)</p>'
      : '') +
    '</div>' +
    (p.isAuction
      ? '<button class="btn btn-primary btn-sm" onclick="openAuctionDetail(\''+p.id+'\')">🔨 Voir l’enchère</button>'
      : p.isBarter
      ? '<button class="btn btn-outline btn-sm" onclick="proposeBarterExchange(\''+p.id+'\')">🔁 Proposer un échange</button>'
      : p.isService
        ? '<button class="btn btn-primary btn-sm" onclick="openServiceBookingPicker(\''+p.id+'\')">📅 Réserver</button>'
        : (p.stock !== null && p.stock !== undefined && p.stock <= 0)
          ? '<button class="btn btn-outline btn-sm" disabled style="opacity:0.4;">Épuisé</button>'
          : '<button class="btn btn-outline btn-sm" onclick="addToCart(\''+p.id+'\')" style="padding:6px 10px;">🛒</button><button class="btn btn-primary btn-sm" onclick="openOrderScreen(\''+p.id+'\')">Commander</button>') +
    (!p.isBarter && !p.isService && !p.isAuction
      ? '<button class="btn btn-outline btn-sm" style="margin-left:4px;" onclick="openPriceNegotiation(\''+p.id+'\')">💬 Négocier</button>'
      : '') +
    '</div>'
  ).join('');
}

/* ---------- RÉSERVATION D'UN CRÉNEAU DE SERVICE ---------- */
let currentServiceBookingProductId = null;
async function openServiceBookingPicker(productId){
  if(!requireAccount('Créez un compte pour réserver un service')) return;
  const p = await safeGet('product:' + productId, true);
  if(!p){ showToast('Service introuvable'); return; }
  if(p.sellerUsername === currentUser){ showToast('Vous ne pouvez pas réserver votre propre service'); return; }
  currentServiceBookingProductId = productId;
  go('service-booking');
  document.getElementById('service-booking-title').textContent = '📅 ' + p.name;
  document.getElementById('service-booking-price').textContent = (p.price||0).toLocaleString('fr-FR') + ' FCFA';
  await renderServiceBookingSlots();
}
/* ---------- NETTOYAGE AUTOMATIQUE DES CRÉNEAUX DE SERVICE PASSÉS ---------- */
async function cleanupPastServiceSlots(){
  const myProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser && p.isService && p.serviceSlots && p.serviceSlots.length > 0);
  const now = new Date();
  for(const p of myProducts){
    const stillValid = p.serviceSlots.filter(s => new Date(s) > now);
    if(stillValid.length !== p.serviceSlots.length){
      p.serviceSlots = stillValid;
      await saveWithRetry('product:' + p.id, p, true);
    }
  }
}
/* ---------- RAPPEL DE CRÉNEAUX VENDEUR À REPUBLIER ---------- */
async function checkServiceSlotsReminder(){
  const myServiceProducts = (await fetchProducts()).filter(p => p.sellerUsername === currentUser && p.isService);
  const isoWeek = getISOWeekKey(new Date());
  for(const p of myServiceProducts){
    if((p.serviceSlots || []).length > 0) continue;
    const reminderKey = 'serviceslotsreminder:' + p.id + '__' + isoWeek;
    const alreadySent = await safeGet(reminderKey, true);
    if(alreadySent) continue;
    await saveWithRetry(reminderKey, true, true);
    await createNotification(currentUser, 'service_slots_empty', 'Suktum', p.id, p.name);
  }
}
async function renderServiceBookingSlots(){
  const el = document.getElementById('service-booking-slots-list');
  const p = await safeGet('product:' + currentServiceBookingProductId, true);
  if(!p){ return; }
  const availableSlots = (p.serviceSlots || []).filter(s => new Date(s) > new Date());
  el.innerHTML = availableSlots.length === 0 ? '<div class="empty">Aucun créneau disponible pour l’instant.</div>' :
    availableSlots.map(iso => '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:8px;" onclick="bookServiceSlot(\''+iso+'\')">📅 '+new Date(iso).toLocaleString('fr-FR', {weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})+'</button>').join('');
}
async function bookServiceSlot(slotIso){
  const p = await safeGet('product:' + currentServiceBookingProductId, true);
  if(!p || !p.serviceSlots || !p.serviceSlots.includes(slotIso)){ showToast('Ce créneau n’est plus disponible'); await renderServiceBookingSlots(); return; }
  p.serviceSlots = p.serviceSlots.filter(s => s !== slotIso);
  await saveWithRetry('product:' + currentServiceBookingProductId, p, true);
  const id = 'servicebooking_' + Date.now();
  await saveWithRetry('servicebooking:' + id, {
    id, productId: currentServiceBookingProductId, productName: p.name, sellerUsername: p.sellerUsername,
    buyerUsername: currentUser, price: p.price, slot: slotIso, status: 'confirmed', createdAt: new Date().toISOString(), sourceLiveId: currentPurchaseSourceLiveId
  }, true);
  currentPurchaseSourceLiveId = null;
  await createNotification(p.sellerUsername, 'service_booked', currentUser, currentServiceBookingProductId, p.name + '__' + slotIso);
  showToast('Réservation confirmée ✓');
  go('shop');
}
async function fetchMyServiceBookings(username, asSeller){
  const keys = await safeList('servicebooking:', true);
  const list = [];
  for(const k of keys){
    const b = await safeGet(k, true);
    if(b && (asSeller ? b.sellerUsername === username : b.buyerUsername === username)) list.push(b);
  }
  list.sort((a,b) => new Date(a.slot) - new Date(b.slot));
  return list;
}
async function renderMyServiceBookings(){
  const el = document.getElementById('my-service-bookings-list');
  if(!el) return;
  const bookings = await fetchMyServiceBookings(currentUser, false);
  el.innerHTML = bookings.length === 0 ? '<div class="empty">Aucune réservation pour l’instant.</div>' : bookings.map(b =>
    '<div class="card"><strong style="font-size:13px;">'+escapeHtml(b.productName)+'</strong>' +
    '<p style="margin:4px 0 0; font-size:12.5px; color:var(--gold);">📅 '+new Date(b.slot).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Chez @'+escapeHtml(b.sellerUsername)+' · '+(b.price||0).toLocaleString('fr-FR')+' FCFA</p></div>'
  ).join('');
}
async function renderSellerServiceBookings(){
  const el = document.getElementById('seller-service-bookings-list');
  if(!el) return;
  const bookings = await fetchMyServiceBookings(currentUser, true);
  el.innerHTML = bookings.length === 0 ? '<div class="empty">Aucune réservation reçue pour l’instant.</div>' : bookings.map(b =>
    '<div class="card"><strong style="font-size:13px;">'+escapeHtml(b.productName)+'</strong>' +
    '<p style="margin:4px 0 0; font-size:12.5px; color:var(--gold);">📅 '+new Date(b.slot).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'})+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Client : @'+escapeHtml(b.buyerUsername)+' · '+(b.price||0).toLocaleString('fr-FR')+' FCFA</p></div>'
  ).join('');
}
/* ---------- MESSAGE GROUPÉ AUX FORMATEURS ---------- */
/* ---------- MESSAGE SEGMENTÉ ---------- */
async function computeSegmentUsernames(segment){
  const allUsers = await fetchUsers();
  if(segment === 'reliable_buyers') return allUsers.filter(u => u.reliableBuyer).map(u => u.username);
  if(segment === 'recommended_sellers') return allUsers.filter(u => u.recommendedSeller).map(u => u.username);
  if(segment === 'verified_trainers') return allUsers.filter(u => u.isTrainer && u.trainerVerified).map(u => u.username);
  if(segment === 'identity_verified') return allUsers.filter(u => u.identityVerified).map(u => u.username);
  if(segment === 'inactive_sellers_30'){
    const allProducts = await fetchProducts();
    const sellers = [...new Set(allProducts.map(p => p.sellerUsername))];
    const inactive = [];
    for(const seller of sellers){
      const sellerProducts = allProducts.filter(p => p.sellerUsername === seller);
      const mostRecent = sellerProducts.reduce((latest, p) => new Date(p.createdAt) > new Date(latest.createdAt) ? p : latest, sellerProducts[0]);
      const daysSince = Math.floor((new Date() - new Date(mostRecent.createdAt)) / (24*60*60*1000));
      if(daysSince >= 30) inactive.push(seller);
    }
    return inactive;
  }
  return [];
}
async function previewSegmentBroadcastCount(){
  const segment = document.getElementById('segment-broadcast-select').value;
  const usernames = await computeSegmentUsernames(segment);
  document.getElementById('segment-broadcast-preview').textContent = usernames.length === 0
    ? 'Aucun utilisateur ne correspond à ce segment pour l’instant.'
    : usernames.length + ' destinataire(s) réel(s) recevront ce message.';
}
async function sendSegmentBroadcast(){
  const segment = document.getElementById('segment-broadcast-select').value;
  const text = document.getElementById('segment-broadcast-text').value.trim();
  if(!text){ showToast('Écrivez un message'); return; }
  const usernames = await computeSegmentUsernames(segment);
  if(usernames.length === 0){ showToast('Aucun destinataire pour ce segment'); return; }
  for(const username of usernames){
    const key = 'dm:' + threadKeyFor(currentUser, username);
    const msgs = (await safeGet(key, true)) || [];
    msgs.push({ from: currentUser, text, ts: new Date().toISOString() });
    await saveWithRetry(key, msgs, true);
    await createNotification(username, 'admin_broadcast', currentUser, null, text.slice(0, 60));
  }
  document.getElementById('segment-broadcast-text').value = '';
  await logAdminAction('Message segmenté envoyé (' + segment + ')', usernames.length + ' destinataire(s)');
  showToast('Message envoyé à ' + usernames.length + ' utilisateur(s) ✓');
}
async function renderTrainerBroadcastList(){
  const el = document.getElementById('trainer-broadcast-list');
  if(!el) return;
  const allUsers = await fetchUsers();
  const trainers = allUsers.filter(u => u.isTrainer);
  el.innerHTML = trainers.length === 0 ? '<div class="empty">Aucun formateur pour l’instant.</div>' : trainers.map(u =>
    '<div style="display:flex; align-items:center; gap:8px; padding:4px 0;">' +
    '<input type="checkbox" class="trainer-broadcast-checkbox" value="'+escapeHtml(u.username)+'" style="width:auto;">' +
    '<label style="margin:0; font-size:13px;">@'+escapeHtml(u.username)+'</label></div>'
  ).join('');
}
function toggleAllTrainersSelection(select){
  document.querySelectorAll('.trainer-broadcast-checkbox').forEach(cb => { cb.checked = select; });
}
async function sendTrainerBroadcast(){
  const text = document.getElementById('trainer-broadcast-text').value.trim();
  if(!text){ showToast('Écrivez un message'); return; }
  const selected = Array.from(document.querySelectorAll('.trainer-broadcast-checkbox:checked')).map(cb => cb.value);
  if(selected.length === 0){ showToast('Sélectionnez au moins un formateur'); return; }
  for(const trainerUsername of selected){
    const key = 'dm:' + threadKeyFor(currentUser, trainerUsername);
    const msgs = (await safeGet(key, true)) || [];
    msgs.push({ from: currentUser, text, ts: new Date().toISOString() });
    await saveWithRetry(key, msgs, true);
    await createNotification(trainerUsername, 'admin_broadcast', currentUser, null, text.slice(0, 60));
  }
  document.getElementById('trainer-broadcast-text').value = '';
  await logAdminAction('Message envoyé à ' + selected.length + ' formateur(s)', selected.join(', '));
  showToast('Message envoyé à ' + selected.length + ' formateur(s) ✓');
}
