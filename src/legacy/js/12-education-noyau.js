/* ---------- ESPACE VENDEUR ---------- */
/* ---------- ESPACE ÉDUCATION (noyau) ---------- */
let trainerApplicationPhotoDataUrl = null;
async function prefillTrainerPhotoIfAvailable(){
  const me = await safeGet('user:' + currentUser, true);
  const preview = document.getElementById('trainer-photo-preview');
  if(me && me.photo){
    trainerApplicationPhotoDataUrl = me.photo;
    preview.style.backgroundImage = 'url(' + me.photo + ')';
    preview.textContent = '';
  } else {
    trainerApplicationPhotoDataUrl = null;
    preview.style.backgroundImage = '';
    preview.textContent = '👤';
  }
}
async function previewTrainerPhoto(){
  const fileInput = document.getElementById('trainer-photo-input');
  const file = fileInput.files[0];
  if(!file) return;
  if(file.size > MAX_AUDIO_SIZE){ showToast('Photo trop lourde (1,5 Mo max)'); fileInput.value = ''; return; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const mediaCheck = await moderateImageWithCloudVision(dataUrl);
    if(mediaCheck.checked && mediaCheck.flagged){
      showToast('Cette photo ne peut pas être utilisée pour votre candidature');
      fileInput.value = '';
      return;
    }
    trainerApplicationPhotoDataUrl = dataUrl;
    const preview = document.getElementById('trainer-photo-preview');
    preview.style.backgroundImage = 'url(' + dataUrl + ')';
    preview.textContent = '';
  }catch(e){
    showToast('Impossible de charger cette photo');
  }
}
async function submitTrainerApplication(){
  if(!(await requireEducationSubscription())) return;
  const subject = document.getElementById('trainer-subject-input').value.trim();
  const bio = document.getElementById('trainer-bio-input').value.trim();
  const paymentNumber = document.getElementById('trainer-payment-number-input').value.trim();
  if(!trainerApplicationPhotoDataUrl){ showToast('Une photo est obligatoire pour rassurer les élèves'); return; }
  if(!subject || !bio || !paymentNumber){ showToast('Renseignez la matière, une présentation, et votre numéro Wave/OM'); return; }
  const diplomaFile = document.getElementById('trainer-diploma-input').files[0];
  let diplomaData = null, diplomaName = null;
  if(diplomaFile){
    if(diplomaFile.size > MAX_LESSON_ATTACHMENT_SIZE){ showToast('Diplôme trop lourd (5 Mo max)'); return; }
    try{
      diplomaData = await readFileAsDataURL(diplomaFile);
      diplomaName = diplomaFile.name;
    }catch(e){
      showToast('Impossible de charger le diplôme');
      return;
    }
  }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.photo = trainerApplicationPhotoDataUrl;
  await saveWithRetry('user:' + currentUser, me, true);
  const id = 'trainerreq_' + Date.now();
  await saveWithRetry('trainerrequest:' + id, {
    id, username: currentUser, country: currentUserCountry, subject, bio, paymentNumber, photo: trainerApplicationPhotoDataUrl, diplomaData, diplomaName, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoValidateTrainer(id);
  showToast('Candidature envoyée — en attente de validation ✓');
  go('education-hub');
}
async function fetchTrainerRequests(){
  const keys = await safeList('trainerrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  return list;
}
/* ---------- ABONNEMENT MENSUEL OBLIGATOIRE — BOUTIQUE ---------- */
const DEFAULT_SHOP_SUB_PRICE = 2000;
const SHOP_SUB_DURATION_DAYS = 30;
async function getShopSubPrice(){
  const price = await safeGet('settings:shop_sub_price', true);
  return (typeof price === 'number') ? price : DEFAULT_SHOP_SUB_PRICE;
}
async function isShopSubActive(sellerUsername){
  const sub = await safeGet('shopsubscription:' + sellerUsername, true);
  if(!sub) return false;
  return new Date(sub.expiresAt) > new Date();
}
async function cancelShopSub(){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function reactivateShopSub(){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function renderMySubscriptions(){
  const el = document.getElementById('my-subscriptions-list');
  if(!el) return;
  const cards = [];
  const premiumKeys = await safeList('premiumpurchase:', true);
  const myPremiumPurchases = [];
  for(const k of premiumKeys){ const p = await safeGet(k, true).catch(() => null); if(p && p.username === currentUser) myPremiumPurchases.push(p); }
  if(myPremiumPurchases.length > 0){
    cards.push('<div class="card" style="position:relative; padding-right:40px; margin-bottom:10px;">' +
      '<span onclick="openSubscriptionKebabMenu(\'premium\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
      '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">⭐ Premium</p>' +
      '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Achat unique — pas de renouvellement automatique</p></div>');
  }
  const eduSub = await safeGet('edusubscription:' + currentUser, true);
  if(eduSub && new Date(eduSub.expiresAt) > new Date()){
    cards.push('<div class="card" style="position:relative; padding-right:40px; margin-bottom:10px;">' +
      '<span onclick="openSubscriptionKebabMenu(\'education\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
      '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">🎓 Espace Éducation</p>' +
      '<p style="margin:0; font-size:12px; color:'+(eduSub.cancelled ? 'var(--gold)' : 'var(--lagoon)')+';">'+(eduSub.cancelled ? '⏳ Actif jusqu’au ' : '✓ Actif jusqu’au ')+new Date(eduSub.expiresAt).toLocaleDateString('fr-FR')+(eduSub.cancelled ? ' — ne sera pas renouvelé' : '')+'</p></div>');
  }
  const shopSub = await safeGet('shopsubscription:' + currentUser, true);
  if(shopSub && new Date(shopSub.expiresAt) > new Date()){
    cards.push('<div class="card" style="position:relative; padding-right:40px; margin-bottom:10px;">' +
      '<span onclick="openSubscriptionKebabMenu(\'shop\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
      '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">🏪 Boutique</p>' +
      '<p style="margin:0; font-size:12px; color:'+(shopSub.cancelled ? 'var(--gold)' : 'var(--lagoon)')+';">'+(shopSub.cancelled ? '⏳ Actif jusqu’au ' : '✓ Actif jusqu’au ')+new Date(shopSub.expiresAt).toLocaleDateString('fr-FR')+(shopSub.cancelled ? ' — ne sera pas renouvelé' : '')+'</p></div>');
  }
  el.innerHTML = cards.length === 0 ? '<div class="empty">Aucun abonnement actif pour l’instant.</div>' : cards.join('');
}
async function openSubscriptionKebabMenu(type){
  const items = [];
  items.push({ icon: '📄', label: 'Télécharger le reçu', action: 'closeGenericKebabMenu(); downloadSubscriptionReceipt(\''+type+'\')' });
  if(type === 'education'){
    const sub = await safeGet('edusubscription:' + currentUser, true);
    items.push(sub && sub.cancelled
      ? { icon: '🔄', label: 'Réactiver le renouvellement', action: 'closeGenericKebabMenu(); reactivateEduSubscription()' }
      : { icon: '✕', label: 'Résilier (annuler le renouvellement)', action: 'closeGenericKebabMenu(); cancelEduSubscription()' });
  }
  if(type === 'shop'){
    const sub = await safeGet('shopsubscription:' + currentUser, true);
    items.push(sub && sub.cancelled
      ? { icon: '🔄', label: 'Réactiver le renouvellement', action: 'closeGenericKebabMenu(); reactivateShopSub()' }
      : { icon: '✕', label: 'Résilier (annuler le renouvellement)', action: 'closeGenericKebabMenu(); cancelShopSub()' });
  }
  openGenericKebabMenu(items);
}
async function downloadSubscriptionReceipt(type){
  let text = 'Suktum — Reçu d’abonnement\n\n';
  if(type === 'premium'){
    const keys = await safeList('premiumpurchase:', true);
    const purchases = [];
    for(const k of keys){ const p = await safeGet(k, true).catch(() => null); if(p && p.username === currentUser) purchases.push(p); }
    purchases.sort((a,b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
    if(purchases.length === 0){ showToast('Aucun achat Premium trouvé'); return; }
    text += 'Premium — achat(s) :\n' + purchases.map(p => '• ' + new Date(p.purchasedAt).toLocaleDateString('fr-FR') + ' — ' + p.price.toLocaleString('fr-FR') + ' FCFA').join('\n');
  } else {
    const sub = await safeGet((type === 'education' ? 'edusubscription:' : 'shopsubscription:') + currentUser, true);
    if(!sub){ showToast('Aucun abonnement trouvé'); return; }
    text += (type === 'education' ? 'Espace Éducation' : 'Boutique') + '\n' +
      'Prix : ' + sub.price.toLocaleString('fr-FR') + ' FCFA/mois\n' +
      'Actif jusqu’au : ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + '\n' +
      'Renouvellement : ' + (sub.cancelled ? 'désactivé' : 'automatique');
  }
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Reçu copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function subscribeToShop(){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function fetchShopSubRequests(){
  const keys = await safeList('shopsubrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function approveShopSubRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function rejectShopSubRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/10-boutique.js */
  return;
}
async function saveShopSubPrice(){
  const price = parseInt(document.getElementById('shop-sub-price-input').value, 10);
  if(isNaN(price) || price < 0){ showToast('Entrez un prix valide'); return; }
  await saveWithRetry('settings:shop_sub_price', price, true);
  showToast('Prix enregistré ✓');
}
async function loadShopSubAdmin(){
  const priceInput = document.getElementById('shop-sub-price-input');
  if(priceInput) priceInput.value = await getShopSubPrice();
  const el = document.getElementById('admin-shopsub-requests');
  if(!el) return;
  let requests = (await fetchShopSubRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  el.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : requests.map(r =>
    '<div class="card"><p style="margin:0 0 10px; font-size:13px;">@'+escapeHtml(r.username)+' — '+r.price.toLocaleString('fr-FR')+' FCFA'+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveShopSubRequest(\''+r.id+'\')">✓ Paiement reçu, activer</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectShopSubRequest(\''+r.id+'\')">✕ Rejeter</button></div></div>'
  ).join('');
}
/* ---------- ABONNEMENT MENSUEL OBLIGATOIRE — ESPACE ÉDUCATION ---------- */
const DEFAULT_EDU_SUB_PRICE = 1000;
const EDU_SUB_DURATION_DAYS = 30;
async function getEducationSubPrice(){
  const price = await safeGet('settings:education_sub_price', true);
  return (typeof price === 'number') ? price : DEFAULT_EDU_SUB_PRICE;
}
async function saveEducationSubPrice(){
  const price = parseInt(document.getElementById('edu-sub-price-input').value, 10);
  if(isNaN(price) || price < 0){ showToast('Entrez un prix valide'); return; }
  await saveWithRetry('settings:education_sub_price', price, true);
  showToast('Prix enregistré ✓');
}
let adminEducationBypass = false;
async function loadInstantTrainerCard(){
  const el = document.getElementById('admin-instant-trainer-card');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  if(me && me.isTrainer){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Vous avez déjà le statut formateur — vos cours se publient directement, sans validation.</p>';
  } else {
    el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Publiez vous-même n’importe quel contenu dans l’Espace Éducation, sans passer par la candidature ni la validation — vos cours seront publiés immédiatement.</p>' +
      '<button class="btn btn-primary" style="width:100%;" onclick="grantSelfInstantTrainer()">🎓 Devenir formateur instantanément</button>';
  }
}
async function grantSelfInstantTrainer(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
function enterEducationSpaceFromAdmin(){
  adminEducationBypass = true;
  go('education-hub');
}
function enterEducationSpaceNormally(){
  adminEducationBypass = false;
  go('education-hub');
}
/* ---------- ESSAI GRATUIT 7 JOURS ---------- */
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
function isTrialStillActive(user){
  if(!user || !user.eduTrialStartedAt) return false;
  return (Date.now() - new Date(user.eduTrialStartedAt).getTime()) < TRIAL_DURATION_MS;
}
async function renderEduSubscriptionStatusCard(){
  const el = document.getElementById('edu-subscription-status-card');
  if(!el) return;
  const u = await safeGet('user:' + currentUser, true);
  if(u && u.stateFunded){ el.innerHTML = ''; return; }
  const sub = await safeGet('edusubscription:' + currentUser, true);
  const active = sub && new Date(sub.expiresAt) > new Date();
  if(!active){ el.innerHTML = ''; return; }
  if(sub.cancelled){
    el.innerHTML = '<div class="card" style="border-color:var(--gold); margin-bottom:14px;">' +
      '<p style="margin:0 0 8px; font-size:12.5px; color:var(--gold);">⏳ Abonnement annulé — accès conservé jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', puis ne sera pas renouvelé.</p>' +
      '<button class="btn btn-outline btn-sm" onclick="reactivateEduSubscription()">Réactiver le renouvellement</button></div>';
  } else {
    el.innerHTML = '<div class="card" style="margin-bottom:14px;">' +
      '<p style="margin:0 0 8px; font-size:12.5px; color:var(--lagoon);">✓ Abonnement Espace Éducation actif jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + '</p>' +
      '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral); width:100%;" onclick="cancelEduSubscription()">Annuler mon abonnement</button></div>';
  }
}
async function cancelEduSubscription(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function reactivateEduSubscription(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function renderTrialBanner(){
  const el = document.getElementById('edu-trial-banner');
  if(!el) return;
  const u = await safeGet('user:' + currentUser, true);
  if(u && u.stateFunded){ el.innerHTML = ''; return; }
  const sub = await safeGet('edusubscription:' + currentUser, true);
  const hasRealSub = sub && new Date(sub.expiresAt) > new Date();
  if(hasRealSub){ el.innerHTML = ''; return; }
  if(isTrialStillActive(u)){
    const msLeft = TRIAL_DURATION_MS - (Date.now() - new Date(u.eduTrialStartedAt).getTime());
    const daysLeft = Math.max(1, Math.ceil(msLeft / (24*60*60*1000)));
    el.innerHTML = '<div class="card" style="border-color:var(--gold); margin-bottom:14px;">' +
      '<p style="margin:0; font-size:13px; color:var(--gold);">🎁 Essai gratuit — '+daysLeft+' jour(s) restant(s)</p>' +
      '<p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">Profitez de l’Espace Éducation et de vos cours gratuitement. Un abonnement sera demandé à la fin de l’essai.</p></div>';
  } else {
    el.innerHTML = '';
  }
}
async function ensureTrialStarted(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  if(u.eduTrialStartedAt) return; // déjà démarré une fois, ne jamais réinitialiser
  u.eduTrialStartedAt = new Date().toISOString();
  await saveWithRetry('user:' + username, u, true);
}
async function isEducationSubActive(username){
  if(adminEducationBypass && username === currentUser) return true;
  const u = await safeGet('user:' + username, true);
  if(u && u.stateFunded) return true;
  if(isTrialStillActive(u)) return true;
  const sub = await safeGet('edusubscription:' + username, true);
  if(!sub) return false;
  return new Date(sub.expiresAt) > new Date();
}
/* ---------- ACCÈS FINANCÉ PAR L'ÉTAT ---------- */
function requestStateFundedAccess(){
  go('request-state-funded');
}
async function submitStateFundedRequest(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchStateFundedRequests(){
  const keys = await safeList('staterequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
function generateSingleActivationCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'SUKTUM-' + code;
}
async function populateCsvImportCourseSelect(){
  const select = document.getElementById('csv-import-course-select');
  if(!select) return;
  const allCourses = await fetchCourses(true);
  select.innerHTML = allCourses.map(c => '<option value="'+c.id+'">'+escapeHtml(c.title)+'</option>').join('');
}
async function importStudentListCSV(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function generateActivationCodes(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function renderActivationCodeBatches(){
  const el = document.getElementById('activation-code-batches-list');
  if(!el) return;
  const keys = await safeList('activationbatch:', true);
  const batches = [];
  for(const k of keys){ const b = await safeGet(k, true).catch(() => null); if(b) batches.push(b); }
  batches.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = batches.length === 0 ? '' : batches.map(b => {
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(b.label)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+b.codes.length+' code(s) — généré le '+new Date(b.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="downloadActivationCodesBatch(\''+b.id+'\')">📥 Télécharger la liste (.txt)</button></div>';
  }).join('');
}
async function downloadActivationCodesBatch(batchId){
  const b = await safeGet('activationbatch:' + batchId, true);
  if(!b) return;
  const text = 'Suktum — Codes d’activation\nCohorte : ' + b.label + '\nGénéré le : ' + new Date(b.createdAt).toLocaleDateString('fr-FR') + '\n\n' + b.codes.join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'codes-activation-' + b.label.replace(/[^a-z0-9]/gi, '-') + '.txt';
  a.click();
}
async function renderInstitutionalDashboard(){
  const summaryEl = document.getElementById('institutional-dashboard-summary');
  const studentsEl = document.getElementById('institutional-dashboard-students');
  if(!summaryEl || !studentsEl) return;
  const allUsers = await fetchUsers();
  const fundedStudents = allUsers.filter(u => u.stateFunded);
  const allEnrollmentKeys = await safeList('enrollment:', true);
  const rows = [];
  for(const student of fundedStudents){
    let courseCount = 0;
    let submittedTotal = 0;
    for(const k of allEnrollmentKeys){
      const e = await safeGet(k, true).catch(() => null);
      if(e && e.studentUsername === student.username && e.status === 'approved') courseCount++;
    }
    rows.push({ username: student.username, courseCount, city: student.city || '—' });
  }
  summaryEl.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">🎓 <strong>'+fundedStudents.length+'</strong> étudiant(s) financé(s) par un programme officiel</p>' +
    '<p style="margin:0; font-size:13px;">📚 <strong>'+rows.reduce((s,r) => s+r.courseCount, 0)+'</strong> inscription(s) de cours au total</p></div>';
  studentsEl.innerHTML = rows.length === 0 ? '<div class="empty">Aucun étudiant financé pour l’instant.</div>' : rows.map(r =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(r.username)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">📍 '+escapeHtml(r.city)+' — '+r.courseCount+' cours suivi(s)</p></div>'
  ).join('');
  window.__institutionalDashboardRows = rows;
}
async function sendInstitutionalAnnouncement(){
  const text = document.getElementById('institutional-announcement-text').value.trim();
  if(!text){ showToast('Écrivez un message avant d’envoyer'); return; }
  const allUsers = await fetchUsers();
  const fundedStudents = allUsers.filter(u => u.stateFunded);
  if(fundedStudents.length === 0){ showToast('Aucun étudiant financé à notifier pour l’instant'); return; }
  for(const student of fundedStudents){
    await createNotification(student.username, 'institutional_announcement', currentUser, null, text);
  }
  document.getElementById('institutional-announcement-text').value = '';
  showToast('Annonce envoyée à ' + fundedStudents.length + ' étudiant(s) ✓');
  await logAdminAction('Annonce institutionnelle envoyée', fundedStudents.length + ' étudiant(s) — ' + text.slice(0,60));
}
async function exportInstitutionalReport(){
  const rows = window.__institutionalDashboardRows || [];
  const now = new Date().toLocaleDateString('fr-FR');
  let text = 'Suktum — Rapport institutionnel\nGénéré le : ' + now + '\n\n';
  text += 'Nombre d’étudiants financés : ' + rows.length + '\n';
  text += 'Total inscriptions de cours : ' + rows.reduce((s,r) => s+r.courseCount, 0) + '\n\n';
  text += 'Détail par étudiant :\n';
  rows.forEach(r => { text += '- @' + r.username + ' (' + r.city + ') — ' + r.courseCount + ' cours suivi(s)\n'; });
  text += '\nCe rapport reflète les données réellement enregistrées sur Suktum à la date de génération. Il ne constitue pas un document certifié.';
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rapport-institutionnel-suktum-' + now.replace(/\//g,'-') + '.txt';
  a.click();
}
async function redeemActivationCode(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function grantStateFundedAccess(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function revokeStateFundedAccess(username){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function approveStateFundedRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectStateFundedRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function subscribeToEducationSpace(){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function fetchEduSubRequests(){
  const keys = await safeList('edusubrequest:', true);
  const list = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) list.push(r); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function approveEduSubRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function rejectEduSubRequest(id){
  /* phase 06 : logique serveur — voir src/platform/overrides/20-education.js */
  return;
}
async function registerAsStudent(){
  const level = document.getElementById('student-level-select') ? document.getElementById('student-level-select').value : '';
  if(!level){ showToast('Choisissez votre niveau scolaire'); return; }
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.isStudent = true;
  me.studentSince = new Date().toISOString();
  me.studentLevel = level;
  me.studentType = (level === 'Supérieur') ? 'Étudiant' : 'Élève';
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('Inscription confirmée — bienvenue dans l’Espace Éducation ✓');
  await renderEducationHub();
}
async function renderStudentStatusCard(){
  const el = document.getElementById('education-student-status-card');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  const enrollmentKeys = await safeList('enrollment:', true);
  let myCourseCount = 0;
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseCount++;
  }
  const pendingParentRequests = (await fetchParentLinkRequests()).filter(r => r.studentUsername === currentUser && r.status === 'pending');
  const parentReqBadge = pendingParentRequests.length > 0
    ? '<p style="margin:8px 0 0; font-size:12px; color:var(--gold); cursor:pointer;" onclick="go(\'parent-requests-received\')">👨‍👩‍👧 '+pendingParentRequests.length+' demande(s) de suivi parental en attente →</p>'
    : '';
  const fundedBadge = me && me.stateFunded ? '<p style="margin:8px 0 0; font-size:12px; color:var(--lagoon);">🏛️ Prise en charge par un programme officiel — accès financé actif</p>' : '';
  if(me && me.isStudent){
    const typeLabel = (me.studentType || 'Étudiant').toLowerCase();
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Inscrit(e) comme '+typeLabel+(me.studentLevel ? ' · '+escapeHtml(me.studentLevel) : '')+' — '+myCourseCount+' cours suivi(s)</p>' + fundedBadge + parentReqBadge;
  } else {
    el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Inscrivez-vous pour accéder facilement à vos cours et suivre votre progression.</p>' +
      '<label style="margin-top:0;">Niveau scolaire</label>' +
      '<select id="student-level-select">' +
      '<option value="">Choisissez...</option>' +
      '<option value="Primaire">Primaire (Élève)</option>' +
      '<option value="Collège">Collège (Élève)</option>' +
      '<option value="Lycée">Lycée (Élève)</option>' +
      '<option value="Supérieur">Supérieur / Formation adulte (Étudiant)</option>' +
      '</select>' +
      '<button class="btn btn-outline" style="width:100%; margin-top:10px;" onclick="registerAsStudent()">🎒 S’inscrire</button>' + fundedBadge + parentReqBadge;
  }
}
async function requireEducationSubscription(){
  const active = await isEducationSubActive(currentUser);
  if(!active){
    showToast('Votre abonnement Espace Éducation a expiré ou n’a pas encore été activé');
    go('education-hub');
    return false;
  }
  return true;
}
