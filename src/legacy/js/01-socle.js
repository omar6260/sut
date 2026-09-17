/* ---------- STORAGE HELPERS ---------- */
async function safeGet(key, shared){
  try{ const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; }
  catch(e){ return null; }
}
async function safeList(prefix, shared){
  try{ const r = await window.storage.list(prefix, shared); return r ? r.keys : []; }
  catch(e){ return []; }
}
async function saveWithRetry(key, value, shared){
  try{ await window.storage.set(key, JSON.stringify(value), shared); return true; }
  catch(e){ showToast('Connexion faible, réessayez'); return false; }
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
/**
 * Redimensionne et recompresse une image (JPEG) pour réduire réellement son poids —
 * essentiel pour les connexions faibles. maxDimension borne la plus grande dimension,
 * quality règle la compression JPEG (0-1). Repli honnête vers l'original si le
 * traitement échoue pour une raison quelconque (jamais de publication bloquée).
 */
function compressImageDataUrl(dataUrl, maxDimension, quality){
  return new Promise((resolve) => {
    try{
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if(width > maxDimension || height > maxDimension){
          if(width > height){ height = Math.round(height * maxDimension / width); width = maxDimension; }
          else { width = Math.round(width * maxDimension / height); height = maxDimension; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.75));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    }catch(e){
      resolve(dataUrl);
    }
  });
}
const MAX_FILE_SIZE = 3.5 * 1024 * 1024;

/* ---------- IDENTITY ---------- */
const COUNTRY_LIST = ['Sénégal', 'Côte d’Ivoire', 'Mali', 'France', 'États-Unis', 'Canada', 'Autre'];
function getLikelyLanguageForCountry(country){
  const map = { 'Sénégal': 'wo', 'Côte d’Ivoire': 'fr', 'Mali': 'fr', 'France': 'fr', 'États-Unis': 'en', 'Canada': 'en' };
  return map[country] || 'fr';
}
const COUNTRY_UTC_OFFSET = { 'Sénégal': 0, 'Côte d’Ivoire': 0, 'Mali': 0, 'France': 1, 'États-Unis': -5, 'Canada': -5 };
function isCountryInWakingHours(country){
  const offset = COUNTRY_UTC_OFFSET[country];
  if(offset === undefined) return false;
  const localHour = (new Date().getUTCHours() + offset + 24) % 24;
  return localHour >= 7 && localHour < 23;
}
const COUNTRY_CURRENCY = {
  'Sénégal': 'FCFA', 'Côte d’Ivoire': 'FCFA', 'Mali': 'FCFA',
  'France': 'EUR', 'États-Unis': 'USD', 'Canada': 'CAD', 'Autre': '—'
};
function populateCountrySelects(){
  document.querySelectorAll('.country-select').forEach(sel => {
    if(sel.options.length > 0) return;
    sel.innerHTML = COUNTRY_LIST.map(c => '<option value="'+c+'">'+c+'</option>').join('');
  });
  const originSel = document.getElementById('profile-origin-country-input');
  if(originSel && originSel.options.length <= 1){
    originSel.innerHTML += COUNTRY_LIST.map(c => '<option value="'+c+'">'+c+'</option>').join('');
  }
}
/* ---------- CONNEXION AVEC GOOGLE ---------- */
const GOOGLE_CLIENT_ID = ""; // ⚠️ À renseigner par l'expert (Google Cloud Console → Identifiants OAuth)
function decodeJwtPayload(token){
  /* phase 05 : logique déplacée côté serveur (Cloud Functions + custom claims) — implémentation dans src/platform/legacy-overrides.js */
  return window.SuktumPlatform && window.SuktumPlatform.legacyStub ? window.SuktumPlatform.legacyStub('decodeJwtPayload') : undefined;
}
function sanitizeUsernameCandidate(raw){
  return (raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20) || 'Utilisateur';
}
let googleSignInEmail = null;
async function handleGoogleCredentialResponse(response){
  /* phase 05 : logique déplacée côté serveur (Cloud Functions + custom claims) — implémentation dans src/platform/legacy-overrides.js */
  return window.SuktumPlatform && window.SuktumPlatform.legacyStub ? window.SuktumPlatform.legacyStub('handleGoogleCredentialResponse') : undefined;
}
async function recoverAccountViaGoogle(){
  const username = document.getElementById('google-recovery-btn').dataset.username;
  if(!username) return;
  const existing = await safeGet('user:' + username, true);
  if(!existing){ showToast('Ce compte n’existe plus'); return; }
  const country = document.getElementById('onboard-country').value || existing.country;
  await logInAsExistingUser(existing, username, country);
}
function initGoogleSignIn(){
  /* phase 05 : logique déplacée côté serveur (Cloud Functions + custom claims) — implémentation dans src/platform/legacy-overrides.js */
  return window.SuktumPlatform && window.SuktumPlatform.legacyStub ? window.SuktumPlatform.legacyStub('initGoogleSignIn') : undefined;
}

const PIROGUE_LOGO_DATAURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAAC0CAYAAACqnKHoAAAEw0lEQVR4nO3dMW4dRRjA8QXRWSDRICioQEoXWpqIC9DScAAkLgBngAsgcQAaWi6A0tCSDolULkA0loJcmwIsHMfP3rfvm53vm/n92jj7Ni/z35lZP6+XBQAAAAAAAAAAAAAAAAAAAAAAAAAAAACAe73W+wSId/b4ydWhP7t89tT/+UBe730CwHYChsIEDIUJGAoT8ET++vmH3qdAMAFP5vLi/OAdauoR8IQuL86vhDwGAU9MxPUJeHIirk3AiLgwAbMsi31xVQLmJSKuRcC8QsR1CJg7ibgGAXOQfXF+AuZBIs5LwKwi4pwEzGoizkfAHMW+OBcBs4mIcxAwm4m4PwFzEhH3JWBOZl/cj4AJI+L9CZhQIt6XgAkn4v0ImCbsi/chYJoScVsCpjkRtyPgifz9xafdXtuSug2/anJAh3696PNHL0Jf583vf9r0987eft+4C+KNHNBeAUd698dfjcUN3uh9ArAsy/LnZx+FLa9nuhjYA0NhAmY4kbN5dgKGwgQMhQmYIc2yjBYwFCZgKEzADGuGZbSAoTABM7TRZ2EBQ2EChsIEzPBGXkYLGArz44Sks+VBAbM+JEDAnGzrkzkiXT+uZ7aQBTyZDLG1dHlxfjVTxPbAExk93mszPTxPwAxplogFzLBmeJStgBneyBELmCmMGrGAmcaIEQuYqYy2LxYwUxolYgEzrREiFjBTqx6xgJle5X2xgOE/FSMWMNxQLWIBwy2VIhYw3KHKvljAcI/sEQsYHpA5YgHDClkjFjCslHFfLGA4UqaIPdSOKY3y4DsBU84o8UUQMLsTYBwBcxTx5SLgyQhwLO5CT+SdTz7vfQoE63Y1Pnv8JM2teIhw+ezp7j3t/oLCZXR7hrzLC4mWWbWOuenBhQv/ahVy+EHXRvv80Yvol4auPvjtrVVfFxlz2LeRzLawznUrESGfdIBTozULM4q1s+8hW2PeNAObbSHW1ll59Re3itYsTHWnzr6HrInZJ7GgsNUB9/iUCcxqbW/dZ+BWyw/YQ+/x2z1gYLujAm61jO59FYMtet68umYGhsLS/EC/WRiOt2lJHPk94T+++SXqUNDFe19/HHasY7ep3ZfQkf942Fvv8ds9YGC7TQFH343ufRWDLaLH7ZauzMBQWJqAzcJUkmW8bg7YZ6Mhztae0szAy5Lnqgb3yTROUwUMHOekgFssozNd3eC2FuPzlI7MwFBYms9C32QWhnVClsDRz8v68NsvIw8HYX7/6rvQ4526DU25hI5+kyBCxnGZMmBgnZCAW9yNzni1Y14txmNEN6lnYBGTQeZxmDrgZcn95jG+7OMvLGCfjYb1onpJPwMvS/6rIGOqMO5KBLwsNd5MxlFlvIUGbBkND4vspMwMvCx1rorUVmmchc+Yfncw3C/1DGwZDYdF91FqCQ28TMBQWJOALaPhVS26MANDYQKGwpoFbBkN/2vVgxkYChMwFNY0YMtoaNuBGRgKEzAU1jxgy2hm1nr8m4GhsN1nRz9uyOj2XHV2Xd6KmVH02iqm2Z+KmWoy3N/pfgKHCJpsMgR7W7oTuouY6SVjtDelPrm7iJnWskd7U5kTvYuYiVIp2ptKnvRdxMyxqkYLAAAAAAAAAAAAAAAAAADU8A9dpdZV/mfp0QAAAABJRU5ErkJggg==";
let effectivePlatformLogo = PIROGUE_LOGO_DATAURL;
let currentUser = null;
let hasUserInteractedThisSession = false;
let singlePostViewCachedPost = null;
let currentUserCountry = null;
let currentUserCity = null;
let pendingSharedProductId = null;
/* ---------- ALERTE PRÉCOCE — CAPTURE AUTOMATIQUE DES ERREURS TECHNIQUES ---------- */
let systemErrorLogQueue = [];
async function logSystemError(source, message, extra){
  try{
    const entry = { source, message: String(message).slice(0, 300), extra: extra ? String(extra).slice(0, 300) : '', page: (typeof document !== 'undefined' && document.querySelector('.screen.active')) ? document.querySelector('.screen.active').id : '', user: currentUser || null, createdAt: new Date().toISOString() };
    const id = 'systemerror:' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await saveWithRetry(id, entry, true);
  }catch(e){ /* ne jamais faire planter l'app à cause du logging lui-même */ }
}
window.addEventListener('error', (e) => {
  logSystemError('js_error', e.message || 'Erreur inconnue', e.filename ? (e.filename + ':' + e.lineno) : '');
});
window.addEventListener('unhandledrejection', (e) => {
  logSystemError('promise_rejection', (e.reason && e.reason.message) ? e.reason.message : String(e.reason));
});
/* ---------- OUTIL DE DIAGNOSTIC — TEST DE STOCKAGE ---------- */
async function runStorageHealthCheck(){
  const el = document.getElementById('storage-health-result');
  if(!el) return;
  el.textContent = '⏳ Test en cours...';
  const testKey = 'healthcheck:' + Date.now();
  const testValue = { ping: Math.random().toString(36) };
  try{
    const startWrite = performance.now();
    await window.storage.set(testKey, JSON.stringify(testValue), true);
    const writeMs = Math.round(performance.now() - startWrite);
    const startRead = performance.now();
    const readBack = await window.storage.get(testKey, true);
    const readMs = Math.round(performance.now() - startRead);
    const parsed = readBack ? JSON.parse(readBack.value) : null;
    await window.storage.delete(testKey, true).catch(() => {});
    if(parsed && parsed.ping === testValue.ping){
      el.innerHTML = '<span style="color:var(--lagoon);">✓ Stockage fonctionnel — écriture '+writeMs+'ms, lecture '+readMs+'ms.</span>';
    } else {
      el.innerHTML = '<span style="color:var(--coral);">⚠️ Le stockage répond mais renvoie des données inattendues — à surveiller.</span>';
      await logSystemError('storage_healthcheck', 'Donnée relue différente de celle écrite');
    }
  }catch(e){
    el.innerHTML = '<span style="color:var(--coral);">✕ Le stockage ne répond pas — problème potentiellement bloquant pour toute l’application.</span>';
    await logSystemError('storage_healthcheck', 'Échec du test de stockage', e.message);
  }
}
/* ---------- ALERTES SUR LES FILES D'ATTENTE ANORMALES ---------- */
/* ---------- SEUILS D'ALERTE PERSONNALISÉS ---------- */
async function saveCustomAlertThresholds(){
  const salesDrop = parseInt(document.getElementById('alert-sales-drop-threshold').value, 10);
  const reportsPerAccount = parseInt(document.getElementById('alert-reports-threshold').value, 10);
  const signupBurst = parseInt(document.getElementById('alert-signup-burst-threshold').value, 10);
  const thresholds = {};
  if(!isNaN(salesDrop) && salesDrop > 0) thresholds.salesDrop = salesDrop;
  if(!isNaN(reportsPerAccount) && reportsPerAccount > 0) thresholds.reportsPerAccount = reportsPerAccount;
  if(!isNaN(signupBurst) && signupBurst > 0) thresholds.signupBurst = signupBurst;
  await saveWithRetry('settings:customAlertThresholds', thresholds, true);
  showToast('Seuils d’alerte enregistrés ✓');
  await renderEarlyWarningAlerts();
}
async function loadCustomAlertThresholds(){
  const thresholds = (await safeGet('settings:customAlertThresholds', true)) || {};
  const salesInput = document.getElementById('alert-sales-drop-threshold');
  const reportsInput = document.getElementById('alert-reports-threshold');
  const signupBurstInput = document.getElementById('alert-signup-burst-threshold');
  if(salesInput) salesInput.value = thresholds.salesDrop || 30;
  if(reportsInput) reportsInput.value = thresholds.reportsPerAccount || 3;
  if(signupBurstInput) signupBurstInput.value = thresholds.signupBurst || 20;
}
async function renderEarlyWarningAlerts(){
  const el = document.getElementById('early-warning-alerts');
  if(!el) return;
  const alerts = [];
  const reports = await fetchReports();
  const oldPendingReports = reports.filter(r => r.status === 'pending' && (new Date() - new Date(r.createdAt)) >= 3*24*60*60*1000);
  if(oldPendingReports.length > 0) alerts.push({ level: 'warn', text: '⚠️ ' + oldPendingReports.length + ' signalement(s) en attente depuis plus de 3 jours — file de modération qui s’accumule.' });

  const suspensionAppealKeys = await safeList('suspensionappeal:', true);
  let oldSuspensionAppeals = 0;
  for(const k of suspensionAppealKeys){ const a = await safeGet(k, true); if(a && a.status === 'pending' && (new Date() - new Date(a.createdAt)) >= 3*24*60*60*1000) oldSuspensionAppeals++; }
  if(oldSuspensionAppeals > 0) alerts.push({ level: 'warn', text: '⚠️ ' + oldSuspensionAppeals + ' contestation(s) de suspension en attente depuis plus de 3 jours.' });

  const banAppealKeys = await safeList('banappeal:', true);
  let oldBanAppeals = 0;
  for(const k of banAppealKeys){ const a = await safeGet(k, true); if(a && a.status === 'pending' && (new Date() - new Date(a.createdAt)) >= 3*24*60*60*1000) oldBanAppeals++; }
  if(oldBanAppeals > 0) alerts.push({ level: 'warn', text: '⚠️ ' + oldBanAppeals + ' contestation(s) de bannissement en attente depuis plus de 3 jours.' });

  const pencReportKeys = await safeList('pencreport:', true);
  let oldPencReports = 0;
  for(const k of pencReportKeys){ const r = await safeGet(k, true); if(r && r.status === 'pending' && (new Date() - new Date(r.createdAt)) >= 3*24*60*60*1000) oldPencReports++; }
  if(oldPencReports > 0) alerts.push({ level: 'warn', text: '⚠️ ' + oldPencReports + ' signalement(s) de Penc en attente depuis plus de 3 jours.' });

  const orders = await fetchOrders();
  const unpaidOrders = orders.filter(o => o.sellerUsername && o.payoutStatus !== 'paid' && o.netAmount);
  const now = new Date();
  const staleSellers = new Set();
  for(const o of unpaidOrders){
    const daysWaiting = Math.floor((now - new Date(o.createdAt)) / (24*60*60*1000));
    if(daysWaiting >= 14) staleSellers.add(o.sellerUsername);
  }
  if(staleSellers.size > 0) alerts.push({ level: 'warn', text: '⚠️ ' + staleSellers.size + ' vendeur(s) attendent leur reversement depuis 14 jours ou plus.' });

  const recentErrors = (await fetchSystemErrors()).filter(er => (new Date() - new Date(er.createdAt)) < 24*60*60*1000);
  if(recentErrors.length > 0) alerts.push({ level: 'error', text: '🔴 ' + recentErrors.length + ' erreur(s) technique(s) capturée(s) dans les dernières 24h — voir le détail ci-dessous.' });

  const thresholds = (await safeGet('settings:customAlertThresholds', true)) || {};
  const salesDropThreshold = thresholds.salesDrop || 30;
  const thisWeekRevenue = orders.filter(o => (now - new Date(o.createdAt)) < 7*24*60*60*1000).reduce((s,o) => s + (o.total||0), 0);
  const lastWeekRevenue = orders.filter(o => { const d = now - new Date(o.createdAt); return d >= 7*24*60*60*1000 && d < 14*24*60*60*1000; }).reduce((s,o) => s + (o.total||0), 0);
  if(lastWeekRevenue > 0){
    const dropPercent = Math.round((1 - thisWeekRevenue / lastWeekRevenue) * 100);
    if(dropPercent >= salesDropThreshold) alerts.push({ level: 'error', text: '📉 Les ventes ont chuté de ' + dropPercent + '% cette semaine par rapport à la semaine dernière (seuil configuré : ' + salesDropThreshold + '%).' });
  }

  const reportsThreshold = thresholds.reportsPerAccount || 3;
  const recentReports = reports.filter(r => (now - new Date(r.createdAt)) < 24*60*60*1000);
  const reportCountsByTarget = {};
  recentReports.forEach(r => { if(r.targetUser) reportCountsByTarget[r.targetUser] = (reportCountsByTarget[r.targetUser] || 0) + 1; });
  const floodedAccounts = Object.entries(reportCountsByTarget).filter(([,count]) => count >= reportsThreshold);
  if(floodedAccounts.length > 0) alerts.push({ level: 'error', text: '🚩 ' + floodedAccounts.map(([u,c]) => '@'+u+' ('+c+' signalements)').join(', ') + ' — au moins ' + reportsThreshold + ' signalements en 24h (votre seuil configuré).' });

  const allUsersForAnomaly = await fetchUsers();
  const fiveMinAgo = new Date(now - 5*60*1000);
  const recentSignups = allUsersForAnomaly.filter(u => new Date(u.createdAt) > fiveMinAgo);
  const anomalyThreshold = thresholds.signupBurst || 20;
  if(recentSignups.length >= anomalyThreshold) alerts.push({ level: 'error', text: '🚨 ' + recentSignups.length + ' nouveaux comptes créés dans les 5 dernières minutes — pic anormal, possible activité de bots ou fraude à vérifier.' });

  el.innerHTML = alerts.length === 0
    ? '<div class="card" style="border-color:var(--lagoon);"><p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Rien à signaler pour l’instant — aucune file d’attente anormale, aucune erreur récente.</p></div>'
    : alerts.map(a => '<div class="card" style="border-color:'+(a.level==='error'?'var(--coral)':'var(--gold)')+'; margin-bottom:8px;"><p style="margin:0; font-size:13px;">'+a.text+'</p></div>').join('');
}
/* ---------- JOURNAL DES ERREURS TECHNIQUES ---------- */
async function fetchSystemErrors(){
  const keys = await safeList('systemerror:', true);
  const errors = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) errors.push({ key: k, ...e }); }
  errors.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return errors;
}
async function renderSystemErrorLog(){
  const el = document.getElementById('system-error-log');
  if(!el) return;
  const errors = (await fetchSystemErrors()).slice(0, 20);
  if(errors.length === 0){ el.innerHTML = '<div class="empty">Aucune erreur technique capturée pour l’instant ✓</div>'; return; }
  el.innerHTML = '<button class="btn btn-outline btn-sm" style="margin-bottom:8px;" onclick="clearAllSystemErrors()">🗑️ Tout effacer</button>' +
    errors.map(er =>
      '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 3px; font-size:12.5px; color:var(--coral);">'+escapeHtml(er.source)+'</p>' +
      '<p style="margin:0 0 3px; font-size:12px;">'+escapeHtml(er.message)+(er.extra ? ' — '+escapeHtml(er.extra) : '')+'</p>' +
      '<p style="margin:0; font-size:10.5px; color:rgba(245,239,227,0.4);">'+(er.page?escapeHtml(er.page)+' · ':'')+new Date(er.createdAt).toLocaleString('fr-FR')+(er.user?' · @'+escapeHtml(er.user):'')+'</p></div>'
    ).join('');
}
async function clearAllSystemErrors(){
  const errors = await fetchSystemErrors();
  for(const er of errors){ await window.storage.delete(er.key, true).catch(() => {}); }
  showToast('Journal des erreurs vidé');
  await renderSystemErrorLog();
  await renderEarlyWarningAlerts();
}
