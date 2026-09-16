/* ---------- ADMIN ---------- */
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function checkPasswordStrength(pw){
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return {checks, passed, strong: passed === 5};
}
/* ---------- CHANGEMENT DE MOT DE PASSE (DG / MODÉRATEUR / ÉQUIPE) ---------- */
async function enforceFirstLoginPasswordChange(listKey, identifier, identifierType, displayName){
  showToast('Vous devez choisir un nouveau mot de passe avant de continuer');
  while(true){
    const newPin = prompt('Nouveau mot de passe pour ' + displayName + ' (8+ caractères, majuscule, minuscule, chiffre, caractère spécial) — obligatoire avant de continuer :');
    if(newPin === null){ showToast('Vous devez changer votre mot de passe pour accéder au tableau de bord'); continue; }
    const {strong} = checkPasswordStrength(newPin);
    if(!strong){ showToast('Ce mot de passe ne respecte pas encore toutes les règles de sécurité'); continue; }
    const newPinHash = await sha256Hex(newPin);
    const superHash = await safeGet('settings:adminpin_hash', true);
    if(newPinHash === superHash){ showToast('Choisissez un mot de passe différent du vôtre'); continue; }
    const list = (await safeGet(listKey, true)) || [];
    if(list.some(m => m.pinHash === newPinHash)){ showToast('Ce mot de passe est déjà utilisé par un autre compte administrateur'); continue; }
    const target = identifierType === 'name' ? list.find(m => m.name === identifier) : list[identifier];
    if(!target) return;
    target.pinHash = newPinHash;
    target.mustChangePassword = false;
    await saveWithRetry(listKey, list, true);
    currentAdminPasswordHash = newPinHash;
    showToast('Mot de passe changé ✓');
    return;
  }
}
async function toggleAdminAccountActive(listKey, identifier, identifierType, displayName){
  const list = (await safeGet(listKey, true)) || [];
  const target = identifierType === 'name' ? list.find(m => m.name === identifier) : list[identifier];
  if(!target) return;
  const currentlyActive = target.active !== false;
  const action = currentlyActive ? 'Suspendre' : 'Réactiver';
  if(!confirm(action + ' l’accès de ' + displayName + ' ?' + (currentlyActive ? ' Toute session déjà ouverte sera coupée dans les 30 secondes.' : ''))) return;
  target.active = !currentlyActive;
  await saveWithRetry(listKey, list, true);
  showToast((currentlyActive ? 'Accès suspendu' : 'Accès réactivé') + ' pour ' + displayName + ' ✓');
  await logAdminAction(currentlyActive ? 'Accès administrateur suspendu' : 'Accès administrateur réactivé', displayName);
  if(listKey === 'settings:regionaladmins') await loadRegionalAdminsList();
  else if(listKey === 'settings:moderators') await loadModeratorsList();
  else if(listKey === 'settings:techteammembers') await renderTechTeamMembersList();
}
async function changeAdminAccountPassword(listKey, identifier, identifierType, displayName){
  const newPin = prompt('Nouveau mot de passe pour ' + displayName + ' (8+ caractères, majuscule, minuscule, chiffre, caractère spécial) :');
  if(!newPin) return;
  const {strong} = checkPasswordStrength(newPin);
  if(!strong){ showToast('Ce mot de passe ne respecte pas toutes les règles de sécurité — réessayez'); return; }
  const newPinHash = await sha256Hex(newPin);
  const superHash = await safeGet('settings:adminpin_hash', true);
  if(newPinHash === superHash){ showToast('Choisissez un mot de passe différent du vôtre'); return; }
  const list = (await safeGet(listKey, true)) || [];
  if(list.some(m => m.pinHash === newPinHash)){ showToast('Ce mot de passe est déjà utilisé par un autre compte administrateur'); return; }
  const target = identifierType === 'name' ? list.find(m => m.name === identifier) : list[identifier];
  if(!target){ showToast('Compte introuvable'); return; }
  target.pinHash = newPinHash;
  await saveWithRetry(listKey, list, true);
  showToast('Mot de passe de ' + displayName + ' changé ✓');
  await logAdminAction('Mot de passe changé', displayName);
  if(listKey === 'settings:regionaladmins') await loadRegionalAdminsList();
  else if(listKey === 'settings:moderators') await loadModeratorsList();
  else if(listKey === 'settings:techteammembers') await renderTechTeamMembersList();
}
function renderPasswordStrengthLabel(pw){
  const {checks, passed} = checkPasswordStrength(pw);
  const labels = [
    (checks.length ? '✓' : '✕') + ' 8 caractères min.',
    (checks.upper ? '✓' : '✕') + ' une majuscule',
    (checks.lower ? '✓' : '✕') + ' une minuscule',
    (checks.number ? '✓' : '✕') + ' un chiffre',
    (checks.special ? '✓' : '✕') + ' un caractère spécial'
  ];
  return {text: labels.join(' · '), color: passed === 5 ? 'var(--lagoon)' : passed >= 3 ? 'var(--gold)' : 'var(--coral)'};
}
function toggleAdminPasswordVisibility(){
  const input = document.getElementById('admin-pin-input');
  const btn = document.getElementById('admin-pin-toggle-btn');
  if(input.type === 'password'){
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}
function updateAdminPasswordStrength(){
  const pw = document.getElementById('admin-pin-input').value;
  const el = document.getElementById('admin-password-strength');
  if(document.getElementById('admin-pin-input').dataset.mode !== 'create'){ el.textContent = ''; return; }
  if(!pw){ el.textContent = ''; return; }
  const r = renderPasswordStrengthLabel(pw);
  el.style.color = r.color;
  el.textContent = r.text;
}
async function loadAdminLoginScreen(){
  const hash = await safeGet('settings:adminpin_hash', true);
  const descEl = document.getElementById('admin-login-desc');
  const input = document.getElementById('admin-pin-input');
  input.value = '';
  document.getElementById('admin-password-strength').textContent = '';
  if(hash){
    descEl.textContent = "Entrez le mot de passe d'administration.";
    input.dataset.mode = 'verify';
  } else {
    descEl.textContent = "Première visite : créez un mot de passe d'administration blindé (8+ caractères, majuscule, minuscule, chiffre, caractère spécial).";
    input.dataset.mode = 'create';
  }
}
let adminScope = 'all';
let isModerator = false;
let currentAdminName = 'Propriétaire';
let isGenuineOwnerSession = false;
let currentCustomRoleDomains = null;
let isTechTeamMember = false;
let currentTechTeamName = null;
async function logAdminLogin(role){
  const id = 'adminlogin_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  await saveWithRetry('adminloginlog:' + id, {
    id, name: currentAdminName, role, scope: adminScope, createdAt: new Date().toISOString()
  }, true);
}
async function computeAuditLogHash(entry, previousHash){
  const payload = previousHash + '|' + entry.actorName + '|' + entry.action + '|' + entry.detail + '|' + entry.createdAt;
  const encoded = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function logAdminAction(action, detail){
  const role = isPayoutSpecialist ? 'Spécialiste reversements' : (isModerator ? 'Modérateur' : (adminScope === 'all' ? 'Propriétaire' : 'DG — ' + adminScope));
  const id = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const previousHash = (await safeGet('settings:lastAuditLogHash', true)) || 'genesis';
  const entry = { id, actorName: currentAdminName, actorRole: role, action, detail, createdAt: new Date().toISOString(), previousHash };
  entry.entryHash = await computeAuditLogHash(entry, previousHash);
  await saveWithRetry('auditlog:' + id, entry, true);
  await saveWithRetry('settings:lastAuditLogHash', entry.entryHash, true);
}
async function verifyAuditLogChainIntegrity(){
  const keys = await safeList('auditlog:', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true).catch(() => null); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const tampered = [];
  for(const e of entries){
    if(!e.entryHash || !e.previousHash) continue; // entrées créées avant l'introduction de la chaîne — non vérifiables, jamais traitées comme suspectes à tort
    const recomputed = await computeAuditLogHash({ actorName: e.actorName, action: e.action, detail: e.detail, createdAt: e.createdAt }, e.previousHash);
    if(recomputed !== e.entryHash) tampered.push(e.id);
  }
  return { totalChecked: entries.filter(e => e.entryHash).length, tampered };
}
async function gatherUnifiedActivityEvents(){
  const events = [];
  const loginKeys = await safeList('loginevent:', true);
  for(const k of loginKeys){ const e = await safeGet(k, true).catch(() => null); if(e) events.push({ type: 'login', username: e.username, label: 'Connexion', createdAt: e.createdAt }); }
  const orders = await fetchOrders();
  orders.forEach(o => events.push({ type: 'order', username: o.buyerUsername, label: 'Commande : ' + (o.productName || '') + ' (' + o.total + ' FCFA)', createdAt: o.createdAt }));
  const posts = await fetchPosts();
  posts.forEach(p => events.push({ type: 'post', username: p.userId, label: 'Publication (' + p.type + ')', createdAt: p.createdAt }));
  const reportKeys = await safeList('report:', true);
  for(const k of reportKeys){ const r = await safeGet(k, true).catch(() => null); if(r) events.push({ type: 'report', username: r.reporterUser, label: 'Signalement (' + r.type + ') visant @' + r.targetUser, createdAt: r.createdAt }); }
  const auditKeys = await safeList('auditlog:', true);
  for(const k of auditKeys){ const a = await safeGet(k, true).catch(() => null); if(a) events.push({ type: 'admin', username: a.actorName, label: a.action + (a.detail ? ' — ' + a.detail : ''), createdAt: a.createdAt }); }
  const lessonKeys = await safeList('lesson:', true);
  for(const k of lessonKeys){ const l = await safeGet(k, true).catch(() => null); if(l){ const c = await safeGet('course:' + l.courseId, true).catch(() => null); events.push({ type: 'course_edit', username: c ? c.trainerUsername : null, label: 'Leçon ajoutée/modifiée : ' + l.title, createdAt: l.createdAt }); } }
  const dmKeys = await safeList('dm:', true);
  for(const k of dmKeys){
    const msgs = await safeGet(k, true).catch(() => null);
    if(msgs) msgs.forEach(m => events.push({ type: 'message', username: m.from, label: 'Message privé', createdAt: m.ts }));
  }
  return events;
}
async function renderGlobalAuditLog(){
  const el = document.getElementById('global-audit-log-list');
  if(!el) return;
  const dateFilter = document.getElementById('audit-filter-date').value;
  const typeFilter = document.getElementById('audit-filter-type').value;
  const usernameFilter = document.getElementById('audit-filter-username').value.trim().toLowerCase();
  let events = await gatherUnifiedActivityEvents();
  if(dateFilter) events = events.filter(e => e.createdAt.slice(0,10) === dateFilter);
  if(typeFilter) events = events.filter(e => e.type === typeFilter);
  if(usernameFilter) events = events.filter(e => (e.username || '').toLowerCase().includes(usernameFilter));
  events.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const isSingleAccountInvestigation = !!usernameFilter && !typeFilter && !dateFilter;
  const shown = isSingleAccountInvestigation ? events : events.slice(0, 100);
  if(shown.length === 0){ el.innerHTML = '<div class="empty">Aucun événement ne correspond à ces filtres.</div>'; return; }
  const typeIcons = { login: '🔑', order: '🛍️', post: '📸', report: '⚠️', admin: '🛡️', course_edit: '🎓', message: '💬' };
  el.innerHTML = (isSingleAccountInvestigation ? '<p style="font-size:11px; color:var(--gold); margin:0 0 8px;">📍 Reconstitution de parcours — '+events.length+' événement(s) au total pour ce compte, historique complet.</p>' : (events.length > 100 ? '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:0 0 8px;">'+events.length+' événements trouvés — les 100 plus récents sont affichés.</p>' : '')) +
    shown.map(e =>
      '<div class="card" style="margin-bottom:6px; padding:10px 14px;"><p style="margin:0; font-size:12.5px;">'+(typeIcons[e.type]||'•')+' <strong>@'+escapeHtml(e.username || '?')+'</strong> — '+escapeHtml(e.label)+'</p>' +
      '<p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">'+new Date(e.createdAt).toLocaleString('fr-FR')+'</p></div>'
    ).join('');
}
async function toggleCountryReadOnlyMode(){
  const readOnlyCountries = (await safeGet('settings:readOnlyCountries', true)) || [];
  const country = prompt('Nom du pays à basculer en lecture seule (ou à réactiver s’il l’est déjà) :\n\nActuellement en lecture seule : ' + (readOnlyCountries.length > 0 ? readOnlyCountries.join(', ') : 'aucun'));
  if(!country || !country.trim()) return;
  const trimmed = country.trim();
  const idx = readOnlyCountries.indexOf(trimmed);
  const willEnable = idx === -1;
  const step1 = confirm(willEnable
    ? 'Basculer ' + trimmed + ' en lecture seule ? Les nouvelles commandes et inscriptions seront bloquées pour ce pays, mais toutes les données restent visibles et rien n’est supprimé.'
    : 'Réactiver les écritures normales pour ' + trimmed + ' ?');
  if(!step1) return;
  if(!(await confirmWithPinReentry())) return;
  if(willEnable) readOnlyCountries.push(trimmed); else readOnlyCountries.splice(idx, 1);
  await saveWithRetry('settings:readOnlyCountries', readOnlyCountries, true);
  await logAdminAction(willEnable ? 'Pays basculé en lecture seule' : 'Lecture seule levée pour un pays', trimmed);
  showToast(willEnable ? trimmed + ' est maintenant en lecture seule ✓' : trimmed + ' réactivé ✓');
}
async function toggleDepartmentReadOnlyMode(){
  const readOnlyDomains = (await safeGet('settings:readOnlyDomains', true)) || [];
  const domainLabels = { marketplace: '🏪 Marketplace (nouvelles commandes)', education: '🎓 Éducation (nouvelles inscriptions de cours)', lives: '🔴 Lives (nouveaux lives)' };
  const domain = prompt('Département à basculer en lecture seule (ou à réactiver) :\n\nTapez : marketplace, education ou lives\n\nActuellement en lecture seule : ' + (readOnlyDomains.length > 0 ? readOnlyDomains.map(d => domainLabels[d] || d).join(', ') : 'aucun'));
  if(!domain || !domainLabels[domain.trim()]){ if(domain !== null) showToast('Département non reconnu'); return; }
  const trimmed = domain.trim();
  const idx = readOnlyDomains.indexOf(trimmed);
  const willEnable = idx === -1;
  const step1 = confirm(willEnable
    ? 'Basculer ' + domainLabels[trimmed] + ' en lecture seule dans TOUS les pays ? Toutes les données restent visibles et rien n’est supprimé.'
    : 'Réactiver les écritures normales pour ' + domainLabels[trimmed] + ' ?');
  if(!step1) return;
  if(!(await confirmWithPinReentry())) return;
  if(willEnable) readOnlyDomains.push(trimmed); else readOnlyDomains.splice(idx, 1);
  await saveWithRetry('settings:readOnlyDomains', readOnlyDomains, true);
  await logAdminAction(willEnable ? 'Département basculé en lecture seule' : 'Lecture seule levée pour un département', domainLabels[trimmed]);
  showToast(willEnable ? domainLabels[trimmed] + ' est maintenant en lecture seule ✓' : 'Réactivé ✓');
}
async function exportComplianceReport(){
  const start = document.getElementById('compliance-report-start').value;
  const end = document.getElementById('compliance-report-end').value;
  if(!start || !end){ showToast('Choisissez une date de début et de fin'); return; }
  const allEvents = await gatherUnifiedActivityEvents();
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T23:59:59');
  const configEvents = allEvents.filter(e => e.type === 'admin' && new Date(e.createdAt) >= startDate && new Date(e.createdAt) <= endDate);
  configEvents.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const now = new Date().toLocaleDateString('fr-FR');
  let text = 'Suktum — Rapport de conformité (actions administratives et modifications de configuration)\n';
  text += 'Période : ' + new Date(start).toLocaleDateString('fr-FR') + ' au ' + new Date(end).toLocaleDateString('fr-FR') + '\n';
  text += 'Généré le : ' + now + '\n\n';
  text += 'Nombre total d’actions administratives sur cette période : ' + configEvents.length + '\n\n';
  if(configEvents.length === 0){
    text += 'Aucune action administrative enregistrée sur cette période.\n';
  } else {
    configEvents.forEach(e => { text += '- [' + new Date(e.createdAt).toLocaleString('fr-FR') + '] ' + e.username + ' — ' + e.label + '\n'; });
  }
  text += '\nCe rapport reflète les données réellement enregistrées sur Suktum à la date de génération. Il ne constitue pas un document certifié par un tiers indépendant.';
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rapport-conformite-suktum-' + start + '-au-' + end + '.txt';
  a.click();
  await logAdminAction('Rapport de conformité exporté', 'Période : ' + start + ' au ' + end);
}
async function showTeamSessionsHistory(){
  const el = document.getElementById('team-sessions-result');
  if(!el) return;
  el.innerHTML = '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:0 0 8px;">Historique des connexions récentes — Suktum n’a pas de serveur propre pour un vrai flux d’appareils connectés en temps réel, mais fermer un accès ci-dessous coupe réellement toute session ouverte sous 30 secondes.</p>';
  const keys = await safeList('adminloginlog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true).catch(() => null); if(l) logs.push(l); }
  logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = logs.slice(0, 15);
  if(recent.length === 0){ el.innerHTML += '<div class="empty">Aucune connexion d’équipe enregistrée pour l’instant.</div>'; return; }
  const regionalAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  const moderators = (await safeGet('settings:moderators', true)) || [];
  el.innerHTML += recent.map(l => {
    const isModeratorRole = l.role && l.role.startsWith('Modérateur');
    const isRegionalRole = l.role && l.role.startsWith('DG —') && l.role !== 'DG — all';
    let terminateBtn = '';
    if(isModeratorRole){
      const idx = moderators.findIndex(m => m.name === l.name);
      if(idx !== -1 && moderators[idx].active !== false) terminateBtn = '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="toggleAdminAccountActive(\'settings:moderators\', '+idx+', \'index\', \''+escapeHtml(l.name).replace(/'/g,"\\'")+'\')">Terminer</button>';
    } else if(isRegionalRole){
      const idx = regionalAdmins.findIndex(a => a.name === l.name);
      if(idx !== -1 && regionalAdmins[idx].active !== false) terminateBtn = '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="toggleAdminAccountActive(\'settings:regionaladmins\', '+idx+', \'index\', \''+escapeHtml(l.name).replace(/'/g,"\\'")+'\')">Terminer</button>';
    }
    return '<div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;"><div><p style="margin:0; font-size:12.5px;">'+escapeHtml(l.name)+' — '+escapeHtml(l.role)+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">'+new Date(l.createdAt).toLocaleString('fr-FR')+'</p></div>'+terminateBtn+'</div>';
  }).join('');
}
async function runAuditIntegrityCheck2(){
  const el = document.getElementById('audit-integrity-result-2');
  el.textContent = 'Vérification en cours...';
  const { totalChecked, tampered } = await verifyAuditLogChainIntegrity();
  if(totalChecked === 0){ el.innerHTML = '<span style="color:rgba(245,239,227,0.5);">Aucune entrée vérifiable pour l’instant.</span>'; return; }
  el.innerHTML = tampered.length === 0
    ? '<span style="color:var(--lagoon);">✓ '+totalChecked+' entrée(s) vérifiée(s) — chaîne intacte.</span>'
    : '<span style="color:var(--coral);">⚠️ '+tampered.length+' entrée(s) sur '+totalChecked+' montrent des signes d’altération.</span>';
}
async function showMyAdminSessionHistory(){
  const el = document.getElementById('my-session-history-result');
  const keys = await safeList('loginevent:' + currentUser + '__', true);
  const events = [];
  for(const k of keys){ const e = await safeGet(k, true).catch(() => null); if(e) events.push(e); }
  events.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = events.slice(0, 10);
  if(recent.length === 0){ el.innerHTML = '<div class="empty">Aucune connexion récente enregistrée pour votre compte.</div>'; return; }
  el.innerHTML = recent.map(e => '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">🔑 '+new Date(e.createdAt).toLocaleString('fr-FR')+'</p>').join('');
}
async function toggleTransactionsFreeze(){
  const currentlyFrozen = await safeGet('settings:transactionsFrozen', true);
  const willFreeze = !currentlyFrozen;
  const step1 = confirm(willFreeze
    ? '🧊 Geler immédiatement toutes les nouvelles commandes et inscriptions sur Suktum ?\n\nLes cours déjà en cours et l’accès des élèves déjà inscrits ne sont PAS affectés.'
    : 'Réactiver les nouvelles commandes et inscriptions sur Suktum ?');
  if(!step1) return;
  if(!(await confirmWithPinReentry())) return;
  await saveWithRetry('settings:transactionsFrozen', willFreeze, true);
  await logAdminAction(willFreeze ? '🧊 Gel des transactions/inscriptions activé' : 'Gel des transactions/inscriptions levé', '');
  showToast(willFreeze ? 'Transactions et inscriptions gelées ✓' : 'Transactions et inscriptions réactivées ✓');
}
async function confirmEmergencyKillSwitch(){
  const step1 = confirm('🚨 Kill switch d’urgence : ceci va IMMÉDIATEMENT désactiver l’accès de TOUS les DG régionaux et modérateurs, sans exception. Les utilisateurs finaux ne sont pas affectés. Continuer ?');
  if(!step1) return;
  if(!(await confirmWithPinReentry())) return;
  const regionalAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  let count = 0;
  regionalAdmins.forEach(a => { if(!a.revokedAt && a.active !== false){ a.active = false; count++; } });
  await saveWithRetry('settings:regionaladmins', regionalAdmins, true);
  const moderators = (await safeGet('settings:moderators', true)) || [];
  moderators.forEach(m => { if(!m.revokedAt && m.active !== false){ m.active = false; count++; } });
  await saveWithRetry('settings:moderators', moderators, true);
  await logAdminAction('🚨 Kill switch d’urgence activé', count + ' accès équipe désactivé(s) instantanément');
  showToast('Kill switch activé — ' + count + ' accès désactivé(s) ✓');
}
async function runAuditIntegrityCheck(){
  const el = document.getElementById('audit-integrity-result');
  el.textContent = 'Vérification en cours...';
  const { totalChecked, tampered } = await verifyAuditLogChainIntegrity();
  if(totalChecked === 0){ el.innerHTML = '<span style="color:rgba(245,239,227,0.5);">Aucune entrée vérifiable pour l’instant.</span>'; return; }
  el.innerHTML = tampered.length === 0
    ? '<span style="color:var(--lagoon);">✓ '+totalChecked+' entrée(s) vérifiée(s) — chaîne intacte, aucune altération détectée.</span>'
    : '<span style="color:var(--coral);">⚠️ '+tampered.length+' entrée(s) sur '+totalChecked+' montrent des signes d’altération.</span>';
}
/* ---------- CENTRE DE CONTRÔLE DE L'AUTOMATISATION ---------- */
const AUTOMATION_CATEGORIES = [
  { label: '🛡️ Modération IA (images/vidéos)', match: (a) => a.includes('Google Cloud') },
  { label: '🎥 Vidéos suspendues automatiquement', match: (a) => a.includes('Vidéo suspendue automatiquement') },
  { label: '🎓 Abonnements Éducation approuvés', match: (a) => a.includes('Abonnement Espace Éducation approuvé automatiquement') },
  { label: '⭐ Abonnements Premium approuvés', match: (a) => a.includes('Abonnement Premium approuvé automatiquement') },
  { label: '📚 Inscriptions aux cours approuvées', match: (a) => a.includes('Inscription au cours approuvée automatiquement') }
];
function isAutomatedLogEntry(entry){
  const text = entry.action || '';
  return text.includes('automatiquement') || text.includes('Google Cloud');
}
async function fetchAutomatedLogEntries(){
  const keys = await safeList('auditlog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l && isAutomatedLogEntry(l)) logs.push(l); }
  logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return logs;
}
/* ---------- ACTIVITÉ EN DIRECT DE TOUTE LA PLATEFORME ---------- */
const ACTIVITY_TYPES = [
  { key: 'signup', label: 'Comptes', icon: '🆕' },
  { key: 'post', label: 'Publications', icon: '🎬' },
  { key: 'order', label: 'Commandes', icon: '🛍️' },
  { key: 'live', label: 'Lives', icon: '🔴' },
  { key: 'gift', label: 'Cadeaux', icon: '🎁' }
];
let liveActivityTypeFilter = 'all';
let liveActivityRefreshInterval = null;
/* ---------- COMPARATEUR DE PERFORMANCE ENTRE PAYS ---------- */
/* ---------- PRÉSENCE PAR RÉGION (classement, pas une carte géographique) ---------- */
/* ---------- CLASSEMENT DE L'ÉQUIPE (reconnaissance interne, aucune notification) ---------- */
/* ---------- SUPPORT PRIORITAIRE ---------- */
async function renderPriorityTicketsList(){
  const el = document.getElementById('priority-tickets-list');
  if(!el) return;
  const allTickets = await fetchTickets();
  const realSupportTickets = allTickets.filter(t => t.subject !== undefined);
  const priorityOpen = realSupportTickets.filter(t => t.isPriority && t.status === 'open');
  el.innerHTML = priorityOpen.length === 0 ? '<div class="empty">Aucune demande prioritaire en attente pour l’instant.</div>' : priorityOpen.map(t =>
    '<div class="card" style="border-color:var(--gold); margin-bottom:8px;">' +
    '<p style="margin:0 0 4px; font-size:12.5px; color:var(--gold); font-weight:600;">⭐ @'+escapeHtml(t.username)+' — '+escapeHtml(t.subject)+'</p>' +
    '<p style="margin:0 0 8px; font-size:12px;">'+escapeHtml(t.message)+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="openThread(\''+escapeHtml(t.username)+'\')">💬 Répondre directement</button>' +
    '</div>'
  ).join('');
}
/* ---------- RECONNAISSANCE POSITIVE POUR L'ÉQUIPE ---------- */
async function addTeamRecognition(){
  const name = document.getElementById('new-recognition-name').value.trim();
  const reason = document.getElementById('new-recognition-reason').value.trim();
  if(!name || !reason){ showToast('Renseignez un nom et une raison'); return; }
  const id = 'recognition_' + Date.now();
  await saveWithRetry('teamrecognition:' + id, { id, name, reason, givenBy: currentAdminName, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-recognition-name').value = '';
  document.getElementById('new-recognition-reason').value = '';
  showToast('Reconnaissance ajoutée ✓');
  await renderTeamRecognitionList();
}
async function deleteTeamRecognition(id){
  await window.storage.delete('teamrecognition:' + id, true).catch(() => {});
  await renderTeamRecognitionList();
}
async function renderTeamRecognitionList(){
  const el = document.getElementById('team-recognition-list');
  if(!el) return;
  const keys = await safeList('teamrecognition:', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = entries.length === 0 ? '<div class="empty">Aucune reconnaissance enregistrée pour l’instant.</div>' : entries.map(e =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">🌟 <strong>'+escapeHtml(e.name)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.7);">'+escapeHtml(e.reason)+'</p>' +
    '<p style="margin:0; font-size:10.5px; color:var(--gold);">'+new Date(e.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<span onclick="deleteTeamRecognition(\''+e.id+'\')" style="color:var(--coral); cursor:pointer; font-size:11px;">🗑️</span></div>'
  ).join('');
}
async function renderTeamLeaderboard(){
  const el = document.getElementById('team-leaderboard-list');
  if(!el) return;
  const keys = await safeList('auditlog:', true);
  const now = new Date();
  const monthAgo = new Date(now - 30*24*60*60*1000);
  const countsByMember = {};
  for(const k of keys){
    const l = await safeGet(k, true);
    if(!l || isAutomatedLogEntry(l)) continue;
    if(new Date(l.createdAt) < monthAgo) continue;
    const member = l.actorName + ' (' + l.actorRole + ')';
    countsByMember[member] = (countsByMember[member] || 0) + 1;
  }
  const ranked = Object.entries(countsByMember).sort((a,b) => b[1] - a[1]);
  el.innerHTML = ranked.length === 0 ? '<div class="empty">Aucune action manuelle enregistrée ce mois-ci.</div>' : ranked.map(([member, count], i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
    '<span style="font-size:16px; font-family:\'Baloo 2\'; font-weight:700; width:26px;">'+(i===0?'🏅':i===1?'🥈':i===2?'🥉':(i+1)+'.')+'</span>' +
    '<span style="flex:1; font-size:13px;">'+escapeHtml(member)+'</span>' +
    '<span style="font-size:13px; color:var(--gold); font-weight:600;">'+count+' action(s)</span>' +
    '</div>'
  ).join('');
}
/* ---------- LITIGES & SIGNALEMENTS PAR RÉGION ---------- */
async function renderDisputesRegionMap(){
  const el = document.getElementById('disputes-region-list');
  if(!el) return;
  const [reports, users] = await Promise.all([fetchReports(), fetchUsers()]);
  const userCityMap = {};
  users.forEach(u => { if(u.city && u.city.trim()) userCityMap[u.username] = u.city + ', ' + (u.country || ''); });
  const regionCounts = {};
  reports.forEach(r => {
    const region = userCityMap[r.targetUser];
    if(!region) return;
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  });
  const rows = Object.entries(regionCounts).map(([region, count]) => ({ region, count })).sort((a,b) => b.count - a.count);
  if(rows.length === 0){ el.innerHTML = '<div class="empty">Aucun signalement rattaché à une ville renseignée pour l’instant.</div>'; return; }
  const maxCount = rows[0].count;
  el.innerHTML = rows.map(r =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<p style="margin:0 0 6px; font-size:13px; font-family:\'Baloo 2\'; font-weight:700;">'+escapeHtml(r.region)+'</p>' +
    '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; margin-bottom:6px; overflow:hidden;"><div style="background:var(--coral); height:100%; width:'+Math.round(r.count/maxCount*100)+'%;"></div></div>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">🚩 '+r.count+' signalement(s)</p>' +
    '</div>'
  ).join('');
}
async function renderRegionPresenceMap(){
  const el = document.getElementById('region-presence-list');
  if(!el) return;
  const [users, products, posts] = await Promise.all([fetchUsers(), fetchProducts(), fetchPosts()]);
  const usersWithCity = users.filter(u => u.city && u.city.trim());
  const sellersByUser = new Set(products.map(p => p.sellerUsername));
  const creatorsByUser = new Set(posts.map(p => p.userId));
  const regionMap = {};
  usersWithCity.forEach(u => {
    const key = u.city + ', ' + (u.country || '');
    if(!regionMap[key]) regionMap[key] = { region: key, users: 0, sellers: 0, creators: 0 };
    regionMap[key].users++;
    if(sellersByUser.has(u.username)) regionMap[key].sellers++;
    if(creatorsByUser.has(u.username)) regionMap[key].creators++;
  });
  const rows = Object.values(regionMap).sort((a,b) => b.users - a.users);
  if(rows.length === 0){ el.innerHTML = '<div class="empty">Aucune ville renseignée pour l’instant.</div>'; return; }
  const maxUsers = rows[0].users;
  el.innerHTML = rows.map(r =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<p style="margin:0 0 6px; font-size:13px; font-family:\'Baloo 2\'; font-weight:700;">'+escapeHtml(r.region)+'</p>' +
    '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; margin-bottom:6px; overflow:hidden;"><div style="background:var(--coral); height:100%; width:'+Math.round(r.users/maxUsers*100)+'%;"></div></div>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">👥 '+r.users+' utilisateur(s) · 🛍️ '+r.sellers+' vendeur(s) · 🎬 '+r.creators+' créateur(s)</p>' +
    '</div>'
  ).join('');
}
async function renderCountryComparison(){
  const el = document.getElementById('country-comparison-table');
  if(!el) return;
  const [users, orders, gifts, affiliateSales] = await Promise.all([fetchUsers(), fetchOrders(), fetchGifts(), fetchAffiliateSales()]);
  const now = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);
  const orderCountryById = {};
  orders.forEach(o => { orderCountryById[o.id] = o.country; });
  const countriesInUse = [...new Set(users.map(u => u.country).filter(Boolean))];
  const rows = countriesInUse.map(country => {
    const countryUsers = users.filter(u => u.country === country);
    const newUsersWeek = countryUsers.filter(u => new Date(u.createdAt) > weekAgo).length;
    const countryOrders = orders.filter(o => o.country === country);
    const revenue = countryOrders.reduce((s,o) => s + (o.total||0), 0);
    const countryGifts = gifts.filter(g => g.country === country);
    const giftRevenue = countryGifts.reduce((s,g) => s + (g.amount||0), 0);
    const affiliatePlatformRevenue = affiliateSales.filter(s => orderCountryById[s.orderId] === country).reduce((s,x) => s + (x.platformFeeAmount||0), 0);
    return {
      country, totalUsers: countryUsers.length, newUsersWeek,
      totalOrders: countryOrders.length, revenue, giftRevenue, affiliatePlatformRevenue,
      totalRevenue: revenue + giftRevenue
    };
  }).sort((a,b) => b.totalRevenue - a.totalRevenue);
  el.innerHTML = rows.length === 0 ? '<div class="empty">Aucun pays actif pour l’instant.</div>' : rows.map((r,i) =>
    '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 8px; font-size:14px; font-family:\'Baloo 2\'; font-weight:700;">'+(i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':'')+escapeHtml(r.country)+'</p>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px;">' +
    '<span>👥 '+r.totalUsers+' utilisateur(s)</span>' +
    '<span>🆕 +'+r.newUsersWeek+' cette semaine</span>' +
    '<span>🛍️ '+r.totalOrders+' commande(s)</span>' +
    '<span style="color:var(--gold); font-weight:600;">💰 '+r.totalRevenue.toLocaleString('fr-FR')+' FCFA</span>' +
    '</div>' +
    (r.affiliatePlatformRevenue > 0 ? '<p style="margin:6px 0 0; font-size:11px; color:var(--lagoon);">🤝 '+r.affiliatePlatformRevenue.toLocaleString('fr-FR')+' FCFA générés via les partenariats vendeur-créateur</p>' : '') +
    '</div>'
  ).join('');
}
/* ---------- EXPORT COMPLET DES DONNÉES ---------- */
function getExportPeriodCutoff(){
  const value = document.getElementById('export-period-select').value;
  if(value === 'all') return null;
  return new Date(Date.now() - parseInt(value, 10) * 24*60*60*1000);
}
async function downloadFullUsersExport(){
  const cutoff = getExportPeriodCutoff();
  let users = await fetchUsers();
  if(cutoff) users = users.filter(u => new Date(u.createdAt) > cutoff);
  if(users.length === 0){ showToast('Aucun utilisateur sur cette période'); return; }
  const header = ['Nom d’utilisateur', 'Pays', 'Ville', 'Statut', 'Abonnés', 'Formateur', 'Vendeur recommandé', 'Identité vérifiée', 'Date d’inscription'];
  const lines = [header.map(csvEscapeField).join(';')];
  users.forEach(u => {
    lines.push([
      u.username, u.country || '', u.city || '', u.status || 'active',
      (u.followers || []).length, u.isTrainer ? 'Oui' : 'Non',
      u.recommendedSeller ? 'Oui' : 'Non', u.identityVerified ? 'Oui' : 'Non',
      new Date(u.createdAt).toLocaleDateString('fr-FR')
    ].map(csvEscapeField).join(';'));
  });
  downloadCsvFile(lines, 'suktum-utilisateurs');
  await logAdminAction('Export complet des utilisateurs téléchargé', users.length + ' compte(s)');
}
async function downloadFullOrdersExport(){
  const cutoff = getExportPeriodCutoff();
  let orders = await fetchOrders();
  if(cutoff) orders = orders.filter(o => new Date(o.createdAt) > cutoff);
  if(orders.length === 0){ showToast('Aucune commande sur cette période'); return; }
  const header = ['Référence', 'Produit', 'Quantité', 'Total (FCFA)', 'Acheteur', 'Vendeur', 'Pays', 'Statut reversement', 'Date'];
  const lines = [header.map(csvEscapeField).join(';')];
  orders.forEach(o => {
    lines.push([
      o.id.slice(-8).toUpperCase(), o.productName, o.quantity, o.total,
      o.buyerUsername, o.sellerUsername || '', o.country || '',
      o.payoutStatus === 'paid' ? 'Reversé' : 'En attente',
      new Date(o.createdAt).toLocaleDateString('fr-FR')
    ].map(csvEscapeField).join(';'));
  });
  downloadCsvFile(lines, 'suktum-commandes');
  await logAdminAction('Export complet des commandes téléchargé', orders.length + ' commande(s)');
}
/* ---------- SAUVEGARDE COMPLÈTE DE LA BASE DE DONNÉES ---------- */
/* ---------- MES TÂCHES DE GESTION RÉCURRENTES (quotidienne/hebdomadaire/mensuelle) ---------- */
const DEFAULT_RECURRING_TASKS = [
  { id: 'check_reports', label: 'Vérifier les signalements en attente', frequency: 'daily' },
  { id: 'check_kyc', label: 'Valider les demandes KYC en attente', frequency: 'weekly' },
  { id: 'check_tickets', label: 'Répondre aux tickets de support', frequency: 'daily' },
  { id: 'check_payouts', label: 'Traiter les reversements vendeurs/formateurs', frequency: 'weekly' },
  { id: 'check_trainer_apps', label: 'Examiner les candidatures formateur', frequency: 'monthly' }
];
function getTaskPeriodKey(frequency, date){
  if(frequency === 'daily') return date.toISOString().slice(0,10);
  if(frequency === 'monthly') return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
  return getISOWeekKey(date);
}
async function fetchCustomRecurringTasks(){
  return (await safeGet('settings:customRecurringTasks', true)) || [];
}
async function createRecurringTask(){
  const titleInput = document.getElementById('new-recurring-task-title');
  const frequencySelect = document.getElementById('new-recurring-task-frequency');
  const label = titleInput.value.trim();
  if(!label){ showToast('Écrivez une tâche'); return; }
  const custom = await fetchCustomRecurringTasks();
  custom.push({ id: 'custom_' + Date.now(), label, frequency: frequencySelect.value });
  await saveWithRetry('settings:customRecurringTasks', custom, true);
  titleInput.value = '';
  await renderRecurringTasks();
}
async function deleteRecurringTask(taskId){
  let custom = await fetchCustomRecurringTasks();
  custom = custom.filter(t => t.id !== taskId);
  await saveWithRetry('settings:customRecurringTasks', custom, true);
  await renderRecurringTasks();
}
async function toggleRecurringTaskDone(taskId, frequency){
  const periodKey = getTaskPeriodKey(frequency, new Date());
  const doneKey = 'recurringtaskdone:' + periodKey + '__' + taskId;
  const currentlyDone = await safeGet(doneKey, true).catch(() => null);
  await saveWithRetry(doneKey, !currentlyDone, true);
  await renderRecurringTasks();
}
const FREQUENCY_LABELS = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle' };
async function renderRecurringTasks(){
  const el = document.getElementById('recurring-tasks-list');
  if(!el) return;
  const custom = await fetchCustomRecurringTasks();
  const allTasks = DEFAULT_RECURRING_TASKS.map(t => ({...t, isDefault: true})).concat(custom.map(t => ({...t, isDefault: false})));
  const rows = [];
  for(const task of allTasks){
    const periodKey = getTaskPeriodKey(task.frequency, new Date());
    const done = await safeGet('recurringtaskdone:' + periodKey + '__' + task.id, true).catch(() => null);
    rows.push(
      '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">' +
      '<input type="checkbox" '+(done ? 'checked' : '')+' onchange="toggleRecurringTaskDone(\''+task.id+'\', \''+task.frequency+'\')" style="width:auto;">' +
      '<div style="flex:1;"><span style="font-size:13px; '+(done ? 'text-decoration:line-through; color:rgba(245,239,227,0.4);' : '')+'">'+escapeHtml(task.label)+'</span>' +
      '<p style="margin:2px 0 0; font-size:10.5px; color:var(--gold);">'+FREQUENCY_LABELS[task.frequency]+'</p></div>' +
      (!task.isDefault ? '<span onclick="deleteRecurringTask(\''+task.id+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span>' : '') +
      '</div>'
    );
  }
  el.innerHTML = rows.join('');
}
async function downloadFullDatabaseBackup(){
  const statusEl = document.getElementById('backup-status');
  if(statusEl) statusEl.textContent = '⏳ Préparation de la sauvegarde — cela peut prendre un moment...';
  try{
    const listResult = await window.storage.list('', true);
    const keys = listResult ? listResult.keys : [];
    const backup = {};
    for(const key of keys){
      try{
        const result = await window.storage.get(key, true);
        backup[key] = result ? JSON.parse(result.value) : null;
      }catch(e){
        // Une entrée illisible ne doit jamais interrompre toute la sauvegarde — on l'ignore proprement.
      }
    }
    const payload = { exportedAt: new Date().toISOString(), keyCount: keys.length, data: backup };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'suktum-sauvegarde-complete-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if(statusEl) statusEl.textContent = '✓ Sauvegarde téléchargée — ' + keys.length + ' entrée(s) réelles incluses.';
    showToast('Sauvegarde complète téléchargée ✓');
    await logAdminAction('Sauvegarde complète de la base téléchargée', keys.length + ' entrée(s)');
  }catch(e){
    if(statusEl) statusEl.textContent = '✕ Sauvegarde indisponible pour le moment (' + e.message + ')';
  }
}
function downloadCsvFile(lines, filenamePrefix){
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenamePrefix + '-' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Export téléchargé ✓');
}
/* ---------- ALERTE POUR ÉVÉNEMENTS IMPORTANTS ---------- */
async function getBigOrderThreshold(){
  const value = await safeGet('settings:bigOrderThreshold', true);
  return (typeof value === 'number') ? value : 50000;
}
async function saveBigOrderThreshold(){
  const value = parseInt(document.getElementById('big-order-threshold-input').value, 10);
  if(isNaN(value) || value <= 0){ showToast('Entrez un montant valide'); return; }
  await saveWithRetry('settings:bigOrderThreshold', value, true);
  showToast('Seuil enregistré ✓ (' + value.toLocaleString('fr-FR') + ' FCFA)');
}
async function loadBigOrderThresholdAdmin(){
  const input = document.getElementById('big-order-threshold-input');
  if(!input) return;
  input.value = await getBigOrderThreshold();
}
/* ---------- RÔLES AVEC PERMISSIONS PERSONNALISÉES ---------- */
const ALL_ADMIN_DOMAINS = { moderation: '🛡️ Modération', marketplace: '🏪 Marketplace', lives: '🔴 Lives', education: '🎓 Éducation', ads: '📢 Publicités', support: '🎫 Support' };
function renderCustomRoleDomainCheckboxes(){
  const el = document.getElementById('new-custom-role-domain-checkboxes');
  if(!el) return;
  el.innerHTML = Object.entries(ALL_ADMIN_DOMAINS).map(([key, label]) =>
    '<div style="display:flex; align-items:center; gap:8px; padding:3px 0;"><input type="checkbox" class="custom-role-domain-checkbox" value="'+key+'" style="width:auto;"><label style="margin:0; font-size:12.5px;">'+label+'</label></div>'
  ).join('');
}
async function fetchCustomRoles(){
  return (await safeGet('settings:customroles', true)) || [];
}
async function createCustomRole(){
  const name = document.getElementById('new-custom-role-name').value.trim();
  const pin = document.getElementById('new-custom-role-pin').value;
  const domains = Array.from(document.querySelectorAll('.custom-role-domain-checkbox:checked')).map(cb => cb.value);
  if(!name || !pin){ showToast('Renseignez un nom et un mot de passe'); return; }
  if(domains.length === 0){ showToast('Cochez au moins un domaine'); return; }
  const roles = await fetchCustomRoles();
  roles.push({ id: 'role_' + Date.now(), name, pinHash: await sha256Hex(pin), domains });
  await saveWithRetry('settings:customroles', roles, true);
  document.getElementById('new-custom-role-name').value = '';
  document.getElementById('new-custom-role-pin').value = '';
  document.querySelectorAll('.custom-role-domain-checkbox').forEach(cb => cb.checked = false);
  showToast('Rôle créé ✓');
  await logAdminAction('Rôle personnalisé créé', name + ' (' + domains.join(', ') + ')');
  await renderCustomRolesList();
}
async function deleteCustomRole(roleId){
  let roles = await fetchCustomRoles();
  const removed = roles.find(r => r.id === roleId);
  roles = roles.filter(r => r.id !== roleId);
  await saveWithRetry('settings:customroles', roles, true);
  showToast('Rôle supprimé');
  if(removed) await logAdminAction('Rôle personnalisé supprimé', removed.name);
  await renderCustomRolesList();
}
async function renderCustomRolesList(){
  const el = document.getElementById('custom-roles-list');
  if(!el) return;
  renderCustomRoleDomainCheckboxes();
  const roles = await fetchCustomRoles();
  el.innerHTML = roles.length === 0 ? '<div class="empty">Aucun rôle personnalisé pour l’instant.</div>' : roles.map(r =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(r.name)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">'+r.domains.map(d => ALL_ADMIN_DOMAINS[d] || d).join(', ')+'</p></div>' +
    '<span onclick="deleteCustomRole(\''+r.id+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span>' +
    '</div>'
  ).join('');
}
/* ---------- POSTE DE COMMANDEMENT (vue unique centralisée) ---------- */
async function renderCommandCenter(){
  const [users, orders, gifts, lives, reports, kycPending, allTickets, affiliateSales] = await Promise.all([
    fetchUsers(), fetchOrders(), fetchGifts(), fetchLives(), fetchReports(), fetchPendingKycRequests(), fetchTickets(), fetchAffiliateSales()
  ]);
  const scopedOrders = adminScope === 'all' ? orders : orders.filter(o => o.country === adminScope);
  const scopedUsers = adminScope === 'all' ? users : users.filter(u => u.country === adminScope);
  const now = new Date();
  const todayOrders = scopedOrders.filter(o => (now - new Date(o.createdAt)) < 24*60*60*1000);
  const todayRevenue = todayOrders.reduce((s,o) => s + (o.total||0), 0);
  const todayGifts = (adminScope === 'all' ? gifts : gifts.filter(g => g.country === adminScope)).filter(g => (now - new Date(g.createdAt)) < 24*60*60*1000);
  const todayGiftRevenue = todayGifts.reduce((s,g) => s + (g.amount||0), 0);
  const todayNewUsers = scopedUsers.filter(u => (now - new Date(u.createdAt)) < 24*60*60*1000).length;
  const activeLives = (adminScope === 'all' ? lives : lives.filter(l => l.country === adminScope)).filter(l => l.status === 'approved').length;

  document.getElementById('command-center-stats').innerHTML =
    '<div class="card" style="text-align:center;"><p style="margin:0; font-size:20px; font-weight:700; color:var(--gold);">'+(todayRevenue+todayGiftRevenue).toLocaleString('fr-FR')+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">FCFA de revenu</p></div>' +
    '<div class="card" style="text-align:center;"><p style="margin:0; font-size:20px; font-weight:700;">'+todayOrders.length+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">Commandes</p></div>' +
    '<div class="card" style="text-align:center;"><p style="margin:0; font-size:20px; font-weight:700;">+'+todayNewUsers+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">Nouveaux comptes</p></div>' +
    '<div class="card" style="text-align:center;"><p style="margin:0; font-size:20px; font-weight:700; color:var(--coral);">'+activeLives+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">Lives actifs</p></div>';

  const scopedReports = (adminScope === 'all' ? reports : reports.filter(r => scopedUsers.some(u => u.username === r.targetUser))).filter(r => r.status === 'pending');
  const realTickets = allTickets.filter(t => t.subject !== undefined && t.status !== 'closed');
  const scopedTickets = adminScope === 'all' ? realTickets : realTickets.filter(t => t.country === adminScope);
  const unpaidBalance = scopedOrders.filter(o => o.sellerUsername && o.payoutStatus !== 'paid' && o.netAmount).reduce((s,o) => s + o.netAmount, 0);

  const pendingItems = [
    { count: scopedReports.length, label: 'Signalement(s) en attente', screen: 'admin' },
    { count: kycPending.length, label: 'Demande(s) KYC en attente', screen: 'admin' },
    { count: scopedTickets.length, label: 'Ticket(s) de support ouvert(s)', screen: 'admin' },
    { count: unpaidBalance > 0 ? 1 : 0, label: unpaidBalance.toLocaleString('fr-FR') + ' FCFA à reverser aux vendeurs', screen: 'admin' }
  ].filter(item => item.count > 0);
  document.getElementById('command-center-pending').innerHTML = pendingItems.length === 0
    ? '<div class="empty">✓ Rien n’attend votre attention pour l’instant.</div>'
    : pendingItems.map(item => '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:6px;" onclick="go(\''+item.screen+'\')"><span style="font-size:16px; font-family:\'Baloo 2\'; font-weight:700; color:var(--coral); width:26px;">'+item.count+'</span><span style="flex:1; font-size:13px;">'+item.label+'</span></div>').join('');

  const alertsEl = document.getElementById('command-center-alerts');
  const importantAlerts = await fetchImportantAlerts();
  const unseenAlerts = importantAlerts.filter(a => !a.seen);
  alertsEl.innerHTML = unseenAlerts.length === 0 ? '' : '<button class="btn btn-primary btn-sm" style="width:100%; margin-bottom:16px; background:var(--coral);" onclick="go(\'important-alerts\')">🚨 '+unseenAlerts.length+' alerte(s) importante(s) non consultée(s)</button>';

  const custom = await fetchCustomRecurringTasks();
  const dailyTasks = DEFAULT_RECURRING_TASKS.concat(custom).filter(t => t.frequency === 'daily');
  const todayKey = getTaskPeriodKey('daily', now);
  let doneCount = 0;
  for(const task of dailyTasks){
    const done = await safeGet('recurringtaskdone:' + todayKey + '__' + task.id, true).catch(() => null);
    if(done) doneCount++;
  }
  document.getElementById('command-center-tasks').innerHTML = dailyTasks.length === 0
    ? '<div class="empty">Aucune tâche quotidienne configurée.</div>'
    : '<div class="card" style="cursor:pointer;" onclick="go(\'recurring-tasks\')"><p style="margin:0; font-size:13px;">'+doneCount+' / '+dailyTasks.length+' tâches quotidiennes faites</p></div>';
}
async function checkBigOrderAlert(orderId, total, productName, buyerUsername){
  const threshold = await getBigOrderThreshold();
  if(total < threshold) return;
  const id = 'importantalert_' + Date.now();
  await saveWithRetry('importantalert:' + id, {
    id, type: 'big_order', orderId, amount: total, productName, buyerUsername,
    seen: false, createdAt: new Date().toISOString()
  }, true);
}
async function fetchImportantAlerts(){
  const keys = await safeList('importantalert:', true);
  const alerts = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a) alerts.push(a); }
  alerts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return alerts;
}
async function renderModerationPendingBadge(){
  const el = document.getElementById('moderation-pending-badge');
  if(!el) return;
  const reports = await fetchReports();
  const pendingAccountReports = reports.filter(r => r.status === 'pending' && r.type === 'account').length;
  const pendingPencReportKeys = await safeList('pencreport:', true);
  let pendingPencReports = 0;
  for(const k of pendingPencReportKeys){ const r = await safeGet(k, true); if(r && r.status === 'pending') pendingPencReports++; }
  const suspensionAppealKeys = await safeList('suspensionappeal:', true);
  let pendingSuspensionAppeals = 0;
  for(const k of suspensionAppealKeys){ const a = await safeGet(k, true); if(a && a.status === 'pending') pendingSuspensionAppeals++; }
  const banAppealKeys = await safeList('banappeal:', true);
  let pendingBanAppeals = 0;
  for(const k of banAppealKeys){ const a = await safeGet(k, true); if(a && a.status === 'pending') pendingBanAppeals++; }
  const fundDisputeKeys = await safeList('creatorfundpayout:', true);
  let pendingFundDisputes = 0;
  for(const k of fundDisputeKeys){ const p = await safeGet(k, true); if(p && p.disputeStatus === 'pending') pendingFundDisputes++; }
  const total = pendingAccountReports + pendingPencReports + pendingSuspensionAppeals + pendingBanAppeals + pendingFundDisputes;
  if(total === 0){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<div class="card" style="border-color:var(--gold);"><p style="margin:0; font-size:12.5px;">⏳ <strong>'+total+'</strong> élément(s) en attente d’examen : '+
    [pendingAccountReports && pendingAccountReports+' compte(s) signalé(s)', pendingPencReports && pendingPencReports+' Penc signalé(s)', pendingSuspensionAppeals && pendingSuspensionAppeals+' contestation(s) de suspension', pendingBanAppeals && pendingBanAppeals+' contestation(s) de bannissement', pendingFundDisputes && pendingFundDisputes+' contestation(s) de fonds créateur']
      .filter(Boolean).join(', ') + '</p></div>';
}
async function renderImportantAlertsBadge(){
  const el = document.getElementById('important-alerts-badge');
  if(!el) return;
  const alerts = await fetchImportantAlerts();
  const unseenCount = alerts.filter(a => !a.seen).length;
  if(unseenCount === 0){ el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<button class="btn btn-primary btn-sm" style="width:100%; background:var(--coral);" onclick="go(\'important-alerts\')">🚨 '+unseenCount+' alerte(s) importante(s) non consultée(s)</button>';
}
async function markAlertSeen(alertId){
  const a = await safeGet('importantalert:' + alertId, true);
  if(!a) return;
  a.seen = true;
  await saveWithRetry('importantalert:' + alertId, a, true);
  await renderImportantAlerts();
  await renderImportantAlertsBadge();
}
async function renderImportantAlerts(){
  const el = document.getElementById('important-alerts-list');
  if(!el) return;
  const alerts = await fetchImportantAlerts();
  el.innerHTML = alerts.length === 0 ? '<div class="empty">Aucune alerte importante pour l’instant.</div>' : alerts.map(a =>
    '<div class="card" style="margin-bottom:8px;'+(a.seen ? '' : ' border-color:var(--coral);')+'">' +
    '<p style="margin:0 0 4px; font-size:13px; '+(a.seen ? 'color:rgba(245,239,227,0.5);' : 'color:var(--coral); font-weight:600;')+'">🛍️ Grosse commande — '+a.amount.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0 0 8px; font-size:12px;">« '+escapeHtml(a.productName)+' » commandée par @'+escapeHtml(a.buyerUsername)+' · '+new Date(a.createdAt).toLocaleString('fr-FR')+'</p>' +
    (!a.seen ? '<button class="btn btn-outline btn-sm" onclick="markAlertSeen(\''+a.id+'\')">✓ Marquer comme consultée</button>' : '') +
    '</div>'
  ).join('');
}
async function fetchAllActivityEvents(){
  const [users, posts, orders, lives, gifts] = await Promise.all([
    fetchUsers(), fetchPosts(), fetchOrders(), fetchLives(), fetchGifts()
  ]);
  const events = [];
  users.forEach(u => events.push({ type: 'signup', label: 'Nouveau compte @'+u.username, createdAt: u.createdAt, icon: '🆕', country: u.country }));
  posts.forEach(p => events.push({ type: 'post', label: '@'+p.userId+' a publié'+(p.caption ? ' : « '+p.caption.slice(0,40)+(p.caption.length>40?'...':'')+' »' : ''), createdAt: p.createdAt, icon: p.type === 'video' ? '🎬' : '🖼️', country: p.country }));
  orders.forEach(o => events.push({ type: 'order', label: '@'+o.buyerUsername+' a commandé « '+o.productName+' » ('+o.total.toLocaleString('fr-FR')+' FCFA)', createdAt: o.createdAt, icon: '🛍️', country: o.country }));
  lives.forEach(l => events.push({ type: 'live', label: '@'+l.username+' a démarré un live', createdAt: l.createdAt, icon: '🔴', country: l.country }));
  gifts.forEach(g => events.push({ type: 'gift', label: '@'+g.fromUser+' a envoyé '+g.amount.toLocaleString('fr-FR')+' FCFA à @'+g.toUser, createdAt: g.createdAt, icon: '🎁', country: g.country }));
  const scoped = adminScope === 'all' ? events : events.filter(e => e.country === adminScope);
  scoped.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return scoped;
}
function setLiveActivityFilter(type){
  liveActivityTypeFilter = type;
  renderLiveActivityFeed();
}
async function renderLiveActivityFeed(){
  const events = await fetchAllActivityEvents();
  const now = new Date();
  const todayEvents = events.filter(e => (now - new Date(e.createdAt)) < 24*60*60*1000);
  const statsEl = document.getElementById('live-activity-stats-grid');
  if(statsEl){
    statsEl.innerHTML = ACTIVITY_TYPES.map(t => {
      const count = todayEvents.filter(e => e.type === t.key).length;
      return '<div class="card" style="text-align:center;"><p style="margin:0; font-size:18px; font-weight:700;">'+count+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5);">'+t.icon+' '+t.label+' aujourd’hui</p></div>';
    }).join('');
  }
  const filtersEl = document.getElementById('live-activity-type-filters');
  if(filtersEl){
    filtersEl.innerHTML = '<button onclick="setLiveActivityFilter(\'all\')" style="flex-shrink:0; border:1px solid var(--line); border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(liveActivityTypeFilter==='all'?'var(--coral)':'transparent')+'; color:'+(liveActivityTypeFilter==='all'?'var(--night)':'var(--cream)')+';">Tout</button>' +
      ACTIVITY_TYPES.map(t => '<button onclick="setLiveActivityFilter(\''+t.key+'\')" style="flex-shrink:0; margin-left:6px; border:1px solid var(--line); border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600; background:'+(liveActivityTypeFilter===t.key?'var(--coral)':'transparent')+'; color:'+(liveActivityTypeFilter===t.key?'var(--night)':'var(--cream)')+';">'+t.icon+' '+t.label+'</button>').join('');
  }
  const timelineEl = document.getElementById('live-activity-timeline');
  if(timelineEl){
    const filtered = liveActivityTypeFilter === 'all' ? events : events.filter(e => e.type === liveActivityTypeFilter);
    const visible = filtered.slice(0, 60);
    timelineEl.innerHTML = visible.length === 0 ? '<div class="empty">Aucune activité pour l’instant.</div>' : visible.map(e =>
      '<div class="card" style="padding:9px 13px; margin-bottom:6px; display:flex; gap:8px;"><span style="font-size:15px;">'+e.icon+'</span><div style="flex:1;"><p style="margin:0; font-size:12.5px;">'+escapeHtml(e.label)+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+new Date(e.createdAt).toLocaleString('fr-FR')+'</p></div></div>'
    ).join('');
  }
  const scopeIndicator = document.getElementById('live-activity-scope-indicator');
  if(scopeIndicator) scopeIndicator.textContent = adminScope === 'all' ? '🌍 Vue complète — tous pays, national et international' : '📍 Vue limitée à votre pays : ' + adminScope;
  const indicator = document.getElementById('live-activity-refresh-indicator');
  if(indicator) indicator.textContent = 'Actualisé à ' + now.toLocaleTimeString('fr-FR');
}
/* ---------- MODE MAINTENANCE ---------- */
async function checkMaintenanceMode(screen){
  const overlay = document.getElementById('maintenance-mode-overlay');
  if(!overlay) return;
  if(isGenuineOwnerSession || screen === 'admin-login'){
    overlay.style.display = 'none';
    return;
  }
  const maintenance = await safeGet('settings:maintenanceMode', true).catch(() => null);
  if(maintenance && maintenance.enabled){
    document.getElementById('maintenance-mode-message').textContent = maintenance.message || 'Suktum revient très bientôt — merci de votre patience.';
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
}
async function toggleMaintenanceMode(){
  const enabled = document.getElementById('maintenance-mode-toggle').checked;
  const message = document.getElementById('maintenance-mode-text').value.trim();
  await saveWithRetry('settings:maintenanceMode', { enabled, message }, true);
  showToast(enabled ? 'Mode maintenance activé ✓' : 'Mode maintenance désactivé ✓');
  await logAdminAction(enabled ? 'Mode maintenance activé' : 'Mode maintenance désactivé', message || '');
}
async function loadMaintenanceModeAdmin(){
  const toggle = document.getElementById('maintenance-mode-toggle');
  const textInput = document.getElementById('maintenance-mode-text');
  if(!toggle) return;
  const maintenance = await safeGet('settings:maintenanceMode', true);
  toggle.checked = !!(maintenance && maintenance.enabled);
  textInput.value = (maintenance && maintenance.message) || '';
}
async function renderCommissionHistory(){
  const el = document.getElementById('commission-history-list');
  if(!el) return;
  const keys = await safeList('commissionhistory:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) logs.push(l); }
  logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = logs.length === 0 ? '<div class="empty">Aucun changement enregistré pour l’instant.</div>' : logs.map(l =>
    '<div class="card" style="padding:9px 13px; margin-bottom:6px;"><p style="margin:0; font-size:12.5px;"><strong>'+escapeHtml(l.label)+'</strong> : '+l.oldValue+'% → '+l.newValue+'%</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">Par '+escapeHtml(l.changedBy)+' · '+new Date(l.createdAt).toLocaleString('fr-FR')+'</p></div>'
  ).join('');
}
async function renderAdminLoginLog(){
  const el = document.getElementById('admin-login-log-list');
  if(!el) return;
  if(!isGenuineOwnerSession){
    el.innerHTML = '<div class="empty">Réservé au propriétaire.</div>';
    return;
  }
  const keys = await safeList('adminloginlog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) logs.push(l); }
  logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = logs.length === 0 ? '<div class="empty">Aucune connexion enregistrée pour l’instant.</div>' : logs.slice(0, 60).map(l =>
    '<div class="card" style="padding:9px 13px; margin-bottom:6px;"><p style="margin:0; font-size:12.5px;"><strong>'+escapeHtml(l.name)+'</strong> — '+escapeHtml(l.role)+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+new Date(l.createdAt).toLocaleString('fr-FR')+'</p></div>'
  ).join('');
}
async function renderAutomationControlCenter(){
  const automated = await fetchAutomatedLogEntries();
  const now = new Date();
  const todayCount = automated.filter(l => (now - new Date(l.createdAt)) < 24*60*60*1000).length;
  const weekCount = automated.filter(l => (now - new Date(l.createdAt)) < 7*24*60*60*1000).length;
  const statsEl = document.getElementById('automation-stats-grid');
  if(statsEl){
    statsEl.innerHTML =
      '<div class="card" style="text-align:center;"><p style="margin:0; font-size:22px; font-weight:700; color:var(--gold);">'+todayCount+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">Aujourd’hui</p></div>' +
      '<div class="card" style="text-align:center;"><p style="margin:0; font-size:22px; font-weight:700; color:var(--lagoon);">'+weekCount+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">Cette semaine</p></div>' +
      '<div class="card" style="text-align:center; grid-column:1/-1;"><p style="margin:0; font-size:22px; font-weight:700;">'+automated.length+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">Total depuis le début</p></div>';
  }
  const breakdownEl = document.getElementById('automation-category-breakdown');
  if(breakdownEl){
    const counts = AUTOMATION_CATEGORIES.map(cat => ({ label: cat.label, count: automated.filter(l => cat.match(l.action)).length }));
    breakdownEl.innerHTML = counts.every(c => c.count === 0)
      ? '<div class="empty">Aucune automatisation active pour l’instant.</div>'
      : counts.filter(c => c.count > 0).map(c => '<div class="card" style="display:flex; justify-content:space-between; padding:9px 13px; margin-bottom:6px;"><span style="font-size:12.5px;">'+c.label+'</span><span style="font-size:12.5px; color:var(--gold); font-weight:600;">'+c.count+'</span></div>').join('');
  }
  const feedEl = document.getElementById('automation-recent-feed');
  if(feedEl){
    const recent = automated.slice(0, 20);
    feedEl.innerHTML = recent.length === 0 ? '<div class="empty">Rien à afficher pour l’instant.</div>' : recent.map(l =>
      '<div class="card" style="padding:9px 13px; margin-bottom:6px;"><p style="margin:0; font-size:12.5px;">'+escapeHtml(l.action)+'</p>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+escapeHtml(l.detail||'')+' · '+new Date(l.createdAt).toLocaleString('fr-FR')+'</p></div>'
    ).join('');
  }
}
async function loadAuditLog(){
  const el = document.getElementById('admin-audit-log');
  if(!el) return;
  const keys = await safeList('auditlog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true); if(l) logs.push(l); }
  logs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = logs.slice(0, 40);
  if(recent.length === 0){ el.innerHTML = '<div class="empty">Aucune action enregistrée pour l’instant.</div>'; return; }
  el.innerHTML = recent.map(l =>
    '<div class="card" style="padding:9px 13px;">' +
    '<p style="margin:0; font-size:12.5px;"><strong>'+escapeHtml(l.actorName)+'</strong> <span style="color:rgba(245,239,227,0.5);">('+escapeHtml(l.actorRole)+')</span> — '+escapeHtml(l.action)+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+escapeHtml(l.detail||'')+' · '+new Date(l.createdAt).toLocaleString('fr-FR')+'</p>' +
    '</div>'
  ).join('');
}
let currentAdminPasswordHash = null;
let isPayoutSpecialist = false;
let currentAdminDomain = 'general';
let dailySummaryGeneratedThisSession = false;
let currentPayoutSpecialistName = null;
async function checkAdminPin(){
  const input = document.getElementById('admin-pin-input');
  const pw = input.value;
  if(input.dataset.mode === 'create'){
    const {strong} = checkPasswordStrength(pw);
    if(!strong){ showToast('Le mot de passe ne respecte pas encore toutes les règles'); return; }
    const hash = await sha256Hex(pw);
    await saveWithRetry('settings:adminpin_hash', hash, true);
    adminScope = 'all';
    isModerator = false;
    currentAdminDomain = 'general';
    currentAdminName = 'Propriétaire';
    currentAdminPasswordHash = hash;
    isGenuineOwnerSession = true;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('Propriétaire (création)');
    showToast('Mot de passe créé ✓');
    go('admin');
    return;
  }
  if(!pw){ showToast('Entrez votre mot de passe'); return; }
  const storedHash = await safeGet('settings:adminpin_hash', true);
  const hash = await sha256Hex(pw);
  if(hash === storedHash){
    adminScope = 'all';
    isModerator = false;
    currentAdminDomain = 'general';
    currentAdminName = 'Propriétaire';
    currentAdminPasswordHash = hash;
    isGenuineOwnerSession = true;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('Propriétaire');
    go('admin');
    return;
  }
  const backupCodes = (await safeGet('settings:admin_backup_codes', true)) || [];
  const codeMatchIdx = backupCodes.findIndex(c => c.hash === hash && !c.used);
  if(codeMatchIdx !== -1){
    backupCodes[codeMatchIdx].used = true;
    await saveWithRetry('settings:admin_backup_codes', backupCodes, true);
    adminScope = 'all';
    isModerator = false;
    currentAdminDomain = 'general';
    currentAdminName = 'Propriétaire';
    currentAdminPasswordHash = storedHash;
    isGenuineOwnerSession = true;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('Propriétaire (code de secours)');
    showToast('Connecté avec un code de secours — pensez à changer votre mot de passe');
    go('admin');
    return;
  }
  const regionalAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  const regionalMatch = regionalAdmins.find(a => a.pinHash === hash);
  if(regionalMatch){
    if(!regionalMatch.active && regionalMatch.active !== undefined){ showToast('Cet accès a été désactivé par le propriétaire'); return; }
    const regionalIndex = regionalAdmins.indexOf(regionalMatch);
    adminScope = regionalMatch.country;
    isModerator = false;
    currentAdminName = regionalMatch.name;
    currentAdminPasswordHash = hash;
    currentAdminDomain = regionalMatch.domain || 'general';
    isGenuineOwnerSession = false;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('DG — ' + adminScope);
    if(regionalMatch.mustChangePassword) await enforceFirstLoginPasswordChange('settings:regionaladmins', regionalIndex, 'index', regionalMatch.name);
    go('admin');
    return;
  }
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const modMatch = moderators.find(m => m.pinHash === hash);
  if(modMatch){
    if(!modMatch.active && modMatch.active !== undefined){ showToast('Cet accès a été désactivé par le propriétaire'); return; }
    if(modMatch.expiresAt && new Date(modMatch.expiresAt) <= new Date()){ showToast('Cet accès temporaire a expiré'); return; }
    const modIndex = moderators.indexOf(modMatch);
    adminScope = modMatch.country || 'all';
    isModerator = true;
    currentAdminDomain = modMatch.restrictedDomain || 'moderation';
    currentAdminName = modMatch.name;
    currentAdminPasswordHash = hash;
    isGenuineOwnerSession = false;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('Modérateur');
    if(modMatch.mustChangePassword) await enforceFirstLoginPasswordChange('settings:moderators', modIndex, 'index', modMatch.name);
    go('admin');
    return;
  }
  const payoutSpecialists = (await safeGet('settings:payoutspecialists', true)) || [];
  const payoutMatch = payoutSpecialists.find(s => s.pinHash === hash);
  if(payoutMatch){
    if(!payoutMatch.active){ showToast('Cet accès a été désactivé par le propriétaire'); return; }
    isPayoutSpecialist = true;
    isModerator = false;
    adminScope = 'all';
    isGenuineOwnerSession = false;
    currentCustomRoleDomains = null;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    currentAdminName = payoutMatch.name;
    currentPayoutSpecialistName = payoutMatch.name;
    currentAdminPasswordHash = hash;
    document.getElementById('payout-specialist-name').textContent = payoutMatch.name;
    await logAdminLogin('Spécialiste reversements');
    go('payout-specialist');
    await renderPayoutSpecialistList();
    await renderCoinWithdrawalSpecialistList();
    return;
  }
  const customRoles = (await safeGet('settings:customroles', true)) || [];
  const customRoleMatch = customRoles.find(r => r.pinHash === hash);
  if(customRoleMatch){
    adminScope = 'all';
    isModerator = false;
    isPayoutSpecialist = false;
    isGenuineOwnerSession = false;
    currentAdminName = customRoleMatch.name;
    currentAdminDomain = 'general';
    currentCustomRoleDomains = customRoleMatch.domains;
    currentAdminPasswordHash = hash;
    isTechTeamMember = false;
    document.body.classList.remove('techteam-mode');
    currentTechTeamName = null;
    await logAdminLogin('Rôle personnalisé — ' + customRoleMatch.name);
    go('admin');
    return;
  }
  const techTeamMembers = (await safeGet('settings:techteammembers', true)) || [];
  const techTeamMatch = techTeamMembers.find(m => m.pinHash === hash);
  if(techTeamMatch){
    if(!techTeamMatch.active && techTeamMatch.active !== undefined){ showToast('Cet accès a été désactivé par le propriétaire'); return; }
    isTechTeamMember = true;
    currentTechTeamName = techTeamMatch.name;
    currentAdminName = techTeamMatch.name;
    currentAdminPasswordHash = hash;
    isGenuineOwnerSession = false;
    currentCustomRoleDomains = null;
    document.body.classList.add('techteam-mode');
    await logAdminLogin('Équipe technique — ' + techTeamMatch.name);
    if(techTeamMatch.mustChangePassword) await enforceFirstLoginPasswordChange('settings:techteammembers', techTeamMatch.name, 'name', techTeamMatch.name);
    go('techteam-home');
    return;
  }
  await logFailedAdminAccessAttempt();
  showToast('Mot de passe incorrect');
}
async function logFailedAdminAccessAttempt(){
  const id = 'failedaccess_' + Date.now();
  await saveWithRetry('failedaccessattempt:' + id, { createdAt: new Date().toISOString() }, true).catch(() => {});
  const keys = await safeList('failedaccessattempt:', true);
  const attempts = [];
  for(const k of keys){ const a = await safeGet(k, true).catch(() => null); if(a) attempts.push(a); }
  const oneHourAgo = Date.now() - 60*60*1000;
  const recentCount = attempts.filter(a => new Date(a.createdAt).getTime() >= oneHourAgo).length;
  if(recentCount >= 5){
    const existing = await safeGet('settings:criticalAlertUnauthorizedAccess', true);
    if(!existing || new Date(existing.createdAt).getTime() < oneHourAgo){
      await saveWithRetry('settings:criticalAlertUnauthorizedAccess', { count: recentCount, createdAt: new Date().toISOString() }, true);
    }
  }
}
function updateAdminNewPasswordStrength(){
  const pw = document.getElementById('admin-new-pin').value;
  const el = document.getElementById('admin-new-password-strength');
  if(!pw){ el.textContent = ''; return; }
  const r = renderPasswordStrengthLabel(pw);
  el.style.color = r.color;
  el.textContent = r.text;
}
async function changeAdminPin(){
  const newPw = document.getElementById('admin-new-pin').value;
  const {strong} = checkPasswordStrength(newPw);
  if(!strong){ showToast('Le nouveau mot de passe ne respecte pas encore toutes les règles'); return; }
  const hash = await sha256Hex(newPw);
  await saveWithRetry('settings:adminpin_hash', hash, true);
  currentAdminPasswordHash = hash;
  document.getElementById('admin-new-pin').value = '';
  showToast('Mot de passe d’administration changé ✓');
}
function generateRandomBackupCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i = 0; i < 10; i++){
    if(i === 5) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
async function generateBackupCodes(){
  const ok = confirm('Générer de nouveaux codes de secours annulera les anciens. Continuer ?');
  if(!ok) return;
  const codes = [];
  for(let i = 0; i < 8; i++) codes.push(generateRandomBackupCode());
  const hashedCodes = [];
  for(const c of codes) hashedCodes.push({ hash: await sha256Hex(c), used: false });
  await saveWithRetry('settings:admin_backup_codes', hashedCodes, true);
  const displayEl = document.getElementById('backup-codes-display');
  displayEl.style.display = 'block';
  displayEl.innerHTML = '<div class="card" style="border-color:var(--gold);"><p style="margin:0 0 8px; font-size:12px; color:var(--coral);">⚠️ Notez-les maintenant, dans un endroit sûr — ils ne seront plus jamais réaffichés ainsi.</p>' +
    codes.map(c => '<p style="margin:2px 0; font-family:monospace; font-size:14px; letter-spacing:.05em;">'+c+'</p>').join('') + '</div>';
  document.getElementById('backup-codes-status').textContent = '8 codes générés — chacun utilisable une seule fois.';
  showToast('Codes de secours générés ✓');
  await logAdminAction('Codes de secours régénérés', '');
}
async function loadBackupCodesStatus(){
  const el = document.getElementById('backup-codes-status');
  if(!el) return;
  const codes = await safeGet('settings:admin_backup_codes', true);
  if(!codes || codes.length === 0){ el.textContent = 'Aucun code de secours généré pour l’instant.'; return; }
  const remaining = codes.filter(c => !c.used).length;
  el.textContent = remaining + ' code(s) encore valide(s) sur ' + codes.length + '.';
}
async function verifyCurrentAdminSessionStillValid(){
  if(!currentAdminPasswordHash) return true;
  try{
    if(isTechTeamMember){
      const r = await window.storage.get('settings:techteammembers', true);
      const members = r ? JSON.parse(r.value) : [];
      const match = members.find(m => m.pinHash === currentAdminPasswordHash);
      if(match && match.active !== false) return true;
    } else if(currentCustomRoleDomains){
      const r = await window.storage.get('settings:customroles', true);
      const roles = r ? JSON.parse(r.value) : [];
      const match = roles.find(role => role.pinHash === currentAdminPasswordHash);
      if(match) return true;
    } else if(isPayoutSpecialist){
      const r = await window.storage.get('settings:payoutspecialists', true);
      const specialists = r ? JSON.parse(r.value) : [];
      const match = specialists.find(s => s.pinHash === currentAdminPasswordHash);
      if(match && match.active) return true;
    } else if(adminScope === 'all' && !isModerator){
      const r = await window.storage.get('settings:adminpin_hash', true);
      const storedHash = r ? JSON.parse(r.value) : null;
      if(storedHash === currentAdminPasswordHash) return true;
    } else if(isModerator){
      const r = await window.storage.get('settings:moderators', true);
      const moderators = r ? JSON.parse(r.value) : [];
      const match = moderators.find(m => m.pinHash === currentAdminPasswordHash);
      if(match && match.active !== false && (!match.expiresAt || new Date(match.expiresAt) > new Date())) return true;
    } else {
      const r = await window.storage.get('settings:regionaladmins', true);
      const regionalAdmins = r ? JSON.parse(r.value) : [];
      const match = regionalAdmins.find(a => a.pinHash === currentAdminPasswordHash);
      if(match && match.active !== false) return true;
    }
  } catch(e){
    // Lecture indisponible (réseau, latence...) — on ne révoque jamais sur un simple doute,
    // on garde la session active plutôt que d'éjecter quelqu'un à tort.
    return true;
  }
  adminScope = 'all';
  isModerator = false;
  isPayoutSpecialist = false;
  currentAdminName = 'Propriétaire';
  currentAdminPasswordHash = null;
  isGenuineOwnerSession = false;
  currentCustomRoleDomains = null;
  isTechTeamMember = false;
  document.body.classList.remove('techteam-mode');
  currentTechTeamName = null;
  showToast('Votre accès administrateur a été révoqué');
  go('profile');
  return false;
}
async function loadEducationOverview(){
  const el = document.getElementById('education-overview-card');
  if(!el) return;
  const allUsers = await fetchUsers();
  let trainers = allUsers.filter(u => u.isTrainer);
  if(adminScope !== 'all') trainers = trainers.filter(u => u.country === adminScope);

  let allCourses = await fetchCourses(true);
  if(adminScope !== 'all') allCourses = allCourses.filter(c => c.country === adminScope);
  const activeCourses = allCourses.filter(c => c.status === 'active');

  const enrollmentKeys = await safeList('enrollment:', true);
  const approvedEnrollments = [];
  for(const k of enrollmentKeys){ const e = await safeGet(k, true); if(e && e.status === 'approved' && (adminScope === 'all' || e.country === adminScope)) approvedEnrollments.push(e); }
  const uniqueStudents = new Set(approvedEnrollments.map(e => e.studentUsername));

  const activeSubs = [];
  const subKeys = await safeList('edusubscription:', true);
  for(const k of subKeys){ const s = await safeGet(k, true); if(s && new Date(s.expiresAt) > new Date() && (adminScope === 'all' || s.country === adminScope)) activeSubs.push(s); }
  let html = '<p style="margin:0 0 4px; font-size:13px;">🎓 <strong>'+trainers.length+'</strong> formateur(s) validé(s)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">📚 <strong>'+activeCourses.length+'</strong> cours publié(s)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">👥 <strong>'+uniqueStudents.size+'</strong> étudiant(s) actif(s)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">🔒 <strong>'+activeSubs.length+'</strong> abonnement(s) Espace Éducation actif(s)</p>';
  if(adminScope === 'all' && !isModerator){
    const totalRevenue = approvedEnrollments.reduce((s,e) => s + (e.price||0), 0);
    const subPaymentKeys = await safeList('edusubpayment:', true);
    let subRevenue = 0;
    for(const k of subPaymentKeys){ const p = await safeGet(k, true); if(p) subRevenue += p.amount || 0; }
    html += '<p style="margin:8px 0 0; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">💰 Revenu cours : '+totalRevenue.toLocaleString('fr-FR')+' FCFA</p>' +
      '<p style="margin:2px 0 0; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">💰 Revenu abonnements : '+subRevenue.toLocaleString('fr-FR')+' FCFA</p>';
  }
  el.innerHTML = html;
}
async function loadTodaysVideos(todayStr){
  const el = document.getElementById('overview-todays-videos');
  if(!el) return;
  let posts = (await fetchPosts(true)).filter(p => p.type === 'video' && p.status !== 'scheduled' && p.createdAt.slice(0,10) === todayStr);
  if(adminScope !== 'all') posts = posts.filter(p => p.country === adminScope);
  posts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(posts.length === 0){ el.innerHTML = '<div class="empty">Aucune vidéo publiée aujourd’hui pour l’instant.</div>'; return; }
  el.innerHTML = posts.map(p =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openCommentsScreen(\''+p.id+'\')">' +
    '<video src="'+p.data+'" muted style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;"></video>' +
    '<div style="flex:1; min-width:0;">' +
    '<p style="margin:0; font-size:12.5px; font-weight:600;">@'+escapeHtml(p.userId)+(p.sensitive?' ⚠️':'')+(p.suspended?' 🚫':'')+'</p>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">'+escapeHtml((p.caption||'').slice(0,50))+'</p>' +
    '</div>' +
    '<span style="font-size:11px; color:rgba(245,239,227,0.4); flex-shrink:0;">'+new Date(p.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</span>' +
    '</div>'
  ).join('');
}
async function loadOwnerOverview(){
  const todayStr = new Date().toISOString().slice(0,10);
  const allUsers = await fetchUsers();
  const scopedUsers = adminScope === 'all' ? allUsers : allUsers.filter(u => u.country === adminScope);
  const newToday = scopedUsers.filter(u => u.createdAt && u.createdAt.slice(0,10) === todayStr).length;
  document.getElementById('overview-new-users').textContent = newToday;
  await loadTodaysVideos(todayStr);
  await loadEducationOverview();

  if(adminScope === 'all' && !isModerator){
    const orders = (await fetchOrders()).filter(o => o.createdAt.slice(0,10) === todayStr);
    const gifts = (await fetchGifts()).filter(g => g.createdAt.slice(0,10) === todayStr);
    const ads = await fetchAds();
    const premiumPayments = (await fetchPremiumPayments()).filter(p => p.createdAt.slice(0,10) === todayStr);
    const badgePayments = (await fetchBadgePayments()).filter(p => p.createdAt.slice(0,10) === todayStr);
    const revToday = orders.reduce((s,o) => s + (o.commissionAmount||0), 0) +
      gifts.reduce((s,g) => s + (g.commissionAmount||0), 0) +
      premiumPayments.reduce((s,p) => s + p.amount, 0) +
      badgePayments.reduce((s,p) => s + p.amount, 0);
    document.getElementById('overview-revenue-today').textContent = Math.round(revToday).toLocaleString('fr-FR') + ' FCFA';
  }

  const items = [];
  let reports = (await fetchReports()).filter(r => r.status === 'pending');
  let lives = (await fetchLives()).filter(l => l.status === 'pending');
  let payouts = await fetchAllPendingPayouts();
  if(adminScope !== 'all'){
    reports = reports.filter(r => true); // signalements non liés à un pays précis, laissés visibles
    lives = lives.filter(l => l.country === adminScope);
    payouts = payouts.filter(o => o.country === adminScope);
  }
  if(reports.length > 0) items.push('🚩 ' + reports.length + ' signalement(s) en attente');
  if(lives.length > 0) items.push('🔴 ' + lives.length + ' live(s) à valider');
  if(adminScope === 'all' && !isModerator && payouts.length > 0) items.push('💸 ' + payouts.length + ' reversement(s) en attente');
  const actionEl = document.getElementById('overview-action-items');
  actionEl.innerHTML = items.length === 0
    ? '<p style="margin:0; font-size:12.5px; color:var(--lagoon);">✓ Rien n’attend votre action pour l’instant</p>'
    : items.map(i => '<p style="margin:0 0 3px; font-size:12.5px; color:var(--coral);">'+i+'</p>').join('');
  if(adminScope === 'all' && !isModerator && !dailySummaryGeneratedThisSession){
    dailySummaryGeneratedThisSession = true;
    generateDailySummary();
  }
  if(adminScope === 'all' && !isModerator) await renderCentralDashboardSummary();
  await checkWeeklyReport();
}
function applyDomainRestriction(){
  const banner = document.getElementById('domain-restriction-banner');
  const domainLabels = { moderation: 'Modération', marketplace: 'Boutique & Marketplace', lives: 'Lives', education: 'Éducation', ads: 'Publicités', support: 'Support' };
  if(currentCustomRoleDomains){
    document.querySelectorAll('[data-domain]').forEach(el => {
      el.style.display = currentCustomRoleDomains.includes(el.dataset.domain) ? '' : 'none';
    });
    banner.style.display = 'block';
    banner.textContent = '🔒 Accès limité à vos domaines (' + currentCustomRoleDomains.map(d => domainLabels[d] || d).join(', ') + ') — rôle « ' + currentAdminName + ' ».';
    return;
  }
  const isRestricted = !isPayoutSpecialist && currentAdminDomain && currentAdminDomain !== 'general';
  document.querySelectorAll('[data-domain]').forEach(el => {
    if(!isRestricted){ el.style.display = ''; return; }
    el.style.display = (el.dataset.domain === currentAdminDomain) ? '' : 'none';
  });
  if(isRestricted){
    banner.style.display = 'block';
    banner.textContent = '🔒 Accès limité à votre domaine : ' + (domainLabels[currentAdminDomain] || currentAdminDomain) + ' — pour ' + adminScope + '.';
  } else {
    banner.style.display = 'none';
  }
}
let adminSessionValidityInterval = null;
function startAdminSessionValidityWatch(){
  if(adminSessionValidityInterval) clearInterval(adminSessionValidityInterval);
  adminSessionValidityInterval = setInterval(async () => {
    const stillValidNow = await verifyCurrentAdminSessionStillValid();
    if(!stillValidNow){ clearInterval(adminSessionValidityInterval); adminSessionValidityInterval = null; }
  }, 30000);
}
const ADMIN_SECTIONS_INDEX = [
  { target: 'finance-dashboard', label: '💰 Tableau de bord financier' },
  { target: 'inactive-users', label: '💤 Utilisateurs inactifs' },
  { target: 'zone-controller', label: '🗺️ Zones & campagnes locales' },
  { target: 'sfx-library', label: '🔔 Bibliothèque de bruitages' },
  { target: 'buyer-pattern-review', label: '🔍 Vérification des motifs acheteur' },
  { target: 'seller-ledger', label: '📒 Historique des transactions vendeur' },
  { target: 'live-activity-feed', label: '📡 Activité en direct' },
  { target: 'country-comparison', label: '📈 Comparer les pays' },
  { target: 'region-presence-map', label: '🗺️ Carte de présence par région' },
  { target: 'disputes-region-map', label: '⚖️ Litiges & signalements par région' },
  { target: 'team-leaderboard', label: '🏅 Classement de l’équipe' },
  { target: 'coin-revenue-dashboard', label: '📊 Revenus en pièces' },
  { target: 'moderation-history', label: '📜 Journal de modération des comptes' },
  { target: 'meeting-history', label: '📜 Historique des réunions' },
  { target: 'automation-control-center', label: '🤖 Centre de contrôle de l’automatisation' },
  { target: 'admin-login-log', label: '🔐 Journal des connexions admin' },
  { target: 'recurring-tasks', label: '📋 Tâches récurrentes' },
  { target: 'oncall-roster', label: '📞 Roster d’astreinte' },
  { target: 'ab-testing', label: '🧪 Tests A/B' },
  { target: 'dev-tasks', label: '👨‍💻 Tâches de développement' },
  { target: 'ai-tech-agent', label: '🤖 Agent IA — Suggestions' },
  { target: 'internal-changelog', label: '📝 Journal des changements' },
  { target: 'decision-log', label: '🧭 Journal des décisions' },
  { target: 'duplicate-accounts', label: '👥 Comptes en double possibles' },
  { target: 'content-country-restriction', label: '🌍 Restriction de contenu par pays' },
  { target: 'ai-confidence-queue', label: '🚨 File de modération — confiance IA' },
  { target: 'knowledge-base', label: '📚 Base de connaissances' },
  { target: 'commission-history', label: '📜 Historique des changements de commission' },
  { target: 'institutional-dashboard', label: '🏛️ Tableau de bord institutionnel' },
  { target: 'command-center', label: '🎖️ Poste de commandement' },
  { target: 'creator-partnerships', label: '🤝 Partenariats créateurs' },
  { target: 'supplier-partnerships', label: '🚚 Fournisseurs & livraison' },
  { scrollTo: 'pay-wave-number', label: '💳 Configuration des moyens de paiement' },
  { scrollTo: 'maintenance-mode-toggle', label: '🛠️ Mode maintenance' },
  { scrollTo: 'commission-rate-input', label: '💰 Taux de commission boutique' },
  { scrollTo: 'gift-commission-rate-input', label: '🎁 Taux de commission sur les cadeaux' },
  { scrollTo: 'ticket-commission-input', label: '🎫 Taux de commission sur les billets' },
  { scrollTo: 'admin-alert-sound-toggle', label: '🔔 Son d’alerte des notifications admin' },
  { scrollTo: 'badge-price-input', label: '🏅 Prix du badge vérifié' },
  { scrollTo: 'boost-price-input', label: '🚀 Prix du boost de publication' },
  { scrollTo: 'premium-price-input', label: '⭐ Prix de l’abonnement Premium' },
  { scrollTo: 'shop-sub-price-input', label: '🏪 Prix de l’abonnement Boutique' },
  { scrollTo: 'edu-sub-price-input', label: '🎓 Prix de l’abonnement Éducation' },
  { scrollTo: 'affiliate-platform-fee-input', label: '🤝 Frais de plateforme sur l’affiliation' },
  { scrollTo: 'self-serve-cpm-input', label: '📣 CPM des publicités en libre-service' },
  { scrollTo: 'creator-fund-budget-input', label: '💵 Budget du fonds créateurs' },
  { scrollTo: 'daily-coin-reward-input', label: '🪙 Récompense quotidienne en pièces' },
  { scrollTo: 'ad-coin-daily-limit-input', label: '🪙 Limite quotidienne de pièces publicitaires' },
  { scrollTo: 'ad-coin-reward-input', label: '🪙 Récompense en pièces par publicité vue' },
  { scrollTo: 'live-report-warn-threshold', label: '🚨 Seuils d’alerte des signalements en direct' },
  { scrollTo: 'forbidden-words-input', label: '🚫 Liste des mots interdits' },
  { scrollTo: 'prohibited-products-input', label: '🚫 Mots-clés produits interdits' },
  { scrollTo: 'gcv-vision-key-input', label: '🔑 Clés API Google Cloud Vision' },
  { scrollTo: 'yango-key-input', label: '🔑 Clé API Yango' },
  { scrollTo: 'gemini-key-input', label: '🔑 Clé API Gemini' },
  { scrollTo: 'auto-approve-lives-card', label: '✅ Validation automatique des directs' },
  { scrollTo: 'auto-approve-premium-card', label: '✅ Validation automatique Premium' },
  { scrollTo: 'auto-approve-enrollment-card', label: '✅ Validation automatique des inscriptions aux cours' },
  { scrollTo: 'auto-triage-reports-card', label: '✅ Tri automatique des signalements' },
  { scrollTo: 'auto-validate-trainers-card', label: '✅ Validation automatique des formateurs' },
  { scrollTo: 'ai-auto-block-toggle', label: '🤖 Blocage automatique par IA (SafeSearch)' },
  { scrollTo: 'admin-cgu-text', label: '📜 Conditions générales et politique de confidentialité' },
  { scrollTo: 'vision-api-key-input', label: '🔑 Clé API Google Vision (blocage automatique)' },
  { target: 'exceptions-registry', label: '🎫 Exceptions & Passe-droits' },
  { target: 'global-audit', label: '🗂️ Journaux d’activité globaux & alertes critiques' },
  { target: 'dg-config-menu', label: '⋮ Menu de configuration DG' },
  { target: 'dg-config-menu', label: '🕓 Historique de mes connexions' },
  { target: 'dg-config-menu', label: '📡 Sessions de l’équipe (modérateurs & DG régionaux)' },
  { target: 'dg-config-menu', label: '📋 Exporter un rapport de conformité' },
  { target: 'dg-config-menu', label: '🚨 Alertes critiques' },
  { target: 'dg-config-menu', label: '🩺 Santé des services' },
  { target: 'dg-config-menu', label: '🚨 Kill switch d’urgence — geler tous les accès équipe' },
  { target: 'dg-config-menu', label: '🏢 Suspendre un département entier' },
  { target: 'dg-config-menu', label: '🧊 Geler/dégeler transactions & inscriptions' },
  { target: 'dg-config-menu', label: '📖 Mode lecture seule par pays' },
  { target: 'dg-config-menu', label: '📖 Mode lecture seule par département' },
  { target: 'payout-specialist', label: '🪙 Retraits de pièces en attente' },
  { target: 'creator-vote', label: '🏆 Créateur & formateur du mois (vote)' },
  { scrollTo: 'penc-topic-votes-list', label: '🗳️ Vote de thème Penc' },
  { scrollTo: 'weekly-trend-election-section', label: '🗳️ Élire la tendance de la semaine' },
  { target: 'dg-config-menu', label: '🔐 Vérifier l’intégrité du journal admin' },
  { scrollTo: 'central-dashboard-summary', label: '📊 Vue d’ensemble (tableau de bord central)' },
  { scrollTo: 'daily-summary-result', label: '🧠 Résumé quotidien IA' },
  { scrollTo: 'regional-admins-list', label: '🌍 Admins régionaux' },
  { scrollTo: 'moderators-list', label: '🛡️ Équipe de modération' },
  { scrollTo: 'admin-posts-search', label: 'Toutes les publications' },
  { scrollTo: 'admin-product-name', label: 'Gérer les produits' },
  { scrollTo: 'overview-todays-videos', label: '🎬 Vidéos publiées aujourd\'hui' },
  { scrollTo: 'education-overview-card', label: '🎓 Espace Éducation — vue d\'ensemble' },
  { scrollTo: 'new-techteam-name', label: '👨‍💻 Équipe technique (accès limité, lecture seule)' },
  { scrollTo: 'new-custom-role-name', label: '🎚️ Rôles avec permissions personnalisées' },
  { scrollTo: 'custom-roles-list', label: '📋 Rôles personnalisés existants' },
  { scrollTo: 'fund-disputes-admin-list', label: '⚖️ Contestations du fonds créateur' },
  { scrollTo: 'suspension-appeals-admin-list', label: '⚖️ Contestations de suspension' },
  { scrollTo: 'ban-appeals-admin-list', label: '⚖️ Contestations de bannissement' },
  { scrollTo: 'account-deletion-requests-list', label: '🗑️ Demandes de suppression de compte (droit à l\'oubli)' },
  { scrollTo: 'satisfaction-summary-display', label: '🌟 Satisfaction réelle des utilisateurs' },
  { scrollTo: 'big-order-threshold-input', label: '🚨 Alerte pour événements importants' },
  { scrollTo: 'export-period-select', label: '📥 Export complet des données' },
  { scrollTo: 'storage-health-result', label: '🩺 Diagnostic & alertes précoces' },
  { scrollTo: 'system-error-log', label: '📋 Erreurs techniques récentes' },
  { scrollTo: 'admin-million-followers-list', label: '🏆 Club 1 million d\'abonnés — cadeaux à remettre' },
  { scrollTo: 'new-series-title', label: '📚 Séries payantes (créées uniquement par vous)' },
  { scrollTo: 'admin-coin-packs-list', label: '🪙 Packs de pièces virtuelles' },
  { scrollTo: 'admin-series-list', label: '📋 Toutes les séries' },
  { scrollTo: 'code-analysis-status', label: '🔬 Analyse de robustesse du code source' },
  { scrollTo: 'admin-kyc-list', label: '🆔 Demandes de vérification d\'identité' },
  { scrollTo: 'audience-creator-badge-requests-admin-list', label: '✅ Demandes de badge vérifié créateur' },
  { scrollTo: 'business-account-requests-admin-list', label: '🏢 Demandes de compte Business' },
  { scrollTo: 'penc-creation-allowed-toggle', label: '🌳 Gestion des Penc (salons vocaux)' },
  { scrollTo: 'penc-reports-admin-list', label: '🚩 Signalements de Penc' },
  { scrollTo: 'meeting-room-owner-controls', label: '🎥 Salle de réunion d\'équipe (propriétaire uniquement)' },
  { scrollTo: 'meeting-agenda-item-input', label: '📋 Ordre du jour' },
  { scrollTo: 'segment-broadcast-select', label: '🎯 Message segmenté' },
  { scrollTo: 'trainer-broadcast-list', label: '📢 Envoyer un message aux formateurs' },
  { scrollTo: 'priority-tickets-list', label: '📞 Support prioritaire' },
  { scrollTo: 'new-macro-title', label: '💬 Réponses standard pour le support' },
  { scrollTo: 'support-sla-display', label: '🎫 Support & Litiges (centralisé)' },
  { scrollTo: 'admin-stat-today', label: '📊 Tableau de bord analytique' },
  { scrollTo: 'admin-user-search', label: '👥 Utilisateurs' },
  { scrollTo: 'bulk-reports-action-bar', label: '🚩 Signalements en attente' },
  { scrollTo: 'admin-appeals-list', label: '📋 Recours en attente' },
  { scrollTo: 'admin-trainer-disputes-list', label: '🎓 Signalements de formateurs (différends élèves)' },
  { scrollTo: 'admin-course-chat-moderation', label: '📚 Modération des espaces pédagogiques' },
  { scrollTo: 'admin-block-spike-alerts', label: '⚠️ Pics de blocages détectés' },
  { scrollTo: 'fraud-investigation-username-input', label: '🔍 Enquête compte (traçabilité financière)' },
  { scrollTo: 'admin-duplicate-posts-list', label: '🔁 Republications suspectes (contenu identique détecté)' },
  { scrollTo: 'admin-media-flagged-list', label: '🛡️ Médias signalés par l\'IA Google Cloud (Vision / Video Intelligence)' },
  { scrollTo: 'admin-products-flagged-list', label: '🛡️ Produits boutique signalés par l\'IA Google Cloud' },
  { scrollTo: 'auto-approve-edusub-card', label: '⚡ Auto-acceptation des demandes' },
  { scrollTo: 'admin-active-lives-list', label: 'Lives en cours' },
  { scrollTo: 'live-auth-username', label: '🔓 Autoriser un live sans 1000 abonnés' },
  { scrollTo: 'live-auth-requests-list', label: '⏳ Demandes en attente' },
  { scrollTo: 'live-auth-authorized-list', label: '✓ Utilisateurs autorisés' },
  { scrollTo: 'admin-posts-search', label: 'Modération' },
  { scrollTo: 'admin-product-name', label: 'Boutique' },
  { scrollTo: 'referral-reward-points-input', label: '🔁 Récompense de parrainage' },
  { scrollTo: 'creator-fund-rate-input', label: '💰 Fonds de récompense créateur (basé sur les vues)' },
  { scrollTo: 'global-revenue-card', label: '📊 Revenus consolidés' },
  { scrollTo: 'revenue-summary-card', label: '💰 Total des ventes boutique' },
  { scrollTo: 'admin-orders-list', label: '📦 Commandes à traiter' },
  { scrollTo: 'admin-gifts-list', label: '🎁 Cadeaux reçus en live' },
  { scrollTo: 'ad-advertiser', label: '📢 Publicités ciblées dans le fil' },
  { scrollTo: 'self-serve-ads-queue', label: '📢 Publicités soumises par les utilisateurs — à valider' },
  { scrollTo: 'admin-premium-requests', label: '⏳ Demandes Premium en attente de paiement' },
  { scrollTo: 'premium-summary-card', label: '⭐ Abonnés Premium' },
  { scrollTo: 'admin-shopsub-requests', label: '⏳ Demandes Boutique en attente de paiement' },
  { scrollTo: 'rate-eur', label: '💱 Taux de change (affichage indicatif)' },
  { scrollTo: 'weather-key-input', label: '🌦️ Alerte météo pour les vendeurs (OpenWeatherMap)' },
  { scrollTo: 'payouts-ai-result', label: '🤖 Assistant IA — Reversements' },
  { scrollTo: 'ai-report-result', label: '🤖 Assistant IA d\'administration' },
  { scrollTo: 'admin-ai-question-input', label: '💬 Poser une question à Gemini' },
  { scrollTo: 'live-risk-scan-result', label: '🚨 Analyse de risque des lives récents' },
  { scrollTo: 'admin-badge-requests', label: '⏳ Demandes de badge en attente' },
  { scrollTo: 'admin-boost-requests', label: '⏳ Demandes de boost en attente' },
  { scrollTo: 'marketplace-open-toggle', label: '🏪 Marketplace ouverte à tous' },
  { scrollTo: 'admin-ticket-requests', label: '⏳ Demandes de billets en attente' },
  { scrollTo: 'official-partner-username', label: '🏛️ Partenaires officiels' },
  { scrollTo: 'new-challenge-title', label: '🔥 Créer un défi / trend' },
  { scrollTo: 'admin-challenges-list', label: 'Défis actifs' },
  { scrollTo: 'new-official-news-title', label: '📰 Publier une actualité officielle' },
  { scrollTo: 'admin-official-news-list', label: 'Actualités publiées' },
  { scrollTo: 'official-statement-text', label: '✓ Déclaration officielle / Démenti' },
  { scrollTo: 'trends-report-result', label: '📊 Rapport de tendances pour marques' },
  { scrollTo: 'admin-feature-toggles', label: '⚙️ Fonctionnalités actives' },
  { scrollTo: 'admin-announcement-text', label: '📢 Centre de notifications / annonces' },
  { scrollTo: 'system-update-notif-text', label: '🔔 Notification de mise à jour' },
  { scrollTo: 'system-update-scheduled-list', label: 'Envois programmés en attente' },
  { scrollTo: 'system-update-history-list', label: 'Historique des envois' },
  { scrollTo: 'admin-legal-country', label: '📄 Conditions & confidentialité' },
  { scrollTo: 'admin-audit-log', label: '📋 Journal d\'audit — traçabilité de l\'administration' },
  { scrollTo: 'admin-new-pin', label: 'Sécurité' },
  { scrollTo: 'admin-instant-trainer-card', label: '🎓 Espace Éducation' },
  { scrollTo: 'admin-trainers-list', label: '👥 Tous les formateurs (activité & suivi)' },
  { scrollTo: 'course-search-gaps-list', label: '🔍 Lacunes du catalogue (recherches sans réponse)' },
  { scrollTo: 'admin-trainer-requests', label: 'Candidatures formateur en attente' },
  { scrollTo: 'admin-all-badges-list', label: '🏅 Tous les badges décernés' },
  { scrollTo: 'admin-flagged-lessons', label: '🔍 Leçons signalées par l\'IA (contenu non éducatif suspecté)' },
  { scrollTo: 'admin-content-validation-list', label: '✓ Validation du contenu pour la recherche IA' },
  { scrollTo: 'admin-conferences-pending', label: '🎤 Conférences en attente de validation' },
  { scrollTo: 'admin-courses-pending', label: 'Cours en attente de validation' },
  { scrollTo: 'admin-courses-published', label: 'Tous les cours publiés' },
  { scrollTo: 'admin-student-removals', label: '🗑️ Demandes de retrait d\'élève (formateur ou vous-même)' },
  { scrollTo: 'state-funded-username', label: '🏛️ Accès financé par l\'État' },
  { scrollTo: 'csv-import-course-select', label: '📋 Import de liste (CSV)' },
  { scrollTo: 'activation-code-count', label: '🎟️ Codes d\'activation nominatifs (portail institutionnel)' },
  { scrollTo: 'admin-state-funded-list', label: 'Comptes financés par l\'État' },
  { scrollTo: 'admin-edusub-requests', label: 'Abonnements Espace Éducation en attente' },
  { scrollTo: 'admin-enrollments-pending', label: 'Inscriptions en attente de paiement' },
  { scrollTo: 'search-reco-keywords', label: '🔍 Recommandations dans la recherche' },
  { scrollTo: 'admin-video-analyses', label: '🔍 Analyses vidéo en cours / résultats' },
  { scrollTo: 'payout-specialist-name-input', label: '💸 Équipe reversements' },
  { scrollTo: 'moderator-name', label: '🛡️ Modérateurs de contenu locaux' },
];
function normalizeForSearch(text){
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}
function filterAdminSections(query){
  const resultsEl = document.getElementById('admin-section-search-results');
  const normalizedQuery = normalizeForSearch(query);
  if(!normalizedQuery){ resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }
  const matches = ADMIN_SECTIONS_INDEX.filter(s => normalizeForSearch(s.label).includes(normalizedQuery));
  if(matches.length === 0){
    resultsEl.innerHTML = '<div style="padding:14px; font-size:12.5px; color:rgba(245,239,227,0.5);">Aucune section trouvée pour « '+escapeHtml(query)+' »</div>';
  } else {
    resultsEl.innerHTML = matches.map(s =>
      '<div onclick="selectAdminSearchResult('+(s.scrollTo ? 'null, \''+s.scrollTo+'\'' : '\''+s.target+'\', null')+')" style="padding:12px 14px; font-size:13.5px; cursor:pointer; border-bottom:1px solid var(--line);">'+escapeHtml(s.label)+'</div>'
    ).join('');
  }
  resultsEl.style.display = 'block';
}
function selectAdminSearchResult(target, scrollTo){
  document.getElementById('admin-section-search').value = '';
  document.getElementById('admin-section-search-results').style.display = 'none';
  if(scrollTo){
    go('admin');
    setTimeout(() => {
      const el = document.getElementById(scrollTo);
      if(el){
        const tabWrapper = el.closest('.admin-tab-content');
        if(tabWrapper) setAdminTab(tabWrapper.dataset.tab);
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.outline = '2px solid var(--gold)';
          setTimeout(() => { el.style.outline = 'none'; }, 2000);
        }, tabWrapper ? 50 : 0);
      }
    }, 150);
    return;
  }
  go(target);
}
async function loadAdminDashboard(){
  const stillValid = await verifyCurrentAdminSessionStillValid();
  if(!stillValid) return;
  startAdminSessionValidityWatch();
  populateCountrySelects();
  await populateTicketFilters();
  await loadOwnerOverview();
  document.body.classList.toggle('regional-admin-mode', adminScope !== 'all');
  document.body.classList.toggle('moderator-mode', isModerator);
  applyDomainRestriction();

  const allUsers = await fetchUsers();
  const userCountryMap = {};
  allUsers.forEach(u => { userCountryMap[u.username] = u.country; });
  const scopedUsers = adminScope === 'all' ? allUsers : allUsers.filter(u => u.country === adminScope);

  const allPosts = await fetchPosts(true);
  const posts = adminScope === 'all' ? allPosts : allPosts.filter(p => userCountryMap[p.userId] === adminScope);

  const allProducts = await fetchProducts();
  const scopedProducts = adminScope === 'all' ? allProducts : allProducts.filter(p => p.country === adminScope);

  document.getElementById('admin-stat-users').textContent = scopedUsers.length;
  document.getElementById('admin-stat-posts').textContent = posts.length;
  document.getElementById('admin-stat-products').textContent = scopedProducts.length;

  const todayStr = new Date().toISOString().slice(0,10);
  const postsToday = posts.filter(p => p.createdAt.slice(0,10) === todayStr).length;
  const totalLikes = posts.reduce((s,p) => s + (p.likes ? p.likes.length : 0), 0);
  const totalComments = posts.reduce((s,p) => s + (p.comments ? p.comments.length : 0), 0);
  const dmKeys = await safeList('dm:', true);
  let totalMessages = 0;
  for(const k of dmKeys){ const msgs = await safeGet(k, true); if(msgs) totalMessages += msgs.length; }
  const allReports = await fetchReports();
  const reports = adminScope === 'all' ? allReports : allReports.filter(r => userCountryMap[r.targetUser] === adminScope);
  const pendingReports = reports.filter(r => r.status === 'pending').length;
  document.getElementById('admin-stat-today').textContent = postsToday;
  document.getElementById('admin-stat-likes').textContent = totalLikes;
  document.getElementById('admin-stat-comments').textContent = totalComments;
  document.getElementById('admin-stat-messages').textContent = totalMessages;
  document.getElementById('admin-stat-reports').textContent = pendingReports;

  await renderModerationPostsList(allPosts);

  await loadAdminProductsList();
  await loadAdminUsersList();
  await loadAdminReportsList();
  await loadAdminAppealsList();
  await renderCourseSearchGaps();
  await renderAdminBlockSpikeAlerts();
  await renderAdminTrainerDisputes();
  await renderAdminCourseChatModeration();
  await renderAdminContentValidationList();
  await loadAdminDuplicatePosts();
  await loadAdminMediaFlaggedPosts();
  await loadAdminProductsFlaggedList();
  await loadGoogleCloudModerationStatus();
  await loadGeminiKeyStatus();
  await loadWeatherKeyStatus();
  await loadYangoKeyStatus();
  await renderEarlyWarningAlerts();
  await loadCustomAlertThresholds();
  await loadBigOrderThresholdAdmin();
  await loadAdminAlertSoundToggle();
  await renderImportantAlertsBadge();
  await renderModerationPendingBadge();
  await renderRefundRequestsAdmin();
  await renderFundDisputesAdmin();
  await renderSuspensionAppealsAdmin();
  await renderBanAppealsAdmin();
  await checkAndPlayAdminAlertSound();
  await renderSupportMacrosAdmin();
  await renderAccountDeletionRequests();
  await renderTechTeamMembersList();
  await renderCustomRolesList();
  await renderSystemErrorLog();
  await renderMillionFollowersAdminList();
  await renderTrainerBroadcastList();
  await previewSegmentBroadcastCount();
  await renderSystemUpdateHistory();
  await renderScheduledSystemNotifications();
  await renderAdminSeriesList();
  await renderAdminCoinPacksList();
  await loadCoinRewardSettings();
  await renderAdminKycList();
  await renderAudienceCreatorBadgeRequestsAdmin();
  await renderBusinessAccountRequestsAdmin();
  await renderAdminActivePencs();
  await renderPencReportsAdmin();
  await loadPencCreationToggle();
  await renderMeetingRoomOwnerControls();
  await renderMeetingAgendaList();
  await loadMaintenanceModeAdmin();
  const savedCodeReport = await safeGet('codeanalysisreport:latest', true);
  if(savedCodeReport) renderCodeAnalysisReport(savedCodeReport);
  await loadForbiddenWords();
  await loadProhibitedProductKeywords();
  await loadReferralRewardPoints();
  await loadCreatorFundSettings();
  await loadSelfServeCpm();
  await loadCurrencyRatesAdmin();
  await loadAdminOfficialNews();
  await loadAdminChallenges();
  await loadInstantTrainerCard();
  await loadAllAutoApproveToggles();
  await loadLiveReportThresholds();
  await loadFeatureTogglesUI();
  await loadAnnouncementAdmin();
  await setupLegalCountrySelect();
  await loadLegalTextsAdmin();
  await loadEducationAdmin();
  await loadSearchRecommendationAdmin();
  await loadRegionalAdminsList();
  await loadModeratorsList();
  await renderPriorityTicketsList();
  await loadTicketsList();
  await loadLivesQueue();
  await loadActiveLivesAdmin();
  await loadLiveAuthAdmin();
  await loadCommissionRateAdmin();
  await loadGiftCommissionRateAdmin();
  await loadAffiliatePlatformFeeAdmin();
  await loadOrdersAndRevenue();
  await loadAdminGiftsList();
  await loadAdminAdsList();
  await loadPremiumPriceAdmin();
  await loadShopSubAdmin();
  await loadPaymentAccountsAdmin();
  await loadPremiumRequestsAdmin();
  await loadAdminPremiumList();
  await loadGlobalRevenueDashboard();
  await loadAuditLog();
  await loadNewMonetizationSettingsAdmin();
  await loadAdminBadgeRequests();
  await loadAdminBoostRequests();
  await loadAdminTicketRequests();
  await loadOfficialPartnersList();
  await loadOfficialStatementAdmin();
  await loadGoogleModerationSettingsAdmin();
  await loadAdminVideoAnalyses();
  await loadSelfServeAdsQueue();
  await loadPayoutSpecialistsList();
  await loadBackupCodesStatus();
}
async function renderModerationPostsList(preloadedPosts){
  const postsEl = document.getElementById('admin-posts-list');
  if(!postsEl) return;
  const posts = preloadedPosts || await fetchPosts(true);
  const modQuery = (document.getElementById('admin-posts-search') ? document.getElementById('admin-posts-search').value : '').toLowerCase();
  const filteredPosts = posts.filter(p => !modQuery || (p.caption||'').toLowerCase().includes(modQuery) || p.userId.toLowerCase().includes(modQuery));
  if(filteredPosts.length === 0){ postsEl.innerHTML = '<div class="empty">Aucune publication pour ces critères.</div>'; return; }
  postsEl.innerHTML = filteredPosts.map(p =>
    '<div class="card" style="display:flex; gap:12px; align-items:center;'+(p.suspended ? ' opacity:0.55;' : '')+'">' +
    (p.type === 'video' ? '<video src="'+p.data+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">') +
    '<div style="flex:1; min-width:0;"><strong style="font-size:13px;">@'+escapeHtml(p.userId)+'</strong>'+(p.suspended ? ' <span style="font-size:10.5px; color:var(--coral);">SUSPENDUE</span>' : '')+
    '<p style="font-size:12px; color:rgba(245,239,227,0.55); margin:3px 0 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'+escapeHtml(p.caption||'')+'</p></div>' +
    (p.type === 'video' ? '<button class="btn btn-outline btn-sm" onclick="requestVideoAIAnalysis(\''+p.id+'\')">🔍</button>' : '') +
    '<button class="btn btn-outline btn-sm" onclick="adminToggleSensitive(\''+p.id+'\')" title="Marquer/démarquer comme sensible">'+(p.sensitive ? '⚠️✓' : '⚠️')+'</button>' +
    '<button class="btn btn-outline btn-sm" onclick="adminToggleSuspendPost(\''+p.id+'\')">'+(p.suspended ? '▶️' : '⏸')+'</button>' +
    '<button class="btn btn-outline btn-sm" onclick="adminDeletePost(\''+p.id+'\')">✕</button>' +
    '</div>'
  ).join('');
}
async function adminDeletePost(postId){
  await window.storage.delete('post:' + postId, true).catch(() => {});
  showToast('Publication supprimée');
  await logAdminAction('Publication supprimée', postId);
  await loadAdminDashboard();
}
async function adminToggleSensitive(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.sensitive = !p.sensitive;
  await saveWithRetry('post:' + postId, p, true);
  showToast(p.sensitive ? 'Marquée comme contenu sensible ✓' : 'Marquage sensible retiré');
  await logAdminAction(p.sensitive ? 'Publication marquée sensible' : 'Marquage sensible retiré', '@' + p.userId);
  await loadAdminDashboard();
}
async function adminToggleSuspendPost(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.suspended = !p.suspended;
  await saveWithRetry('post:' + postId, p, true);
  showToast(p.suspended ? 'Publication suspendue (masquée du fil)' : 'Publication réactivée');
  await logAdminAction(p.suspended ? 'Publication suspendue' : 'Publication réactivée', '@' + p.userId);
  await loadAdminDashboard();
}
async function loadAdminProductsList(){
  const allProducts = await fetchProducts();
  const products = adminScope === 'all' ? allProducts : allProducts.filter(p => p.country === adminScope);
  const el = document.getElementById('admin-products-list');
  if(products.length === 0){ el.innerHTML = '<div class="empty">Aucun produit pour l’instant.</div>'; return; }
  el.innerHTML = products.map(p =>
    '<div class="card" style="display:flex; gap:12px; align-items:center;">' +
    (p.image ? '<img src="'+p.image+'" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
    '<p style="font-size:12px; color:var(--gold); margin:3px 0 0;">'+(p.price||0).toLocaleString('fr-FR')+' FCFA'+(p.country ? ' · '+escapeHtml(p.country) : '')+'</p>' +
    '<p id="product-ai-analysis-'+p.id+'" style="font-size:11px; color:rgba(245,239,227,0.5); margin:4px 0 0;"></p></div>' +
    '<button class="btn btn-outline btn-sm" onclick="analyzeProductWithAI(\''+p.id+'\')">🧠</button>' +
    '<button class="btn btn-outline btn-sm" onclick="adminDeleteProduct(\''+p.id+'\')">✕</button>' +
    '</div>'
  ).join('');
}
async function analyzeProductWithAI(productId){
  const el = document.getElementById('product-ai-analysis-' + productId);
  const p = (await fetchProducts()).find(x => x.id === productId);
  if(!p || !el) return;
  el.textContent = '⏳ Analyse en cours...';
  try{
    const prompt = "Tu aides un modérateur à examiner un produit publié sur une marketplace africaine (Suktum). Voici le produit :\n\nNom : " + p.name +
      "\nDescription : " + (p.description || '(aucune)') + "\nPrix : " + (p.price||0) + " FCFA" +
      "\n\nCe produit te semble-t-il légitime, ou présente-t-il des signaux d'alerte (contenu interdit, arnaque probable, contrefaçon manifeste, prix incohérent) ? Réponds en 1-2 phrases brèves et concrètes, sans détecter à tort un produit normal.";
    const analysis = await callAIProvider(prompt, 200, await getGovernanceAIProvider());
    el.textContent = analysis ? '🧠 ' + analysis : 'Analyse indisponible.';
  }catch(e){
    el.textContent = 'Analyse indisponible (connexion).';
  }
}
async function logCommissionChange(label, oldValue, newValue){
  if(oldValue === newValue) return;
  const id = 'commhistory_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  await saveWithRetry('commissionhistory:' + id, {
    id, label, oldValue, newValue, changedBy: currentAdminName, createdAt: new Date().toISOString()
  }, true);
}
async function saveCommissionRate(){
  const rate = parseFloat(document.getElementById('commission-rate-input').value);
  if(isNaN(rate) || rate < 0 || rate > 100){ showToast('Entrez un taux entre 0 et 100'); return; }
  const oldRate = await getCommissionRate();
  await saveWithRetry('settings:commission_rate', rate, true);
  await logCommissionChange('Commission boutique', oldRate, rate);
  showToast('Taux de commission enregistré ✓ (' + rate + '%)');
}
/* ---------- SIMULATEUR D'IMPACT AVANT CHANGEMENT DE COMMISSION ---------- */
async function simulateCommissionImpact(){
  const el = document.getElementById('commission-impact-simulation');
  if(!el) return;
  const proposedRate = parseFloat(document.getElementById('commission-rate-input').value);
  if(isNaN(proposedRate) || proposedRate < 0){ el.textContent = ''; return; }
  const orders = await fetchOrders();
  const scopedOrders = adminScope === 'all' ? orders : orders.filter(o => o.country === adminScope);
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000);
  const recentOrders = scopedOrders.filter(o => new Date(o.createdAt) > monthAgo);
  if(recentOrders.length === 0){ el.textContent = 'Aucune commande sur les 30 derniers jours pour simuler un impact.'; return; }
  const actualCommission = recentOrders.reduce((s,o) => s + (o.commissionAmount || 0), 0);
  const simulatedCommission = recentOrders.reduce((s,o) => s + Math.round((o.total||0) * proposedRate / 100), 0);
  const diff = simulatedCommission - actualCommission;
  el.textContent = 'Sur les 30 derniers jours (' + recentOrders.length + ' commande(s)) : ' + actualCommission.toLocaleString('fr-FR') + ' FCFA réellement perçus → ' + simulatedCommission.toLocaleString('fr-FR') + ' FCFA si ce taux avait été appliqué (' + (diff >= 0 ? '+' : '') + diff.toLocaleString('fr-FR') + ' FCFA).';
}
async function loadCommissionRateAdmin(){
  const input = document.getElementById('commission-rate-input');
  if(!input) return;
  input.value = await getCommissionRate();
  await simulateCommissionImpact();
}
async function saveGiftCommissionRate(){
  const rate = parseFloat(document.getElementById('gift-commission-rate-input').value);
  if(isNaN(rate) || rate < 0 || rate > 100){ showToast('Entrez un taux entre 0 et 100'); return; }
  const oldRate = await getGiftCommissionRate();
  await saveWithRetry('settings:gift_commission_rate', rate, true);
  await logCommissionChange('Commission cadeaux live', oldRate, rate);
  showToast('Taux de commission enregistré ✓ (' + rate + '%)');
}
async function loadGiftCommissionRateAdmin(){
  const input = document.getElementById('gift-commission-rate-input');
  if(!input) return;
  input.value = await getGiftCommissionRate();
}
async function saveAffiliatePlatformFeePercent(){
  const rate = parseFloat(document.getElementById('affiliate-platform-fee-input').value);
  if(isNaN(rate) || rate < 0 || rate > 100){ showToast('Entrez un taux entre 0 et 100'); return; }
  const oldRate = await getAffiliatePlatformFeePercent();
  await saveWithRetry('settings:affiliatePlatformFeePercent', rate, true);
  await logCommissionChange('Commission plateforme sur partenariats', oldRate, rate);
  showToast('Taux enregistré ✓ (' + rate + '%)');
}
async function loadAffiliatePlatformFeeAdmin(){
  const input = document.getElementById('affiliate-platform-fee-input');
  if(!input) return;
  input.value = await getAffiliatePlatformFeePercent();
}
/* ---------- COLLECTE DES PAIEMENTS RÉELS (par pays) ---------- */
const FCFA_ZONE_COUNTRIES = ['Sénégal', 'Côte d’Ivoire', 'Mali'];
async function savePaymentAccounts(){
  const accounts = {
    waveNumber: document.getElementById('pay-wave-number').value.trim(),
    omNumber: document.getElementById('pay-om-number').value.trim(),
    paypalEmail: document.getElementById('pay-paypal-email').value.trim(),
    ninea: document.getElementById('pay-ninea').value.trim(),
    bankAccount: document.getElementById('pay-bank-account').value.trim()
  };
  await saveWithRetry('settings:payment_accounts', accounts, true);
  showToast('Comptes de paiement enregistrés ✓');
}
async function loadPaymentAccountsAdmin(){
  const accounts = (await safeGet('settings:payment_accounts', true)) || {};
  const waveEl = document.getElementById('pay-wave-number');
  if(!waveEl) return;
  waveEl.value = accounts.waveNumber || '';
  document.getElementById('pay-om-number').value = accounts.omNumber || '';
  document.getElementById('pay-paypal-email').value = accounts.paypalEmail || '';
  document.getElementById('pay-ninea').value = accounts.ninea || '';
  document.getElementById('pay-bank-account').value = accounts.bankAccount || '';
}
async function getPaymentInstructions(country){
  const accounts = (await safeGet('settings:payment_accounts', true)) || {};
  if(FCFA_ZONE_COUNTRIES.includes(country)){
    const parts = [];
    if(accounts.waveNumber) parts.push('Wave : ' + accounts.waveNumber);
    if(accounts.omNumber) parts.push('Orange Money : ' + accounts.omNumber);
    if(parts.length === 0) return 'Aucun moyen de paiement configuré pour l’instant — contactez l’équipe.';
    return parts.join(' · ') + '. Envoyez votre preuve de paiement pour validation.';
  }
  if(accounts.paypalEmail) return 'PayPal : ' + accounts.paypalEmail + '. Envoyez votre preuve de paiement pour validation.';
  return 'Aucun moyen de paiement configuré pour l’instant — contactez l’équipe.';
}

async function gatherPlatformSnapshot(){
  const users = await fetchUsers();
  const posts = await fetchPosts();
  const reports = (await fetchReports()).filter(r => r.status === 'pending');
  const lives = await fetchLives();
  const pendingLives = lives.filter(l => l.status === 'pending');
  const activeLives = lives.filter(l => l.status === 'approved');
  const orders = await fetchOrders();
  const gifts = await fetchGifts();
  const ads = await fetchAds();
  const activeAds = ads.filter(a => a.status === 'active');
  const boutiqueCommission = orders.reduce((s,o) => s + (o.commissionAmount || 0), 0);
  const giftCommission = gifts.reduce((s,g) => s + (g.commissionAmount || 0), 0);
  const adRevenue = ads.reduce((s,a) => s + (a.spent || 0), 0);
  const premiumPayments = await fetchPremiumPayments();
  const premiumRevenue = premiumPayments.reduce((s,p) => s + p.amount, 0);
  const totalRevenue = boutiqueCommission + giftCommission + Math.round(adRevenue) + premiumRevenue;
  const premiumActive = (await fetchPremiumUsernames()).size;
  const todayStr = new Date().toISOString().slice(0,10);
  const postsToday = posts.filter(p => p.createdAt.slice(0,10) === todayStr).length;
  const bookingKeys = await safeList('servicebooking:', true);
  let newBookingsToday = 0;
  for(const k of bookingKeys){ const b = await safeGet(k, true).catch(() => null); if(b && b.createdAt.slice(0,10) === todayStr) newBookingsToday++; }

  return "Utilisateurs : " + users.length + " au total.\n" +
    "Publications : " + posts.length + " au total, dont " + postsToday + " aujourd'hui.\n" +
    "Signalements en attente : " + reports.length + ".\n" +
    "Lives : " + pendingLives.length + " en attente de validation, " + activeLives.length + " en cours.\n" +
    "Boutique : " + orders.length + " commande(s), commission gagnée " + boutiqueCommission.toLocaleString('fr-FR') + " FCFA.\n" +
    "Cadeaux live : " + gifts.length + " envoyé(s), commission gagnée " + giftCommission.toLocaleString('fr-FR') + " FCFA.\n" +
    "Publicité : " + activeAds.length + " campagne(s) active(s), revenu " + Math.round(adRevenue).toLocaleString('fr-FR') + " FCFA.\n" +
    "Services de consultation réservés aujourd'hui : " + newBookingsToday + ".\n" +
    "Abonnés Premium actifs : " + premiumActive + ", revenu Premium " + premiumRevenue.toLocaleString('fr-FR') + " FCFA.\n" +
    "Revenu total de la plateforme : " + totalRevenue.toLocaleString('fr-FR') + " FCFA.";
}
/* ---------- PARTENAIRES OFFICIELS (accordé par l'admin uniquement) ---------- */
async function grantOfficialPartner(){
  const username = document.getElementById('official-partner-username').value.trim();
  const label = document.getElementById('official-partner-label').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe pas'); return; }
  u.officialPartner = true;
  u.officialPartnerLabel = label || null;
  await saveWithRetry('user:' + username, u, true);
  document.getElementById('official-partner-username').value = '';
  document.getElementById('official-partner-label').value = '';
  showToast('Badge partenaire officiel accordé ✓');
  await logAdminAction('Badge partenaire officiel accordé', '@' + username + (label ? ' — ' + label : ''));
  await loadOfficialPartnersList();
}
async function revokeOfficialPartner(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.officialPartner = false;
  u.officialPartnerLabel = null;
  await saveWithRetry('user:' + username, u, true);
  showToast('Badge retiré');
  await logAdminAction('Badge partenaire officiel retiré', '@' + username);
  await loadOfficialPartnersList();
}
async function loadOfficialPartnersList(){
  const el = document.getElementById('official-partners-list');
  if(!el) return;
  const users = await fetchUsers();
  const partners = users.filter(u => u.officialPartner);
  if(partners.length === 0){ el.innerHTML = '<div class="empty">Aucun partenaire officiel pour l’instant.</div>'; return; }
  el.innerHTML = partners.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' + smallAvatarBadge(u.username, 28) +
    '<span style="flex:1; font-size:13px;"><strong>@'+escapeHtml(u.username)+'</strong>'+(u.officialPartnerLabel ? '<br><span style="font-size:11.5px; color:rgba(245,239,227,0.55);">'+escapeHtml(u.officialPartnerLabel)+'</span>' : '')+'</span>' +
    '<button class="btn btn-outline btn-sm" onclick="revokeOfficialPartner(\''+escapeHtml(u.username)+'\')">Retirer</button></div>'
  ).join('');
}
async function fetchOfficialPartnerUsernames(){
  const users = await fetchUsers();
  return new Set(users.filter(u => u.officialPartner).map(u => u.username));
}

/* ---------- DÉCLARATION OFFICIELLE / DÉMENTI ---------- */
async function publishOfficialStatement(){
  const text = document.getElementById('official-statement-text').value.trim();
  if(!text){ showToast('Écrivez un texte avant de publier'); return; }
  await saveWithRetry('settings:official_statement', {text, publishedAt: new Date().toISOString()}, true);
  showToast('Déclaration officielle publiée ✓');
  await logAdminAction('Déclaration officielle publiée', text.slice(0, 60));
}
async function clearOfficialStatement(){
  await window.storage.delete('settings:official_statement', true).catch(() => {});
  document.getElementById('official-statement-text').value = '';
  showToast('Déclaration retirée');
  await logAdminAction('Déclaration officielle retirée', '');
}
async function loadOfficialStatementAdmin(){
  const el = document.getElementById('official-statement-text');
  if(!el) return;
  const s = await safeGet('settings:official_statement', true);
  el.value = s ? s.text : '';
}
/* ---------- FIL D'ACTUALITÉ OFFICIEL ---------- */
async function publishOfficialNews(){
  const title = document.getElementById('new-official-news-title').value.trim();
  const content = document.getElementById('new-official-news-content').value.trim();
  if(!title || !content){ showToast('Renseignez le titre et le contenu'); return; }
  const id = 'officialnews_' + Date.now();
  await saveWithRetry('officialnews:' + id, {
    id, title, content, author: currentAdminName || 'Suktum', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-official-news-title').value = '';
  document.getElementById('new-official-news-content').value = '';
  showToast('Actualité publiée ✓');
  await logAdminAction('Actualité officielle publiée', title);
  await loadAdminOfficialNews();
}
/* ---------- DÉFIS & TRENDS ---------- */
let currentPublishChallengeId = null;
let currentChallengeDetailId = null;
async function createChallenge(){
  const title = document.getElementById('new-challenge-title').value.trim();
  let hashtag = document.getElementById('new-challenge-hashtag').value.trim();
  const desc = document.getElementById('new-challenge-desc').value.trim();
  const reward = document.getElementById('new-challenge-reward').value.trim();
  if(!title || !hashtag || !desc){ showToast('Renseignez le titre, le hashtag, et la description'); return; }
  hashtag = hashtag.replace(/^#/, '').replace(/\s+/g, '');
  const id = 'challenge_' + Date.now();
  await saveWithRetry('challenge:' + id, {
    id, title, hashtag, description: desc, reward: reward || null, createdBy: currentAdminName || 'Suktum', status: 'active', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-challenge-title').value = '';
  document.getElementById('new-challenge-hashtag').value = '';
  document.getElementById('new-challenge-desc').value = '';
  document.getElementById('new-challenge-reward').value = '';
  showToast('Défi publié ✓');
  await logAdminAction('Défi publié', title + ' (#' + hashtag + ')');
  await loadAdminChallenges();
}
async function fetchChallenges(){
  const keys = await safeList('challenge:', true);
  const list = [];
  for(const k of keys){ const c = await safeGet(k, true); if(c) list.push(c); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function endChallenge(id){
  const c = await safeGet('challenge:' + id, true);
  if(!c) return;
  c.status = c.status === 'active' ? 'ended' : 'active';
  await saveWithRetry('challenge:' + id, c, true);
  showToast(c.status === 'ended' ? 'Défi terminé' : 'Défi réactivé ✓');
  await loadAdminChallenges();
}
async function loadAdminChallenges(){
  const el = document.getElementById('admin-challenges-list');
  if(!el) return;
  const challenges = (await fetchChallenges()).filter(c => c.status === 'active');
  if(challenges.length === 0){ el.innerHTML = '<div class="empty">Aucun défi actif pour l’instant.</div>'; return; }
  const allPosts = await fetchPosts();
  el.innerHTML = challenges.map(c => {
    const count = allPosts.filter(p => p.challengeId === c.id).length;
    const countryCounts = {};
    allPosts.filter(p => p.challengeId === c.id && p.country).forEach(p => { countryCounts[p.country] = (countryCounts[p.country] || 0) + 1; });
    const countries = Object.keys(countryCounts).sort((a,b) => countryCounts[b] - countryCounts[a]);
    return '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(c.title)+' — #'+escapeHtml(c.hashtag)+'</p>' +
    '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+count+' participation(s)</p>' +
    (countries.length >= 2 ? '<p style="margin:0 0 10px;">' + countries.map(cn => '<span style="display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); font-size:11px; padding:2px 8px; border-radius:8px; margin:0 4px 4px 0;">'+escapeHtml(cn)+' — '+countryCounts[cn]+'</span>').join('') + '</p>' : '') +
    '<button class="btn btn-outline btn-sm" onclick="endChallenge(\''+c.id+'\')">Clôturer le défi</button></div>';
  }).join('');
}
async function renderChallengesList(){
  const el = document.getElementById('challenges-list');
  if(!el) return;
  const challenges = (await fetchChallenges()).filter(c => c.status === 'active');
  if(challenges.length === 0){ el.innerHTML = '<div class="empty">Aucun défi pour l’instant — revenez bientôt !</div>'; return; }
  const allPosts = await fetchPosts();
  el.innerHTML = challenges.map(c => {
    const count = allPosts.filter(p => p.challengeId === c.id).length;
    const countryCount = new Set(allPosts.filter(p => p.challengeId === c.id && p.country).map(p => p.country)).size;
    return '<div class="card" style="cursor:pointer;" onclick="openChallengeDetail(\''+c.id+'\')">' +
      '<p style="margin:0 0 4px; font-size:14px; font-weight:600; font-family:\'Baloo 2\';">🔥 '+escapeHtml(c.title)+'</p>' +
      '<p style="margin:0 0 6px; font-size:12.5px; color:var(--gold);">#'+escapeHtml(c.hashtag)+'</p>' +
      '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+count+' participation(s)'+(countryCount >= 2 ? ' · 🌍 '+countryCount+' pays' : '')+'</p></div>';
  }).join('');
}
async function openChallengeDetail(challengeId){
  currentChallengeDetailId = challengeId;
  const c = await safeGet('challenge:' + challengeId, true);
  if(!c){ showToast('Défi introuvable'); return; }
  go('challenge-detail');
  document.getElementById('challenge-detail-title').textContent = c.title;
  document.getElementById('challenge-detail-info').innerHTML =
    '<p style="margin:0 0 6px; font-size:13px; color:var(--gold); font-weight:600;">#'+escapeHtml(c.hashtag)+'</p>' +
    '<p style="margin:0; font-size:13px; white-space:pre-line;">'+escapeHtml(c.description)+'</p>' +
    (c.reward ? '<p style="margin:8px 0 0; font-size:12.5px; color:var(--coral);">🏆 À gagner : '+escapeHtml(c.reward)+'</p>' : '');
  const submissionsEl = document.getElementById('challenge-submissions-list');
  const allPosts = await fetchPosts();
  const submissions = allPosts.filter(p => p.challengeId === challengeId && p.status === 'published').sort((a,b) => (b.likes||[]).length - (a.likes||[]).length);
  const countryBreakdownEl = document.getElementById('challenge-country-breakdown');
  if(countryBreakdownEl){
    const countryCounts = {};
    submissions.forEach(p => { if(p.country) countryCounts[p.country] = (countryCounts[p.country] || 0) + 1; });
    const countries = Object.keys(countryCounts).sort((a,b) => countryCounts[b] - countryCounts[a]);
    countryBreakdownEl.innerHTML = countries.length < 2 ? '' :
      '<p style="margin:0 0 6px; font-size:11.5px; color:rgba(245,239,227,0.5);">🌍 Participation par pays</p>' +
      countries.map(c => '<span style="display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); font-size:11.5px; padding:3px 10px; border-radius:8px; margin:0 4px 4px 0;">'+escapeHtml(c)+' — '+countryCounts[c]+'</span>').join('');
  }
  const canAward = isGenuineOwnerSession && c.reward;
  submissionsEl.innerHTML = submissions.length === 0 ? '<div class="empty">Aucune participation pour l’instant — soyez le premier !</div>' : submissions.map((p,i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    '<span onclick="openSinglePostView(\''+p.id+'\')" style="cursor:pointer; font-size:15px; font-family:\'Baloo 2\'; font-weight:700; width:24px; flex-shrink:0;">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1)+'.')+'</span>' +
    smallAvatarBadge(p.userId, 32) +
    '<div onclick="openSinglePostView(\''+p.id+'\')" style="flex:1; cursor:pointer;"><strong style="font-size:13px;" onclick="event.stopPropagation(); openUserProfile(\''+escapeHtml(p.userId)+'\')">@'+escapeHtml(p.userId)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">❤️ '+(p.likes||[]).length+' j’aime · 👁️ '+(p.views||0)+' vue(s)</p>' +
    (p.challengeRewardAwarded ? '<p style="margin:2px 0 0; font-size:11px; color:var(--gold);">🏆 Récompense déjà attribuée</p>' : '') +
    '</div>' +
    (canAward && !p.challengeRewardAwarded ? '<button class="btn btn-outline btn-sm" onclick="awardChallengeReward(\''+p.id+'\', \''+challengeId+'\')">🏆 Attribuer</button>' : '') +
    '</div>'
  ).join('');
}
async function awardChallengeReward(postId, challengeId){
  const c = await safeGet('challenge:' + challengeId, true);
  const p = await safeGet('post:' + postId, true);
  if(!c || !p || !c.reward) return;
  const ok = confirm('Attribuer la récompense « ' + c.reward + ' » à @' + p.userId + ' pour sa participation « ' + c.title + ' » ?');
  if(!ok) return;
  p.challengeRewardAwarded = true;
  await saveWithRetry('post:' + postId, p, true);
  await createNotification(p.userId, 'challenge_reward', currentAdminName || 'Suktum', postId, c.title + ' — ' + c.reward);
  showToast('Récompense attribuée ✓');
  await logAdminAction('Récompense de défi attribuée', '@' + p.userId + ' — ' + c.title + ' : ' + c.reward);
  await openChallengeDetail(challengeId);
}
function participateInChallenge(){
  currentPublishChallengeId = currentChallengeDetailId;
  go('publish');
}
async function renderPublishChallengeBanner(){
  const el = document.getElementById('publish-challenge-banner');
  if(!el) return;
  if(!currentPublishChallengeId){ el.innerHTML = ''; return; }
  const c = await safeGet('challenge:' + currentPublishChallengeId, true);
  if(!c){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card" style="border-color:var(--gold); margin:10px 0;"><p style="margin:0; font-size:12.5px; color:var(--gold);">🔥 Vous participez au défi « '+escapeHtml(c.title)+' » — #'+escapeHtml(c.hashtag)+'</p>' +
    '<span onclick="cancelChallengeParticipation()" style="font-size:11px; color:rgba(245,239,227,0.5); cursor:pointer;">Annuler</span></div>';
}
function cancelChallengeParticipation(){
  currentPublishChallengeId = null;
  renderPublishChallengeBanner();
}
async function fetchOfficialNews(){
  const keys = await safeList('officialnews:', true);
  const list = [];
  for(const k of keys){ const n = await safeGet(k, true); if(n) list.push(n); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function deleteOfficialNews(id){
  const ok = confirm('Supprimer cette actualité ?');
  if(!ok) return;
  await window.storage.delete('officialnews:' + id, true).catch(() => {});
  showToast('Actualité supprimée');
  await loadAdminOfficialNews();
}
async function loadAdminOfficialNews(){
  const el = document.getElementById('admin-official-news-list');
  if(!el) return;
  const news = await fetchOfficialNews();
  el.innerHTML = news.length === 0 ? '<div class="empty">Aucune actualité publiée pour l’instant.</div>' : news.map(n =>
    '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(n.title)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+new Date(n.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="deleteOfficialNews(\''+n.id+'\')">🗑️ Supprimer</button></div>'
  ).join('');
}
let selectedExamTargetFilter = '';
function setExamTargetFilter(target){
  selectedExamTargetFilter = (selectedExamTargetFilter === target) ? '' : target;
  renderExamPrepList();
}
async function renderExamPrepList(){
  if(!(await requireEducationSubscription())) return;
  const filtersEl = document.getElementById('exam-prep-filters');
  const targets = ['CFEE', 'BFEM', 'BAC', 'Concours'];
  filtersEl.innerHTML = targets.map(t =>
    '<button onclick="setExamTargetFilter(\''+t+'\')" style="flex-shrink:0; border:1px solid '+(selectedExamTargetFilter===t?'var(--gold)':'var(--line)')+'; background:'+(selectedExamTargetFilter===t?'var(--gold)':'transparent')+'; color:'+(selectedExamTargetFilter===t?'var(--night)':'var(--cream)')+'; border-radius:16px; padding:6px 14px; font-size:12px; font-family:\'Baloo 2\'; font-weight:600;">'+t+'</button>'
  ).join('');

  const el = document.getElementById('exam-prep-list');
  let courses = (await fetchCourses(false)).filter(c => c.examTarget);
  if(selectedExamTargetFilter) courses = courses.filter(c => c.examTarget === selectedExamTargetFilter);
  if(courses.length === 0){ el.innerHTML = '<div class="empty">'+(selectedExamTargetFilter ? 'Aucun cours pour '+escapeHtml(selectedExamTargetFilter)+' pour l’instant.' : 'Aucun cours de révision pour l’instant.')+'</div>'; return; }
  el.innerHTML = courses.map(c =>
    '<div class="card" style="cursor:pointer;" onclick="openCourseDetail(\''+c.id+'\')">' +
    '<span style="display:inline-block; background:rgba(242,183,5,0.15); border:1px solid var(--gold); border-radius:10px; padding:2px 8px; font-size:10.5px; color:var(--gold); margin-bottom:4px;">🎯 '+escapeHtml(c.examTarget)+'</span>' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(c.title)+'</p>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Par @'+escapeHtml(c.trainerUsername)+'</p>' +
    '</div>'
  ).join('');
}
async function renderOfficialNewsFeed(){
  const el = document.getElementById('official-news-list');
  if(!el) return;
  const news = await fetchOfficialNews();
  el.innerHTML = news.length === 0 ? '<div class="empty">Aucune actualité pour l’instant.</div>' : news.map(n =>
    '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 6px; font-size:14px; font-weight:600; font-family:\'Baloo 2\';">'+escapeHtml(n.title)+'</p>' +
    '<p style="margin:0 0 8px; font-size:13px; white-space:pre-line;">'+escapeHtml(n.content)+'</p>' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+escapeHtml(n.author)+' · '+new Date(n.createdAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
/* ---------- ANNUAIRE DES COMMERCES LOCAUX ---------- */
async function renderLocalDirectory(){
  const el = document.getElementById('local-directory-list');
  if(!el) return;
  const query = (document.getElementById('local-directory-search').value || '').trim().toLowerCase();
  const allProducts = await fetchProducts();
  const bySellerMap = {};
  for(const p of allProducts){
    if(!p.sellerUsername) continue;
    if(!bySellerMap[p.sellerUsername]) bySellerMap[p.sellerUsername] = [];
    bySellerMap[p.sellerUsername].push(p);
  }
  const sellers = [];
  for(const sellerUsername of Object.keys(bySellerMap)){
    const u = await safeGet('user:' + sellerUsername, true);
    if(!u || u.status === 'banned' || u.shopSuspended) continue;
    sellers.push({ username: sellerUsername, city: u.city || '', country: u.country || '', photo: u.photo || null, products: bySellerMap[sellerUsername] });
  }
  let filtered = sellers;
  if(query){
    filtered = sellers.filter(s =>
      s.username.toLowerCase().includes(query) ||
      s.city.toLowerCase().includes(query) ||
      s.country.toLowerCase().includes(query) ||
      s.products.some(p => p.name.toLowerCase().includes(query))
    );
  }
  if(filtered.length === 0){ el.innerHTML = '<div class="empty">'+(query ? 'Aucun résultat.' : 'Aucun commerce pour l’instant.')+'</div>'; return; }
  el.innerHTML = filtered.map(s =>
    '<div class="card" style="cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(s.username)+'\')">' +
    '<div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
    (s.photo ? '<img src="'+s.photo+'" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">' : smallAvatarBadge(s.username, 36)) +
    '<div><strong style="font-size:13px;">@'+escapeHtml(s.username)+'</strong>' +
    (s.city || s.country ? '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">📍 '+escapeHtml([s.city, s.country].filter(Boolean).join(', '))+'</p>' : '') +
    '</div></div>' +
    '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">'+s.products.length+' produit(s) — '+s.products.slice(0,3).map(p => escapeHtml(p.name)).join(', ')+(s.products.length > 3 ? '...' : '')+'</p>' +
    '</div>'
  ).join('');
}
/* ---------- ÉVÉNEMENTS COMMUNAUTAIRES ---------- */
async function createCommunityEvent(){
  const title = document.getElementById('new-event-title').value.trim();
  const desc = document.getElementById('new-event-desc').value.trim();
  const date = document.getElementById('new-event-date').value;
  const location = document.getElementById('new-event-location').value.trim();
  if(!title || !desc || !date || !location){ showToast('Renseignez tous les champs'); return; }
  const id = 'event_' + Date.now();
  await saveWithRetry('communityevent:' + id, {
    id, title, description: desc, date, location, organizer: currentUser, participants: [], createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-event-title').value = '';
  document.getElementById('new-event-desc').value = '';
  document.getElementById('new-event-date').value = '';
  document.getElementById('new-event-location').value = '';
  showToast('Événement publié ✓');
  go('community-events');
}
async function fetchCommunityEvents(){
  const keys = await safeList('communityevent:', true);
  const list = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) list.push(e); }
  list.sort((a,b) => new Date(a.date) - new Date(b.date));
  return list;
}
/* ---------- SONDAGES ---------- */
async function createPoll(){
  const question = document.getElementById('new-poll-question').value.trim();
  const options = [0,1,2,3].map(i => document.getElementById('new-poll-option-'+i).value.trim()).filter(Boolean);
  if(!question || options.length < 2){ showToast('Renseignez la question et au moins 2 options'); return; }
  const durationHours = parseInt(document.getElementById('new-poll-duration').value, 10);
  const id = 'poll_' + Date.now();
  await saveWithRetry('poll:' + id, {
    id, userId: currentUser, question, options, votes: {}, createdAt: new Date().toISOString(),
    expiresAt: durationHours > 0 ? new Date(Date.now() + durationHours*60*60*1000).toISOString() : null
  }, true);
  document.getElementById('new-poll-question').value = '';
  [0,1,2,3].forEach(i => document.getElementById('new-poll-option-'+i).value = '');
  showToast('Sondage publié ✓');
  go('polls');
}
async function fetchPolls(){
  const keys = await safeList('poll:', true);
  const list = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) list.push(p); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderPollsList(){
  const el = document.getElementById('polls-list');
  if(!el) return;
  const polls = await fetchPolls();
  if(polls.length === 0){ el.innerHTML = '<div class="empty">Aucun sondage pour l’instant.</div>'; return; }
  el.innerHTML = polls.map(p => renderPollCardHtml(p)).join('');
}
function renderPollCardHtml(p){
  const totalVotes = Object.values(p.votes || {}).reduce((s,arr) => s + arr.length, 0);
  const myVoteIndex = Object.keys(p.votes || {}).find(idx => (p.votes[idx]||[]).includes(currentUser));
  const isExpired = p.expiresAt && new Date(p.expiresAt) < new Date();
  let optionsHtml = '';
  if(myVoteIndex !== undefined || isExpired){
    optionsHtml = p.options.map((opt, i) => {
      const count = (p.votes[i] || []).length;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const mine = String(i) === myVoteIndex;
      return '<div style="margin-bottom:6px;"><div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:2px;"><span>'+(mine?'✓ ':'')+escapeHtml(opt)+'</span><span>'+pct+'%</span></div>' +
        '<div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px; overflow:hidden;"><div style="background:'+(mine?'var(--gold)':'var(--lagoon)')+'; height:100%; width:'+pct+'%;"></div></div></div>';
    }).join('');
  } else {
    optionsHtml = p.options.map((opt, i) =>
      '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:6px; text-align:left;" onclick="voteOnPoll(\''+p.id+'\', '+i+')">'+escapeHtml(opt)+'</button>'
    ).join('');
  }
  const durationLabel = isExpired
    ? '<p style="margin:0 0 8px; font-size:11px; color:var(--coral);">🔒 Sondage clos</p>'
    : (p.expiresAt ? '<p style="margin:0 0 8px; font-size:11px; color:var(--gold);">⏰ Se termine le '+new Date(p.expiresAt).toLocaleDateString('fr-FR', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})+'</p>' : '');
  return '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">@'+escapeHtml(p.userId)+'</p>' +
    '<p style="margin:0 0 6px; font-size:14px; font-weight:600;">'+escapeHtml(p.question)+'</p>' +
    durationLabel +
    optionsHtml +
    '<p style="margin:8px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">'+totalVotes+' vote(s)</p></div>';
}
async function voteOnPoll(pollId, optionIndex){
  const p = await safeGet('poll:' + pollId, true);
  if(!p) return;
  if(p.expiresAt && new Date(p.expiresAt) < new Date()){ showToast('Ce sondage est clos'); return; }
  const alreadyVoted = Object.values(p.votes || {}).some(arr => arr.includes(currentUser));
  if(alreadyVoted) return;
  if(!p.votes) p.votes = {};
  if(!p.votes[optionIndex]) p.votes[optionIndex] = [];
  p.votes[optionIndex].push(currentUser);
  await saveWithRetry('poll:' + pollId, p, true);
  await renderPollsList();
}
async function renderCommunityEventsList(){
  const el = document.getElementById('community-events-list');
  if(!el) return;
  const events = (await fetchCommunityEvents()).filter(e => new Date(e.date) >= new Date(new Date().toDateString()));
  el.innerHTML = events.length === 0 ? '<div class="empty">Aucun événement à venir pour l’instant.</div>' : events.map(e =>
    '<div class="card" style="cursor:pointer;" onclick="openEventDetail(\''+e.id+'\')">' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(e.title)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">📅 '+new Date(e.date).toLocaleDateString('fr-FR')+' · 📍 '+escapeHtml(e.location)+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">Par @'+escapeHtml(e.organizer)+' · '+e.participants.length+' participant(s)</p>' +
    '</div>'
  ).join('');
}
let currentEventDetailId = null;
async function openEventDetail(eventId){
  currentEventDetailId = eventId;
  go('event-detail');
  const el = document.getElementById('event-detail-content');
  const e = await safeGet('communityevent:' + eventId, true);
  if(!e){ el.innerHTML = '<div class="empty">Événement introuvable.</div>'; return; }
  const isParticipating = e.participants.includes(currentUser);
  el.innerHTML =
    '<p style="margin:0 0 4px; font-size:18px; font-weight:700; font-family:\'Baloo 2\';">'+escapeHtml(e.title)+'</p>' +
    '<p style="margin:0 0 14px; font-size:12.5px; color:rgba(245,239,227,0.6);">Organisé par @'+escapeHtml(e.organizer)+'</p>' +
    '<p style="margin:0 0 8px; font-size:13px;">📅 '+new Date(e.date).toLocaleDateString('fr-FR')+'</p>' +
    '<p style="margin:0 0 16px; font-size:13px;">📍 '+escapeHtml(e.location)+'</p>' +
    '<p style="margin:0 0 16px; font-size:13.5px; white-space:pre-line;">'+escapeHtml(e.description)+'</p>' +
    '<button class="btn '+(isParticipating ? 'btn-outline' : 'btn-primary')+'" style="width:100%; margin-bottom:14px;" onclick="toggleEventParticipation(\''+eventId+'\')">'+(isParticipating ? '✓ Vous participez — se désinscrire' : 'Je participe')+'</button>' +
    '<div class="eyebrow">'+e.participants.length+' participant(s)</div>' +
    (e.participants.length === 0 ? '<div class="empty">Aucun participant pour l’instant.</div>' : e.participants.map(p =>
      '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(p)+'\')">' + smallAvatarBadge(p, 28) + '<span style="font-size:13px;">@'+escapeHtml(p)+'</span></div>'
    ).join(''));
}
async function toggleEventParticipation(eventId){
  const e = await safeGet('communityevent:' + eventId, true);
  if(!e) return;
  if(e.participants.includes(currentUser)){
    e.participants = e.participants.filter(p => p !== currentUser);
  } else {
    e.participants.push(currentUser);
    if(e.organizer !== currentUser) await createNotification(e.organizer, 'event_participation', currentUser, eventId, e.title);
  }
  await saveWithRetry('communityevent:' + eventId, e, true);
  await openEventDetail(eventId);
}
async function checkOfficialStatementBanner(){
  const el = document.getElementById('official-statement-banner');
  if(!el) return;
  const s = await safeGet('settings:official_statement', true);
  if(s && s.text){
    el.style.display = 'block';
    el.innerHTML = '<div class="card" style="border-color:var(--gold); margin-bottom:6px;">' +
      '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); font-weight:700; text-transform:uppercase; letter-spacing:.04em;">✓ Vérifié par Suktum</p>' +
      '<p style="margin:0; font-size:13px; white-space:pre-line;">'+escapeHtml(s.text)+'</p></div>';
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

async function generateTrendsReport(){
  const resultEl = document.getElementById('trends-report-result');
  resultEl.textContent = '…';
  try{
    const posts = await fetchPosts();
    const users = await fetchUsers();
    const tagCounts = {};
    posts.forEach(p => extractHashtags(p.caption).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([t,c]) => t + ' (' + c + ')').join(', ');
    const countryCounts = {};
    users.forEach(u => { if(u.country) countryCounts[u.country] = (countryCounts[u.country] || 0) + 1; });
    const countryBreakdown = Object.entries(countryCounts).map(([c,n]) => c + ': ' + n).join(', ');
    const totalEngagement = posts.reduce((s,p) => s + (p.likes?p.likes.length:0) + (p.comments?p.comments.length:0), 0);
    const snapshot = "Utilisateurs : " + users.length + " (répartition par pays : " + (countryBreakdown || 'N/A') + ").\n" +
      "Publications : " + posts.length + ".\n" +
      "Mots-clés les plus populaires : " + (topTags || 'aucun') + ".\n" +
      "Engagement total (j'aime + commentaires) : " + totalEngagement + ".";
    const prompt = "Voici des données agrégées et anonymisées (aucune donnée individuelle) de la plateforme Suktum :\n\n" + snapshot +
      "\n\nRédige un court rapport de tendances (5-7 phrases) destiné à être vendu à des annonceurs externes : quels sujets/pays sont porteurs en ce moment, et une recommandation de ciblage publicitaire. Reste factuel, ne cite aucun nom d'utilisateur individuel.";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const report = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    resultEl.textContent = report ? '📊 ' + report : 'Rapport indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Rapport indisponible (connexion).';
  }
}
async function gatherDetailedAdminContext(){
  const users = await fetchUsers();
  const reports = await fetchReports();
  const reportsByTarget = {};
  reports.forEach(r => { if(r.targetUser){ reportsByTarget[r.targetUser] = (reportsByTarget[r.targetUser] || 0) + 1; } });
  const topReported = Object.entries(reportsByTarget).sort((a,b) => b[1] - a[1]).slice(0, 10);
  const sevenDaysAgo = Date.now() - 7*24*60*60*1000;
  const recentSignups = users.filter(u => new Date(u.createdAt).getTime() >= sevenDaysAgo);
  const signupsByCategory = {};
  recentSignups.forEach(u => { const cat = u.businessSector || u.country || 'non précisé'; signupsByCategory[cat] = (signupsByCategory[cat] || 0) + 1; });
  const appealKeys = await safeList('sanctionappeal:', true);
  let pendingAppeals = 0;
  for(const k of appealKeys){ const a = await safeGet(k, true).catch(() => null); if(a && a.status === 'pending') pendingAppeals++; }
  return "Total utilisateurs : " + users.length + ".\n" +
    "Nouvelles inscriptions (7 derniers jours) : " + recentSignups.length + ", réparties ainsi : " + Object.entries(signupsByCategory).map(([k,v]) => k+' : '+v).join(', ') + ".\n" +
    "Créateurs les plus signalés (tous types confondus, total réel de signalements reçus) : " + (topReported.length > 0 ? topReported.map(([u,c]) => '@'+u+' ('+c+' signalement(s))').join(', ') : 'aucun') + ".\n" +
    "Recours en attente d'examen : " + pendingAppeals + ".";
}
async function askAdminAIQuestion(){
  const question = document.getElementById('admin-ai-question-input').value.trim();
  if(!question){ showToast('Écrivez votre question d’abord'); return; }
  const resultEl = document.getElementById('admin-ai-question-result');
  resultEl.textContent = '…';
  try{
    const context = await gatherDetailedAdminContext();
    const prompt = "Tu es l’assistant du propriétaire de Suktum. Voici un vrai instantané de ses données :\n\n" + context +
      "\n\nQuestion du propriétaire : " + question +
      "\n\nRéponds en 2-4 phrases, en français simple, en te basant UNIQUEMENT sur les données ci-dessus. Si les données fournies ne permettent pas de répondre précisément, dis-le honnêtement plutôt que d’inventer un chiffre.";
    const provider = getAIProviderChoice('dailysummary');
    const answer = await callAIProvider(prompt, 300, provider);
    resultEl.textContent = answer ? '🧠 ' + answer : 'Réponse indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Réponse indisponible (connexion).';
  }
}
async function scanRecentLivesForRisk(){
  const el = document.getElementById('live-risk-scan-result');
  el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5);">Analyse en cours...</p>';
  const keys = await safeList('livechattranscript:', true);
  const transcripts = [];
  for(const k of keys){ const t = await safeGet(k, true).catch(() => null); if(t) transcripts.push(t); }
  transcripts.sort((a,b) => new Date(b.savedAt) - new Date(a.savedAt));
  const recent = transcripts.slice(0, 5);
  if(recent.length === 0){ el.innerHTML = '<div class="empty">Aucun compte-rendu de live récent à analyser.</div>'; return; }
  const results = [];
  for(const t of recent){
    const chatText = t.messages.map(m => '@'+m.username+' : '+m.text).join('\n').slice(0, 3000);
    const prompt = "Voici le texte du chat d’un live sur Suktum (streameur : @" + t.streamerUsername + ") :\n\n" + chatText +
      "\n\nY a-t-il un vrai risque de harcèlement, de contenu illicite, ou de non-respect des règles de vente dans ce chat ? Cherche aussi des signaux faibles : usage répété de mots ambigus, tentatives de contourner les filtres par l’orthographe phonétique ou des symboles à la place de lettres. Réponds en une seule phrase courte en français, soit 'Aucun risque détecté', soit une description brève du problème réel repéré.";
    const provider = getAIProviderChoice('dailysummary');
    const analysis = await callAIProvider(prompt, 100, provider).catch(() => null);
    const finalAnalysis = analysis || 'Analyse indisponible';
    results.push({ streamer: t.streamerUsername, savedAt: t.savedAt, analysis: finalAnalysis });
    if(finalAnalysis && !finalAnalysis.includes('Aucun risque') && finalAnalysis !== 'Analyse indisponible'){
      const u = await safeGet('user:' + t.streamerUsername, true);
      if(u && !u.underWatchlist){
        u.underWatchlist = true;
        u.watchlistReason = finalAnalysis;
        u.watchlistSince = new Date().toISOString();
        await saveWithRetry('user:' + t.streamerUsername, u, true);
        await logAdminAction('Compte placé sous surveillance renforcée (signal faible détecté)', '@' + t.streamerUsername + ' — ' + finalAnalysis.slice(0, 60));
      }
    }
  }
  el.innerHTML = results.map(r =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 4px; font-size:12.5px;">@'+escapeHtml(r.streamer)+' — '+new Date(r.savedAt).toLocaleDateString('fr-FR')+'</p>' +
    '<p style="margin:0; font-size:12px; color:'+(r.analysis.includes('Aucun risque') ? 'var(--lagoon)' : 'var(--coral)')+';">'+escapeHtml(r.analysis)+(!r.analysis.includes('Aucun risque') && r.analysis !== 'Analyse indisponible' ? ' — 👁️ placé sous surveillance' : '')+'</p></div>'
  ).join('');
}
async function generatePayoutsAIReport(targetElId){
  const resultEl = document.getElementById(targetElId || 'payouts-ai-result');
  resultEl.textContent = '…';
  try{
    const allOrders = await fetchOrders();
    const scopedOrders = adminScope === 'all' ? allOrders : allOrders.filter(o => o.country === adminScope);
    const unpaidOrders = scopedOrders.filter(o => o.sellerUsername && o.payoutStatus !== 'paid' && o.netAmount);
    if(unpaidOrders.length === 0){
      resultEl.textContent = '✓ Aucun reversement en attente pour l’instant.';
      return;
    }
    const bySeller = {};
    for(const o of unpaidOrders){
      if(!bySeller[o.sellerUsername]) bySeller[o.sellerUsername] = { count: 0, total: 0, products: new Set() };
      bySeller[o.sellerUsername].count++;
      bySeller[o.sellerUsername].total += o.netAmount;
      bySeller[o.sellerUsername].products.add(o.productName);
    }
    const allUsersForPayout = await fetchUsers();
    const priceFlags = [];
    const staleFlags = [];
    const now = new Date();
    for(const username of Object.keys(bySeller)){
      const sellerProducts = (await fetchProducts()).filter(p => p.sellerUsername === username);
      const changesCount = sellerProducts.reduce((s,p) => s + ((p.priceHistory && p.priceHistory.length) || 0), 0);
      if(changesCount >= 2) priceFlags.push(username + ' (' + changesCount + ' changements de prix)');
      const sellerOrders = unpaidOrders.filter(o => o.sellerUsername === username);
      const oldestOrder = sellerOrders.reduce((oldest, o) => !oldest || new Date(o.createdAt) < new Date(oldest.createdAt) ? o : oldest, null);
      if(oldestOrder){
        const daysWaiting = Math.floor((now - new Date(oldestOrder.createdAt)) / (24*60*60*1000));
        if(daysWaiting >= 14) staleFlags.push(username + ' (en attente depuis ' + daysWaiting + ' jours)');
      }
    }
    const summary = Object.entries(bySeller).map(([username, d]) =>
      '@' + username + ' : ' + d.count + ' commande(s), ' + d.total.toLocaleString('fr-FR') + ' FCFA dû, produits : ' + [...d.products].join(', ')
    ).join('\n');
    const prompt = "Tu aides le propriétaire d'une marketplace (Suktum) à traiter ses reversements en attente aux vendeurs. Voici la liste réelle (données vérifiées, pas déclaratives) :\n\n" + summary +
      (priceFlags.length ? "\n\nVendeurs ayant changé leurs prix plusieurs fois récemment (à vérifier avant paiement) : " + priceFlags.join(', ') : "\n\nAucun changement de prix suspect détecté.") +
      (staleFlags.length ? "\n\nVendeurs en attente depuis 14 jours ou plus (à prioriser pour ne pas les faire attendre davantage) : " + staleFlags.join(', ') : "\n\nAucun vendeur en attente depuis longtemps.") +
      "\n\nEn français, propose en 4-6 phrases un ordre de traitement priorisé (ex: petits montants d'abord pour aller vite, ou gros vendeurs fiables en premier, en tenant compte des vendeurs qui attendent depuis longtemps) et signale clairement s'il y a un cas à vérifier avant de payer. Ne cite aucun montant que tu n'as pas reçu ci-dessus.";
    const analysis = await callAIProvider(prompt, 500, await getGovernanceAIProvider());
    resultEl.textContent = analysis ? '🧠 ' + analysis : 'Analyse indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Analyse indisponible (connexion).';
  }
}
function getISOWeekKey(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}
async function checkWeeklyReport(){
  const el = document.getElementById('weekly-report-card');
  if(!el || adminScope !== 'all' || isModerator) { if(el) el.innerHTML = ''; return; }
  const currentWeekKey = getISOWeekKey(new Date());
  const lastShownWeek = await safeGet('settings:lastWeeklyReport', true);
  if(lastShownWeek === currentWeekKey){
    const saved = await safeGet('settings:weeklyReportText__' + currentWeekKey, true);
    el.innerHTML = '<p style="margin:0 0 4px; font-size:11px; color:var(--lagoon); text-transform:uppercase; letter-spacing:.04em;">📊 Rapport hebdomadaire</p>' +
      '<p style="margin:0; font-size:12.5px; color:var(--cream); line-height:1.6; white-space:pre-line;">'+(saved ? '🧠 ' + escapeHtml(saved) : '')+'</p>';
    return;
  }
  el.innerHTML = '<p style="margin:0 0 4px; font-size:11px; color:var(--lagoon); text-transform:uppercase; letter-spacing:.04em;">📊 Rapport hebdomadaire</p><p style="margin:0; font-size:12.5px;">…</p>';
  await saveWithRetry('settings:lastWeeklyReport', currentWeekKey, true);
  try{
    const snapshot = await gatherPlatformSnapshot();
    const payouts = await fetchAllPendingPayouts();
    const prompt = "Tu prépares le rapport hebdomadaire du propriétaire d'une application (Suktum), envoyé chaque semaine. Voici l'état réel de sa plateforme :\n\n" + snapshot +
      "\nReversements aux vendeurs en attente : " + payouts.length + ".\n\n" +
      "Rédige ce rapport en 4-6 phrases courtes, en français simple : une vue d'ensemble de la semaine, puis ce qui mérite son attention en priorité. Ne donne aucun chiffre que tu n'as pas reçu ci-dessus.";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const report = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if(report) await saveWithRetry('settings:weeklyReportText__' + currentWeekKey, report, true);
    el.innerHTML = '<p style="margin:0 0 4px; font-size:11px; color:var(--lagoon); text-transform:uppercase; letter-spacing:.04em;">📊 Rapport hebdomadaire</p>' +
      '<p style="margin:0; font-size:12.5px; color:var(--cream); line-height:1.6; white-space:pre-line;">'+(report ? '🧠 ' + escapeHtml(report) : 'Rapport indisponible pour le moment.')+'</p>';
  }catch(e){
    el.innerHTML = '<p style="margin:0 0 4px; font-size:11px; color:var(--lagoon); text-transform:uppercase; letter-spacing:.04em;">📊 Rapport hebdomadaire</p><p style="margin:0; font-size:12.5px;">Rapport indisponible (connexion).</p>';
  }
}
async function generateDailySummary(){
  const resultEl = document.getElementById('daily-summary-result');
  const todayKey = new Date().toISOString().slice(0,10);
  const cached = await safeGet('dailysummarycache:' + todayKey, true).catch(() => null);
  if(cached){
    resultEl.innerHTML = '🧠 ' + escapeHtml(cached.text) + '<p style="margin:6px 0 0; font-size:10px; color:rgba(245,239,227,0.4);">Généré aujourd’hui à ' + new Date(cached.createdAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) + ' — <span style="text-decoration:underline; cursor:pointer;" onclick="regenerateDailySummary()">régénérer</span></p>';
    return;
  }
  await regenerateDailySummary();
}
async function regenerateDailySummary(){
  const resultEl = document.getElementById('daily-summary-result');
  resultEl.textContent = '…';
  try{
    const snapshot = await gatherPlatformSnapshot();
    const payouts = await fetchAllPendingPayouts();
    const prompt = "Tu prépares le résumé quotidien du propriétaire d'une application (Suktum), à lire en 20 secondes chaque fois qu'il ouvre son back-office. Voici l'état réel de sa plateforme aujourd'hui :\n\n" + snapshot +
      "\nReversements aux vendeurs en attente : " + payouts.length + ".\n\n" +
      "Rédige ce résumé en 3-5 phrases courtes, en français simple, structuré ainsi : d'abord ce qui s'est passé aujourd'hui (nouveaux comptes, publications), puis — seulement s'il y en a — ce qui attend son action en priorité (signalements, lives, reversements). Si tout est calme, dis-le simplement. Ne donne aucun chiffre que tu n'as pas reçu ci-dessus.";
    const provider = getAIProviderChoice('dailysummary');
    const summary = await callAIProvider(prompt, 350, provider);
    if(summary){
      const todayKey = new Date().toISOString().slice(0,10);
      await saveWithRetry('dailysummarycache:' + todayKey, { text: summary, provider, createdAt: new Date().toISOString() }, true);
    }
    resultEl.textContent = summary ? '🧠 ' + (provider==='gemini'?'(Gemini) ':'') + summary : 'Résumé indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Résumé indisponible (connexion).';
  }
}
async function generateAIPlatformReport(){
  const resultEl = document.getElementById('ai-report-result');
  resultEl.textContent = '…';
  try{
    const snapshot = await gatherPlatformSnapshot();
    const prompt = "Tu es un assistant qui aide le propriétaire d'un réseau social (Suktum) à gérer sa plateforme. Voici un instantané de ses vraies données :\n\n" + snapshot +
      "\n\nRédige un résumé en 4 à 6 phrases, en français simple : ce qui va bien, ce qui mérite son attention en priorité (signalements, lives en attente...), et un conseil concret pour développer ses revenus. Ne donne aucun chiffre que tu n'as pas reçu ci-dessus.";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 500, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const analysis = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    resultEl.textContent = analysis ? '🧠 ' + analysis : 'Analyse indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Analyse indisponible (connexion).';
  }
}
async function askAIAboutPlatform(){
  const question = document.getElementById('ai-question-input').value.trim();
  const resultEl = document.getElementById('ai-question-result');
  if(!question){ resultEl.textContent = 'Écrivez votre question d’abord.'; return; }
  resultEl.textContent = '…';
  try{
    const snapshot = await gatherPlatformSnapshot();
    const prompt = "Voici un instantané des données réelles de l'application Suktum :\n\n" + snapshot +
      "\n\nLe propriétaire de l'app pose cette question : " + question +
      "\n\nRéponds en 1 à 3 phrases, en français, en te basant uniquement sur les données ci-dessus. Si la réponse ne s'y trouve pas, dis-le honnêtement plutôt que d'inventer un chiffre.";
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
    });
    const data = await response.json();
    const answer = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    resultEl.textContent = answer ? '🤖 ' + answer : 'Réponse indisponible pour le moment.';
  } catch(e){
    resultEl.textContent = 'Réponse indisponible (connexion).';
  }
}
async function loadGlobalRevenueDashboard(){
  const el = document.getElementById('global-revenue-card');
  if(!el) return;
  let orders = await fetchOrders();
  let gifts = await fetchGifts();
  let ads = await fetchAds();
  let premiumPayments = await fetchPremiumPayments();
  let badgePayments = await fetchBadgePayments();
  let boostPayments = await fetchBoostPayments();
  let ticketPayments = await fetchTicketPayments();
  if(adminScope !== 'all'){
    orders = orders.filter(o => o.country === adminScope);
    gifts = gifts.filter(g => g.country === adminScope);
    ads = ads.filter(a => !a.country || a.country === adminScope);
    premiumPayments = premiumPayments.filter(p => p.country === adminScope);
    badgePayments = badgePayments.filter(p => p.country === adminScope);
    boostPayments = boostPayments.filter(p => p.country === adminScope);
    ticketPayments = ticketPayments.filter(p => p.country === adminScope);
  }
  const boutiqueCommission = orders.reduce((s,o) => s + (o.commissionAmount || 0), 0);
  const giftCommission = gifts.reduce((s,g) => s + (g.commissionAmount || 0), 0);
  const adRevenue = ads.reduce((s,a) => s + (a.spent || 0), 0);
  const premiumRevenue = premiumPayments.reduce((s,p) => s + p.amount, 0);
  const badgeRevenue = badgePayments.reduce((s,p) => s + p.amount, 0);
  const boostRevenue = boostPayments.reduce((s,p) => s + p.amount, 0);
  const ticketCommissionRevenue = ticketPayments.reduce((s,p) => s + (p.commissionAmount || 0), 0);
  const totalRevenue = boutiqueCommission + giftCommission + adRevenue + premiumRevenue + badgeRevenue + boostRevenue + ticketCommissionRevenue;
  const totalGiftVolume = gifts.reduce((s,g) => s + g.amount, 0);
  el.innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">🛍️ Commission boutique : <strong>'+boutiqueCommission.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">🎁 Commission cadeaux live : <strong>'+giftCommission.toLocaleString('fr-FR')+' FCFA</strong> (sur '+totalGiftVolume.toLocaleString('fr-FR')+' FCFA envoyés)</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">📢 Revenus publicitaires : <strong>'+Math.round(adRevenue).toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">✓ Badges vérifiés : <strong>'+badgeRevenue.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">🚀 Boosts de publications : <strong>'+boostRevenue.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">🎟️ Commission billets live : <strong>'+ticketCommissionRevenue.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0 0 4px; font-size:13px;">⭐ Revenus Premium : <strong>'+premiumRevenue.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:8px 0 0; font-size:15px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">💰 Revenu total de la plateforme : '+Math.round(totalRevenue).toLocaleString('fr-FR')+' FCFA</p>';
}
async function loadAdminGiftsList(){
  const el = document.getElementById('admin-gifts-list');
  if(!el) return;
  let gifts = await fetchGifts();
  if(adminScope !== 'all') gifts = gifts.filter(g => g.country === adminScope);
  if(gifts.length === 0){ el.innerHTML = '<div class="empty">Aucun cadeau envoyé pour l’instant.</div>'; return; }
  el.innerHTML = gifts.slice(0, 30).map(g =>
    '<div class="card" style="padding:10px 14px;">' +
    '<p style="margin:0; font-size:12.5px;">@'+escapeHtml(g.fromUser)+' → @'+escapeHtml(g.toUser)+' : <strong style="color:var(--gold);">'+g.amount.toLocaleString('fr-FR')+' FCFA</strong>' +
    ' <span style="color:rgba(245,239,227,0.5);">(commission '+(g.commissionAmount||0).toLocaleString('fr-FR')+' FCFA)</span></p>' +
    '</div>'
  ).join('');
}
async function loadOrdersAndRevenue(){
  const summaryEl = document.getElementById('revenue-summary-card');
  const listEl = document.getElementById('admin-orders-list');
  if(!summaryEl || !listEl) return;
  let orders = await fetchOrders();
  if(adminScope !== 'all') orders = orders.filter(o => o.country === adminScope);
  const totalSales = orders.reduce((s,o) => s + o.total, 0);
  const totalCommission = orders.reduce((s,o) => s + (o.commissionAmount || 0), 0);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  summaryEl.innerHTML =
    '<p style="margin:0 0 4px; font-size:13px;">🧾 <strong>'+orders.length+'</strong> commande(s), dont <strong>'+pendingCount+'</strong> en attente</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">💵 Ventes totales : <strong>'+totalSales.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '<p style="margin:0; font-size:13px; color:var(--gold);">💰 Commission gagnée : <strong>'+totalCommission.toLocaleString('fr-FR')+' FCFA</strong></p>';
  if(orders.length === 0){ listEl.innerHTML = '<div class="empty">Aucune commande pour l’instant.</div>'; return; }
  listEl.innerHTML = orders.map(o =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(o.productName)+'</strong> × '+o.quantity+(adminScope === 'all' ? ' — '+o.total.toLocaleString('fr-FR')+' FCFA' : '')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">@'+escapeHtml(o.buyerUsername)+' · '+escapeHtml(o.buyerPhone)+(o.country ? ' · '+escapeHtml(o.country) : '')+'</p>' +
    (adminScope === 'all' ? '<p style="margin:0 0 8px; font-size:12px; color:var(--gold);">Commission ('+(o.commissionRate||0)+'%) : '+(o.commissionAmount||0).toLocaleString('fr-FR')+' FCFA</p>' : '') +
    (o.status === 'fulfilled'
      ? '<span style="font-size:12px; color:var(--lagoon);">✓ Traitée</span>'
      : '<button class="btn btn-outline btn-sm" onclick="markOrderFulfilled(\''+o.id+'\')">✓ Marquer comme traitée</button>') +
    '</div>'
  ).join('');
}
async function markOrderFulfilled(id){
  const o = await safeGet('order:' + id, true);
  if(!o) return;
  o.status = 'fulfilled';
  await saveWithRetry('order:' + id, o, true);
  showToast('Commande marquée comme traitée ✓');
  await logAdminAction('Commande marquée traitée', o.productName + ' — @' + o.buyerUsername);
  await loadOrdersAndRevenue();
}
async function addProduct(){
  const name = document.getElementById('admin-product-name').value.trim();
  const price = parseInt(document.getElementById('admin-product-price').value, 10);
  const country = document.getElementById('admin-product-country').value;
  const fileInput = document.getElementById('admin-product-image');
  if(!name || isNaN(price) || price <= 0){ showToast('Renseignez au moins le nom et un prix valide'); return; }
  let image = null;
  if(fileInput.files[0]){
    try{ image = await readFileAsDataURL(fileInput.files[0]); }catch(e){}
  }
  const id = 'prod_' + Date.now();
  await saveWithRetry('product:' + id, {id, name, price, country, image, createdAt: new Date().toISOString()}, true);
  document.getElementById('admin-product-name').value = '';
  document.getElementById('admin-product-price').value = '';
  fileInput.value = '';
  showToast('Produit ajouté ✓');
  await loadAdminProductsList();
  await loadAdminDashboard();
}
async function adminDeleteProduct(id){
  await window.storage.delete('product:' + id, true).catch(() => {});
  showToast('Produit supprimé');
  await loadAdminProductsList();
}

/* ---------- SIGNALEMENTS ---------- */
async function deleteCommentFromReport(reportId){
  const r = await safeGet('report:' + reportId, true);
  if(!r || r.type !== 'comment') return;
  const [postId, indexStr] = r.targetId.split('__');
  const storedIndex = parseInt(indexStr, 10);
  const p = await safeGet('post:' + postId, true);
  if(!p){ showToast('Cette publication n’existe plus'); return; }
  let realIndex = (p.comments[storedIndex] && p.comments[storedIndex].text === r.commentText && p.comments[storedIndex].user === r.targetUser) ? storedIndex : -1;
  if(realIndex === -1) realIndex = p.comments.findIndex(c => c.text === r.commentText && c.user === r.targetUser);
  if(realIndex === -1){
    showToast('Ce commentaire a peut-être déjà été modifié ou supprimé — vérifiez la publication directement');
    return;
  }
  if(!confirm('Supprimer définitivement ce commentaire ?')) return;
  p.comments.splice(realIndex, 1);
  if(p.pinnedCommentIndex !== null && p.pinnedCommentIndex !== undefined){
    if(p.pinnedCommentIndex === realIndex) p.pinnedCommentIndex = null;
    else if(p.pinnedCommentIndex > realIndex) p.pinnedCommentIndex -= 1;
  }
  await saveWithRetry('post:' + postId, p, true);
  showToast('Commentaire supprimé ✓');
  await logAdminAction('Commentaire supprimé suite à signalement', '@' + r.targetUser + ' — « ' + r.commentText.slice(0,60) + ' »');
  await resolveReport(reportId, 'approved');
}
async function reportComment(index){
  const p = await safeGet('post:' + currentCommentsPostId, true);
  if(!p || !p.comments[index]) return;
  const reason = prompt('Pourquoi signalez-vous ce commentaire ?');
  if(reason === null || !reason.trim()) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'comment', targetId: currentCommentsPostId + '__' + index, targetUser: p.comments[index].user,
    commentText: p.comments[index].text, commentImageData: p.comments[index].imageData || null, commentSticker: p.comments[index].sticker || null,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Signalement envoyé, merci ⚠️');
}
async function reportEpisode(seriesId, episodeIndex){
  const reason = prompt('Pourquoi signalez-vous cet épisode ?');
  if(reason === null || !reason.trim()) return;
  const s = await safeGet('series:' + seriesId, true);
  if(!s) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'series_episode', targetId: seriesId + '__' + episodeIndex, targetUser: s.createdBy,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Signalement envoyé, merci ⚠️');
}
async function openProductActionsMenu(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  const isMine = p.sellerUsername === currentUser;
  const wishlist = await safeGet('wishlist:' + currentUser, true).catch(() => []) || [];
  const favorited = wishlist.includes(productId);
  const seller = p.sellerUsername ? await safeGet('user:' + p.sellerUsername, true).catch(() => null) : null;
  const items = [];
  items.push({ icon: '📤', label: 'Partager', action: 'closeProductActionsMenu(); shareProductListing(\''+productId+'\')' });
  if(!isMine) items.push({ icon: '⚠️', label: 'Signaler', action: 'closeProductActionsMenu(); reportProduct(\''+productId+'\')' });
  items.push({ icon: favorited ? '❤️' : '🤍', label: favorited ? 'Retiré des favoris' : 'Ajouter aux favoris', action: 'toggleWishlist(\''+productId+'\'); closeProductActionsMenu()' });
  if(!isMine && seller && seller.whatsappNumber) items.push({ icon: '💬', label: 'Contacter le vendeur', action: 'closeProductActionsMenu(); window.open(\'https://wa.me/'+seller.whatsappNumber.replace(/[^0-9+]/g, '').replace('+', '')+'\', \'_blank\')' });
  const el = document.getElementById('product-actions-menu-content');
  el.innerHTML = items.map(it => '<div onclick="'+it.action+'" style="display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; padding:6px 0;"><span style="font-size:22px; width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:rgba(245,239,227,0.08); border-radius:50%;">'+it.icon+'</span><span style="font-size:10.5px; text-align:center; color:rgba(245,239,227,0.8);">'+it.label+'</span></div>').join('');
  document.getElementById('product-actions-menu-overlay').style.display = 'block';
}
function closeProductActionsMenu(){
  document.getElementById('product-actions-menu-overlay').style.display = 'none';
}
async function shareProductListing(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  const text = p.name + ' — ' + (p.price ? p.price.toLocaleString('fr-FR') + ' FCFA' : '') + ' sur Suktum';
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Description copiée ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function openBuyerOrderKebabMenu(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o) return;
  const reminder = o.productId ? await safeGet('recurringreminder:' + currentUser + '__' + o.productId, true) : null;
  const items = [];
  items.push({ icon: '🧾', label: 'Suivi détaillé', action: 'closeGenericKebabMenu(); openOrderReceipt(\''+orderId+'\')' });
  if(o.status !== 'cancelled' && o.shipmentStage !== 'shipped' && o.shipmentStage !== 'delivered'){
    items.push({ icon: '✕', label: 'Annuler ma commande', action: 'closeGenericKebabMenu(); cancelMyOrder(\''+orderId+'\')' });
  }
  if(o.shipmentStage === 'delivered'){
    items.push({ icon: '⚠️', label: 'Faire une réclamation', action: 'closeGenericKebabMenu(); openOrderReceipt(\''+orderId+'\'); setTimeout(() => { const el = document.getElementById(\'refund-request-area\'); if(el) el.scrollIntoView({behavior:\'smooth\', block:\'center\'}); }, 200);' });
  }
  if(o.productId){
    items.push(reminder && reminder.active
      ? { icon: '🔔', label: 'Rappel actif — annuler', action: 'closeGenericKebabMenu(); cancelRecurringReminder(\''+o.productId+'\')' }
      : { icon: '🔔', label: 'Me rappeler de renouveler', action: 'closeGenericKebabMenu(); activateRecurringReminder(\''+o.productId+'\', \''+escapeHtml(o.productName).replace(/'/g,"\\'")+'\')' });
  }
  openGenericKebabMenu(items);
}
async function openSellerOrderKebabMenu(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o) return;
  const items = [];
  items.push({ icon: '💬', label: 'Discuter avec l’acheteur', action: 'closeGenericKebabMenu(); openThread(\''+escapeHtml(o.buyerUsername).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '📋', label: 'Historique avec ce client', action: 'closeGenericKebabMenu(); openCustomerHistory(\''+escapeHtml(o.buyerUsername).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🧾', label: 'Voir le reçu', action: 'closeGenericKebabMenu(); openOrderReceipt(\''+orderId+'\')' });
  if(o.status !== 'cancelled' && o.shipmentStage !== 'shipped' && o.shipmentStage !== 'delivered'){
    items.push({ icon: '✕', label: 'Annuler la commande', action: 'closeGenericKebabMenu(); sellerCancelOrder(\''+orderId+'\')' });
  }
  openGenericKebabMenu(items);
}
function openDiscoverSectionKebab(section){
  const sections = {
    tools: [
      { icon: '🗓️', label: 'Mon agenda', action: 'closeGenericKebabMenu(); go(\'my-agenda\')' },
      { icon: '📖', label: 'Carnet de vocabulaire', action: 'closeGenericKebabMenu(); go(\'vocab-notebook\')' },
      { icon: '🎓', label: 'Vérifier une attestation', action: 'closeGenericKebabMenu(); go(\'verify-certificate\')' },
      { icon: '📱', label: 'Amis via mes contacts', action: 'closeGenericKebabMenu(); findFriendsFromContacts()' }
    ],
    community: [
      { icon: '🏆', label: 'Créateur/formateur du mois', action: 'closeGenericKebabMenu(); go(\'creator-vote\')' },
      { icon: '👥', label: 'Groupes à thème', action: 'closeGenericKebabMenu(); go(\'community-groups\')' },
      { icon: '🌳', label: 'Penc — Salons vocaux', action: 'closeGenericKebabMenu(); go(\'penc-browse\')' },
      { icon: '🗳️', label: 'Sondages', action: 'closeGenericKebabMenu(); go(\'polls\')' },
      { icon: '🎗️', label: 'Cagnottes', action: 'closeGenericKebabMenu(); go(\'cagnottes-browse\')' },
      { icon: '🤝', label: 'Partenariats', action: 'closeGenericKebabMenu(); go(\'affiliate-partnerships\')' },
      { icon: '📰', label: 'Actualités', action: 'closeGenericKebabMenu(); go(\'official-news\')' },
      { icon: '🗺️', label: 'Commerces', action: 'closeGenericKebabMenu(); go(\'local-directory\')' },
      { icon: '🎪', label: 'Événements', action: 'closeGenericKebabMenu(); go(\'community-events\')' }
    ],
    learning: [
      { icon: '🕯️', label: 'Capsules de sagesse', action: 'closeGenericKebabMenu(); go(\'wisdom-capsules\')' },
      { icon: '📚', label: 'Guides et e-books', action: 'closeGenericKebabMenu(); go(\'ebook-library\')' },
      { icon: '🏛️', label: 'Coin institutionnel & DER', action: 'closeGenericKebabMenu(); go(\'institutional-corner\')' },
      { icon: '📚', label: 'Séries payantes', action: 'closeGenericKebabMenu(); go(\'series-list\')' },
      { icon: '🎯', label: 'Révisions examens', action: 'closeGenericKebabMenu(); go(\'exam-prep\')' },
      { icon: '🏅', label: 'Classement élèves', action: 'closeGenericKebabMenu(); go(\'students-leaderboard\')' }
    ],
    entertainment: [
      { icon: '🎵', label: 'Bibliothèque de musiques', action: 'closeGenericKebabMenu(); go(\'music-library\')' },
      { icon: '🎶', label: 'Sons tendance', action: 'closeGenericKebabMenu(); go(\'trending-sounds\')' },
      { icon: '🎵', label: 'Playlists collaboratives', action: 'closeGenericKebabMenu(); go(\'collab-playlists-browse\')' },
      { icon: '🔥', label: 'Défis & Trends', action: 'closeGenericKebabMenu(); go(\'challenges\')' }
    ],
    settings: [
      { icon: '🗳️', label: 'Voter pour les fonctionnalités', action: 'closeGenericKebabMenu(); go(\'feature-votes\')' }
    ]
  };
  openGenericKebabMenu(sections[section] || []);
}
function openTeamManagementKebabMenu(){
  openGenericKebabMenu([
    { icon: '🚨', label: 'Kill switch d\'urgence', action: 'closeGenericKebabMenu(); confirmEmergencyKillSwitch()' },
    { icon: '🕓', label: 'Historique connexions', action: 'closeGenericKebabMenu(); go(\'dg-config-menu\')' },
    { icon: '🗂️', label: 'Journal d\'audit', action: 'closeGenericKebabMenu(); go(\'global-audit\')' }
  ]);
}
function openSfxLibraryKebabMenu(){
  openGenericKebabMenu([
    { icon: '📻', label: 'Sons tendances', action: 'closeGenericKebabMenu(); document.getElementById(\'admin-trending-sounds-list\').scrollIntoView({behavior:\'smooth\'})' },
    { icon: '💰', label: 'Redevances', action: 'closeGenericKebabMenu(); document.getElementById(\'admin-royalty-tracking-list\').scrollIntoView({behavior:\'smooth\'})' },
    { icon: '🎓', label: 'Filtrage IA pédagogique', action: 'closeGenericKebabMenu(); go(\'admin\')' }
  ]);
}
function openPlatformSettingsKebabMenu(){
  openGenericKebabMenu([
    { icon: '🗂️', label: 'Journal & alertes', action: 'closeGenericKebabMenu(); go(\'global-audit\')' },
    { icon: '⋮', label: 'Menu DG complet', action: 'closeGenericKebabMenu(); go(\'dg-config-menu\')' }
  ]);
}
function openGenericKebabMenu(items){
  const el = document.getElementById('generic-kebab-menu-content');
  el.innerHTML = items.map(it => '<div onclick="'+it.action+'" style="display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; padding:6px 0;"><span style="font-size:22px; width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:rgba(245,239,227,0.08); border-radius:50%;">'+it.icon+'</span><span style="font-size:10.5px; text-align:center; color:rgba(245,239,227,0.8);">'+it.label+'</span></div>').join('');
  document.getElementById('generic-kebab-menu-overlay').style.display = 'block';
}
function closeGenericKebabMenu(){
  document.getElementById('generic-kebab-menu-overlay').style.display = 'none';
}
async function reportProduct(productId){
  const reason = prompt('Pourquoi signalez-vous cette annonce ?');
  if(reason === null || !reason.trim()) return;
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'product', targetId: productId, targetUser: p.sellerUsername || null,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Signalement envoyé, merci ⚠️');
}
async function reportPost(postId){
  const reason = prompt('Pourquoi signalez-vous cette publication ?');
  if(reason === null || !reason.trim()) return;
  const posts = await fetchPosts();
  const post = posts.find(p => p.id === postId);
  if(!post) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'post', targetId: postId, targetUser: post.userId,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Signalement envoyé, merci ⚠️');
}
async function reportLive(){
  if(!currentLiveView) return;
  openGenericKebabMenu([
    { icon: '😡', label: 'Harcèlement', action: 'closeGenericKebabMenu(); submitLiveReport(\'harcelement\')' },
    { icon: '🚫', label: 'Contenu illicite', action: 'closeGenericKebabMenu(); submitLiveReport(\'contenu_illicite\')' },
    { icon: '🛍️', label: 'Non-respect règles de vente', action: 'closeGenericKebabMenu(); submitLiveReport(\'vente\')' },
    { icon: '❓', label: 'Autre', action: 'closeGenericKebabMenu(); submitLiveReport(\'autre\')' }
  ]);
}
async function submitLiveReport(category){
  if(!currentLiveView) return;
  const reason = prompt('Précisez le problème (visible par la modération) :');
  if(reason === null || !reason.trim()) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'live', category, targetId: currentLiveView.id, targetUser: currentLiveView.username,
    reporterUser: currentUser, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await checkLiveReportThreshold(currentLiveView.id, currentLiveView.username);
  showToast('Live signalé, merci ⚠️');
}
/* ---------- SEUIL DE SIGNALEMENTS AVANT ACTION SUR UN LIVE (jamais un seul signalement) ---------- */
async function getLiveReportThresholds(){
  const warn = await safeGet('settings:liveReportWarnThreshold', true);
  const cooldown = await safeGet('settings:liveReportCooldownThreshold', true);
  const cut = await safeGet('settings:liveReportCutThreshold', true);
  return { warn: (typeof warn === 'number' && warn >= 2) ? warn : 3, cooldown: (typeof cooldown === 'number' && cooldown >= 2) ? cooldown : 4, cut: (typeof cut === 'number' && cut >= 2) ? cut : 6 };
}
async function saveLiveReportThresholds(){
  const warn = parseInt(document.getElementById('live-report-warn-threshold').value, 10);
  const cooldown = parseInt(document.getElementById('live-report-cooldown-threshold').value, 10);
  const cut = parseInt(document.getElementById('live-report-cut-threshold').value, 10);
  if(isNaN(warn) || warn < 2 || isNaN(cooldown) || cooldown < 2 || isNaN(cut) || cut < 2){ showToast('Les trois seuils doivent être d’au moins 2 — jamais un seul signalement'); return; }
  if(cooldown < warn || cut < cooldown){ showToast('Les seuils doivent être croissants : avertir ≤ couper le chat ≤ couper le live'); return; }
  const { warn: oldWarn, cooldown: oldCooldown, cut: oldCut } = await getLiveReportThresholds();
  await saveWithRetry('settings:liveReportWarnThreshold', warn, true);
  await saveWithRetry('settings:liveReportCooldownThreshold', cooldown, true);
  await saveWithRetry('settings:liveReportCutThreshold', cut, true);
  if(oldWarn !== warn) await logCommissionChange('Seuil avertissement live', oldWarn, warn);
  if(oldCooldown !== cooldown) await logCommissionChange('Seuil cool-down live', oldCooldown, cooldown);
  if(oldCut !== cut) await logCommissionChange('Seuil coupure live', oldCut, cut);
  showToast('Seuils enregistrés ✓');
}
async function loadLiveReportThresholds(){
  const { warn, cut } = await getLiveReportThresholds();
  const warnInput = document.getElementById('live-report-warn-threshold');
  const cutInput = document.getElementById('live-report-cut-threshold');
  if(warnInput) warnInput.value = warn;
  if(cutInput) cutInput.value = cut;
}
async function countDistinctLiveReporters(liveId){
  const keys = await safeList('report:', true);
  const reporters = new Set();
  for(const k of keys){
    const r = await safeGet(k, true);
    if(r && r.type === 'live' && r.targetId === liveId) reporters.add(r.reporterUser);
  }
  return reporters.size;
}
async function getBlockSpikeThreshold(){
  const threshold = await safeGet('settings:blockSpikeThreshold', true);
  return (typeof threshold === 'number' && threshold >= 3) ? threshold : 5;
}
let currentTrainerDisputeTarget = null;
function openTrainerDisputeForm(trainerUsername){
  currentTrainerDisputeTarget = trainerUsername;
  go('trainer-dispute-form');
  document.getElementById('trainer-dispute-target-label').textContent = 'Concernant : @' + trainerUsername;
  document.getElementById('trainer-dispute-description').value = '';
}
async function submitTrainerDispute(){
  const description = document.getElementById('trainer-dispute-description').value.trim();
  if(!description){ showToast('Décrivez la situation avant d’envoyer'); return; }
  if(!currentTrainerDisputeTarget) return;
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'trainer_dispute', targetId: null, targetUser: currentTrainerDisputeTarget,
    reporterUser: currentUser, reason: description, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Votre signalement a été transmis à la direction en toute confidentialité ✓');
  go('privacy-settings');
}
async function fileHarassmentReportWithEvidence(reportedUsername){
  const evidenceLines = [];
  const dmKey = 'dm:' + threadKeyFor(currentUser, reportedUsername);
  const msgs = (await safeGet(dmKey, true).catch(() => null)) || [];
  const recentMsgs = msgs.slice(-5);
  if(recentMsgs.length > 0){
    evidenceLines.push('— Derniers messages privés —');
    recentMsgs.forEach(m => evidenceLines.push('@' + m.from + ' : ' + m.text));
  }
  const myPosts = (await fetchPosts()).filter(p => p.userId === currentUser);
  const theirComments = [];
  myPosts.forEach(p => {
    (p.comments || []).forEach(c => { if(c.user === reportedUsername) theirComments.push({ postId: p.id, text: c.text, ts: c.ts }); });
  });
  theirComments.sort((a,b) => new Date(b.ts) - new Date(a.ts));
  const recentComments = theirComments.slice(0, 5);
  if(recentComments.length > 0){
    evidenceLines.push('— Derniers commentaires sur mes publications —');
    recentComments.forEach(c => evidenceLines.push('« ' + c.text + ' »'));
  }
  const id = 'report_' + Date.now();
  await saveWithRetry('report:' + id, {
    id, type: 'account_harassment', targetId: null, targetUser: reportedUsername,
    reporterUser: currentUser, reason: 'Harcèlement/comportement abusif signalé au moment du blocage',
    evidence: evidenceLines.length > 0 ? evidenceLines.join('\n') : 'Aucun échange récent disponible en preuve.',
    status: 'pending', createdAt: new Date().toISOString()
  }, true);
  await maybeAutoTriageReport(id);
  showToast('Compte aussi signalé aux modérateurs ✓');
}
async function renderAdminTrainerDisputes(){
  const el = document.getElementById('admin-trainer-disputes-list');
  if(!el) return;
  const keys = await safeList('report:', true);
  const allDisputes = [];
  for(const k of keys){ const r = await safeGet(k, true).catch(() => null); if(r && r.type === 'trainer_dispute') allDisputes.push({...r, key: k}); }
  const byTrainer = {};
  allDisputes.forEach(d => { if(!byTrainer[d.targetUser]) byTrainer[d.targetUser] = []; byTrainer[d.targetUser].push(d); });
  const reputationHtml = Object.keys(byTrainer).length === 0 ? '' :
    '<div class="eyebrow" style="margin-top:0;">📊 Dossier de réputation par formateur</div>' +
    Object.entries(byTrainer).sort((a,b) => b[1].length - a[1].length).map(([trainer, list]) =>
      '<div class="card" style="margin-bottom:6px;"><p style="margin:0; font-size:12.5px;"><strong>@'+escapeHtml(trainer)+'</strong> — '+list.length+' signalement(s) au total ('+list.filter(d => d.status === 'pending').length+' en attente)</p></div>'
    ).join('') + '<div class="eyebrow">⏳ Signalements en attente d’examen</div>';
  const disputes = allDisputes.filter(d => d.status === 'pending');
  disputes.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(disputes.length === 0){ el.innerHTML = reputationHtml + '<div class="empty">Aucun signalement de formateur en attente.</div>'; return; }
  el.innerHTML = reputationHtml + disputes.map(d =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">Formateur : <strong>@'+escapeHtml(d.targetUser)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.6);">Signalé par @'+escapeHtml(d.reporterUser)+' — « '+escapeHtml(d.reason)+' »</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="resolveTrainerDispute(\''+d.key+'\', \'warning\')">⚠️ Avertissement</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveTrainerDispute(\''+d.key+'\', \'reconciliation\')">🤝 Conciliation</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="resolveTrainerDispute(\''+d.key+'\', \'replacement\')">🔁 Remplacer le formateur</button>' +
    '</div></div>'
  ).join('');
}
async function resolveTrainerDispute(reportKey, decision){
  const r = await safeGet(reportKey, true);
  if(!r) return;
  r.status = 'resolved';
  r.resolution = decision;
  await saveWithRetry(reportKey, r, true);
  if(decision === 'warning'){
    const u = await safeGet('user:' + r.targetUser, true);
    if(u){
      if(!u.warnings) u.warnings = [];
      u.warnings.push({ reason: 'Différend avec un(e) élève : ' + r.reason, createdAt: new Date().toISOString() });
      await saveWithRetry('user:' + r.targetUser, u, true);
      await createNotification(r.targetUser, 'warning', 'Suktum', null, 'Un différend a été signalé et examiné par la direction.');
    }
  } else if(decision === 'replacement'){
    const u = await safeGet('user:' + r.targetUser, true);
    if(u){ u.flaggedForReplacement = true; await saveWithRetry('user:' + r.targetUser, u, true); }
  }
  await logAdminAction('Différend formateur résolu (' + (decision === 'warning' ? 'avertissement' : decision === 'reconciliation' ? 'conciliation' : 'remplacement demandé') + ')', '@' + r.targetUser);
  showToast('Différend traité ✓');
  await renderAdminTrainerDisputes();
}
async function checkReportSpikeAlert(){
  const reportKeys = await safeList('report:', true);
  const reports = [];
  for(const k of reportKeys){ const r = await safeGet(k, true).catch(() => null); if(r) reports.push(r); }
  const oneHourAgo = Date.now() - 60*60*1000;
  const recentCount = reports.filter(r => new Date(r.createdAt).getTime() >= oneHourAgo).length;
  if(recentCount < 10) return;
  const existing = await safeGet('settings:criticalAlertReportSpike', true);
  if(!existing || new Date(existing.createdAt).getTime() < oneHourAgo){
    await saveWithRetry('settings:criticalAlertReportSpike', { count: recentCount, createdAt: new Date().toISOString() }, true);
  }
}
async function renderCentralDashboardSummary(){
  const el = document.getElementById('central-dashboard-summary');
  if(!el) return;
  const payouts = await fetchAllPendingPayouts();
  const totalPayoutAmount = payouts.reduce((s,o) => s + (o.netAmount||0), 0);
  const reportKeys = await safeList('report:', true);
  let pendingReports = 0;
  for(const k of reportKeys){ const r = await safeGet(k, true).catch(() => null); if(r && r.status === 'pending') pendingReports++; }
  const regionalAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  const activeRegionalAdmins = regionalAdmins.filter(a => !a.revokedAt && a.active !== false).length;
  const revokedRegionalAdmins = regionalAdmins.filter(a => a.revokedAt).length;
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const activeModerators = moderators.filter(m => !m.revokedAt && m.active !== false).length;
  const mediaFlaggedKeys = await safeList('post:', true);
  let flaggedMediaCount = 0;
  for(const k of mediaFlaggedKeys){ const p = await safeGet(k, true).catch(() => null); if(p && p.mediaFlagged) flaggedMediaCount++; }
  const courseKeys = await safeList('course:', true);
  let unvalidatedContentCount = 0;
  for(const k of courseKeys){
    const lessonKeys = await safeList('lesson:' + k.replace('course:','') + '__', true);
    for(const lk of lessonKeys){ const l = await safeGet(lk, true).catch(() => null); if(l && !l.aiFlagged && !l.validatedForSearch) unvalidatedContentCount++; }
  }
  const badge = (label, isOk) => '<span style="display:inline-flex; align-items:center; gap:5px; font-size:11px; background:rgba(245,239,227,0.06); padding:5px 10px; border-radius:20px; margin:3px;"><span style="width:8px; height:8px; border-radius:50%; background:'+(isOk?'var(--lagoon)':'var(--coral)')+';"></span>'+label+'</span>';
  el.innerHTML =
    '<div style="display:flex; flex-wrap:wrap; margin-bottom:14px;">' +
    badge('🔴 Sécurité & RH', pendingReports === 0 && revokedRegionalAdmins === 0) +
    badge('🎓 Pédagogie RAG', unvalidatedContentCount === 0) +
    badge('💰 Finances', totalPayoutAmount < 200000) +
    badge('🎵 Modération Multimédia', flaggedMediaCount === 0) +
    '</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
    '<div><p style="margin:0; font-size:20px; font-family:\'Baloo 2\'; color:var(--gold);">'+totalPayoutAmount.toLocaleString('fr-FR')+'</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">FCFA en reversements en attente</p></div>' +
    '<div><p style="margin:0; font-size:20px; font-family:\'Baloo 2\'; color:'+(pendingReports > 0 ? 'var(--coral)' : 'var(--lagoon)')+';">'+pendingReports+'</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">signalement(s) en attente</p></div>' +
    '<div><p style="margin:0; font-size:20px; font-family:\'Baloo 2\';">'+activeRegionalAdmins+'</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">DG régionaux actifs</p></div>' +
    '<div><p style="margin:0; font-size:20px; font-family:\'Baloo 2\';">'+activeModerators+'</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">modérateurs actifs</p></div>' +
    '</div>';
}
async function checkTrainerReportSpikeAlert(){
  const reportKeys = await safeList('report:', true);
  const reports = [];
  for(const k of reportKeys){ const r = await safeGet(k, true).catch(() => null); if(r && r.targetUser) reports.push(r); }
  const oneHourAgo = Date.now() - 60*60*1000;
  const byTrainer = {};
  for(const r of reports){
    if(new Date(r.createdAt).getTime() < oneHourAgo) continue;
    if(!byTrainer[r.targetUser]) byTrainer[r.targetUser] = 0;
    byTrainer[r.targetUser]++;
  }
  for(const [username, count] of Object.entries(byTrainer)){
    if(count < 5) continue;
    const u = await safeGet('user:' + username, true).catch(() => null);
    if(!u || !u.isTrainer) continue;
    const existing = await safeGet('settings:criticalAlertTrainerSpike__' + username, true);
    if(!existing || new Date(existing.createdAt).getTime() < oneHourAgo){
      await saveWithRetry('settings:criticalAlertTrainerSpike__' + username, { count, createdAt: new Date().toISOString() }, true);
    }
  }
}
async function renderCriticalAlertsPanel(){
  const el = document.getElementById('critical-alerts-panel');
  if(!el) return;
  await checkReportSpikeAlert();
  await checkTrainerReportSpikeAlert();
  const unauthorizedAlert = await safeGet('settings:criticalAlertUnauthorizedAccess', true).catch(() => null);
  const reportSpikeAlert = await safeGet('settings:criticalAlertReportSpike', true).catch(() => null);
  const largePayoutThreshold = (await safeGet('settings:largePayoutAlertThreshold', true)) || 100000;
  const payouts = await fetchAllPendingPayouts();
  const largePayouts = payouts.filter(o => o.netAmount >= largePayoutThreshold);
  const trainerSpikeKeys = await safeList('settings:criticalAlertTrainerSpike__', true);
  const alerts = [];
  if(unauthorizedAlert) alerts.push({ icon: '🔒', text: unauthorizedAlert.count + ' tentatives d’accès non autorisées au back-office dans la dernière heure', ts: unauthorizedAlert.createdAt, action: '' });
  if(reportSpikeAlert) alerts.push({ icon: '⚠️', text: reportSpikeAlert.count + ' signalements reçus dans la dernière heure — pic inhabituel', ts: reportSpikeAlert.createdAt, action: '<button class="btn btn-outline btn-sm" onclick="go(\'global-audit\')">🗂️ Examiner</button>' });
  largePayouts.forEach(o => alerts.push({ icon: '💰', text: 'Reversement important en attente : ' + o.netAmount.toLocaleString('fr-FR') + ' FCFA pour @' + o.sellerUsername, ts: o.createdAt, action: '<button class="btn btn-outline btn-sm" onclick="go(\'sfx-library\'); showToast(\'Ouvrez la fiche du vendeur depuis la recherche d’enquête\')">💰 Voir</button>' }));
  for(const k of trainerSpikeKeys){
    const username = k.replace('settings:criticalAlertTrainerSpike__', '');
    const data = await safeGet(k, true).catch(() => null);
    if(data) alerts.push({ icon: '🎓', text: data.count + ' signalements sur le formateur @' + username + ' dans la dernière heure — pic inhabituel', ts: data.createdAt,
      action: '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'fraud-investigation-username-input\').value=\''+username+'\'; runFraudInvestigation(); go(\'admin\')">🔍 Enquêter</button>' });
  }
  el.innerHTML = '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:0 0 10px;">Alertes affichées dans l’application uniquement — un vrai envoi par e-mail ou SMS nécessiterait un service externe (ex. SendGrid, Twilio) que Suktum n’intègre pas encore, faute de serveur propre.</p>' +
    (alerts.length === 0 ? '<div class="empty">Aucune alerte critique pour l’instant.</div>' : alerts.map(a =>
      '<div class="card" style="margin-bottom:6px; border-color:var(--coral);"><p style="margin:0 0 6px; font-size:12.5px;">'+a.icon+' '+escapeHtml(a.text)+'</p><p style="margin:0 0 6px; font-size:10px; color:rgba(245,239,227,0.4);">'+new Date(a.ts).toLocaleString('fr-FR')+'</p>'+a.action+'</div>'
    ).join(''));
}
async function checkBlockSpikeThreshold(blockedUsername){
  const threshold = await getBlockSpikeThreshold();
  const eventKeys = await safeList('blockevent:' + blockedUsername + '__', true);
  const events = [];
  for(const k of eventKeys){ const e = await safeGet(k, true).catch(() => null); if(e) events.push(e); }
  const oneDayAgo = Date.now() - 24*60*60*1000;
  const recentDistinctBlockers = new Set(events.filter(e => new Date(e.createdAt).getTime() >= oneDayAgo).map(e => e.blockerUser));
  if(recentDistinctBlockers.size < threshold) return;
  const u = await safeGet('user:' + blockedUsername, true);
  if(!u || u.blockSpikeAlertedAt) return; // ne pas répéter l'alerte tant qu'elle n'a pas été traitée
  u.blockSpikeAlertedAt = new Date().toISOString();
  u.blockSpikeCount = recentDistinctBlockers.size;
  await saveWithRetry('user:' + blockedUsername, u, true);
  await logAdminAction('⚠️ Pic de blocages détecté (' + recentDistinctBlockers.size + ' personnes distinctes en 24h)', '@' + blockedUsername);
}
async function renderAdminBlockSpikeAlerts(){
  const el = document.getElementById('admin-block-spike-alerts');
  if(!el) return;
  const users = await fetchUsers();
  const flagged = users.filter(u => u.blockSpikeAlertedAt && u.status !== 'banned' && u.status !== 'suspended');
  if(flagged.length === 0){ el.innerHTML = '<div class="empty">Aucune alerte de pic de blocages pour l’instant.</div>'; return; }
  el.innerHTML = flagged.map(u =>
    '<div class="card" style="margin-bottom:8px; border-color:var(--coral);"><p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(u.username)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:rgba(245,239,227,0.5);">Bloqué par '+(u.blockSpikeCount||0)+' personnes différentes en 24h — '+new Date(u.blockSpikeAlertedAt).toLocaleString('fr-FR')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="dismissBlockSpikeAlert(\''+escapeHtml(u.username)+'\')">Rejeter l’alerte</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="preventivelySuspendFromBlockSpike(\''+escapeHtml(u.username)+'\')">⏸ Suspendre préventivement</button>' +
    '</div></div>'
  ).join('');
}
async function dismissBlockSpikeAlert(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.blockSpikeAlertedAt = null;
  await saveWithRetry('user:' + username, u, true);
  await logAdminAction('Alerte de pic de blocages rejetée', '@' + username);
  await renderAdminBlockSpikeAlerts();
}
async function preventivelySuspendFromBlockSpike(username){
  const reason = prompt('Motif de la suspension préventive (visible dans l’historique du compte) :', 'Pic anormal de blocages détecté — enquête préventive');
  if(reason === null || !reason.trim()) return;
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.status = 'suspended';
  u.suspendedUntil = null;
  u.blockSpikeAlertedAt = null;
  if(!u.suspensionHistory) u.suspensionHistory = [];
  u.suspensionHistory.push({ action: 'suspended', by: 'Suktum (pic de blocages)', reason: reason.trim(), durationDays: null, createdAt: new Date().toISOString() });
  await saveWithRetry('user:' + username, u, true);
  const theirLives = (await fetchLives()).filter(l => l.username === username && (l.status === 'approved' || l.status === 'pending' || l.status === 'scheduled'));
  for(const l of theirLives){ await window.storage.delete('live:' + l.id, true).catch(() => {}); }
  await createNotification(username, 'account_suspended', 'Suktum', null, reason.trim());
  await logAdminAction('Suspension préventive suite à un pic de blocages', '@' + username + ' — ' + reason.trim().slice(0, 60));
  showToast('Compte suspendu préventivement ✓');
  await renderAdminBlockSpikeAlerts();
}
async function checkLiveReportThreshold(liveId, username){
  const distinctCount = await countDistinctLiveReporters(liveId);
  const { warn, cooldown, cut } = await getLiveReportThresholds();
  // Un signalement isolé, même unique, ne déclenche jamais rien — il faut plusieurs personnes différentes.
  if(distinctCount < warn) return;
  const l = await safeGet('live:' + liveId, true);
  if(!l) return; // déjà terminé entre-temps
  if(distinctCount >= cut){
    if(l.autoCutAt) return; // déjà coupé automatiquement, ne pas répéter l'action
    await window.storage.delete('live:' + liveId, true).catch(() => {});
    await createNotification(username, 'live_auto_cut', 'Suktum', null, String(distinctCount));
    await logAdminAction('Live coupé automatiquement (' + distinctCount + ' signalements distincts)', '@' + username);
  } else if(distinctCount >= cooldown){
    if(l.chatCooldownUntil) return; // déjà en cool-down, ne pas répéter l'action
    l.chatCooldownUntil = new Date(Date.now() + 30*60*1000).toISOString();
    await saveWithRetry('live:' + liveId, l, true);
    await createNotification(username, 'live_chat_cooldown', 'Suktum', null, String(distinctCount));
    await logAdminAction('Chat mis en pause automatiquement 30 minutes (' + distinctCount + ' signalements distincts) — le live continue', '@' + username);
  } else if(!l.autoWarnedAt){
    l.autoWarnedAt = new Date().toISOString();
    await saveWithRetry('live:' + liveId, l, true);
    await createNotification(username, 'live_auto_warning', 'Suktum', null, String(distinctCount));
    await logAdminAction('Avertissement automatique envoyé (' + distinctCount + ' signalements distincts) — le live continue', '@' + username);
  }
}
async function fetchReports(){
  const keys = await safeList('report:', true);
  const reports = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) reports.push(r); }
  reports.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return reports;
}
/* ---------- AUTO-ACCEPTATION DES DEMANDES DE LIVE ---------- */
async function isAutoApproveLivesEnabled(){
  const v = await safeGet('settings:autoApproveLives', true);
  return v === true;
}
/* ---------- AUTO-ACCEPTATION — INSCRIPTIONS ESPACE ÉDUCATION, PREMIUM, COURS ---------- */
function renderGenericAutoApproveToggle(elId, enabled, label, description, toggleFn){
  const el = document.getElementById(elId);
  if(!el) return;
  el.innerHTML =
    '<div style="display:flex; align-items:center; justify-content:space-between;">' +
    '<span style="font-size:13px;">⚡ '+label+'</span>' +
    '<label class="switch" style="position:relative; display:inline-block; width:42px; height:24px;">' +
    '<input type="checkbox" '+(enabled?'checked':'')+' onchange="'+toggleFn+'(this.checked)" style="opacity:0; width:0; height:0;">' +
    '<span style="position:absolute; inset:0; background:'+(enabled?'var(--lagoon)':'rgba(245,239,227,0.2)')+'; border-radius:30px; transition:.2s;"></span>' +
    '</label></div>' +
    '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:8px 0 0;">'+description+'</p>';
}
async function isAutoApproveEduSubEnabled(){ return (await safeGet('settings:autoApproveEduSub', true)) === true; }
async function loadAutoApproveEduSubToggle(){
  renderGenericAutoApproveToggle('auto-approve-edusub-card', await isAutoApproveEduSubEnabled(),
    'Auto-accepter les abonnements Espace Éducation', 'Si activé, chaque demande d’abonnement mensuel à l’Espace Éducation est validée dès réception, sans passer par vous.', 'toggleAutoApproveEduSub');
}
async function toggleAutoApproveEduSub(value){
  await saveWithRetry('settings:autoApproveEduSub', value, true);
  showToast(value ? 'Auto-acceptation activée ✓' : 'Auto-acceptation désactivée');
  await loadAutoApproveEduSubToggle();
}
async function isAutoApprovePremiumEnabled(){ return (await safeGet('settings:autoApprovePremium', true)) === true; }
async function loadAutoApprovePremiumToggle(){
  renderGenericAutoApproveToggle('auto-approve-premium-card', await isAutoApprovePremiumEnabled(),
    'Auto-accepter les abonnements Premium', 'Si activé, chaque demande d’abonnement Premium est validée dès réception, sans passer par vous.', 'toggleAutoApprovePremium');
}
async function toggleAutoApprovePremium(value){
  await saveWithRetry('settings:autoApprovePremium', value, true);
  showToast(value ? 'Auto-acceptation activée ✓' : 'Auto-acceptation désactivée');
  await loadAutoApprovePremiumToggle();
}
async function isAutoApproveEnrollmentEnabled(){ return (await safeGet('settings:autoApproveEnrollment', true)) === true; }
async function loadAutoApproveEnrollmentToggle(){
  renderGenericAutoApproveToggle('auto-approve-enrollment-card', await isAutoApproveEnrollmentEnabled(),
    'Auto-accepter les inscriptions aux cours', 'Si activé, chaque inscription payante à un cours est validée dès réception, sans passer par vous.', 'toggleAutoApproveEnrollment');
}
async function toggleAutoApproveEnrollment(value){
  await saveWithRetry('settings:autoApproveEnrollment', value, true);
  showToast(value ? 'Auto-acceptation activée ✓' : 'Auto-acceptation désactivée');
  await loadAutoApproveEnrollmentToggle();
}
/* ---------- GESTION AUTONOME — TRI IA DES SIGNALEMENTS ---------- */
/* ---------- FOURNISSEUR IA CHOISI POUR L'AUTOMATISATION DE GOUVERNANCE ---------- */
async function getGovernanceAIProvider(){
  const v = await safeGet('settings:governanceAIProvider', true);
  return v === 'claude' ? 'claude' : 'gemini';
}
async function setGovernanceAIProvider(provider){
  await saveWithRetry('settings:governanceAIProvider', provider, true);
  showToast('Fournisseur IA enregistré ✓');
  await loadGovernanceAIProviderToggle();
}
async function loadGovernanceAIProviderToggle(){
  const el = document.getElementById('governance-ai-provider-toggle');
  if(!el) return;
  const current = await getGovernanceAIProvider();
  el.innerHTML =
    '<div style="display:flex; gap:6px;">' +
    '<button type="button" class="btn btn-outline btn-sm" style="flex:1;'+(current==='claude'?' border-color:var(--gold); color:var(--gold);':'')+'" onclick="setGovernanceAIProvider(\'claude\')">Claude</button>' +
    '<button type="button" class="btn btn-outline btn-sm" style="flex:1;'+(current==='gemini'?' border-color:var(--gold); color:var(--gold);':'')+'" onclick="setGovernanceAIProvider(\'gemini\')">Gemini</button>' +
    '</div>';
}
async function isAutoTriageReportsEnabled(){ return (await safeGet('settings:autoTriageReports', true)) === true; }
async function loadAutoTriageReportsToggle(){
  renderGenericAutoApproveToggle('auto-triage-reports-card', await isAutoTriageReportsEnabled(),
    'Trier automatiquement les signalements avec l’IA', 'Claude analyse chaque nouveau signalement et décide de le rejeter ou de supprimer le contenu, en s’appuyant sur la raison indiquée. Chaque décision reste visible dans le journal d’audit, et vous pouvez toujours revenir dessus manuellement.', 'toggleAutoTriageReports');
}
async function toggleAutoTriageReports(value){
  await saveWithRetry('settings:autoTriageReports', value, true);
  showToast(value ? 'Tri automatique activé ✓' : 'Tri automatique désactivé');
  await loadAutoTriageReportsToggle();
}
async function maybeAutoTriageReport(reportId){
  if(!(await isAutoTriageReportsEnabled())) return;
  const r = await safeGet('report:' + reportId, true);
  if(!r) return;
  let contentDescription = 'Compte @' + r.targetUser + ' signalé.';
  if(r.type === 'post' && r.targetId){
    const post = (await fetchPosts(true)).find(p => p.id === r.targetId);
    if(post) contentDescription = 'Publication de @' + post.userId + ', légende : « ' + (post.caption || '(sans légende)') + ' »';
  } else if(r.type === 'comment' && (r.commentText || r.commentImageData || r.commentSticker)){
    contentDescription = 'Commentaire de @' + r.targetUser + ' : ' + (r.commentText ? '« ' + r.commentText + ' »' : (r.commentImageData ? '(photo jointe, sans texte)' : '(autocollant '+r.commentSticker+', sans texte)'));
  } else if(r.type === 'series_episode' && r.targetId){
    const [seriesId, episodeIndex] = r.targetId.split('__');
    const s = await safeGet('series:' + seriesId, true);
    if(s && s.episodes[episodeIndex]) contentDescription = 'Épisode ' + (parseInt(episodeIndex,10)+1) + ' de la série « ' + s.title + ' » : ' + s.episodes[episodeIndex].title;
  } else if(r.type === 'product' && r.targetId){
    const p = await safeGet('product:' + r.targetId, true);
    if(p) contentDescription = 'Annonce marketplace de @' + r.targetUser + ' : « ' + p.name + ' » — Prix : ' + p.price + ' FCFA' + (p.description ? ' — Description : ' + p.description.slice(0, 200) : '');
  } else if(r.type === 'account_harassment'){
    contentDescription = 'Signalement de compte pour harcèlement/comportement abusif — @' + r.reporterUser + ' a bloqué @' + r.targetUser + '. Preuves jointes :\n' + (r.evidence || 'Aucune preuve disponible.');
  }
  try{
    const prompt = "Tu aides à la modération d'un réseau social. Voici un signalement reçu :\n\n" +
      "CONTENU SIGNALÉ : " + contentDescription + "\nRAISON DU SIGNALEMENT : " + r.reason +
      "\n\nDécide s'il faut supprimer ce contenu ou rejeter le signalement comme non fondé. Réponds UNIQUEMENT en JSON strict : {\"decision\": \"suspend\" ou \"dismiss\", \"reasoning\": \"<1 phrase en français>\"}. En cas de doute réel, réponds \"dismiss\" pour laisser un humain trancher.";
    const text = await callAIProvider(prompt, 150, await getGovernanceAIProvider());
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    await resolveReport(reportId, parsed.decision === 'suspend' ? 'approved' : 'rejected');
    await logAdminAction('Signalement trié automatiquement par l’IA', '@' + r.targetUser + ' — ' + parsed.reasoning);
  }catch(e){ /* en cas d'erreur IA, le signalement reste simplement en attente pour un humain */ }
}
/* ---------- GESTION AUTONOME — VALIDATION IA DES CANDIDATURES FORMATEUR ---------- */
async function isAutoValidateTrainersEnabled(){ return (await safeGet('settings:autoValidateTrainers', true)) === true; }
async function loadAutoValidateTrainersToggle(){
  renderGenericAutoApproveToggle('auto-validate-trainers-card', await isAutoValidateTrainersEnabled(),
    'Valider automatiquement les candidatures formateur avec l’IA', 'Claude évalue chaque candidature (matière, présentation) et valide directement si elle semble sérieuse et cohérente — la photo et le numéro de paiement restent toujours obligatoires. En cas de doute, la candidature reste en attente pour vous.', 'toggleAutoValidateTrainers');
}
async function toggleAutoValidateTrainers(value){
  await saveWithRetry('settings:autoValidateTrainers', value, true);
  showToast(value ? 'Validation automatique activée ✓' : 'Validation automatique désactivée');
  await loadAutoValidateTrainersToggle();
}
async function maybeAutoValidateTrainer(requestId){
  if(!(await isAutoValidateTrainersEnabled())) return;
  const req = await safeGet('trainerrequest:' + requestId, true);
  if(!req) return;
  try{
    const prompt = "Tu aides à examiner une candidature de formateur pour une plateforme d'éducation en ligne. Voici la candidature :\n\n" +
      "MATIÈRE : " + req.subject + "\nPRÉSENTATION : " + req.bio +
      "\n\nCette candidature semble-t-elle sérieuse, cohérente et rédigée par quelqu'un ayant une vraie compétence dans cette matière (pas un texte vide, absurde, ou hors-sujet) ? Réponds UNIQUEMENT en JSON strict : {\"decision\": \"approve\" ou \"hold\", \"reasoning\": \"<1 phrase en français>\"}. En cas de doute, réponds \"hold\".";
    const text = await callAIProvider(prompt, 150, await getGovernanceAIProvider());
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    if(parsed.decision === 'approve'){
      await approveTrainerRequest(requestId);
      await logAdminAction('Candidature formateur validée automatiquement par l’IA', '@' + req.username + ' — ' + parsed.reasoning);
    }
  }catch(e){ /* en cas d'erreur IA, la candidature reste simplement en attente pour un humain */ }
}
/* ---------- MODE DE GESTION AUTONOME — INTERRUPTEUR MAÎTRE ---------- */
async function enableAutonomousMode(){
  await saveWithRetry('settings:autoApproveLives', true, true);
  await saveWithRetry('settings:autoApproveEduSub', true, true);
  await saveWithRetry('settings:autoApprovePremium', true, true);
  await saveWithRetry('settings:autoApproveEnrollment', true, true);
  await saveWithRetry('settings:autoTriageReports', true, true);
  await saveWithRetry('settings:autoValidateTrainers', true, true);
  showToast('Mode de gestion autonome activé ✓');
  await logAdminAction('Mode de gestion autonome activé', 'Tous les interrupteurs d’auto-acceptation');
  await loadAllAutoApproveToggles();
}
async function disableAutonomousMode(){
  await saveWithRetry('settings:autoApproveLives', false, true);
  await saveWithRetry('settings:autoApproveEduSub', false, true);
  await saveWithRetry('settings:autoApprovePremium', false, true);
  await saveWithRetry('settings:autoApproveEnrollment', false, true);
  await saveWithRetry('settings:autoTriageReports', false, true);
  await saveWithRetry('settings:autoValidateTrainers', false, true);
  showToast('Mode de gestion autonome désactivé');
  await logAdminAction('Mode de gestion autonome désactivé', 'Tous les interrupteurs d’auto-acceptation');
  await loadAllAutoApproveToggles();
}
async function loadAllAutoApproveToggles(){
  await loadAutoApproveLivesToggle();
  await loadAutoApproveEduSubToggle();
  await loadAutoApprovePremiumToggle();
  await loadAutoApproveEnrollmentToggle();
  await loadAutoTriageReportsToggle();
  await loadAutoValidateTrainersToggle();
  await loadGovernanceAIProviderToggle();
}
async function loadAutoApproveLivesToggle(){
  const el = document.getElementById('auto-approve-lives-card');
  if(!el) return;
  const enabled = await isAutoApproveLivesEnabled();
  el.innerHTML =
    '<div style="display:flex; align-items:center; justify-content:space-between;">' +
    '<span style="font-size:13px;">⚡ Auto-accepter les demandes de live</span>' +
    '<label class="switch" style="position:relative; display:inline-block; width:42px; height:24px;">' +
    '<input type="checkbox" '+(enabled?'checked':'')+' onchange="toggleAutoApproveLives(this.checked)" style="opacity:0; width:0; height:0;">' +
    '<span style="position:absolute; inset:0; background:'+(enabled?'var(--lagoon)':'rgba(245,239,227,0.2)')+'; border-radius:30px; transition:.2s;"></span>' +
    '</label></div>' +
    '<p style="font-size:11px; color:rgba(245,239,227,0.4); margin:8px 0 0;">Si activé, chaque demande de live et de conférence (y compris Espace Éducation) est validée automatiquement, sans passer par vous.</p>';
}
async function toggleAutoApproveLives(value){
  await saveWithRetry('settings:autoApproveLives', value, true);
  showToast(value ? 'Auto-acceptation activée ✓' : 'Auto-acceptation désactivée');
  await logAdminAction('Auto-acceptation des lives ' + (value ? 'activée' : 'désactivée'), '');
  await loadAutoApproveLivesToggle();
}
async function loadAdminProductsFlaggedList(){
  const el = document.getElementById('admin-products-flagged-list');
  if(!el) return;
  const keys = await safeList('product:', true);
  let flagged = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.mediaFlagged) flagged.push(p);
  }
  if(adminScope !== 'all') flagged = flagged.filter(p => p.country === adminScope);
  el.innerHTML = flagged.length === 0 ? '<div class="empty">Aucun produit en attente de vérification.</div>' : flagged.map(p =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;">@'+escapeHtml(p.sellerUsername||'')+' — '+escapeHtml(p.name)+' — '+escapeHtml(p.mediaFlagReason || 'contenu potentiellement inapproprié')+'</p>' +
    (p.image ? '<img src="'+p.image+'" style="width:100%; max-height:220px; object-fit:cover; border-radius:10px; margin-bottom:10px;">' : '') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveFlaggedProduct(\''+p.id+'\')">✓ Approuver quand même</button>' +
    '<button class="btn btn-outline btn-sm" onclick="removeFlaggedProduct(\''+p.id+'\')">🗑️ Supprimer</button></div></div>'
  ).join('');
}
async function approveFlaggedProduct(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  p.mediaFlagged = false;
  await saveWithRetry('product:' + productId, p, true);
  showToast('Produit approuvé ✓');
  await logAdminAction('Produit boutique signalé approuvé manuellement', '@' + (p.sellerUsername||''));
  await loadAdminProductsFlaggedList();
}
async function removeFlaggedProduct(productId){
  const p = await safeGet('product:' + productId, true);
  if(!p) return;
  await window.storage.delete('product:' + productId, true).catch(() => {});
  showToast('Produit supprimé');
  await logAdminAction('Produit boutique signalé supprimé', '@' + (p.sellerUsername||''));
  await loadAdminProductsFlaggedList();
}
async function loadAdminMediaFlaggedPosts(){
  const el = document.getElementById('admin-media-flagged-list');
  if(!el) return;
  const keys = await safeList('post:', true);
  let flagged = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.mediaFlagged) flagged.push({ ...p, kind: 'post' });
  }
  const storyKeys = await safeList('story:', true);
  for(const k of storyKeys){
    const s = await safeGet(k, true);
    if(s && s.mediaFlagged) flagged.push({ ...s, kind: 'story' });
  }
  if(adminScope !== 'all') flagged = flagged.filter(p => p.country === adminScope);
  const priorCounts = {};
  for(const p of flagged){
    if(priorCounts[p.userId] === undefined){
      const creator = await safeGet('user:' + p.userId, true).catch(() => null);
      priorCounts[p.userId] = (creator && creator.audioRemovedCount) || 0;
    }
  }
  const blockedCommentKeys = await safeList('autoblockedcomment:', true);
  const blockedComments = [];
  for(const k of blockedCommentKeys){ const b = await safeGet(k, true).catch(() => null); if(b) blockedComments.push({ ...b, kind: 'comment', id: k.replace('autoblockedcomment:','') }); }
  el.innerHTML = (flagged.length === 0 && blockedComments.length === 0) ? '<div class="empty">Aucun média en attente de vérification.</div>' : flagged.map(p =>
    '<div class="card" style="position:relative;"><p style="margin:0 0 6px; font-size:13px;">'+(p.kind === 'story' ? 'Story de ' : '')+'@'+escapeHtml(p.userId)+' — '+escapeHtml(p.mediaFlagReason || 'contenu potentiellement inapproprié')+'</p>' +
    (priorCounts[p.userId] > 0 ? '<p style="margin:0 0 6px; font-size:11.5px; color:var(--coral);">⚠️ '+priorCounts[p.userId]+' retrait(s) de son déjà effectué(s) pour ce compte — récidive à considérer</p>' : '') +
    (p.type === 'video'
      ? '<video controls style="width:100%; max-height:220px; border-radius:10px; margin-bottom:10px;" src="'+p.data+'"></video>'
      : '<img src="'+p.data+'" style="width:100%; max-height:220px; object-fit:cover; border-radius:10px; margin-bottom:10px;">') +
    '<span onclick="openFlaggedMediaKebabMenu(\''+p.id+'\', \''+p.kind+'\', \''+p.type+'\')" style="position:absolute; top:10px; right:10px; font-size:20px; cursor:pointer; background:rgba(0,0,0,0.5); border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">⋮</span></div>'
  ).join('') + blockedComments.map(b =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;">Commentaire bloqué de @'+escapeHtml(b.username)+' — '+escapeHtml(b.reason)+'</p>' +
    '<img src="'+b.imageData+'" style="width:100%; max-height:220px; object-fit:cover; border-radius:10px; margin-bottom:10px;">' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveBlockedComment(\''+b.id+'\')">✓ Publier quand même (faux positif)</button>' +
    '<button class="btn btn-outline btn-sm" onclick="removeBlockedCommentRecord(\''+b.id+'\')">🗑️ Confirmer le blocage</button></div></div>'
  ).join('');
}
async function openFlaggedMediaKebabMenu(postId, kind, type){
  const items = [];
  items.push({ icon: '✓', label: 'Approuver quand même', action: 'closeGenericKebabMenu(); '+(kind === 'story' ? 'approveMediaFlaggedStory' : 'approveMediaFlaggedPost')+'(\''+postId+'\')' });
  if(type === 'video') items.push({ icon: '🔇', label: 'Purger le son (garder l’image)', action: 'closeGenericKebabMenu(); muteFlaggedVideoAudio(\''+postId+'\', \''+kind+'\')' });
  items.push({ icon: '🗑️', label: 'Masquer / Supprimer', action: 'closeGenericKebabMenu(); '+(kind === 'story' ? 'removeMediaFlaggedStory' : 'removeMediaFlaggedPost')+'(\''+postId+'\')' });
  items.push({ icon: '⚙️', label: 'Régler le filtrage automatique', action: 'closeGenericKebabMenu(); go(\'admin\'); document.getElementById(\'forbidden-words-input\').scrollIntoView({behavior:\'smooth\'})' });
  openGenericKebabMenu(items);
}
async function approveBlockedComment(id){
  const b = await safeGet('autoblockedcomment:' + id, true);
  if(!b) return;
  await addComment(b.postId, '', null, b.imageData, null);
  await window.storage.delete('autoblockedcomment:' + id, true).catch(() => {});
  showToast('Image publiée — faux positif confirmé ✓');
  await logAdminAction('Faux positif de modération image corrigé', '@' + b.username);
  await loadAdminMediaFlaggedPosts();
}
async function removeBlockedCommentRecord(id){
  await window.storage.delete('autoblockedcomment:' + id, true).catch(() => {});
  showToast('Blocage confirmé, image définitivement supprimée');
  await loadAdminMediaFlaggedPosts();
}
async function approveMediaFlaggedStory(storyId){
  const s = await safeGet('story:' + storyId, true);
  if(!s) return;
  s.mediaFlagged = false;
  await saveWithRetry('story:' + storyId, s, true);
  showToast('Story approuvée ✓');
  await logAdminAction('Story signalée approuvée manuellement', '@' + s.userId);
  await loadAdminMediaFlaggedPosts();
}
async function removeMediaFlaggedStory(storyId){
  const s = await safeGet('story:' + storyId, true);
  if(!s) return;
  await window.storage.delete('story:' + storyId, true).catch(() => {});
  showToast('Story supprimée');
  await logAdminAction('Story signalée supprimée', '@' + s.userId);
  await loadAdminMediaFlaggedPosts();
}
async function approveMediaFlaggedPost(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.mediaFlagged = false;
  await saveWithRetry('post:' + postId, p, true);
  showToast('Publication approuvée ✓');
  await logAdminAction('Média signalé approuvé manuellement', '@' + p.userId);
  await loadAdminMediaFlaggedPosts();
}
async function muteFlaggedVideoAudio(postId, kind){
  const storageKey = (kind === 'story' ? 'story:' : 'post:') + postId;
  const p = await safeGet(storageKey, true);
  if(!p || p.type !== 'video') return;
  const reason = prompt('Motif du retrait du son (visible par le créateur) :', p.mediaFlagReason || '');
  if(reason === null || !reason.trim()) return;
  showToast('Retrait du son en cours...');
  try{
    const ffmpeg = await getFFmpegInstance();
    ffmpeg.FS('writeFile', 'muteinput.mp4', dataURLtoUint8Array(p.data));
    await ffmpeg.run('-i', 'muteinput.mp4', '-c:v', 'copy', '-an', 'muted.mp4');
    const data = ffmpeg.FS('readFile', 'muted.mp4');
    const base64 = btoa(String.fromCharCode(...data));
    p.data = 'data:video/mp4;base64,' + base64;
    p.mediaFlagged = false;
    p.audioRemovedReason = reason.trim();
    p.audioRemovedAt = new Date().toISOString();
    await saveWithRetry(storageKey, p, true);
    const creator = await safeGet('user:' + p.userId, true);
    let priorCount = 0;
    if(creator){
      priorCount = creator.audioRemovedCount || 0;
      creator.audioRemovedCount = priorCount + 1;
      await saveWithRetry('user:' + p.userId, creator, true);
    }
    await createNotification(p.userId, 'audio_removed', 'Suktum', postId, reason.trim());
    await logAdminAction('Son retiré d’une vidéo (vidéo conservée)' + (priorCount > 0 ? ' — ⚠️ '+(priorCount+1)+'e retrait pour ce compte, récidive' : ''), '@' + p.userId + ' — ' + reason.trim().slice(0, 60));
    showToast(priorCount > 0 ? 'Son retiré — ⚠️ '+(priorCount+1)+'e récidive pour ce compte' : 'Son retiré — la vidéo reste visible sans audio ✓');
    await loadAdminMediaFlaggedPosts();
  }catch(e){
    showToast('Retrait du son impossible pour le moment');
  }
}
async function removeMediaFlaggedPost(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  await window.storage.delete('post:' + postId, true).catch(() => {});
  showToast('Publication supprimée');
  await logAdminAction('Média signalé supprimé', '@' + p.userId);
  await loadAdminMediaFlaggedPosts();
}
async function loadAdminDuplicatePosts(){
  const el = document.getElementById('admin-duplicate-posts-list');
  if(!el) return;
  const keys = await safeList('post:', true);
  let suspects = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.possibleRepost && !p.duplicateReviewed) suspects.push(p);
  }
  if(adminScope !== 'all') suspects = suspects.filter(p => p.country === adminScope);
  el.innerHTML = suspects.length === 0 ? '<div class="empty">Aucune republication suspecte détectée.</div>' : suspects.map(p =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;">@'+escapeHtml(p.userId)+' a publié un contenu identique à celui de @'+escapeHtml(p.originalAuthor)+'</p>' +
    '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5);">Publié le '+new Date(p.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="removeDuplicatePost(\''+p.id+'\')">🗑️ Supprimer la copie</button>' +
    '<button class="btn btn-outline btn-sm" onclick="dismissDuplicateFlag(\''+p.id+'\')">✕ Ce n’est pas un problème</button></div></div>'
  ).join('');
}
async function removeDuplicatePost(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  await window.storage.delete('post:' + postId, true).catch(() => {});
  showToast('Copie supprimée ✓');
  await logAdminAction('Republication suspecte supprimée', '@'+p.userId+' — original de @'+p.originalAuthor);
  await loadAdminDuplicatePosts();
}
async function dismissDuplicateFlag(postId){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  p.duplicateReviewed = true;
  await saveWithRetry('post:' + postId, p, true);
  showToast('Signalement écarté');
  await loadAdminDuplicatePosts();
}
async function analyzeAppealWithAI(appealKey){
  const resultElId = 'appeal-ai-result-' + appealKey.replace(/[^a-zA-Z0-9]/g,'_');
  const resultEl = document.getElementById(resultElId);
  if(!resultEl) return;
  resultEl.textContent = '…';
  const a = await safeGet(appealKey, true);
  if(!a) return;
  const u = await safeGet('user:' + a.username, true);
  const warningsCount = (u && u.warnings) ? u.warnings.length : 0;
  const suspensionsCount = (u && u.suspensionHistory) ? u.suspensionHistory.filter(s => s.action === 'suspended').length : 0;
  const prompt = "Un créateur de Suktum (@" + a.username + ") conteste une sanction de type " + (a.sanctionType === 'suspension' ? 'suspension' : 'avertissement') + ".\n" +
    "Son message de recours : « " + a.reason + " »\n" +
    "Historique réel de ce compte : " + warningsCount + " avertissement(s) au total, " + suspensionsCount + " suspension(s) au total.\n\n" +
    "Résume la situation en 1-2 phrases, puis propose une recommandation (clémence ou maintien de la sanction) avec une brève justification. Ceci est une suggestion pour aider le modérateur — précise que la décision finale lui revient.";
  const provider = getAIProviderChoice('dailysummary');
  const analysis = await callAIProvider(prompt, 250, provider).catch(() => null);
  resultEl.textContent = analysis ? '🧠 ' + analysis : 'Analyse indisponible pour le moment.';
}
async function renderAdminContentValidationList(){
  const el = document.getElementById('admin-content-validation-list');
  if(!el) return;
  const courses = await fetchCourses(true);
  const items = [];
  for(const c of courses){
    const lessonKeys = await safeList('lesson:' + c.id + '__', true);
    for(const k of lessonKeys){
      const l = await safeGet(k, true).catch(() => null);
      if(l && !l.aiFlagged && !l.validatedForSearch) items.push({ type: 'lesson', courseId: c.id, courseTitle: c.title, id: l.id, title: l.title, key: k });
    }
    const exerciseKeys = await safeList('exercise:' + c.id + '__', true);
    for(const k of exerciseKeys){
      const ex = await safeGet(k, true).catch(() => null);
      if(ex && !ex.validatedForSearch) items.push({ type: 'exercise', courseId: c.id, courseTitle: c.title, id: ex.id, title: ex.title, key: k });
    }
  }
  if(items.length === 0){ el.innerHTML = '<div class="empty">Tout le contenu éligible est déjà validé pour la recherche.</div>'; return; }
  el.innerHTML = items.map(item =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 4px; font-size:12.5px;">'+(item.type === 'lesson' ? '📖' : '✏️')+' '+escapeHtml(item.title)+'</p>' +
    '<p style="margin:0 0 8px; font-size:11px; color:rgba(245,239,227,0.5);">'+escapeHtml(item.courseTitle)+'</p>' +
    '<button class="btn btn-outline btn-sm" onclick="adminValidateContentForSearch(\''+item.key+'\', \''+item.type+'\')">✓ Valider pour la recherche</button></div>'
  ).join('');
}
async function adminValidateContentForSearch(key, type){
  const item = await safeGet(key, true);
  if(!item) return;
  item.validatedForSearch = true;
  await saveWithRetry(key, item, true);
  showToast('Validé pour la recherche IA ✓');
  await logAdminAction('Contenu validé pour la recherche IA (' + (type === 'lesson' ? 'leçon' : 'exercice') + ')', item.title);
  await renderAdminContentValidationList();
}
async function renderCourseSearchGaps(){
  const el = document.getElementById('course-search-gaps-list');
  if(!el) return;
  const keys = await safeList('coursesearchlog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true).catch(() => null); if(l && !l.wasFound) logs.push(l); }
  if(logs.length === 0){ el.innerHTML = '<div class="empty">Aucune recherche sans réponse pour l’instant.</div>'; return; }
  const normalize = (s) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const grouped = {};
  logs.forEach(l => {
    const key = normalize(l.question);
    if(!grouped[key]) grouped[key] = { question: l.question, count: 0, students: new Set() };
    grouped[key].count++;
    grouped[key].students.add(l.username);
  });
  const sorted = Object.values(grouped).sort((a,b) => b.count - a.count).slice(0, 20);
  el.innerHTML = sorted.map(g =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 4px; font-size:12.5px;">« '+escapeHtml(g.question)+' »</p>' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+g.count+' recherche(s) · '+g.students.size+' élève(s) différent(s)</p></div>'
  ).join('');
}
async function loadAdminAppealsList(){
  const el = document.getElementById('admin-appeals-list');
  if(!el) return;
  const keys = await safeList('sanctionappeal:', true);
  const appeals = [];
  for(const k of keys){ const a = await safeGet(k, true).catch(() => null); if(a && a.status === 'pending') appeals.push({...a, key: k}); }
  appeals.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(appeals.length === 0){ el.innerHTML = '<div class="empty">Aucun recours en attente.</div>'; return; }
  el.innerHTML = appeals.map(a =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(a.username)+'</strong> — recours sur '+(a.sanctionType === 'suspension' ? 'suspension' : 'avertissement')+'</p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; font-style:italic; color:rgba(245,239,227,0.75);">« '+escapeHtml(a.reason)+' »</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="analyzeAppealWithAI(\''+a.key+'\')">🧠 Analyser avec l’IA</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveSanctionAppeal(\''+a.key+'\', \'approved\')">✓ Accepter le recours</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveSanctionAppeal(\''+a.key+'\', \'rejected\')">✕ Rejeter</button>' +
    '</div><p id="appeal-ai-result-'+a.key.replace(/[^a-zA-Z0-9]/g,'_')+'" style="font-size:12px; color:var(--gold); margin:8px 0 0; line-height:1.5;"></p></div>'
  ).join('');
}
async function resolveSanctionAppeal(appealKey, decision){
  const a = await safeGet(appealKey, true);
  if(!a) return;
  a.status = decision;
  await saveWithRetry(appealKey, a, true);
  if(decision === 'approved'){
    const u = await safeGet('user:' + a.username, true);
    if(u){
      if(a.sanctionType === 'suspension' && u.status === 'suspended'){
        u.status = 'active';
        u.suspendedUntil = null;
      }
      if(a.sanctionType === 'warning' && u.liveRestrictedUntil){
        u.liveRestrictedUntil = null;
      }
      await saveWithRetry('user:' + a.username, u, true);
    }
  }
  await createNotification(a.username, decision === 'approved' ? 'appeal_approved' : 'appeal_rejected', 'Suktum', null, null);
  await logAdminAction('Recours ' + (decision === 'approved' ? 'accepté' : 'rejeté'), '@' + a.username);
  showToast(decision === 'approved' ? 'Recours accepté — sanction levée ✓' : 'Recours rejeté');
  await loadAdminAppealsList();
}
async function loadAdminReportsList(){
  const el = document.getElementById('admin-reports-list');
  let reports = (await fetchReports()).filter(r => r.status === 'pending');
  const allUsersForReports = await fetchUsers();
  const statusMap = {};
  const photoMap = {};
  allUsersForReports.forEach(u => { statusMap[u.username] = u.status || 'active'; photoMap[u.username] = u.photo || null; });
  if(adminScope !== 'all'){
    const countryMap = {};
    allUsersForReports.forEach(u => { countryMap[u.username] = u.country; });
    reports = reports.filter(r => countryMap[r.targetUser] === adminScope);
  }
  const targetCounts = {};
  reports.forEach(r => {
    const key = r.type + '__' + (r.targetId || r.targetUser);
    targetCounts[key] = (targetCounts[key] || 0) + 1;
  });
  reports.sort((a,b) => {
    const countA = targetCounts[a.type + '__' + (a.targetId || a.targetUser)];
    const countB = targetCounts[b.type + '__' + (b.targetId || b.targetUser)];
    if(countB !== countA) return countB - countA;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  if(reports.length === 0){ el.innerHTML = '<div class="empty">Aucun signalement en attente.</div>'; return; }
  el.innerHTML = reports.map(r => {
    const severityCount = targetCounts[r.type + '__' + (r.targetId || r.targetUser)];
    const severityBadge = severityCount > 1 ? '<span style="display:inline-block; background:var(--coral); color:var(--night); font-size:10.5px; font-weight:700; border-radius:8px; padding:1px 7px; margin-left:6px;">'+severityCount+' signalements liés</span>' : '';
    if(r.type === 'message'){
      return '<div class="card"><div style="display:flex; gap:8px;"><input type="checkbox" class="bulk-report-checkbox" value="'+r.id+'" onchange="updateBulkReportsBar()" style="width:auto; margin-top:2px;"><div style="flex:1;">' +
        '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.targetUser)+'</strong> — message privé signalé'+severityBadge+'</p>' +
        '<p style="margin:0 0 6px; font-size:12.5px; font-style:italic; color:rgba(245,239,227,0.75);">« '+escapeHtml(r.messageText||'')+' »</p>' +
        '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'approved\')">✓ Traiter (avertissement noté)</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
        '</div></div></div></div>';
    }
    if(r.type === 'comment'){
      const reportAvatarHtml = '<div class="avatar" onclick="openUserProfile(\''+escapeHtml(r.targetUser)+'\')" style="width:28px; height:28px; font-size:12px; cursor:pointer; flex-shrink:0; display:inline-flex; vertical-align:middle; margin-right:8px; background-size:cover; background-position:center;'+(photoMap[r.targetUser] ? ' background-image:url('+photoMap[r.targetUser]+');' : '')+'">'+(photoMap[r.targetUser] ? '' : escapeHtml(r.targetUser).charAt(0).toUpperCase())+'</div>';
      return '<div class="card"><div style="display:flex; gap:8px;"><input type="checkbox" class="bulk-report-checkbox" value="'+r.id+'" onchange="updateBulkReportsBar()" style="width:auto; margin-top:2px;"><div style="flex:1;">' +
        '<p style="margin:0 0 4px; font-size:13px; display:flex; align-items:center;">'+reportAvatarHtml+'<strong>@'+escapeHtml(r.targetUser)+'</strong> — commentaire signalé'+severityBadge+'</p>' +
        '<p style="margin:0 0 6px; font-size:12.5px; font-style:italic; color:rgba(245,239,227,0.75);">« '+escapeHtml(r.commentText||'')+' »</p>' +
        (r.commentImageData ? '<img src="'+r.commentImageData+'" style="max-width:160px; border-radius:8px; margin-bottom:6px;">' : '') +
        (r.commentSticker ? '<div style="font-size:34px; margin-bottom:6px;">'+r.commentSticker+'</div>' : '') +
        '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="deleteCommentFromReport(\''+r.id+'\')">🗑️ Supprimer le commentaire</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
        '</div></div></div></div>';
    }
    if(r.type === 'account'){
      const targetIsSuspended = statusMap[r.targetUser] === 'suspended';
      return '<div class="card"><div style="display:flex; gap:8px;"><input type="checkbox" class="bulk-report-checkbox" value="'+r.id+'" onchange="updateBulkReportsBar()" style="width:auto; margin-top:2px;"><div style="flex:1;">' +
        '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.targetUser)+'</strong> — compte signalé'+severityBadge+(targetIsSuspended ? ' <span style="color:var(--coral); font-size:11px;">⏸ Déjà suspendu</span>' : '')+'</p>' +
        '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" onclick="openUserDetail(\''+escapeHtml(r.targetUser)+'\')">👤 Voir le compte</button>' +
        '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="toggleUserAccountSuspension(\''+escapeHtml(r.targetUser)+'\')">'+(targetIsSuspended ? '▶️ Réactiver le compte' : '⏸ Suspendre le compte')+'</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'approved\')">✓ Traiter</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
        '</div></div></div></div>';
    }
    if(r.type === 'live'){
      const categoryLabels = { harcelement: '😡 Harcèlement', contenu_illicite: '🚫 Contenu illicite', vente: '🛍️ Non-respect règles de vente', autre: '❓ Autre' };
      return '<div class="card">' +
        '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.targetUser)+'</strong> — live signalé'+(r.category ? ' <span style="color:var(--coral); font-size:11px;">'+categoryLabels[r.category]+'</span>' : '')+'</p>' +
        '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" onclick="warnLiveStreamer(\''+r.id+'\', \''+escapeHtml(r.targetUser)+'\')">⚠️ Avertir d’abord</button>' +
        '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="cutReportedLive(\''+r.id+'\', \''+r.targetId+'\', \''+escapeHtml(r.targetUser)+'\')">🚫 Couper le live</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
        '</div></div>';
    }
    if(r.type === 'series_episode'){
      return '<div class="card" id="report-episode-'+r.id+'">' +
        '<p style="margin:0 0 4px; font-size:13px;"><strong>Épisode signalé</strong>'+severityBadge+'</p>' +
        '<p id="report-episode-context-'+r.id+'" style="margin:0 0 6px; font-size:12.5px; color:rgba(245,239,227,0.75);">Chargement...</p>' +
        '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="removeEpisodeFromReport(\''+r.id+'\')">🗑️ Supprimer l’épisode</button>' +
        '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
        '</div></div>';
    }
    return '<div class="card">' +
      '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(r.targetUser)+'</strong> — publication signalée</p>' +
      '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Motif : '+escapeHtml(r.reason)+'</p>' +
      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
      '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'approved\')">✓ Valider (supprimer le contenu)</button>' +
      '<button class="btn btn-outline btn-sm" onclick="resolveReport(\''+r.id+'\', \'rejected\')">✕ Rejeter la plainte</button>' +
      '</div></div>';
  }).join('');
  reports.filter(r => r.type === 'series_episode').forEach(async r => {
    const el = document.getElementById('report-episode-context-' + r.id);
    if(!el || !r.targetId) return;
    const [seriesId, episodeIndex] = r.targetId.split('__');
    const s = await safeGet('series:' + seriesId, true).catch(() => null);
    el.textContent = (s && s.episodes[episodeIndex]) ? '« '+s.title+' » — Épisode '+(parseInt(episodeIndex,10)+1)+' : '+s.episodes[episodeIndex].title : 'Cette série ou cet épisode a depuis été supprimé.';
  });
}
async function warnLiveStreamer(reportId, username){
  const reason = prompt('Motif de l’avertissement envoyé à @' + username + ' au sujet de son live signalé :');
  if(reason === null || !reason.trim()) return;
  const u = (await safeGet('user:' + username, true)) || {username, createdAt: new Date().toISOString()};
  if(!u.warnings) u.warnings = [];
  u.warnings.push({reason: reason.trim(), createdAt: new Date().toISOString()});
  await saveWithRetry('user:' + username, u, true);
  await createNotification(username, 'warning', 'Suktum', null, reason.trim());
  const r = await safeGet('report:' + reportId, true);
  if(r){ r.status = 'approved'; await saveWithRetry('report:' + reportId, r, true); }
  showToast('Avertissement envoyé — le live reste en cours ✓');
  await logAdminAction('Avertissement envoyé (live signalé)', '@' + username + ' — ' + reason.trim().slice(0, 60));
  const strikeCount = u.warnings.length;
  if(strikeCount === 2){
    u.liveRestrictedUntil = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    await saveWithRetry('user:' + username, u, true);
    await createNotification(username, 'live_restricted', 'Suktum', null, null);
    await logAdminAction('Fonctionnalité live restreinte (2e avertissement)', '@' + username + ' — 7 jours');
  } else if(strikeCount >= 3){
    if(!u.suspensionHistory) u.suspensionHistory = [];
    u.status = 'suspended';
    u.suspendedUntil = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    u.suspensionHistory.push({ action: 'suspended', by: 'Suktum (automatique)', reason: 'Cumul de ' + strikeCount + ' avertissements', durationDays: 7, createdAt: new Date().toISOString() });
    await saveWithRetry('user:' + username, u, true);
    await createNotification(username, 'account_suspended', 'Suktum', null, 'Cumul d’avertissements');
    await logAdminAction('Compte suspendu automatiquement (cumul de ' + strikeCount + ' avertissements)', '@' + username + ' — 7 jours');
  }
  await loadAdminReportsList();
}
async function cutReportedLive(reportId, liveId, username){
  const ok = confirm('Couper le live de @' + username + ' maintenant ?');
  if(!ok) return;
  await window.storage.delete('live:' + liveId, true).catch(() => {});
  const r = await safeGet('report:' + reportId, true);
  if(r){ r.status = 'approved'; await saveWithRetry('report:' + reportId, r, true); }
  showToast('Live coupé ✓');
  await logAdminAction('Live coupé suite à signalement', '@' + username);
  await loadAdminReportsList();
  await loadActiveLivesAdmin();
}
/* ---------- ACTIONS DE MODÉRATION GROUPÉES ---------- */
/* ---------- JOURNAL DES CHANGEMENTS INTERNES ---------- */
/* ---------- JOURNAL DES DÉCISIONS ---------- */
async function addDecisionLogEntry(){
  const title = document.getElementById('new-decision-title').value.trim();
  const reason = document.getElementById('new-decision-reason').value.trim();
  if(!title){ showToast('Écrivez au moins un titre'); return; }
  const id = 'decision_' + Date.now();
  await saveWithRetry('decisionlog:' + id, {
    id, title, reason, author: currentAdminName, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-decision-title').value = '';
  document.getElementById('new-decision-reason').value = '';
  showToast('Ajoutée au journal ✓');
  await renderDecisionLog();
}
async function deleteDecisionLogEntry(entryId){
  const entry = await safeGet('decisionlog:' + entryId, true);
  if(!entry) return;
  if(!confirm('Archiver cette décision : « '+entry.title+' » ?\n\nElle ne s’affichera plus dans la liste active, mais reste conservée pour la traçabilité — jamais effacée.')) return;
  entry.archivedAt = new Date().toISOString();
  entry.archivedBy = currentAdminName;
  await saveWithRetry('decisionlog:' + entryId, entry, true);
  await logAdminAction('Décision archivée', entry.title);
  showToast('Décision archivée ✓');
  await renderDecisionLog();
}
/* ---------- COMPTES EN DOUBLE POSSIBLES ---------- */
/* ---------- RESTRICTION DE CONTENU PAR PAYS ---------- */
let currentCountryRestrictionPostId = null;
async function loadPostForCountryRestriction(){
  const postId = document.getElementById('country-restriction-post-id').value.trim();
  if(!postId){ showToast('Renseignez un identifiant de publication'); return; }
  const p = await safeGet('post:' + postId, true);
  if(!p){ showToast('Publication introuvable'); return; }
  currentCountryRestrictionPostId = postId;
  await renderCountryRestrictionEditor(p);
}
async function renderCountryRestrictionEditor(p){
  const el = document.getElementById('country-restriction-editor');
  const blocked = new Set(p.blockedCountries || []);
  el.innerHTML = '<div class="card"><p style="margin:0 0 10px; font-size:12.5px;"><strong>'+escapeHtml((p.caption||'').slice(0,60) || p.id)+'</strong> — @'+escapeHtml(p.userId)+'</p>' +
    '<p style="margin:0 0 10px; font-size:11px; color:rgba(245,239,227,0.5);">Cochez les pays où cette publication doit être masquée :</p>' +
    '<div style="display:flex; flex-direction:column; gap:6px; max-height:220px; overflow-y:auto;">' +
    COUNTRY_LIST.map(c => '<label style="display:flex; align-items:center; gap:8px; font-size:12.5px;"><input type="checkbox" data-country="'+escapeHtml(c)+'" '+(blocked.has(c)?'checked':'')+' style="width:auto;">'+escapeHtml(c)+'</label>').join('') +
    '</div>' +
    '<button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="saveCountryRestrictions()">Enregistrer</button></div>';
}
async function saveCountryRestrictions(){
  const p = await safeGet('post:' + currentCountryRestrictionPostId, true);
  if(!p) return;
  const checked = Array.from(document.querySelectorAll('#country-restriction-editor input[type="checkbox"]:checked')).map(i => i.dataset.country);
  p.blockedCountries = checked;
  await saveWithRetry('post:' + currentCountryRestrictionPostId, p, true);
  showToast('Restrictions enregistrées ✓ (' + checked.length + ' pays)');
  await logAdminAction('Restriction de contenu par pays modifiée', p.id + ' — ' + (checked.length ? checked.join(', ') : 'aucune restriction'));
}
/* ---------- FILE DE MODÉRATION — CONFIANCE IA ---------- */
const AI_CONFIDENCE_RANK = { VERY_LIKELY: 4, LIKELY: 3, POSSIBLE: 2, UNLIKELY: 1, VERY_UNLIKELY: 0 };
async function renderAiConfidenceQueue(){
  const el = document.getElementById('ai-confidence-queue-list');
  if(!el) return;
  const posts = (await fetchPosts(true)).filter(p => p.mediaFlagged && p.mediaFlagConfidence);
  if(posts.length === 0){ el.innerHTML = '<div class="empty">Aucune publication avec un vrai niveau de confiance IA enregistré pour l’instant.</div>'; return; }
  posts.sort((a,b) => (AI_CONFIDENCE_RANK[b.mediaFlagConfidence]||0) - (AI_CONFIDENCE_RANK[a.mediaFlagConfidence]||0));
  const confidenceColors = { VERY_LIKELY: 'var(--coral)', LIKELY: 'var(--gold)', POSSIBLE: 'rgba(245,239,227,0.6)' };
  el.innerHTML = posts.map(p =>
    '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 4px; font-size:12px; font-weight:700; color:'+(confidenceColors[p.mediaFlagConfidence]||'rgba(245,239,227,0.6)')+';">🎯 Confiance : '+escapeHtml(p.mediaFlagConfidence)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(p.mediaFlagReason||'')+'</p>' +
    '<p style="margin:0 0 10px; font-size:11.5px; color:rgba(245,239,227,0.5);">@'+escapeHtml(p.userId)+' · '+new Date(p.createdAt).toLocaleString('fr-FR')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="openSinglePostView(\''+p.id+'\')">👁️ Voir</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="dismissAiConfidenceFlag(\''+p.id+'\', false)">✕ Retirer la publication</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--lagoon); color:var(--lagoon);" onclick="dismissAiConfidenceFlag(\''+p.id+'\', true)">✓ Fausse alerte — republier</button>' +
    '</div></div>'
  ).join('');
}
async function dismissAiConfidenceFlag(postId, republish){
  const p = await safeGet('post:' + postId, true);
  if(!p) return;
  if(republish){
    p.mediaFlagged = false;
    showToast('Publication remise en ligne ✓');
  } else {
    p.suspended = true;
    showToast('Publication retirée ✓');
  }
  await saveWithRetry('post:' + postId, p, true);
  await logAdminAction('File confiance IA — décision', p.id + ' — ' + (republish ? 'fausse alerte, republiée' : 'retirée'));
  await renderAiConfidenceQueue();
}
/* ---------- HISTORIQUE PERSONNEL DES VERSEMENTS DU FONDS CRÉATEUR ---------- */
/* ---------- LISTE DE MES COMPTES BLOQUÉS ---------- */
async function unblockUserFromList(username){
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  if(!me.blocked) me.blocked = [];
  const idx = me.blocked.indexOf(username);
  if(idx === -1) return;
  me.blocked.splice(idx, 1);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('@' + username + ' débloqué(e)');
  await renderBlockedUsersList();
}
/* ---------- BOUTIQUE D'UN VENDEUR (LIEN DEPUIS LE PROFIL) ---------- */
let currentSellerShopViewUsername = null;
async function renderProfileShopButton(username){
  const el = document.getElementById('uprofile-shop-button');
  if(!el) return;
  const allProducts = await fetchProducts();
  const sellerProducts = allProducts.filter(p => p.sellerUsername === username);
  el.innerHTML = sellerProducts.length > 0
    ? '<button class="btn btn-primary" style="width:100%;" onclick="openSellerShopView(\''+escapeHtml(username)+'\')">🛍️ Voir la boutique de @'+escapeHtml(username)+' ('+sellerProducts.length+')</button>'
    : '';
}
async function openSellerShopView(username){
  currentSellerShopViewUsername = username;
  document.getElementById('seller-shop-view-title').textContent = '🛍️ Boutique de @' + username;
  go('seller-shop-view');
  await renderSellerShopViewReviews();
  await renderSellerShopView();
}
/* ---------- SUGGESTION IA DE LÉGENDE ---------- */
async function suggestCaptionWithAI(){
  const statusEl = document.getElementById('ai-caption-suggest-status');
  const fileInput = document.getElementById('publish-file');
  const file = fileInput.files[0];
  if(!file){ statusEl.textContent = 'Choisissez d’abord une photo.'; return; }
  if(!file.type.startsWith('image')){ statusEl.textContent = 'La suggestion IA n’est disponible que pour les photos pour l’instant, pas les vidéos.'; return; }
  statusEl.textContent = '⏳ Analyse de la photo...';
  try{
    let dataUrl = await readFileAsDataURL(file);
    dataUrl = await compressImageDataUrl(dataUrl, 600, 0.6);
    const result = await analyzeProductPhotoLabels(dataUrl);
    if(!result.checked){ statusEl.textContent = 'Suggestion indisponible pour le moment (clé de vision non configurée).'; return; }
    if(!result.topLabel){ statusEl.textContent = 'Aucune suggestion trouvée pour cette photo.'; return; }
    const prompt = 'Voici ce qu’une analyse d’image détecte sur une photo publiée sur Suktum (réseau social sénégalais) : "' + result.topLabel + '". Propose une courte légende naturelle en français (1 phrase, ton chaleureux) suivie de 3 hashtags pertinents. Réponds uniquement avec la légende et les hashtags, rien d’autre.';
    const provider = await getGovernanceAIProvider();
    const suggestion = await callAIProvider(prompt, 150, provider);
    if(!suggestion){ statusEl.textContent = 'Suggestion indisponible pour le moment.'; return; }
    statusEl.innerHTML = '💡 « '+escapeHtml(suggestion)+' » <span onclick="applyCaptionSuggestion(\''+escapeHtml(suggestion).replace(/'/g,"\\'")+'\')" style="text-decoration:underline; cursor:pointer;">Utiliser</span>';
  }catch(e){
    statusEl.textContent = 'Suggestion indisponible pour le moment.';
  }
}
function applyCaptionSuggestion(text){
  document.getElementById('publish-caption').value = text;
  document.getElementById('ai-caption-suggest-status').textContent = '';
  saveCaptionDraft();
  showToast('Légende appliquée ✓ — modifiable librement');
}
async function renderSellerShopViewReviews(){
  const el = document.getElementById('seller-shop-view-reviews');
  if(!el || !currentSellerShopViewUsername) return;
  const ratings = await fetchSellerRatings(currentSellerShopViewUsername);
  if(ratings.length === 0){ el.innerHTML = ''; return; }
  const avg = (ratings.reduce((s,r) => s + r.stars, 0) / ratings.length).toFixed(1);
  const isOwnShop = currentUser === currentSellerShopViewUsername;
  const withComments = ratings.filter(r => r.comment).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = '<div class="card"><p style="margin:0 0 10px; font-size:14px;">⭐ <strong>'+avg+'</strong>/5 sur '+ratings.length+' avis</p>' +
    (withComments.length > 0 ? withComments.slice(0, 10).map(r =>
      '<div style="border-top:1px solid var(--line); padding-top:8px; margin-top:8px;"><p style="margin:0 0 2px; font-size:12.5px;">'+'⭐'.repeat(r.stars)+'</p>' +
      '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.7);">« '+escapeHtml(r.comment)+' »</p>' +
      (r.sellerReply
        ? '<p style="margin:6px 0 0 12px; font-size:12px; color:var(--gold);">↳ Réponse du vendeur : '+escapeHtml(r.sellerReply)+'</p>'
        : (isOwnShop ? '<span onclick="replyToSellerReview(\''+r.orderId+'\')" style="display:inline-block; margin-top:4px; font-size:11.5px; color:var(--lagoon); cursor:pointer;">Répondre</span>' : '')
      ) + '</div>'
    ).join('') : '') +
    '</div>';
}
async function replyToSellerReview(orderId){
  if(currentUser !== currentSellerShopViewUsername) return;
  const reply = prompt('Votre réponse publique à cet avis :');
  if(!reply || !reply.trim()) return;
  const r = await safeGet('sellerrating:' + orderId, true);
  if(!r || r.sellerUsername !== currentUser) return;
  r.sellerReply = reply.trim();
  r.sellerReplyAt = new Date().toISOString();
  await saveWithRetry('sellerrating:' + orderId, r, true);
  showToast('Réponse publiée ✓');
  await renderSellerShopViewReviews();
}
async function renderSellerShopView(){
  const el = document.getElementById('seller-shop-view-list');
  if(!el || !currentSellerShopViewUsername) return;
  const allProducts = await fetchProducts();
  const products = allProducts.filter(p => p.sellerUsername === currentSellerShopViewUsername);
  if(products.length === 0){ el.innerHTML = '<div class="empty">Aucun produit pour l’instant.</div>'; return; }
  el.innerHTML = products.map(p =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
    (p.image ? '<img src="'+p.image+'" style="width:52px; height:52px; border-radius:8px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(p.name)+'</strong>' +
    (p.category ? '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+escapeHtml(p.category)+'</p>' : '') +
    '<p style="margin:2px 0 0; font-size:12.5px; color:var(--gold);">'+(p.price||0).toLocaleString('fr-FR')+' FCFA</p></div>' +
    (p.isBarter ? '<button class="btn btn-outline btn-sm" onclick="proposeBarterExchange(\''+p.id+'\')">🔁 Échanger</button>'
      : p.isService ? '<button class="btn btn-primary btn-sm" onclick="openServiceBookingPicker(\''+p.id+'\')">📅 Réserver</button>'
      : p.isAuction ? '<button class="btn btn-primary btn-sm" onclick="openAuctionDetail(\''+p.id+'\')">🔨 Voir</button>'
      : '<button class="btn btn-primary btn-sm" onclick="openOrderScreen(\''+p.id+'\')">Commander</button>') +
    '</div>'
  ).join('');
}
async function renderBlockedUsersList(){
  const el = document.getElementById('blocked-users-list-content');
  if(!el || !currentUser) return;
  const blocked = [...(await getMyBlockedUsernames())];
  if(blocked.length === 0){ el.innerHTML = '<div class="empty">Aucun compte bloqué pour l’instant.</div>'; return; }
  el.innerHTML = blocked.map(u =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">' +
    smallAvatarBadge(u, 40) +
    '<span style="flex:1; font-size:13px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u)+'\')">@'+escapeHtml(u)+'</span>' +
    '<button class="btn btn-outline btn-sm" onclick="unblockUserFromList(\''+escapeHtml(u)+'\')">Débloquer</button>' +
    '</div>'
  ).join('');
}
/* ---------- CALENDRIER ÉDITORIAL D'ÉQUIPE ---------- */
let currentEditorialCalendarOwner = null;
async function openEditorialCalendar(ownerUsername){
  currentEditorialCalendarOwner = ownerUsername || currentUser;
  go('editorial-calendar');
  await renderEditorialCalendar();
}
async function hasEditorialCalendarAccess(ownerUsername){
  if(ownerUsername === currentUser) return true;
  const team = (await safeGet('editorialteam:' + ownerUsername, true)) || [];
  return team.includes(currentUser);
}
async function addEditorialTeamMember(){
  const username = document.getElementById('editorial-team-add-input').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  if(username === currentUser){ showToast('Vous êtes déjà propriétaire de ce calendrier'); return; }
  const exists = await safeGet('user:' + username, true);
  if(!exists){ showToast('Ce compte n’existe pas'); return; }
  const team = (await safeGet('editorialteam:' + currentUser, true)) || [];
  if(team.includes(username)){ showToast('Déjà membre de l’équipe'); return; }
  team.push(username);
  await saveWithRetry('editorialteam:' + currentUser, team, true);
  document.getElementById('editorial-team-add-input').value = '';
  showToast('@' + username + ' ajouté(e) à l’équipe ✓');
  await createNotification(username, 'editorial_team_invite', currentUser, null, null);
  await renderEditorialCalendar();
}
async function removeEditorialTeamMember(username){
  let team = (await safeGet('editorialteam:' + currentUser, true)) || [];
  team = team.filter(u => u !== username);
  await saveWithRetry('editorialteam:' + currentUser, team, true);
  showToast('@' + username + ' retiré(e) de l’équipe');
  await renderEditorialCalendar();
}
async function addEditorialEntry(){
  const title = document.getElementById('editorial-entry-title').value.trim();
  const date = document.getElementById('editorial-entry-date').value;
  const notes = document.getElementById('editorial-entry-notes').value.trim();
  if(!title || !date){ showToast('Renseignez au moins un titre et une date'); return; }
  const hasAccess = await hasEditorialCalendarAccess(currentEditorialCalendarOwner);
  if(!hasAccess){ showToast('Vous n’avez pas accès à ce calendrier'); return; }
  const id = 'entry_' + Date.now();
  await saveWithRetry('editorialentry:' + currentEditorialCalendarOwner + '__' + id, {
    id, title, date, notes, addedBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('editorial-entry-title').value = '';
  document.getElementById('editorial-entry-date').value = '';
  document.getElementById('editorial-entry-notes').value = '';
  showToast('Ajouté au calendrier ✓');
  await renderEditorialCalendar();
}
async function removeEditorialEntry(entryId){
  const hasAccess = await hasEditorialCalendarAccess(currentEditorialCalendarOwner);
  if(!hasAccess) return;
  await window.storage.delete('editorialentry:' + currentEditorialCalendarOwner + '__' + entryId, true).catch(() => {});
  showToast('Retiré du calendrier');
  await renderEditorialCalendar();
}
async function renderEditorialCalendar(){
  if(!currentEditorialCalendarOwner) currentEditorialCalendarOwner = currentUser;
  const isOwner = currentEditorialCalendarOwner === currentUser;
  const teamCard = document.getElementById('editorial-team-list');
  const teamManageCard = document.getElementById('editorial-team-add-input');
  if(teamManageCard) teamManageCard.closest('.card').style.display = isOwner ? 'block' : 'none';
  if(isOwner){
    const team = (await safeGet('editorialteam:' + currentUser, true)) || [];
    teamCard.innerHTML = team.length === 0 ? '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Aucun membre d’équipe pour l’instant — vous seul(e) gérez ce calendrier.</p>' :
      team.map(u => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;"><span style="flex:1; font-size:13px;">@'+escapeHtml(u)+'</span><span onclick="removeEditorialTeamMember(\''+escapeHtml(u)+'\')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>').join('');
  }
  const hasAccess = await hasEditorialCalendarAccess(currentEditorialCalendarOwner);
  const entriesEl = document.getElementById('editorial-entries-list');
  if(!hasAccess){
    entriesEl.innerHTML = '<div class="empty">Vous n’avez pas accès à ce calendrier.</div>';
  } else {
    const keys = await safeList('editorialentry:' + currentEditorialCalendarOwner + '__', true);
    const entries = [];
    for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
    entries.sort((a,b) => new Date(a.date) - new Date(b.date));
    entriesEl.innerHTML = entries.length === 0 ? '<div class="empty">Aucune idée planifiée pour l’instant.</div>' : entries.map(e =>
      '<div class="card" style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><div style="flex:1;">' +
      '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(e.title)+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:var(--gold);">📅 '+new Date(e.date).toLocaleDateString('fr-FR')+'</p>' +
      (e.notes ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(e.notes)+'</p>' : '') +
      '<p style="margin:4px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Proposé par @'+escapeHtml(e.addedBy)+'</p>' +
      '</div><span onclick="removeEditorialEntry(\''+e.id+'\')" style="color:var(--coral); cursor:pointer; font-size:11px;">Retirer</span></div></div>'
    ).join('');
  }
  const sharedEl = document.getElementById('editorial-shared-with-me-list');
  if(isOwner && sharedEl){
    const allUsers = await fetchUsers();
    const sharedWithMe = [];
    for(const u of allUsers){
      if(u.username === currentUser) continue;
      const team = (await safeGet('editorialteam:' + u.username, true)) || [];
      if(team.includes(currentUser)) sharedWithMe.push(u.username);
    }
    sharedEl.innerHTML = sharedWithMe.length === 0 ? '<div class="empty">Aucun calendrier partagé avec vous pour l’instant.</div>' :
      sharedWithMe.map(u => '<div class="card" style="cursor:pointer; margin-bottom:6px;" onclick="openEditorialCalendar(\''+escapeHtml(u)+'\')"><span style="font-size:13px;">📅 Calendrier de @'+escapeHtml(u)+'</span></div>').join('');
  }
}
/* ---------- PENC — SALONS VOCAUX (ARBRE À PALABRES) ---------- */
async function createPenc(){
  if(!requireAccount('Créez un compte pour ouvrir un Penc')) return;
  const creationAllowed = await safeGet('settings:pencCreationAllowed', true);
  if(creationAllowed === false){ showToast('La création de nouveaux Penc est temporairement désactivée'); return; }
  const title = document.getElementById('new-penc-title').value.trim();
  const category = document.getElementById('new-penc-category').value;
  if(!title){ showToast('Renseignez un sujet de discussion'); return; }
  const isScheduled = document.getElementById('new-penc-schedule-toggle').checked;
  let scheduledFor = null;
  if(isScheduled){
    const datetimeValue = document.getElementById('new-penc-schedule-datetime').value;
    if(!datetimeValue){ showToast('Renseignez une date et une heure'); return; }
    scheduledFor = new Date(datetimeValue);
    if(scheduledFor <= new Date()){ showToast('Choisissez une date dans le futur'); return; }
  }
  const id = 'penc_' + Date.now();
  await saveWithRetry('penc:' + id, {
    id, title, category, host: currentUser, participants: isScheduled ? [] : [currentUser],
    active: !isScheduled, scheduledFor: scheduledFor ? scheduledFor.toISOString() : null, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-penc-title').value = '';
  document.getElementById('new-penc-schedule-toggle').checked = false;
  document.getElementById('new-penc-schedule-fields').style.display = 'none';
  document.getElementById('new-penc-schedule-datetime').value = '';
  if(isScheduled){
    showToast('Penc planifié ✓ pour le ' + scheduledFor.toLocaleString('fr-FR'));
    go('penc-browse');
  } else {
    showToast('Penc ouvert ✓');
    await openPencRoom(id);
  }
}
async function startScheduledPenc(pencId){
  const p = await safeGet('penc:' + pencId, true);
  if(!p || p.host !== currentUser) return;
  p.active = true;
  p.scheduledFor = null;
  if(!p.participants.includes(currentUser)) p.participants.push(currentUser);
  await saveWithRetry('penc:' + pencId, p, true);
  await openPencRoom(pencId);
}
async function renderPencBrowse(){
  const el = document.getElementById('penc-browse-list');
  if(!el) return;
  const categoryFilter = document.getElementById('penc-category-filter') ? document.getElementById('penc-category-filter').value : '';
  const keys = await safeList('penc:', true);
  let pencs = [];
  let upcoming = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(!p) continue;
    if(p.active) pencs.push(p);
    else if(p.scheduledFor && new Date(p.scheduledFor) > new Date()) upcoming.push(p);
  }
  if(categoryFilter){ pencs = pencs.filter(p => p.category === categoryFilter); upcoming = upcoming.filter(p => p.category === categoryFilter); }
  pencs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  upcoming.sort((a,b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  const categoryEmojis = { Culture: '🎭', Entrepreneuriat: '💼', Sport: '⚽', Actualités: '📰', Autre: '💬' };
  let html = '';
  if(upcoming.length > 0){
    html += '<div class="eyebrow">📅 À venir</div>' + upcoming.map(p =>
      '<div class="card" style="margin-bottom:10px;"><strong style="font-size:13px;">'+(categoryEmojis[p.category]||'💬')+' '+escapeHtml(p.title)+'</strong>' +
      '<p style="margin:4px 0 8px; font-size:11.5px; color:var(--gold);">Animé par @'+escapeHtml(p.host)+' · '+new Date(p.scheduledFor).toLocaleString('fr-FR')+'</p>' +
      (p.host === currentUser ? '<button class="btn btn-outline btn-sm" onclick="startScheduledPenc(\''+p.id+'\')">Démarrer maintenant</button>' : '') +
      '</div>'
    ).join('') + '<div class="eyebrow" style="margin-top:16px;">🎙️ En direct</div>';
  }
  if(pencs.length === 0){
    html += '<div class="empty">Aucun Penc en cours pour l’instant.</div>';
    el.innerHTML = html;
    return;
  }
  html += pencs.map(p => {
    const minutesActive = Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 60000));
    return '<div class="card" style="cursor:pointer; margin-bottom:10px;" onclick="openPencRoom(\''+p.id+'\')">' +
      '<strong style="font-size:13px;">'+(categoryEmojis[p.category]||'💬')+' '+escapeHtml(p.title)+'</strong>' +
      '<p style="margin:4px 0 0; font-size:11.5px; color:var(--gold);">Animé par @'+escapeHtml(p.host)+' · 🎙️ '+p.participants.length+' · depuis '+minutesActive+' min</p></div>';
  }).join('');
  el.innerHTML = html;
}
let currentPencId = null;
let pencRoomRefreshInterval = null;
async function openPencRoom(pencId){
  if(!requireAccount('Créez un compte pour rejoindre un Penc')) return;
  const p = await safeGet('penc:' + pencId, true);
  if(!p || !p.active){ showToast('Ce Penc est terminé'); return; }
  currentPencId = pencId;
  if(!p.everJoined) p.everJoined = [];
  let needsSave = false;
  if(!p.participants.includes(currentUser)){ p.participants.push(currentUser); needsSave = true; }
  if(!p.everJoined.includes(currentUser)){ p.everJoined.push(currentUser); needsSave = true; }
  if(needsSave) await saveWithRetry('penc:' + pencId, p, true);
  document.getElementById('penc-room-title').textContent = '🌳 ' + p.title;
  document.getElementById('penc-room-iframe').src = 'https://meet.jit.si/suktum-penc-' + pencId + '#config.startAudioOnly=true&config.startWithVideoMuted=true&config.prejoinPageEnabled=false';
  document.getElementById('penc-end-btn').style.display = p.host === currentUser ? 'block' : 'none';
  document.getElementById('penc-report-btn').style.display = p.host !== currentUser ? 'block' : 'none';
  document.getElementById('penc-cohost-invite').style.display = p.host === currentUser ? 'block' : 'none';
  go('penc-room');
  await renderPencRoomParticipants();
  if(pencRoomRefreshInterval) clearInterval(pencRoomRefreshInterval);
  pencRoomRefreshInterval = setInterval(renderPencRoomParticipants, 4000);
}
/* ---------- SONDAGE RAPIDE SUR UNE PUBLICATION ---------- */
function renderPostPollHtml(p){
  const votes = p.poll.votes || {};
  const myVote = currentUser ? votes[currentUser] : undefined;
  const counts = [0, 0];
  Object.values(votes).forEach(v => { if(v === 0 || v === 1) counts[v]++; });
  const total = counts[0] + counts[1];
  if(myVote === undefined){
    return '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 10px; font-size:13px; font-weight:600;">🗳️ '+escapeHtml(p.poll.question)+'</p>' +
      '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:8px; text-align:left;" onclick="voteOnPostPoll(\''+p.id+'\', 0)">'+escapeHtml(p.poll.options[0])+'</button>' +
      '<button class="btn btn-outline btn-sm" style="width:100%; text-align:left;" onclick="voteOnPostPoll(\''+p.id+'\', 1)">'+escapeHtml(p.poll.options[1])+'</button></div>';
  }
  const pctA = total > 0 ? Math.round(counts[0]/total*100) : 0;
  const pctB = total > 0 ? Math.round(counts[1]/total*100) : 0;
  return '<div class="card" style="margin-bottom:12px;"><p style="margin:0 0 10px; font-size:13px; font-weight:600;">🗳️ '+escapeHtml(p.poll.question)+'</p>' +
    '<div style="margin-bottom:8px;"><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;"><span>'+escapeHtml(p.poll.options[0])+(myVote===0?' ✓':'')+'</span><span>'+pctA+'%</span></div><div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px;"><div style="background:'+(myVote===0?'var(--lagoon)':'var(--gold)')+'; height:100%; width:'+pctA+'%; border-radius:6px;"></div></div></div>' +
    '<div><div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;"><span>'+escapeHtml(p.poll.options[1])+(myVote===1?' ✓':'')+'</span><span>'+pctB+'%</span></div><div style="background:rgba(245,239,227,0.1); border-radius:6px; height:8px;"><div style="background:'+(myVote===1?'var(--lagoon)':'var(--gold)')+'; height:100%; width:'+pctB+'%; border-radius:6px;"></div></div></div>' +
    '<p style="margin:8px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">'+total+' vote(s)</p></div>';
}
async function voteOnPostPoll(postId, optionIndex){
  if(!requireAccount('Créez un compte pour voter')) return;
  const p = await safeGet('post:' + postId, true);
  if(!p || !p.poll) return;
  if(!p.poll.votes) p.poll.votes = {};
  if(p.poll.votes[currentUser] !== undefined){ showToast('Vous avez déjà voté'); return; }
  p.poll.votes[currentUser] = optionIndex;
  await saveWithRetry('post:' + postId, p, true);
  await openSinglePostView(postId);
}
async function renderPencRoomParticipants(){
  if(!currentPencId) return;
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p){ leavePencRoom(); return; }
  if(!p.active){
    showToast('Ce Penc a été clôturé par l’animateur');
    leavePencRoom();
    return;
  }
  if(!p.participants.includes(currentUser) && (p.kicked||[]).includes(currentUser)){
    showToast('Vous avez été exclu(e) de ce Penc par l’animateur');
    await leavePencRoom();
    return;
  }
  const el = document.getElementById('penc-room-participants');
  const infoEl = document.getElementById('penc-room-info');
  if(infoEl) infoEl.textContent = 'Animé par @' + p.host;
  if(el){
    el.innerHTML = p.participants.map(u => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">' +
      smallAvatarBadge(u, 32) + '<span style="flex:1; font-size:13px;">@'+escapeHtml(u)+(u === p.host ? ' 🎙️ Animateur' : (p.coHosts||[]).includes(u) ? ' 🤝 Co-animateur' : '')+'</span>' +
      (p.host === currentUser && u !== currentUser ? '<span onclick="kickFromPenc(\''+escapeHtml(u)+'\')" style="color:var(--coral); cursor:pointer; font-size:11px;">Exclure</span>' : '') +
      '</div>').join('');
  }
  const chatEl = document.getElementById('penc-room-chat');
  if(chatEl){
    const messages = p.chatMessages || [];
    chatEl.innerHTML = messages.length === 0 ? '<p style="font-size:11.5px; color:rgba(245,239,227,0.4); margin:0;">Aucun message pour l’instant.</p>' :
      messages.map(m => '<p style="margin:0 0 6px; font-size:12.5px;"><strong>@'+escapeHtml(m.user)+'</strong> : '+escapeHtml(m.text)+'</p>').join('');
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}
async function sendPencChatMessage(){
  if(!currentPencId || !currentUser) return;
  const input = document.getElementById('penc-chat-input');
  const text = input.value.trim();
  if(!text) return;
  const forbiddenWords = await getForbiddenWords();
  if(containsForbiddenWord(text, forbiddenWords)){ showToast('Ce message contient un mot non autorisé'); return; }
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p) return;
  if(!p.chatMessages) p.chatMessages = [];
  p.chatMessages.push({ user: currentUser, text, ts: new Date().toISOString() });
  await saveWithRetry('penc:' + currentPencId, p, true);
  input.value = '';
  await renderPencRoomParticipants();
}
/* ---------- RECHERCHE DANS UNE CONVERSATION ---------- */
function searchInThread(){
  const query = document.getElementById('thread-search-input').value.trim().toLowerCase();
  const clearBtn = document.getElementById('thread-search-clear-btn');
  const countEl = document.getElementById('thread-search-results-count');
  clearBtn.style.display = query ? 'inline-block' : 'none';
  if(!query){
    countEl.style.display = 'none';
    document.querySelectorAll('[id^="dm-text-"]').forEach(el => { if(el.parentElement) el.parentElement.style.display = ''; });
    return;
  }
  let matchCount = 0;
  document.querySelectorAll('[id^="dm-text-"]').forEach(el => {
    const matches = el.textContent.toLowerCase().includes(query);
    if(el.parentElement) el.parentElement.style.display = matches ? '' : 'none';
    if(matches) matchCount++;
  });
  countEl.style.display = 'block';
  countEl.textContent = matchCount + ' message(s) trouvé(s)';
}
function clearThreadSearch(){
  document.getElementById('thread-search-input').value = '';
  searchInThread();
}
async function kickFromPenc(username){
  if(!currentPencId) return;
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p || p.host !== currentUser) return;
  if(!confirm('Exclure @' + username + ' de ce Penc ?')) return;
  p.participants = p.participants.filter(u => u !== username);
  if(p.coHosts) p.coHosts = p.coHosts.filter(u => u !== username);
  if(!p.kicked) p.kicked = [];
  if(!p.kicked.includes(username)) p.kicked.push(username);
  await saveWithRetry('penc:' + currentPencId, p, true);
  showToast('@' + username + ' exclu(e) du Penc ✓');
  await renderPencRoomParticipants();
}
async function reportPencRoom(){
  if(!currentPencId || !currentUser) return;
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p) return;
  const reason = prompt('Pourquoi signalez-vous ce Penc ? (visible par l’administration)');
  if(!reason) return;
  const reportId = 'pencreport_' + Date.now();
  await saveWithRetry('pencreport:' + reportId, {
    id: reportId, pencId: currentPencId, pencTitle: p.title, host: p.host,
    reportedBy: currentUser, reason, createdAt: new Date().toISOString(), status: 'pending'
  }, true);
  showToast('Signalement envoyé ✓ — merci, l’équipe va l’examiner');
}
async function invitePencCoHost(){
  if(!currentPencId) return;
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p || p.host !== currentUser) return;
  const username = document.getElementById('penc-cohost-input').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  if(username === currentUser){ showToast('Vous êtes déjà l’animateur'); return; }
  const exists = await safeGet('user:' + username, true);
  if(!exists){ showToast('Ce compte n’existe pas'); return; }
  if(!p.coHosts) p.coHosts = [];
  if(p.coHosts.includes(username)){ showToast('Déjà co-animateur(trice)'); return; }
  p.coHosts.push(username);
  if(!p.participants.includes(username)) p.participants.push(username);
  await saveWithRetry('penc:' + currentPencId, p, true);
  document.getElementById('penc-cohost-input').value = '';
  showToast('@' + username + ' invité(e) comme co-animateur(trice) ✓');
  await createNotification(username, 'penc_cohost_invite', currentUser, null, p.title);
  await renderPencRoomParticipants();
}
async function leavePencRoom(){
  if(pencRoomRefreshInterval){ clearInterval(pencRoomRefreshInterval); pencRoomRefreshInterval = null; }
  if(currentPencId && currentUser){
    const p = await safeGet('penc:' + currentPencId, true);
    if(p && p.active){
      p.participants = p.participants.filter(u => u !== currentUser);
      await saveWithRetry('penc:' + currentPencId, p, true);
    }
  }
  const iframe = document.getElementById('penc-room-iframe');
  if(iframe) iframe.removeAttribute('src');
  currentPencId = null;
  go('penc-browse');
}
async function endPenc(){
  if(!currentPencId) return;
  const p = await safeGet('penc:' + currentPencId, true);
  if(!p || p.host !== currentUser) return;
  if(!confirm('Clôturer ce Penc pour tout le monde ?')) return;
  p.active = false;
  await saveWithRetry('penc:' + currentPencId, p, true);
  showToast('Penc clôturé ✓');
  await leavePencRoom();
}
/* ---------- GESTION DES PENC (BACK-OFFICE) ---------- */
async function renderAdminActivePencs(){
  const el = document.getElementById('admin-active-pencs-list');
  if(!el) return;
  const keys = await safeList('penc:', true);
  const activePencs = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p && p.active) activePencs.push(p); }
  activePencs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(activePencs.length === 0){ el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Aucun Penc actif pour l’instant sur toute la plateforme.</p>'; return; }
  el.innerHTML = activePencs.map(p =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(p.title)+' <span style="color:rgba(245,239,227,0.5); font-size:11px;">('+escapeHtml(p.category)+')</span></p>' +
    '<p style="margin:0 0 8px; font-size:11.5px; color:var(--gold);">Animé par @'+escapeHtml(p.host)+' · 🎙️ '+p.participants.length+'</p>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="forceClosePencAdmin(\''+p.id+'\')">Clôturer de force</button></div>'
  ).join('');
}
async function forceClosePencAdmin(pencId){
  if(!currentAdminPasswordHash){ showToast('Session administrateur requise'); return; }
  if(!confirm('Clôturer ce Penc de force, pour tout le monde ?')) return;
  const p = await safeGet('penc:' + pencId, true);
  if(!p) return;
  p.active = false;
  await saveWithRetry('penc:' + pencId, p, true);
  showToast('Penc clôturé de force ✓');
  await logAdminAction('Penc clôturé de force', '« '+p.title+' » (animé par @'+p.host+')');
  await renderAdminActivePencs();
}
async function renderPencReportsAdmin(){
  const el = document.getElementById('penc-reports-admin-list');
  if(!el) return;
  const keys = await safeList('pencreport:', true);
  const reports = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r && r.status === 'pending') reports.push(r); }
  reports.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(reports.length === 0){ el.innerHTML = '<div class="empty">Aucun signalement en attente.</div>'; return; }
  el.innerHTML = reports.map(r =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>« '+escapeHtml(r.pencTitle)+' »</strong> — animé par @'+escapeHtml(r.host)+'</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">Signalé par @'+escapeHtml(r.reportedBy)+' : « '+escapeHtml(r.reason)+' »</p>' +
    '<div style="display:flex; gap:8px;">' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="forceClosePencFromReport(\''+r.id+'\', \''+r.pencId+'\')">Clôturer le Penc</button>' +
    '<button class="btn btn-outline btn-sm" onclick="dismissPencReport(\''+r.id+'\')">Ignorer</button>' +
    '</div></div>'
  ).join('');
}
async function forceClosePencFromReport(reportId, pencId){
  if(!currentAdminPasswordHash){ showToast('Session administrateur requise'); return; }
  await forceClosePencAdmin(pencId);
  await resolvePencReport(reportId);
}
async function dismissPencReport(reportId){
  if(!currentAdminPasswordHash){ showToast('Session administrateur requise'); return; }
  await resolvePencReport(reportId);
}
async function resolvePencReport(reportId){
  const r = await safeGet('pencreport:' + reportId, true);
  if(!r) return;
  r.status = 'resolved';
  await saveWithRetry('pencreport:' + reportId, r, true);
  await renderPencReportsAdmin();
}
async function togglePencCreationAllowed(){
  if(!currentAdminPasswordHash){ showToast('Session administrateur requise'); return; }
  const allowed = document.getElementById('penc-creation-allowed-toggle').checked;
  await saveWithRetry('settings:pencCreationAllowed', allowed, true);
  showToast(allowed ? 'Création de Penc autorisée ✓' : 'Création de Penc désactivée ✓');
}
async function loadPencCreationToggle(){
  const toggle = document.getElementById('penc-creation-allowed-toggle');
  if(!toggle) return;
  const allowed = await safeGet('settings:pencCreationAllowed', true);
  toggle.checked = allowed !== false;
}
/* ---------- SALLE DE RÉUNION D'ÉQUIPE (VIDÉO) ---------- */
async function addMeetingRoomStaff(){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut gérer la salle de réunion'); return; }
  const username = document.getElementById('meeting-staff-add-input').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  const exists = await safeGet('user:' + username, true);
  if(!exists){ showToast('Ce compte n’existe pas'); return; }
  const staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  if(staff.includes(username)){ showToast('Déjà membre de la salle de réunion'); return; }
  staff.push(username);
  await saveWithRetry('settings:meetingroomstaff', staff, true);
  document.getElementById('meeting-staff-add-input').value = '';
  showToast('@' + username + ' ajouté(e) ✓');
  await createNotification(username, 'meeting_room_access_granted', currentAdminName, null, null);
  await renderMeetingRoomOwnerControls();
}
async function removeMeetingRoomStaff(username){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut gérer la salle de réunion'); return; }
  let staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  staff = staff.filter(u => u !== username);
  await saveWithRetry('settings:meetingroomstaff', staff, true);
  showToast('@' + username + ' retiré(e)');
  await renderMeetingRoomOwnerControls();
}
async function startTeamMeeting(){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut démarrer une réunion'); return; }
  const roomId = 'meeting_' + Date.now();
  const agendaSnapshot = (await safeGet('settings:meetingagenda', true)) || [];
  await saveWithRetry('settings:teammeetingstate', { active: true, roomId, startedAt: new Date().toISOString(), agendaSnapshot }, true);
  const staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  for(const u of staff) await createNotification(u, 'team_meeting_started', currentAdminName, null, null);
  await saveWithRetry('settings:meetingwaitingroom', [], true);
  showToast('Réunion démarrée ✓');
  await renderMeetingRoomOwnerControls();
}
async function endTeamMeeting(){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut clôturer la réunion'); return; }
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  if(state.active){
    const historyId = 'meetinghistory_' + Date.now();
    await saveWithRetry('meetinghistory:' + historyId, {
      id: historyId, startedAt: state.startedAt, endedAt: new Date().toISOString(), participants: state.participants || [], agendaSnapshot: state.agendaSnapshot || []
    }, true);
  }
  await saveWithRetry('settings:teammeetingstate', { active: false }, true);
  showToast('Réunion clôturée ✓');
  await renderMeetingRoomOwnerControls();
}
async function joinMeetingWaitingRoom(){
  const hasAccess = await hasMeetingRoomAccess();
  if(!hasAccess){ showToast('Vous n’avez pas accès à cette salle de réunion'); return; }
  const waiting = (await safeGet('settings:meetingwaitingroom', true)) || [];
  if(!waiting.includes(currentUser)) waiting.push(currentUser);
  await saveWithRetry('settings:meetingwaitingroom', waiting, true);
  showToast('Vous patientez dans la salle d’attente ✓');
  await renderMeetingWaitingRoomStaffStatus();
}
async function leaveMeetingWaitingRoom(){
  let waiting = (await safeGet('settings:meetingwaitingroom', true)) || [];
  waiting = waiting.filter(u => u !== currentUser);
  await saveWithRetry('settings:meetingwaitingroom', waiting, true);
  if(meetingWaitingRoomRefreshInterval){ clearInterval(meetingWaitingRoomRefreshInterval); meetingWaitingRoomRefreshInterval = null; }
  await renderMeetingWaitingRoomStaffStatus();
}
let meetingWaitingRoomRefreshInterval = null;
async function renderMeetingWaitingRoomStaffStatus(){
  const el = document.getElementById('meeting-waiting-room-staff-status');
  if(!el) return;
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  if(state.active){
    if(meetingWaitingRoomRefreshInterval){ clearInterval(meetingWaitingRoomRefreshInterval); meetingWaitingRoomRefreshInterval = null; }
    return;
  }
  const waiting = (await safeGet('settings:meetingwaitingroom', true)) || [];
  const isWaiting = waiting.includes(currentUser);
  el.innerHTML = isWaiting
    ? '<p style="margin:8px 0 8px; font-size:12px; color:var(--gold);">🚪 Vous patientez dans la salle d’attente — vous rejoindrez automatiquement dès que le propriétaire démarrera.</p><button class="btn btn-outline btn-sm" onclick="leaveMeetingWaitingRoom()">Quitter la salle d’attente</button>'
    : '<button class="btn btn-outline btn-sm" style="margin-top:4px;" onclick="joinMeetingWaitingRoom()">🚪 Rejoindre la salle d’attente</button>';
  if(isWaiting && !meetingWaitingRoomRefreshInterval){
    meetingWaitingRoomRefreshInterval = setInterval(async () => {
      const s = (await safeGet('settings:teammeetingstate', true)) || { active: false };
      if(s.active){
        clearInterval(meetingWaitingRoomRefreshInterval);
        meetingWaitingRoomRefreshInterval = null;
        await joinTeamMeeting();
      }
    }, 4000);
  }
}
async function renderMeetingWaitingRoomOwnerView(){
  const el = document.getElementById('meeting-waiting-room-owner-view');
  if(!el) return;
  const waiting = (await safeGet('settings:meetingwaitingroom', true)) || [];
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  if(state.active || waiting.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<p style="font-size:12px; font-weight:600; margin:0 0 6px;">🚪 En salle d’attente :</p>' +
    waiting.map(u => '<p style="margin:0 0 4px; font-size:12.5px; color:var(--gold);">@'+escapeHtml(u)+'</p>').join('');
}
async function renderMeetingRoomOwnerControls(){
  const el = document.getElementById('meeting-room-owner-controls');
  if(!el) return;
  const staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  el.innerHTML =
    '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 10px;">Un vrai espace vidéo privé pour vos réunions avec les DG et l’équipe — accessible uniquement aux comptes que vous ajoutez ici.</p>' +
    '<div style="display:flex; gap:8px; margin-bottom:12px;">' +
    '<input type="text" id="meeting-staff-add-input" placeholder="Nom d’utilisateur à autoriser" style="margin:0; flex:1;">' +
    '<button class="btn btn-primary btn-sm" onclick="addMeetingRoomStaff()">Ajouter</button>' +
    '</div>' +
    (staff.length === 0 ? '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0 0 12px;">Aucun employé autorisé pour l’instant.</p>' :
      staff.map(u => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;"><span style="flex:1; font-size:13px;">@'+escapeHtml(u)+'</span><span onclick="removeMeetingRoomStaff(\''+escapeHtml(u)+'\')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>').join('')) +
    '<div id="meeting-waiting-room-owner-view" style="margin-top:12px;"></div>' +
    (state.active
      ? '<p style="margin:12px 0 8px; font-size:12.5px; color:var(--lagoon);">🟢 Réunion en cours depuis '+new Date(state.startedAt).toLocaleTimeString('fr-FR')+'</p><button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral); margin-right:8px;" onclick="endTeamMeeting()">Clôturer</button><button class="btn btn-primary btn-sm" onclick="joinTeamMeeting()">Rejoindre</button>'
      : '<button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="startTeamMeeting()">Démarrer une réunion</button>');
  await renderMeetingWaitingRoomOwnerView();
}
async function hasMeetingRoomAccess(){
  if(isGenuineOwnerSession) return true;
  const staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  return staff.includes(currentUser);
}
async function joinTeamMeeting(){
  const hasAccess = await hasMeetingRoomAccess();
  if(!hasAccess){ showToast('Vous n’avez pas accès à cette salle de réunion'); return; }
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  if(!state.active){ showToast('Aucune réunion en cours pour l’instant'); return; }
  if(!state.participants) state.participants = [];
  if(!state.participants.includes(currentUser)){
    state.participants.push(currentUser);
    await saveWithRetry('settings:teammeetingstate', state, true);
  }
  document.getElementById('team-meeting-iframe').src = 'https://meet.jit.si/suktum-team-' + state.roomId + '#config.prejoinPageEnabled=false';
  go('team-meeting-room');
}
function leaveTeamMeeting(){
  const iframe = document.getElementById('team-meeting-iframe');
  if(iframe) iframe.removeAttribute('src');
  go('settings');
}
async function addMeetingAgendaItem(){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut gérer l’ordre du jour'); return; }
  const text = document.getElementById('meeting-agenda-item-input').value.trim();
  if(!text){ showToast('Renseignez un point à aborder'); return; }
  const agenda = (await safeGet('settings:meetingagenda', true)) || [];
  agenda.push({ text, createdAt: new Date().toISOString() });
  await saveWithRetry('settings:meetingagenda', agenda, true);
  document.getElementById('meeting-agenda-item-input').value = '';
  showToast('Ajouté à l’ordre du jour ✓');
  await renderMeetingAgendaList();
}
async function removeMeetingAgendaItem(index){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut gérer l’ordre du jour'); return; }
  const agenda = (await safeGet('settings:meetingagenda', true)) || [];
  agenda.splice(index, 1);
  await saveWithRetry('settings:meetingagenda', agenda, true);
  await renderMeetingAgendaList();
}
async function clearMeetingAgenda(){
  if(!isGenuineOwnerSession){ showToast('Seul le propriétaire peut gérer l’ordre du jour'); return; }
  await saveWithRetry('settings:meetingagenda', [], true);
  showToast('Ordre du jour vidé');
  await renderMeetingAgendaList();
}
async function renderMeetingAgendaList(){
  const el = document.getElementById('meeting-agenda-list');
  if(!el) return;
  const agenda = (await safeGet('settings:meetingagenda', true)) || [];
  if(agenda.length === 0){ el.innerHTML = '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Aucun point à l’ordre du jour pour l’instant.</p>'; return; }
  el.innerHTML = agenda.map((item, i) => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;"><span style="flex:1; font-size:13px;">'+(i+1)+'. '+escapeHtml(item.text)+'</span><span onclick="removeMeetingAgendaItem('+i+')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>').join('') +
    '<button class="btn btn-outline btn-sm" style="margin-top:8px; border-color:var(--coral); color:var(--coral);" onclick="clearMeetingAgenda()">Vider tout</button>';
}
async function renderMeetingRoomStaffAccess(){
  const el = document.getElementById('meeting-room-staff-access');
  if(!el || !currentUser) return;
  const staff = (await safeGet('settings:meetingroomstaff', true)) || [];
  if(!staff.includes(currentUser)){ el.style.display = 'none'; return; }
  const state = (await safeGet('settings:teammeetingstate', true)) || { active: false };
  const agenda = (await safeGet('settings:meetingagenda', true)) || [];
  el.style.display = 'block';
  el.innerHTML = '<div class="eyebrow">🎥 Réunion d’équipe Suktum</div><div class="card">' +
    (state.active
      ? '<p style="margin:0 0 10px; font-size:12.5px; color:var(--lagoon);">🟢 Une réunion est en cours.</p><button class="btn btn-primary btn-sm" onclick="joinTeamMeeting()">Rejoindre la réunion</button>'
      : '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.5);">Aucune réunion en cours pour l’instant.</p><div id="meeting-waiting-room-staff-status"></div>') +
    (agenda.length > 0 ? '<p style="margin:14px 0 6px; font-size:12px; font-weight:600;">📋 Ordre du jour :</p>' + agenda.map((item,i) => '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.7);">'+(i+1)+'. '+escapeHtml(item.text)+'</p>').join('') : '') +
    '</div>';
  if(!state.active) await renderMeetingWaitingRoomStaffStatus();
}
async function renderMeetingHistory(){
  const el = document.getElementById('meeting-history-list');
  if(!el) return;
  if(!isGenuineOwnerSession){ el.innerHTML = '<div class="empty">Réservé au propriétaire.</div>'; return; }
  const keys = await safeList('meetinghistory:', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune réunion clôturée pour l’instant.</div>'; return; }
  el.innerHTML = entries.map(e => {
    const durationMin = Math.max(0, Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 60000));
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">'+new Date(e.startedAt).toLocaleString('fr-FR')+'</p>' +
      '<p style="margin:0 0 6px; font-size:12px; color:var(--gold);">Durée : '+durationMin+' min</p>' +
      '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">Présents : '+(e.participants.length > 0 ? e.participants.map(u => '@'+escapeHtml(u)).join(', ') : 'Personne n’a rejoint')+'</p>' +
      '<button class="btn btn-outline btn-sm" onclick="exportMeetingSummary(\''+e.id+'\')">📤 Exporter le résumé</button></div>';
  }).join('');
}
async function exportMeetingSummary(historyId){
  const e = await safeGet('meetinghistory:' + historyId, true);
  if(!e) return;
  const durationMin = Math.max(0, Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 60000));
  let text = 'RÉUNION D’ÉQUIPE SUKTUM\n';
  text += '========================\n\n';
  text += 'Date : ' + new Date(e.startedAt).toLocaleString('fr-FR') + '\n';
  text += 'Durée : ' + durationMin + ' min\n\n';
  text += 'PARTICIPANTS\n';
  text += (e.participants.length > 0 ? e.participants.map(u => '- @' + u).join('\n') : 'Personne n’a rejoint') + '\n\n';
  text += 'ORDRE DU JOUR\n';
  text += ((e.agendaSnapshot || []).length > 0 ? e.agendaSnapshot.map((item, i) => (i+1) + '. ' + item.text).join('\n') : 'Aucun point à l’ordre du jour n’avait été renseigné.');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reunion-suktum-' + new Date(e.startedAt).toISOString().slice(0,10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Résumé téléchargé ✓');
}
async function renderPencStats(){
  const summaryEl = document.getElementById('penc-stats-summary');
  const listEl = document.getElementById('penc-stats-list');
  if(!summaryEl || !listEl || !currentUser) return;
  const keys = await safeList('penc:', true);
  const myPencs = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p && p.host === currentUser && (p.everJoined||[]).length > 0) myPencs.push(p); }
  if(myPencs.length === 0){
    summaryEl.innerHTML = '<div class="empty">Aucun Penc animé pour l’instant.</div>';
    listEl.innerHTML = '';
    return;
  }
  const totalJoins = myPencs.reduce((sum, p) => sum + (p.everJoined||[]).length, 0);
  summaryEl.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">🌳 '+myPencs.length+' Penc(s) animé(s)</p><p style="margin:0; font-size:13px;">🎙️ '+totalJoins+' participation(s) au total</p></div>';
  const ranked = [...myPencs].sort((a,b) => (b.everJoined||[]).length - (a.everJoined||[]).length).slice(0, 10);
  listEl.innerHTML = ranked.map(p =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">'+escapeHtml(p.title)+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:var(--gold);">'+(p.everJoined||[]).length+' personne(s) ont rejoint · '+new Date(p.createdAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
async function renderBanAppealsAdmin(){
  const el = document.getElementById('ban-appeals-admin-list');
  if(!el) return;
  const keys = await safeList('banappeal:', true);
  const appeals = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a && a.status === 'pending') appeals.push(a); }
  appeals.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(appeals.length === 0){ el.innerHTML = '<div class="empty">Aucune contestation de bannissement en attente.</div>'; return; }
  el.innerHTML = appeals.map(a =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(a.username)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.6);">« '+escapeHtml(a.text)+' »</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="openUserDetail(\''+escapeHtml(a.username)+'\')">👤 Voir le compte</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveBanAppeal(\''+escapeHtml(a.username)+'\', true)">✓ Lever le bannissement</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveBanAppeal(\''+escapeHtml(a.username)+'\', false)">✕ Maintenir le bannissement</button>' +
    '</div></div>'
  ).join('');
}
async function resolveBanAppeal(username, lift){
  const appeal = await safeGet('banappeal:' + username, true);
  if(!appeal) return;
  if(lift){
    const u = await safeGet('user:' + username, true);
    if(u && u.status === 'banned'){
      u.status = 'active';
      if(!u.suspensionHistory) u.suspensionHistory = [];
      u.suspensionHistory.push({ action: 'reactivated', by: currentAdminName + ' (bannissement levé suite à contestation)', reason: null, createdAt: new Date().toISOString() });
      await saveWithRetry('user:' + username, u, true);
      await createNotification(username, 'account_reactivated', 'Suktum', null, null);
    }
  } else {
    await createNotification(username, 'ban_appeal_rejected', 'Suktum', null, null);
  }
  appeal.status = 'resolved';
  appeal.lifted = lift;
  await saveWithRetry('banappeal:' + username, appeal, true);
  showToast(lift ? 'Bannissement levé suite à la contestation ✓' : 'Contestation examinée — bannissement maintenu');
  await logAdminAction('Contestation de bannissement examinée', '@' + username + (lift ? ' (bannissement levé)' : ' (maintenu)'));
  await renderBanAppealsAdmin();
}
async function renderSuspensionAppealsAdmin(){
  const el = document.getElementById('suspension-appeals-admin-list');
  if(!el) return;
  const keys = await safeList('suspensionappeal:', true);
  const appeals = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a && a.status === 'pending') appeals.push(a); }
  appeals.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(appeals.length === 0){ el.innerHTML = '<div class="empty">Aucune contestation de suspension en attente.</div>'; return; }
  el.innerHTML = appeals.map(a =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(a.username)+'</strong></p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.6);">« '+escapeHtml(a.text)+' »</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="openUserDetail(\''+escapeHtml(a.username)+'\')">👤 Voir le compte</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveSuspensionAppeal(\''+escapeHtml(a.username)+'\', true)">✓ Réactiver le compte</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resolveSuspensionAppeal(\''+escapeHtml(a.username)+'\', false)">✕ Maintenir la suspension</button>' +
    '</div></div>'
  ).join('');
}
async function resolveSuspensionAppeal(username, reactivate){
  const appeal = await safeGet('suspensionappeal:' + username, true);
  if(!appeal) return;
  if(reactivate) await toggleUserAccountSuspension(username);
  appeal.status = 'resolved';
  appeal.reactivated = reactivate;
  await saveWithRetry('suspensionappeal:' + username, appeal, true);
  showToast(reactivate ? 'Compte réactivé suite à la contestation ✓' : 'Contestation examinée — suspension maintenue');
  await logAdminAction('Contestation de suspension examinée', '@' + username + (reactivate ? ' (réactivé)' : ' (suspension maintenue)'));
  if(!reactivate) await createNotification(username, 'suspension_appeal_rejected', 'Suktum', null, null);
  await renderSuspensionAppealsAdmin();
}
async function renderFundDisputesAdmin(){
  const el = document.getElementById('fund-disputes-admin-list');
  if(!el) return;
  const keys = await safeList('creatorfundpayout:', true);
  const disputes = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.disputeStatus === 'pending') disputes.push(p);
  }
  disputes.sort((a,b) => new Date(a.disputeCreatedAt) - new Date(b.disputeCreatedAt));
  if(disputes.length === 0){ el.innerHTML = '<div class="empty">Aucune contestation en attente.</div>'; return; }
  el.innerHTML = disputes.map(p =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(p.username)+'</strong> — '+escapeHtml(p.monthKey)+' — '+p.amount.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0 0 8px; font-size:12.5px; color:rgba(245,239,227,0.6);">« '+escapeHtml(p.disputeReason)+' »</p>' +
    '<div style="display:flex; gap:8px;"><input type="text" id="dispute-note-'+p.username+'-'+p.monthKey+'" placeholder="Note (facultatif)" style="margin:0; flex:1; font-size:12px;"><button class="btn btn-primary btn-sm" onclick="resolveFundDispute(\''+p.username+'\', \''+p.monthKey+'\')">Marquer examiné</button></div></div>'
  ).join('');
}
async function resolveFundDispute(username, monthKey){
  const key = 'creatorfundpayout:' + monthKey + '__' + username;
  const p = await safeGet(key, true);
  if(!p) return;
  const noteInput = document.getElementById('dispute-note-' + username + '-' + monthKey);
  const note = noteInput ? noteInput.value.trim() : '';
  p.disputeStatus = 'resolved';
  p.disputeAdminNote = note || null;
  await saveWithRetry(key, p, true);
  await createNotification(username, 'fund_dispute_resolved', 'Suktum', null, monthKey);
  showToast('Contestation marquée comme examinée ✓');
  await logAdminAction('Contestation fonds créateur examinée', '@'+username+' — '+monthKey);
  await renderFundDisputesAdmin();
}
async function renderMyFundPayouts(){
  const el = document.getElementById('my-fund-payouts-list');
  if(!el || !currentUser) return;
  const keys = await safeList('creatorfundpayout:', true);
  const myPayouts = [];
  for(const k of keys){
    const p = await safeGet(k, true);
    if(p && p.username === currentUser) myPayouts.push(p);
  }
  myPayouts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(myPayouts.length === 0){ el.innerHTML = '<div class="empty">Aucun versement reçu pour l’instant.</div>'; return; }
  const totalReceived = myPayouts.reduce((s,p) => s + p.amount, 0);
  el.innerHTML = '<div class="card" style="margin-bottom:14px;"><p style="margin:0; font-size:13px;">Total reçu : <strong style="color:var(--gold);">'+totalReceived.toLocaleString('fr-FR')+' FCFA</strong></p></div>' +
    myPayouts.map(p =>
      '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(p.monthKey)+'</strong> — '+p.views.toLocaleString('fr-FR')+' vues</p>' +
      '<p style="margin:0 0 8px; font-size:12.5px; color:var(--gold);">'+p.amount.toLocaleString('fr-FR')+' FCFA</p>' +
      (p.disputeStatus === 'pending' ? '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">⏳ Contestation en cours d’examen</p>' :
       p.disputeStatus === 'resolved' ? '<p style="margin:0; font-size:11px; color:var(--lagoon);">✓ Contestation examinée'+(p.disputeAdminNote ? ' : '+escapeHtml(p.disputeAdminNote) : '')+'</p>' :
       '<button class="btn btn-outline btn-sm" onclick="openPayoutDisputeForm(\''+p.monthKey+'\')">⚖️ Contester ce montant</button>') +
      '<div id="dispute-form-'+p.monthKey+'" style="display:none; margin-top:8px;"><textarea id="dispute-reason-'+p.monthKey+'" placeholder="Expliquez pourquoi ce montant vous semble incorrect..." style="min-height:60px;"></textarea><button class="btn btn-primary btn-sm" style="margin-top:6px;" onclick="submitPayoutDispute(\''+p.monthKey+'\')">Envoyer</button></div>' +
      '</div>'
    ).join('');
}
function openPayoutDisputeForm(monthKey){
  const el = document.getElementById('dispute-form-' + monthKey);
  if(el) el.style.display = 'block';
}
async function submitPayoutDispute(monthKey){
  const reason = document.getElementById('dispute-reason-' + monthKey).value.trim();
  if(!reason){ showToast('Expliquez la raison de votre contestation'); return; }
  const key = 'creatorfundpayout:' + monthKey + '__' + currentUser;
  const p = await safeGet(key, true);
  if(!p || p.disputeStatus){ showToast('Cette contestation ne peut pas être envoyée'); return; }
  p.disputeStatus = 'pending';
  p.disputeReason = reason;
  p.disputeCreatedAt = new Date().toISOString();
  await saveWithRetry(key, p, true);
  showToast('Contestation envoyée ✓ — en attente d’examen');
  await logAdminAction('Nouvelle contestation de versement fonds créateur', '@'+currentUser+' — '+monthKey);
  await renderMyFundPayouts();
}
async function renderCountryRestrictionRecentPosts(){
  const el = document.getElementById('country-restriction-recent-posts');
  if(!el) return;
  const posts = (await fetchPosts(true)).slice(0, 15);
  el.innerHTML = posts.map(p =>
    '<div class="card" style="cursor:pointer; margin-bottom:6px;" onclick="document.getElementById(\'country-restriction-post-id\').value=\''+p.id+'\'; loadPostForCountryRestriction();">' +
    '<p style="margin:0; font-size:12px;">'+escapeHtml((p.caption||'(sans légende)').slice(0,50))+' — @'+escapeHtml(p.userId)+(p.blockedCountries && p.blockedCountries.length ? ' <span style="color:var(--coral);">🌍 '+p.blockedCountries.length+'</span>' : '')+'</p></div>'
  ).join('');
}
async function renderDuplicateAccounts(){
  const el = document.getElementById('duplicate-accounts-list');
  if(!el) return;
  const groups = [];
  const deviceKeys = await safeList('devicelink:', true);
  for(const k of deviceKeys){
    const link = await safeGet(k, true);
    if(link && link.accounts.length > 1) groups.push({ reason: '📱 Même appareil déjà utilisé', accounts: link.accounts });
  }
  const allUsers = await fetchUsers();
  const byPaymentNumber = {};
  allUsers.forEach(u => {
    if(u.sellerPaymentNumber && u.sellerPaymentNumber.trim()){
      const key = u.sellerPaymentNumber.replace(/[^0-9]/g, '');
      if(key.length >= 8){
        if(!byPaymentNumber[key]) byPaymentNumber[key] = [];
        byPaymentNumber[key].push(u.username);
      }
    }
  });
  Object.values(byPaymentNumber).filter(accs => accs.length > 1).forEach(accs => {
    groups.push({ reason: '💳 Même numéro de paiement renseigné', accounts: accs });
  });
  if(groups.length === 0){ el.innerHTML = '<div class="empty">Aucune correspondance réelle trouvée pour l’instant.</div>'; return; }
  el.innerHTML = groups.map(g =>
    '<div class="card" style="margin-bottom:10px;">' +
    '<p style="margin:0 0 6px; font-size:12px; color:var(--gold);">'+g.reason+'</p>' +
    g.accounts.map(a => '<span onclick="openUserDetail(\''+escapeHtml(a)+'\')" style="display:inline-block; cursor:pointer; text-decoration:underline; color:var(--lagoon); font-size:13px; margin:2px 8px 2px 0;">@'+escapeHtml(a)+'</span>').join('') +
    '</div>'
  ).join('');
}
async function renderDecisionLog(){
  const el = document.getElementById('decision-log-list');
  if(!el) return;
  const keys = await safeList('decisionlog:', true);
  const allEntries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) allEntries.push(e); }
  const entries = allEntries.filter(e => !e.archivedAt);
  const archived = allEntries.filter(e => e.archivedAt);
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  archived.sort((a,b) => new Date(b.archivedAt) - new Date(a.archivedAt));
  let html = entries.length === 0 ? '<div class="empty">Aucune décision notée pour l’instant.</div>' : entries.map(e =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<div style="display:flex; align-items:flex-start; gap:8px;"><div style="flex:1;">' +
    '<p style="margin:0 0 2px; font-size:13px; font-weight:600;">'+escapeHtml(e.title)+'</p>' +
    (e.reason ? '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.7);">'+escapeHtml(e.reason)+'</p>' : '') +
    '<p style="margin:0; font-size:11px; color:var(--gold);">'+new Date(e.createdAt).toLocaleString('fr-FR')+' · '+escapeHtml(e.author)+'</p>' +
    '</div><span onclick="deleteDecisionLogEntry(\''+e.id+'\')" class="admin-super-only" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>' +
    '</div>'
  ).join('');
  if(archived.length > 0){
    html += '<div class="eyebrow" style="margin-top:16px;">🗄️ Décisions archivées (historique conservé)</div>' +
      archived.map(e =>
        '<div class="card" style="opacity:0.6;"><p style="margin:0 0 2px; font-size:13px; font-weight:600;">'+escapeHtml(e.title)+'</p>' +
        (e.reason ? '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(e.reason)+'</p>' : '') +
        '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.4);">Décidée le '+new Date(e.createdAt).toLocaleDateString('fr-FR')+' par '+escapeHtml(e.author)+' — archivée le '+new Date(e.archivedAt).toLocaleDateString('fr-FR')+' par '+escapeHtml(e.archivedBy)+'</p></div>'
      ).join('');
  }
  el.innerHTML = html;
}
async function addChangelogEntry(){
  const title = document.getElementById('new-changelog-title').value.trim();
  const details = document.getElementById('new-changelog-details').value.trim();
  if(!title){ showToast('Écrivez au moins un titre'); return; }
  const id = 'changelog_' + Date.now();
  await saveWithRetry('internalchangelog:' + id, {
    id, title, details, author: currentAdminName, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-changelog-title').value = '';
  document.getElementById('new-changelog-details').value = '';
  showToast('Ajouté au journal ✓');
  await renderInternalChangelog();
}
async function deleteChangelogEntry(entryId){
  await window.storage.delete('internalchangelog:' + entryId, true).catch(() => {});
  showToast('Entrée supprimée');
  await renderInternalChangelog();
}
/* ---------- BASE DE CONNAISSANCES INTERNE ---------- */
async function addKnowledgeBaseArticle(){
  const title = document.getElementById('new-kb-title').value.trim();
  const content = document.getElementById('new-kb-content').value.trim();
  if(!title || !content){ showToast('Renseignez un titre et une procédure'); return; }
  const id = 'kb_' + Date.now();
  await saveWithRetry('knowledgebase:' + id, {
    id, title, content, author: currentAdminName, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-kb-title').value = '';
  document.getElementById('new-kb-content').value = '';
  showToast('Procédure ajoutée ✓');
  await renderKnowledgeBase();
}
async function deleteKnowledgeBaseArticle(id){
  await window.storage.delete('knowledgebase:' + id, true).catch(() => {});
  showToast('Procédure supprimée');
  await renderKnowledgeBase();
}
const DEFAULT_KB_ARTICLES = [
  { id: 'default_claude_role', title: '🤖 Rôle de Claude (IA) dans ce projet', author: 'Claude', isDefault: true,
    content: 'Une grande partie du code de Suktum a été construite avec l\u2019assistance de Claude (Anthropic), en dialogue direct avec Gorgui Faye, ainsi qu\u2019avec Claude Code (un autre outil ayant travaillé en parallèle sur le même fichier).\n\nCe que Claude PEUT faire : lire et modifier le code existant, construire de nouvelles fonctionnalités, tester de bout en bout avant chaque livraison, répondre à des questions techniques sur l\u2019architecture.\n\nCe que Claude NE PEUT PAS faire : agir de façon autonome entre les conversations, se connecter seul à l\u2019application, surveiller le projet en continu sans qu\u2019on le lui demande explicitement.\n\nPour tout contributeur qui rejoint le projet : voir le "Guide technique pour experts" livré séparément, qui détaille les conventions établies et les pièges déjà rencontrés.' }
];
async function renderKnowledgeBase(){
  const el = document.getElementById('knowledge-base-list');
  if(!el) return;
  const query = (document.getElementById('kb-search-input').value || '').toLowerCase().trim();
  const keys = await safeList('knowledgebase:', true);
  let articles = [];
  for(const k of keys){ const a = await safeGet(k, true); if(a) articles.push(a); }
  articles = DEFAULT_KB_ARTICLES.concat(articles);
  if(query) articles = articles.filter(a => a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query));
  articles.sort((a,b) => (b.isDefault?1:0) - (a.isDefault?1:0) || a.title.localeCompare(b.title));
  el.innerHTML = articles.length === 0 ? '<div class="empty">Aucune procédure trouvée.</div>' : articles.map(a =>
    '<div class="card" style="margin-bottom:8px;'+(a.isDefault ? ' border-color:var(--lagoon);' : '')+'">' +
    '<p style="margin:0 0 6px; font-size:13px; font-weight:600;">'+escapeHtml(a.title)+'</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.75); white-space:pre-line;">'+escapeHtml(a.content)+'</p>' +
    '<p style="margin:0; font-size:10.5px; color:var(--gold);">Par '+escapeHtml(a.author)+'</p>' +
    (!a.isDefault ? '<span onclick="deleteKnowledgeBaseArticle(\''+a.id+'\')" class="admin-super-only" style="color:var(--coral); cursor:pointer; font-size:11px;">🗑️ Supprimer</span>' : '') +
    '</div>'
  ).join('');
}
async function renderInternalChangelog(){
  const el = document.getElementById('internal-changelog-list');
  if(!el) return;
  const keys = await safeList('internalchangelog:', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = entries.length === 0 ? '<div class="empty">Aucun changement noté pour l’instant.</div>' : entries.map(e =>
    '<div class="card" style="margin-bottom:8px;">' +
    '<div style="display:flex; align-items:flex-start; gap:8px;"><div style="flex:1;">' +
    '<p style="margin:0 0 2px; font-size:13px; font-weight:600;">'+escapeHtml(e.title)+'</p>' +
    (e.details ? '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.7);">'+escapeHtml(e.details)+'</p>' : '') +
    '<p style="margin:0; font-size:11px; color:var(--gold);">'+new Date(e.createdAt).toLocaleString('fr-FR')+' · '+escapeHtml(e.author)+'</p>' +
    '</div><span onclick="deleteChangelogEntry(\''+e.id+'\')" class="admin-super-only" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>' +
    '</div>'
  ).join('');
}
function updateBulkReportsBar(){
  const checked = document.querySelectorAll('.bulk-report-checkbox:checked');
  const bar = document.getElementById('bulk-reports-action-bar');
  if(!bar) return;
  if(checked.length === 0){ bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  bar.innerHTML = '<div class="card" style="display:flex; align-items:center; gap:8px; border-color:var(--gold); flex-wrap:wrap;">' +
    '<span style="flex:1; font-size:12.5px; color:var(--gold);">'+checked.length+' signalement(s) sélectionné(s)</span>' +
    '<button class="btn btn-outline btn-sm" onclick="bulkResolveReports(\'approved\')">✓ Traiter tout</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="bulkResolveReports(\'rejected\')">✕ Rejeter tout</button>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="bulkSuspendReportedAccounts()">⏸ Suspendre les comptes</button>' +
    '</div>';
}
async function bulkResolveReports(decision){
  const checked = Array.from(document.querySelectorAll('.bulk-report-checkbox:checked')).map(cb => cb.value);
  if(checked.length === 0) return;
  for(const reportId of checked){
    await resolveReport(reportId, decision);
  }
  showToast(checked.length + ' signalement(s) ' + (decision === 'approved' ? 'traité(s)' : 'rejeté(s)') + ' ✓');
  await logAdminAction('Modération groupée (' + (decision === 'approved' ? 'traité' : 'rejeté') + ')', checked.length + ' signalement(s)');
  await loadAdminReportsList();
}
async function bulkSuspendReportedAccounts(){
  const checkedIds = Array.from(document.querySelectorAll('.bulk-report-checkbox:checked')).map(cb => cb.value);
  if(checkedIds.length === 0) return;
  const targetUsernames = new Set();
  for(const reportId of checkedIds){
    const r = await safeGet('report:' + reportId, true);
    if(r && r.type === 'account' && r.targetUser) targetUsernames.add(r.targetUser);
  }
  if(targetUsernames.size === 0){ showToast('Aucun compte signalé parmi la sélection'); return; }
  const reason = prompt('Motif de la suspension groupée pour ' + targetUsernames.size + ' compte(s) (visible dans le journal) :');
  if(reason === null || !reason.trim()) return;
  const durationInput = prompt('Durée de la suspension en jours (laissez vide pour une suspension indéfinie) :');
  let durationDays = null;
  if(durationInput && durationInput.trim()){
    const parsed = parseInt(durationInput.trim(), 10);
    if(isNaN(parsed) || parsed <= 0){ showToast('Durée invalide — suspension groupée annulée'); return; }
    durationDays = parsed;
  }
  let suspendedCount = 0;
  for(const username of targetUsernames){
    const before = await safeGet('user:' + username, true);
    if(before && before.status !== 'suspended' && before.status !== 'banned'){
      await toggleUserAccountSuspension(username, reason, durationDays);
      suspendedCount++;
    }
  }
  showToast(suspendedCount + ' compte(s) suspendu(s) ✓');
  await logAdminAction('Suspension groupée', suspendedCount + ' compte(s) — ' + reason.trim());
}
async function toggleUserAccountSuspension(username, presetReason, presetDurationDays){
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe plus'); return; }
  if(u.status === 'banned'){ showToast('Ce compte est déjà banni — utilisez la fiche du compte pour le réactiver'); return; }
  const currentlySuspended = u.status === 'suspended';
  const action = currentlySuspended ? 'Réactiver' : 'Suspendre';
  let reason = presetReason || null, durationDays = presetDurationDays || null;
  if(!currentlySuspended && presetReason === undefined){
    reason = prompt('Motif de la suspension de @' + username + ' (visible dans le journal) :');
    if(reason === null || !reason.trim()) return;
    const durationInput = prompt('Durée de la suspension en jours (laissez vide pour une suspension indéfinie) :');
    if(durationInput && durationInput.trim()){
      const parsed = parseInt(durationInput.trim(), 10);
      if(isNaN(parsed) || parsed <= 0){ showToast('Durée invalide — suspension annulée'); return; }
      durationDays = parsed;
    }
  }
  if(!confirm(action + ' le compte de @' + username + ' ?')) return;
  if(!u.suspensionHistory) u.suspensionHistory = [];
  if(currentlySuspended){
    u.status = 'active';
    u.suspendedUntil = null;
    u.suspensionHistory.push({ action: 'reactivated', by: currentAdminName, reason: null, createdAt: new Date().toISOString() });
  } else {
    u.status = 'suspended';
    u.suspendedUntil = durationDays ? new Date(Date.now() + durationDays*24*60*60*1000).toISOString() : null;
    u.suspensionHistory.push({ action: 'suspended', by: currentAdminName, reason: reason.trim(), durationDays: durationDays || null, createdAt: new Date().toISOString() });
  }
  await saveWithRetry('user:' + username, u, true);
  showToast(currentlySuspended ? 'Compte réactivé ✓' : ('Compte suspendu' + (durationDays ? ' pour ' + durationDays + ' jour(s)' : ' (indéfiniment)') + ' ✓'));
  await logAdminAction(currentlySuspended ? 'Compte réactivé' : 'Compte suspendu', '@' + username + (reason ? ' — ' + reason.trim() : '') + (durationDays ? ' (' + durationDays + ' jours)' : ''));
  await createNotification(username, currentlySuspended ? 'account_reactivated' : 'account_suspended', 'Suktum', null, reason || null);
  if(document.getElementById('admin-reports-list')) await loadAdminReportsList();
  if(document.getElementById('user-detail-status') && currentUserDetailTarget === username) await openUserDetail(username);
}
async function removeEpisodeFromReport(reportId){
  const r = await safeGet('report:' + reportId, true);
  if(!r || !r.targetId) return;
  const [seriesId, episodeIndex] = r.targetId.split('__');
  const s = await safeGet('series:' + seriesId, true);
  if(s && s.episodes[episodeIndex]){
    s.episodes[episodeIndex].title = '[Épisode supprimé]';
    s.episodes[episodeIndex].data = '';
    s.episodes[episodeIndex].removed = true;
    await saveWithRetry('series:' + seriesId, s, true);
    showToast('Épisode supprimé ✓');
  } else {
    showToast('Cet épisode n’existe déjà plus');
  }
  await resolveReport(reportId, 'approved');
}
async function resolveReport(reportId, decision){
  const r = await safeGet('report:' + reportId, true);
  if(!r) return;
  r.status = decision;
  await saveWithRetry('report:' + reportId, r, true);
  if(decision === 'approved' && r.type === 'post'){
    await window.storage.delete('post:' + r.targetId, true).catch(() => {});
    showToast('Contenu supprimé ✓');
  } else if(decision === 'approved' && r.type === 'product'){
    await window.storage.delete('product:' + r.targetId, true).catch(() => {});
    if(r.targetUser){
      const seller = await safeGet('user:' + r.targetUser, true);
      if(seller && seller.status !== 'banned'){
        seller.status = 'suspended';
        seller.suspendedUntil = null;
        if(!seller.suspensionHistory) seller.suspensionHistory = [];
        seller.suspensionHistory.push({ action: 'suspended', by: 'Suktum (signalement marketplace confirmé)', reason: 'Annonce frauduleuse confirmée : ' + r.reason, durationDays: null, createdAt: new Date().toISOString() });
        await saveWithRetry('user:' + r.targetUser, seller, true);
        const theirLives = (await fetchLives()).filter(l => l.username === r.targetUser && (l.status === 'approved' || l.status === 'pending' || l.status === 'scheduled'));
        for(const l of theirLives){ await window.storage.delete('live:' + l.id, true).catch(() => {}); }
        await createNotification(r.targetUser, 'account_suspended', 'Suktum', null, 'Annonce frauduleuse confirmée');
      }
    }
    showToast('Annonce supprimée et vendeur suspendu ✓');
  } else if(decision === 'approved'){
    showToast('Signalement traité ✓');
  } else {
    showToast('Signalement rejeté');
  }
  await logAdminAction('Signalement ' + (decision === 'approved' ? 'validé' : 'rejeté'), '@' + r.targetUser);
  await loadAdminReportsList();
  await loadAdminDashboard();
}

/* ---------- UTILISATEURS ---------- */
async function renderInactiveUsersList(){
  const el = document.getElementById('inactive-users-list');
  if(!el) return;
  const users = await fetchUsers();
  const fourteenDaysAgo = Date.now() - 14*24*60*60*1000;
  const inactive = users.filter(u => {
    if(!u.lastLoginDate) return false;
    return new Date(u.lastLoginDate + 'T00:00:00').getTime() < fourteenDaysAgo;
  });
  inactive.sort((a,b) => new Date(a.lastLoginDate) - new Date(b.lastLoginDate));
  if(inactive.length === 0){ el.innerHTML = '<div class="empty">Aucun utilisateur inactif depuis 14 jours ou plus pour l’instant.</div>'; return; }
  el.innerHTML = inactive.map(u => {
    const daysSince = Math.floor((Date.now() - new Date(u.lastLoginDate + 'T00:00:00').getTime()) / (24*60*60*1000));
    const whatsappUrl = u.phone ? 'https://wa.me/' + u.phone.replace(/[^0-9]/g,'') : null;
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">@'+escapeHtml(u.username)+' — <span style="color:var(--gold);">'+daysSince+' jours d’inactivité</span></p>' +
      (whatsappUrl ? '<a href="'+whatsappUrl+'" target="_blank" class="btn btn-outline btn-sm" style="width:100%;">💬 Contacter sur WhatsApp</a>' : '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.4);">Aucun numéro de téléphone enregistré</p>') +
      '</div>';
  }).join('');
}
async function fetchUsers(){
  const keys = await safeList('user:', true);
  const users = [];
  for(const k of keys){ const u = await safeGet(k, true); if(u) users.push(u); }
  return users;
}
async function loadAdminUsersList(){
  const el = document.getElementById('admin-users-list');
  const query = (document.getElementById('admin-user-search').value || '').toLowerCase();
  const allUsers = await fetchUsers();
  const scoped = adminScope === 'all' ? allUsers : allUsers.filter(u => u.country === adminScope);
  const filtered = scoped.filter(u => !query || u.username.toLowerCase().includes(query));
  if(filtered.length === 0){ el.innerHTML = '<div class="empty">Aucun utilisateur trouvé.</div>'; return; }
  el.innerHTML = filtered.map(u => {
    const statusLabel = u.status === 'banned' ? '🚫 Banni' : u.status === 'suspended' ? '⏸ Suspendu' : '🟢 Actif';
    return '<div class="card" style="cursor:pointer;" onclick="openUserDetail(\''+u.username+'\')">' +
      '<strong style="font-size:13.5px;">@'+escapeHtml(u.username)+'</strong>' +
      '<p style="font-size:12px; color:rgba(245,239,227,0.55); margin:4px 0 0;">'+statusLabel+(u.country ? ' · '+escapeHtml(u.country) : '')+'</p></div>';
  }).join('');
}
let currentUserDetailTarget = null;
/* ---------- COIN INSTITUTIONNEL & DER ---------- */
/* ---------- SÉRIES PAYANTES (CRÉATION RÉSERVÉE À L'ADMINISTRATION) ---------- */
async function createPaidSeries(){
  const title = document.getElementById('new-series-title').value.trim();
  const description = document.getElementById('new-series-desc').value.trim();
  const priceRaw = document.getElementById('new-series-price').value.trim();
  const price = priceRaw ? parseInt(priceRaw, 10) : null;
  const freeEpisodeCount = parseInt(document.getElementById('new-series-free-count').value, 10) || 0;
  const genre = document.getElementById('new-series-genre').value;
  const coverFile = document.getElementById('new-series-cover').files[0];
  if(!title){ showToast('Renseignez au moins le titre'); return; }
  if(priceRaw && (isNaN(price) || price <= 0)){ showToast('Le prix d’accès complet doit être un nombre valide'); return; }
  let cover = null;
  if(coverFile){ cover = await compressImageDataUrl(await readFileAsDataURL(coverFile), 800, 0.8); }
  const id = 'series_' + Date.now();
  await saveWithRetry('series:' + id, {
    id, title, description, price, freeEpisodeCount, genre, cover, episodes: [], createdBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-series-title').value = '';
  document.getElementById('new-series-desc').value = '';
  document.getElementById('new-series-price').value = '';
  document.getElementById('new-series-cover').value = '';
  showToast('Série créée ✓ — ajoutez maintenant ses épisodes');
  await logAdminAction('Série payante créée', title);
  await renderAdminSeriesList();
}
async function renderCoinRevenueDashboard(){
  const el = document.getElementById('coin-revenue-summary');
  if(!el) return;
  const keys = await safeList('coinpurchase:', true);
  const purchases = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) purchases.push(p); }
  const totalCoinsIssued = purchases.reduce((s,p) => s + p.coins, 0);
  const totalRevenueFcfa = purchases.reduce((s,p) => s + p.priceFcfa, 0);
  purchases.sort((a,b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
  const adjustmentKeys = await safeList('coinadjustment:', true);
  const adjustments = [];
  for(const k of adjustmentKeys){ const a = await safeGet(k, true); if(a) adjustments.push(a); }
  adjustments.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 6px; font-size:13px;">🪙 Total pièces vendues : <strong>'+totalCoinsIssued.toLocaleString('fr-FR')+'</strong></p>' +
    '<p style="margin:0; font-size:13px;">💰 Revenu total : <strong>'+totalRevenueFcfa.toLocaleString('fr-FR')+' FCFA</strong></p>' +
    '</div>' +
    '<div class="eyebrow" style="margin-top:0;">Achats récents</div>' +
    (purchases.length === 0 ? '<div class="empty">Aucun achat pour l’instant.</div>' :
      purchases.slice(0,30).map(p => '<div class="card" style="margin-bottom:6px;"><p style="margin:0; font-size:12.5px;">@'+escapeHtml(p.username)+' — '+p.coins+' pièces — '+p.priceFcfa.toLocaleString('fr-FR')+' FCFA · '+new Date(p.purchasedAt).toLocaleDateString('fr-FR')+'</p></div>').join('')) +
    '<div class="eyebrow">⚖️ Ajustements manuels (hors revenus réels)</div>' +
    (adjustments.length === 0 ? '<div class="empty">Aucun ajustement pour l’instant.</div>' :
      adjustments.slice(0,30).map(a => '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 3px; font-size:12.5px;">@'+escapeHtml(a.username)+' — '+(a.amount > 0 ? '+' : '')+a.amount+' pièces · '+new Date(a.createdAt).toLocaleDateString('fr-FR')+'</p><p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">« '+escapeHtml(a.reason)+' » — par @'+escapeHtml(a.adjustedBy)+'</p></div>').join(''));
}
async function saveDailyCoinReward(){
  const value = parseInt(document.getElementById('daily-coin-reward-input').value, 10) || 0;
  await saveWithRetry('settings:dailycoinreward', value, true);
  showToast('Réglage enregistré ✓');
}
async function saveAdCoinReward(){
  const value = parseInt(document.getElementById('ad-coin-reward-input').value, 10) || 0;
  await saveWithRetry('settings:adcoinreward', value, true);
  showToast('Réglage enregistré ✓');
}
async function saveAdCoinDailyLimit(){
  const value = parseInt(document.getElementById('ad-coin-daily-limit-input').value, 10) || 1;
  await saveWithRetry('settings:adcoindailylimit', value, true);
  showToast('Réglage enregistré ✓');
}
async function loadCoinRewardSettings(){
  document.getElementById('daily-coin-reward-input').value = (await safeGet('settings:dailycoinreward', true)) || '';
  document.getElementById('ad-coin-reward-input').value = (await safeGet('settings:adcoinreward', true)) || '';
  document.getElementById('ad-coin-daily-limit-input').value = (await safeGet('settings:adcoindailylimit', true)) || '';
}
async function fetchCoinPacks(){
  return (await safeGet('settings:coinpacks', true)) || [];
}
async function addCoinPack(){
  const coins = parseInt(document.getElementById('new-coin-pack-coins').value, 10);
  const priceFcfa = parseInt(document.getElementById('new-coin-pack-price').value, 10);
  if(isNaN(coins) || coins <= 0 || isNaN(priceFcfa) || priceFcfa <= 0){ showToast('Renseignez un nombre de pièces et un prix valides'); return; }
  const packs = await fetchCoinPacks();
  packs.push({ id: 'pack_' + Date.now(), coins, priceFcfa });
  packs.sort((a,b) => a.coins - b.coins);
  await saveWithRetry('settings:coinpacks', packs, true);
  document.getElementById('new-coin-pack-coins').value = '';
  document.getElementById('new-coin-pack-price').value = '';
  showToast('Pack ajouté ✓');
  await logAdminAction('Pack de pièces ajouté', coins + ' pièces — ' + priceFcfa + ' FCFA');
  await renderAdminCoinPacksList();
}
async function removeCoinPack(packId){
  const packs = (await fetchCoinPacks()).filter(p => p.id !== packId);
  await saveWithRetry('settings:coinpacks', packs, true);
  showToast('Pack retiré');
  await renderAdminCoinPacksList();
}
async function renderAdminCoinPacksList(){
  const el = document.getElementById('admin-coin-packs-list');
  if(!el) return;
  const packs = await fetchCoinPacks();
  el.innerHTML = packs.length === 0 ? '<p style="font-size:11.5px; color:rgba(245,239,227,0.4); margin:0;">Aucun pack pour l’instant.</p>' :
    packs.map(p => '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;"><span style="font-size:13px; flex:1;">🪙 '+p.coins+' pièces — '+p.priceFcfa.toLocaleString('fr-FR')+' FCFA</span><span onclick="removeCoinPack(\''+p.id+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>').join('');
}
async function fetchAllSeries(){
  const keys = await safeList('series:', true);
  const list = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) list.push(s); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function renderAdminSeriesList(){
  const el = document.getElementById('admin-series-list');
  if(!el) return;
  const series = await fetchAllSeries();
  el.innerHTML = series.length === 0 ? '<div class="empty">Aucune série pour l’instant.</div>' : series.map(s =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
    (s.cover ? '<img src="'+s.cover+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-size:13px;">'+escapeHtml(s.title)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">'+(s.price ? s.price.toLocaleString('fr-FR') + ' FCFA' : 'Paiement à l’épisode uniquement')+' · '+s.episodes.length+' épisode(s)</p></div>' +
    '<button class="btn btn-outline btn-sm" onclick="openSeriesEpisodeManager(\''+s.id+'\')">🎬</button>' +
    (s.episodes.length > 0 ? '<button class="btn btn-outline btn-sm" onclick="publishSeriesTeaser(\''+s.id+'\')">📣</button>' : '') +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="deletePaidSeries(\''+s.id+'\')">✕</button>' +
    '</div>'
  ).join('');
}
async function publishSeriesTeaser(seriesId){
  const s = await safeGet('series:' + seriesId, true);
  if(!s || s.episodes.length === 0){ showToast('Ajoutez au moins un épisode avant de publier un teaser'); return; }
  if(!confirm('Publier l’épisode 1 de « '+s.title+' » comme publicité dans le fil principal ?')) return;
  const firstEpisode = s.episodes[0];
  const id = 'post_' + Date.now();
  await saveWithRetry('post:' + id, {
    id, userId: currentUser, type: 'video', data: firstEpisode.data,
    caption: '🎬 ' + s.title + ' — ' + (s.description || '').slice(0,100),
    linkedSeriesId: seriesId, sensitive: !!firstEpisode.sensitive,
    country: currentUserCountry, city: currentUserCity, likes: [], dislikes: [], comments: [], favoritedBy: [], views: 0,
    status: 'published', scheduledFor: null, soundId: firstEpisode.soundId || null, createdAt: new Date().toISOString()
  }, true);
  showToast('Teaser publié dans le fil ✓');
  await logAdminAction('Teaser de série publié', s.title);
}
async function deletePaidSeries(seriesId){
  const s = await safeGet('series:' + seriesId, true);
  await window.storage.delete('series:' + seriesId, true).catch(() => {});
  const postKeys = await safeList('post:', true);
  for(const k of postKeys){
    const p = await safeGet(k, true);
    if(p && p.linkedSeriesId === seriesId) await window.storage.delete(k, true).catch(() => {});
  }
  const subscriberKeys = await safeList('seriessubscriber:' + seriesId + '__', true);
  for(const k of subscriberKeys){ await window.storage.delete(k, true).catch(() => {}); }
  const purchaseKeys = await safeList('seriespurchase:' + seriesId + '__', true);
  for(const k of purchaseKeys){ await window.storage.delete(k, true).catch(() => {}); }
  const ratingKeys = await safeList('seriesrating:' + seriesId + '__', true);
  for(const k of ratingKeys){ await window.storage.delete(k, true).catch(() => {}); }
  if(s){
    for(let i = 0; i < s.episodes.length; i++){
      await window.storage.delete('episodereleasenotified:' + seriesId + '__' + i, true).catch(() => {});
    }
  }
  showToast('Série supprimée');
  await logAdminAction('Série payante supprimée', seriesId);
  await renderAdminSeriesList();
}
let currentSeriesManagerId = null;
async function openSeriesEpisodeManager(seriesId){
  currentSeriesManagerId = seriesId;
  const s = await safeGet('series:' + seriesId, true);
  if(!s) return;
  go('series-episode-manager');
  document.getElementById('series-manager-title').textContent = '🎬 ' + s.title;
  const products = await fetchProducts();
  const productSelect = document.getElementById('new-episode-product-select');
  productSelect.innerHTML = '<option value="">Aucun produit</option>' + products.map(p => '<option value="'+p.id+'">'+escapeHtml(p.name)+' — '+p.price.toLocaleString('fr-FR')+' FCFA</option>').join('');
  const sounds = await fetchSounds();
  const soundSelect = document.getElementById('new-episode-sound-select');
  soundSelect.innerHTML = '<option value="">Aucun son</option>' + sounds.map(s => '<option value="'+s.id+'">'+escapeHtml(s.name)+'</option>').join('');
  await renderSeriesEpisodesAdminList();
}
async function addSeriesEpisode(){
  const title = document.getElementById('new-episode-title').value.trim();
  const file = document.getElementById('new-episode-video').files[0];
  const coinPriceRaw = document.getElementById('new-episode-coin-price').value.trim();
  const coinPrice = coinPriceRaw ? parseInt(coinPriceRaw, 10) : 0;
  const taggedProductId = document.getElementById('new-episode-product-select').value || null;
  const soundId = document.getElementById('new-episode-sound-select').value || null;
  const releaseDateRaw = document.getElementById('new-episode-release-date').value;
  const releaseAt = releaseDateRaw ? new Date(releaseDateRaw + 'T00:00:00').toISOString() : null;
  const sensitive = document.getElementById('new-episode-sensitive').checked;
  if(!title || !file){ showToast('Renseignez un titre et une vidéo'); return; }
  showToast('Ajout en cours...');
  let data = await readFileAsDataURL(file);
  if(soundId){
    const sound = await safeGet('sound:' + soundId, true).catch(() => null);
    if(sound){
      try{
        showToast('Mixage du son en cours...');
        const ffmpeg = await getFFmpegInstance();
        ffmpeg.FS('writeFile', 'episodeinput.mp4', dataURLtoUint8Array(data));
        ffmpeg.FS('writeFile', 'episodesound.mp3', Uint8Array.from(atob(sound.audioData.split(',')[1]), c => c.charCodeAt(0)));
        await ffmpeg.run(
          '-i', 'episodeinput.mp4', '-i', 'episodesound.mp3',
          '-filter_complex', '[0:a]volume=1[voriginal];[1:a]volume=0.5[vsound];[voriginal][vsound]amix=inputs=2:duration=first:dropout_transition=0[aout]',
          '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-preset', 'ultrafast', 'episodeoutput.mp4'
        );
        const mixedData = ffmpeg.FS('readFile', 'episodeoutput.mp4');
        const base64 = btoa(String.fromCharCode(...mixedData));
        data = 'data:video/mp4;base64,' + base64;
        sound.usageCount = (sound.usageCount || 0) + 1;
        await saveWithRetry('sound:' + soundId, sound, true);
      }catch(e){ showToast('Le mixage du son a échoué — épisode ajouté sans son'); }
    }
  }
  const s = await safeGet('series:' + currentSeriesManagerId, true);
  if(!s) return;
  s.episodes.push({ id: 'ep_' + Date.now(), title, data, coinPrice, taggedProductId, soundId, releaseAt, sensitive });
  await saveWithRetry('series:' + currentSeriesManagerId, s, true);
  document.getElementById('new-episode-sensitive').checked = false;
  document.getElementById('new-episode-title').value = '';
  document.getElementById('new-episode-video').value = '';
  document.getElementById('new-episode-coin-price').value = '';
  document.getElementById('new-episode-release-date').value = '';
  document.getElementById('new-episode-sound-select').value = '';
  showToast('Épisode ajouté ✓');
  await renderSeriesEpisodesAdminList();
}
async function removeSeriesEpisode(episodeId){
  const s = await safeGet('series:' + currentSeriesManagerId, true);
  if(!s) return;
  s.episodes = s.episodes.filter(e => e.id !== episodeId);
  await saveWithRetry('series:' + currentSeriesManagerId, s, true);
  showToast('Épisode retiré');
  await renderSeriesEpisodesAdminList();
}
async function renderSeriesEpisodesAdminList(){
  const el = document.getElementById('series-episodes-admin-list');
  const s = await safeGet('series:' + currentSeriesManagerId, true);
  if(!s || !el) return;
  el.innerHTML = s.episodes.length === 0 ? '<div class="empty">Aucun épisode pour l’instant.</div>' : s.episodes.map((e,i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px;"><span style="font-size:13px; flex:1;">'+(i+1)+'. '+escapeHtml(e.title)+'</span>' +
    '<span onclick="removeSeriesEpisode(\''+e.id+'\')" style="color:var(--coral); cursor:pointer; padding:4px;">🗑️</span></div>'
  ).join('');
}
/* ---------- SÉRIES — CÔTÉ UTILISATEUR (ACHAT + LECTURE VERROUILLÉE) ---------- */
async function hasUserPurchasedSeries(seriesId, username){
  const purchase = await safeGet('seriespurchase:' + seriesId + '__' + username, true);
  return !!purchase;
}
async function renderSeriesWeeklyRanking(){
  const el = document.getElementById('series-weekly-ranking');
  if(!el) return;
  const series = (await fetchAllSeries()).filter(s => s.episodes.length > 0);
  if(series.length === 0){ el.innerHTML = ''; return; }
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
  const scored = [];
  for(const s of series){
    const purchaseKeys = await safeList('seriespurchase:' + s.id + '__', true);
    let recentPurchases = 0;
    for(const k of purchaseKeys){ const p = await safeGet(k, true).catch(() => null); if(p && new Date(p.purchasedAt) >= weekAgo) recentPurchases++; }
    const subKeys = await safeList('seriessubscriber:' + s.id + '__', true);
    let recentSubs = 0;
    for(const k of subKeys){ const sub = await safeGet(k, true).catch(() => null); if(sub && new Date(sub.subscribedAt) >= weekAgo) recentSubs++; }
    const score = recentPurchases * 3 + recentSubs;
    if(score > 0) scored.push({ series: s, score });
  }
  if(scored.length === 0){ el.innerHTML = ''; return; }
  scored.sort((a,b) => b.score - a.score);
  const top = scored.slice(0,5);
  el.innerHTML = '<div class="eyebrow" style="margin-top:0;">🏆 Top de la semaine</div>' +
    top.map((t,i) => '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:8px;" onclick="openSeriesDetail(\''+t.series.id+'\')">' +
      '<span style="font-size:16px; font-weight:700; color:var(--gold); width:22px;">'+(i+1)+'</span>' +
      (t.series.cover ? '<img src="'+t.series.cover+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">' : '') +
      '<strong style="font-size:13px; flex:1;">'+escapeHtml(t.series.title)+'</strong>' +
      '</div>').join('') +
    '<div class="eyebrow">📚 Toutes les séries</div>';
}
let currentSeriesGenreFilter = 'all';
function filterSeriesByGenre(genre){
  currentSeriesGenreFilter = genre;
  renderPublicSeriesList();
}
async function renderPublicSeriesList(){
  const el = document.getElementById('public-series-list');
  if(!el) return;
  const allSeries = (await fetchAllSeries()).filter(s => s.episodes.length > 0);
  if(allSeries.length === 0){ el.innerHTML = '<div class="empty">Aucune série disponible pour l’instant.</div>'; return; }
  const realGenresPresent = [...new Set(allSeries.map(s => s.genre).filter(g => g))];
  const filterBar = realGenresPresent.length > 0 ? '<div style="display:flex; gap:6px; overflow-x:auto; margin-bottom:12px; padding-bottom:4px;">' +
    '<button onclick="filterSeriesByGenre(\'all\')" style="flex-shrink:0; border:none; border-radius:16px; padding:6px 12px; font-size:12px; background:'+(currentSeriesGenreFilter==='all'?'var(--coral)':'rgba(245,239,227,0.1)')+'; color:'+(currentSeriesGenreFilter==='all'?'var(--night)':'var(--cream)')+';">Tous</button>' +
    realGenresPresent.map(g => '<button onclick="filterSeriesByGenre(\''+g+'\')" style="flex-shrink:0; border:none; border-radius:16px; padding:6px 12px; font-size:12px; background:'+(currentSeriesGenreFilter===g?'var(--coral)':'rgba(245,239,227,0.1)')+'; color:'+(currentSeriesGenreFilter===g?'var(--night)':'var(--cream)')+';">'+escapeHtml(g)+'</button>').join('') +
    '</div>' : '';
  const series = (currentSeriesGenreFilter === 'all' ? allSeries : allSeries.filter(s => s.genre === currentSeriesGenreFilter))
    .filter(s => s.title.toLowerCase().includes((document.getElementById('series-search-input') ? document.getElementById('series-search-input').value : '').toLowerCase().trim()));
  if(series.length === 0){ el.innerHTML = filterBar + '<div class="empty">Aucune série ne correspond à votre recherche.</div>'; return; }
  el.innerHTML = filterBar + await Promise.all(series.map(async s => {
    const owned = currentUser ? await hasUserPurchasedSeries(s.id, currentUser) : false;
    return '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openSeriesDetail(\''+s.id+'\')">' +
      (s.cover ? '<img src="'+s.cover+'" style="width:52px; height:52px; border-radius:8px; object-fit:cover;">' : '') +
      '<div style="flex:1;"><strong style="font-size:13.5px;">'+escapeHtml(s.title)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+s.episodes.length+' épisode(s)</p></div>' +
      (owned ? '<span style="font-size:11px; color:var(--lagoon);">✓ Achetée</span>' : (s.price ? '<span style="font-size:13px; color:var(--gold); font-weight:600;">'+s.price.toLocaleString('fr-FR')+' FCFA</span>' : '<span style="font-size:11px; color:var(--gold);">🪙 À l’épisode</span>')) +
      '</div>';
  })).then(arr => arr.join(''));
}
let currentSeriesDetailId = null;
async function isEpisodeUnlocked(seriesId, index, freeEpisodeCount, ownsWholeSeries, episode){
  if(episode && episode.releaseAt && new Date(episode.releaseAt) > new Date()) return false;
  if(ownsWholeSeries) return true;
  if(index < freeEpisodeCount) return true;
  const unlock = await safeGet('episodeunlock:' + seriesId + '__' + index + '__' + currentUser, false).catch(() => null);
  return !!unlock;
}
async function toggleSeriesSubscription(seriesId){
  const key = 'seriessubscriber:' + seriesId + '__' + currentUser;
  const existing = await safeGet(key, true).catch(() => null);
  if(existing){
    await window.storage.delete(key, true).catch(() => {});
    showToast('Vous ne serez plus notifié(e)');
  } else {
    await saveWithRetry(key, { seriesId, username: currentUser, subscribedAt: new Date().toISOString() }, true);
    showToast('Vous serez notifié(e) des nouveaux épisodes ✓');
  }
  await openSeriesDetail(seriesId);
}
async function checkNewlyReleasedEpisodes(){
  const seriesList = await fetchAllSeries();
  const now = new Date();
  for(const s of seriesList){
    for(let i = 0; i < s.episodes.length; i++){
      const e = s.episodes[i];
      if(!e.releaseAt || new Date(e.releaseAt) > now) continue;
      const notifiedFlag = await safeGet('episodereleasenotified:' + s.id + '__' + i, true).catch(() => null);
      if(notifiedFlag) continue;
      await saveWithRetry('episodereleasenotified:' + s.id + '__' + i, true, true);
      const subscriberKeys = await safeList('seriessubscriber:' + s.id + '__', true);
      for(const subKey of subscriberKeys){
        const sub = await safeGet(subKey, true).catch(() => null);
        if(sub) await createNotification(sub.username, 'series_episode_released', 'Suktum', null, s.title + ' — Épisode ' + (i+1));
      }
    }
  }
}
async function openSeriesDetail(seriesId){
  if(!requireAccount('Créez un compte pour accéder aux séries')) return;
  currentSeriesDetailId = seriesId;
  const s = await safeGet('series:' + seriesId, true);
  if(!s){ showToast('Cette série n’est plus disponible'); return; }
  go('series-detail');
  document.getElementById('series-detail-title').textContent = s.title;
  const owned = await hasUserPurchasedSeries(seriesId, currentUser);
  const el = document.getElementById('series-detail-content');
  const freeEpisodeCount = s.freeEpisodeCount || 0;
  const progress = (await safeGet('seriesprogress:' + seriesId + '__' + currentUser, false)) || { lastEpisodeIndex: -1 };
  const products = await fetchProducts();
  const productById = {};
  products.forEach(p => { productById[p.id] = p; });
  const restrictedMode = await isRestrictedModeActive(currentUser);
  const instructions = await getPaymentInstructions(currentUserCountry);
  let html = (s.cover ? '<img src="'+s.cover+'" style="width:100%; border-radius:12px; margin-bottom:12px;">' : '') +
    '<p style="font-size:13px; margin:0 0 10px;">'+escapeHtml(s.description||'')+'</p>';
  const ratings = await fetchSeriesRatings(seriesId);
  const myRating = ratings.find(r => r.username === currentUser);
  if(ratings.length > 0){
    const avg = (ratings.reduce((sum,r) => sum + r.stars, 0) / ratings.length).toFixed(1);
    html += '<p style="font-size:13px; margin:0 0 10px;">⭐ '+avg+'/5 ('+ratings.length+' avis)</p>';
  }
  if(!myRating){
    html += '<div style="display:flex; gap:4px; margin-bottom:14px;">' +
      [1,2,3,4,5].map(n => '<span onclick="rateSeries(\''+seriesId+'\', '+n+')" style="font-size:22px; cursor:pointer;">☆</span>').join('') +
      '</div>';
  }
  const ratingsWithComments = ratings.filter(r => r.comment);
  if(ratingsWithComments.length > 0){
    html += ratingsWithComments.slice(0,5).map(r => '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 3px; font-size:12.5px;">@'+escapeHtml(r.username)+' — '+'⭐'.repeat(r.stars)+'</p><p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(r.comment)+'</p></div>').join('');
  }
  const isSubscribed = await safeGet('seriessubscriber:' + seriesId + '__' + currentUser, true).catch(() => null);
  html += '<button class="btn '+(isSubscribed ? 'btn-outline' : 'btn-primary')+' btn-sm" style="width:100%; margin-bottom:14px;" onclick="toggleSeriesSubscription(\''+seriesId+'\')">'+(isSubscribed ? '🔔 Vous serez notifié(e) des nouveaux épisodes' : '🔕 Me notifier des nouveaux épisodes')+'</button>';
  if(!owned && s.price){
    html += '<button class="btn btn-primary" style="width:100%; margin-bottom:14px;" onclick="purchaseSeries()">🔓 Débloquer toute la série — '+s.price.toLocaleString('fr-FR')+' FCFA</button>';
  }
  if(progress.lastEpisodeIndex >= 0){
    const nextEpisodeIndex = progress.lastEpisodeIndex + 1 < s.episodes.length ? progress.lastEpisodeIndex + 1 : 0;
    const nextEpisodeIsFuture = s.episodes[nextEpisodeIndex].releaseAt && new Date(s.episodes[nextEpisodeIndex].releaseAt) > new Date();
    const nextEpisodeIsBlockedByFamily = s.episodes[nextEpisodeIndex].sensitive && restrictedMode;
    if(progress.lastEpisodeIndex + 1 < s.episodes.length && nextEpisodeIsFuture){
      html += '<p style="text-align:center; font-size:12.5px; color:var(--gold); margin:0 0 14px;">📅 Prochain épisode disponible le '+new Date(s.episodes[nextEpisodeIndex].releaseAt).toLocaleDateString('fr-FR')+'</p>';
    } else if(progress.lastEpisodeIndex + 1 < s.episodes.length && nextEpisodeIsBlockedByFamily){
      html += '<p style="text-align:center; font-size:12.5px; color:var(--gold); margin:0 0 14px;">🔒 Prochain épisode masqué en Mode Familial</p>';
    } else {
      html += '<button class="btn btn-outline btn-sm" style="width:100%; margin-bottom:14px;" onclick="playSeriesEpisode('+nextEpisodeIndex+')">▶️ '+(progress.lastEpisodeIndex + 1 < s.episodes.length ? 'Reprendre — Épisode ' + (nextEpisodeIndex+1) : 'Revoir depuis le début')+'</button>';
    }
  }
  for(let i = 0; i < s.episodes.length; i++){
    const e = s.episodes[i];
    if(e.removed){
      html += '<div class="card" style="margin-bottom:10px;"><p style="margin:0; font-size:13px; color:rgba(245,239,227,0.5);">'+(i+1)+'. '+escapeHtml(e.title)+'</p></div>';
      continue;
    }
    const unlocked = await isEpisodeUnlocked(seriesId, i, freeEpisodeCount, owned, e);
    const isFutureRelease = e.releaseAt && new Date(e.releaseAt) > new Date();
    const product = e.taggedProductId ? productById[e.taggedProductId] : null;
    html += '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 8px; font-size:13px;">'+(i+1)+'. '+escapeHtml(e.title)+(i < freeEpisodeCount ? ' <span style="color:var(--gold); font-size:11px;">🎁 Gratuit</span>' : '')+(progress.lastEpisodeIndex >= i ? ' <span style="color:var(--lagoon); font-size:11px;">✓ vu</span>' : '')+'</p>';
    if(unlocked){
      const episodeRevealKey = seriesId + '__' + i;
      if(e.sensitive && restrictedMode){
        html += '<div style="position:relative; width:100%; aspect-ratio:9/16; max-height:400px; border-radius:10px; overflow:hidden; background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:0 30px; text-align:center;">' +
          '<span style="font-size:36px;">🔒</span>' +
          '<p style="margin:0; font-size:13.5px; color:var(--cream);">Cet épisode est masqué en Mode Familial.</p>' +
          '</div>';
      } else if(e.sensitive && !sensitiveEpisodeRevealedThisSession.has(episodeRevealKey)){
        html += '<div style="position:relative; width:100%; aspect-ratio:9/16; max-height:400px; border-radius:10px; overflow:hidden; background:#000;">' +
          '<div style="width:100%; height:100%; filter:blur(35px); transform:scale(1.1); display:flex; align-items:center; justify-content:center; font-size:60px;">🎬</div>' +
          '<div style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:0 30px; text-align:center; background:rgba(11,46,61,0.55);">' +
          '<span style="font-size:36px;">⚠️</span>' +
          '<p style="margin:0; font-size:13.5px; color:var(--cream);">Cet épisode a été marqué comme sensible.</p>' +
          '<button onclick="revealSensitiveEpisode(\''+episodeRevealKey+'\', \''+seriesId+'\')" class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);">Voir quand même</button>' +
          '</div></div>';
      } else {
        html += '<video id="series-episode-video-'+i+'" src="'+e.data+'" controls style="width:100%; border-radius:10px;" onended="advanceSeriesEpisode(\''+seriesId+'\', '+i+')" ontimeupdate="markSeriesEpisodeStarted(\''+seriesId+'\', '+i+')"></video>';
      }
      if(product) html += '<button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="openOrderScreen(\''+product.id+'\')">🛍️ '+escapeHtml(product.name)+' — '+product.price.toLocaleString('fr-FR')+' FCFA</button>';
      if(s.createdBy !== currentUser) html += '<span onclick="reportEpisode(\''+seriesId+'\', '+i+')" style="display:block; margin-top:6px; font-size:11px; color:rgba(245,239,227,0.4); cursor:pointer;">⚠️ Signaler cet épisode</span>';
    } else if(isFutureRelease){
      html += '<p style="margin:0 0 8px; font-size:12px; color:var(--gold);">📅 Disponible le '+new Date(e.releaseAt).toLocaleDateString('fr-FR')+'</p>';
    } else {
      html += '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.5);">🔒 Verrouillé'+(e.coinPrice ? ' — '+e.coinPrice+' pièces pour débloquer' : '')+'</p>';
      if(e.coinPrice) html += '<button class="btn btn-primary btn-sm" style="width:100%;" onclick="unlockEpisodeWithCoins(\''+seriesId+'\', '+i+', '+e.coinPrice+')">🪙 Débloquer avec des pièces</button>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
  const walletBalance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
  el.insertAdjacentHTML('afterbegin', '<p style="font-size:12px; color:var(--gold); margin:0 0 10px;">🪙 Solde : '+walletBalance+' pièces — <span onclick="go(\'coin-wallet\')" style="text-decoration:underline; cursor:pointer;">Acheter des pièces</span></p>');
}
async function markSeriesEpisodeStarted(seriesId, episodeIndex){
  const key = 'seriesprogress:' + seriesId + '__' + currentUser;
  const progress = (await safeGet(key, false)) || { lastEpisodeIndex: -1 };
  if(progress.lastEpisodeIndex >= episodeIndex) return;
  progress.lastEpisodeIndex = episodeIndex;
  progress.updatedAt = new Date().toISOString();
  await saveWithRetry(key, progress, false);
}
async function advanceSeriesEpisode(seriesId, finishedEpisodeIndex){
  await markSeriesEpisodeStarted(seriesId, finishedEpisodeIndex);
  const s = await safeGet('series:' + seriesId, true);
  if(!s || finishedEpisodeIndex + 1 >= s.episodes.length) return;
  const nextVideo = document.getElementById('series-episode-video-' + (finishedEpisodeIndex + 1));
  if(nextVideo){
    nextVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nextVideo.play().catch(() => {});
  }
}
function playSeriesEpisode(episodeIndex){
  const video = document.getElementById('series-episode-video-' + episodeIndex);
  if(video){ video.scrollIntoView({ behavior: 'smooth', block: 'center' }); video.play().catch(() => {}); }
}
async function purchaseSeries(){
  const s = await safeGet('series:' + currentSeriesDetailId, true);
  if(!s) return;
  await saveWithRetry('seriespurchase:' + currentSeriesDetailId + '__' + currentUser, {
    seriesId: currentSeriesDetailId, username: currentUser, price: s.price, purchasedAt: new Date().toISOString()
  }, true);
  showToast('Achat enregistré ✓ — accès débloqué');
  await openSeriesDetail(currentSeriesDetailId);
}
async function purchaseCoinPack(packId){
  const packs = await fetchCoinPacks();
  const pack = packs.find(p => p.id === packId);
  if(!pack) return;
  const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
  await saveWithRetry('coinbalance:' + currentUser, balance + pack.coins, false);
  await saveWithRetry('coinpurchase:' + currentUser + '__' + Date.now(), { username: currentUser, coins: pack.coins, priceFcfa: pack.priceFcfa, purchasedAt: new Date().toISOString() }, true);
  showToast(pack.coins + ' pièces ajoutées à votre solde ✓');
  await renderCoinWallet();
}
async function unlockEpisodeWithCoins(seriesId, episodeIndex, coinPrice){
  const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
  if(balance < coinPrice){ showToast('Solde insuffisant — il vous manque ' + (coinPrice - balance) + ' pièces'); go('coin-wallet'); return; }
  await saveWithRetry('coinbalance:' + currentUser, balance - coinPrice, false);
  await saveWithRetry('episodeunlock:' + seriesId + '__' + episodeIndex + '__' + currentUser, { unlockedAt: new Date().toISOString(), coinPrice }, false);
  showToast('Épisode débloqué ✓');
  await openSeriesDetail(seriesId);
}
let rewardedAdTimerInterval = null;
async function startRewardedAd(){
  const dailyLimit = (await safeGet('settings:adcoindailylimit', true)) || 3;
  const adReward = (await safeGet('settings:adcoinreward', true)) || 0;
  if(adReward <= 0){ showToast('Cette fonctionnalité n’est pas encore activée'); return; }
  const todayKey = new Date().toISOString().slice(0,10);
  const watchKey = 'adcoinwatches:' + currentUser + '__' + todayKey;
  const watchCount = (await safeGet(watchKey, false)) || 0;
  if(watchCount >= dailyLimit){ showToast('Vous avez atteint la limite quotidienne de publicités récompensées'); return; }
  const ad = await pickAdForFeed();
  if(!ad){ showToast('Aucune publicité disponible pour l’instant'); return; }
  go('rewarded-ad');
  const contentEl = document.getElementById('rewarded-ad-content');
  const timerEl = document.getElementById('rewarded-ad-timer');
  let durationSeconds = 15;
  if(ad.type === 'video'){
    contentEl.innerHTML = '<video id="rewarded-ad-video" src="'+ad.mediaData+'" autoplay muted style="width:100%; border-radius:12px;"></video><p style="margin:10px 0 0; font-size:13px;">'+escapeHtml(ad.caption||'')+'</p>';
    const video = document.getElementById('rewarded-ad-video');
    await new Promise(resolve => { video.onloadedmetadata = resolve; setTimeout(resolve, 2000); });
    if(video.duration && isFinite(video.duration)) durationSeconds = Math.ceil(video.duration);
  } else {
    contentEl.innerHTML = '<img src="'+ad.mediaData+'" style="width:100%; border-radius:12px;"><p style="margin:10px 0 0; font-size:13px;">'+escapeHtml(ad.caption||'')+'</p>';
  }
  let remaining = durationSeconds;
  timerEl.textContent = 'Récompense dans ' + remaining + 's...';
  if(rewardedAdTimerInterval) clearInterval(rewardedAdTimerInterval);
  rewardedAdTimerInterval = setInterval(async () => {
    remaining--;
    if(remaining <= 0){
      clearInterval(rewardedAdTimerInterval);
      const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
      await saveWithRetry('coinbalance:' + currentUser, balance + adReward, false);
      await saveWithRetry(watchKey, watchCount + 1, false);
      showToast('🪙 +' + adReward + ' pièces gagnées !');
      go('coin-wallet');
      await renderCoinWallet();
    } else {
      timerEl.textContent = 'Récompense dans ' + remaining + 's...';
    }
  }, 1000);
}
async function renderWalletTransactionHistory(){
  const el = document.getElementById('wallet-transaction-history');
  if(!el) return;
  const keys = await safeList('coinpurchase:' + currentUser + '__', true);
  const purchases = [];
  for(const k of keys){ const p = await safeGet(k, true).catch(() => null); if(p) purchases.push({...p, id: k.replace('coinpurchase:', '')}); }
  purchases.sort((a,b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
  if(purchases.length === 0){ el.innerHTML = '<div class="empty">Aucune transaction pour l’instant.</div>'; return; }
  el.innerHTML = purchases.map(p =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:8px;">' +
    '<span onclick="openWalletTransactionKebabMenu(\''+p.id+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<p style="margin:0 0 4px; font-size:13px;">🪙 '+p.coins+' pièces — '+p.priceFcfa.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+new Date(p.purchasedAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
async function openWalletTransactionKebabMenu(transactionId){
  const p = await safeGet('coinpurchase:' + transactionId, true);
  if(!p) return;
  const items = [];
  items.push({ icon: '📄', label: 'Télécharger le reçu', action: 'closeGenericKebabMenu(); downloadWalletTransactionReceipt(\''+transactionId+'\')' });
  items.push({ icon: '🔁', label: 'Répéter cette transaction', action: 'closeGenericKebabMenu(); go(\'coin-wallet\')' });
  items.push({ icon: '💬', label: 'Contacter le support', action: 'closeGenericKebabMenu(); go(\'support\')' });
  items.push({ icon: '⚠️', label: 'Signaler un litige', action: 'closeGenericKebabMenu(); go(\'support\')' });
  openGenericKebabMenu(items);
}
async function downloadWalletTransactionReceipt(transactionId){
  const p = await safeGet('coinpurchase:' + transactionId, true);
  if(!p) return;
  const text = 'Suktum — Reçu\n\n🪙 '+p.coins+' pièces\nMontant : '+p.priceFcfa.toLocaleString('fr-FR')+' FCFA\nDate : '+new Date(p.purchasedAt).toLocaleDateString('fr-FR');
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Reçu copié ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function renderCoinWallet(){
  const el = document.getElementById('coin-wallet-content');
  if(!el) return;
  const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
  const packs = await fetchCoinPacks();
  const instructions = await getPaymentInstructions(currentUserCountry);
  document.getElementById('coin-wallet-balance').textContent = balance + ' pièces';
  el.innerHTML = packs.length === 0 ? '<div class="empty">Aucun pack disponible pour l’instant.</div>' :
    packs.map(p => '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 8px; font-size:13px;">🪙 '+p.coins+' pièces — '+p.priceFcfa.toLocaleString('fr-FR')+' FCFA</p><button class="btn btn-primary btn-sm" style="width:100%;" onclick="purchaseCoinPack(\''+p.id+'\')">Acheter</button></div>').join('') +
    '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:14px 0 0;">'+escapeHtml(instructions)+'</p>';
  await renderWalletTransactionHistory();
}
async function renderInstitutionalCorner(){
  const el = document.getElementById('institutional-corner-list');
  if(!el) return;
  const allUsers = await fetchUsers();
  const featured = allUsers.filter(u => u.institutionalPartnerLabel);
  if(featured.length === 0){ el.innerHTML = '<div class="empty">Aucun vendeur mis en avant pour l’instant.</div>'; return; }
  const allProducts = await fetchProducts();
  el.innerHTML = featured.map(u => {
    const sellerProducts = allProducts.filter(p => p.sellerUsername === u.username).slice(0, 3);
    return '<div class="card" style="margin-bottom:12px;">' +
      '<div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(u.username)+'\')">' + smallAvatarBadge(u.username, 36) +
      '<div><strong style="font-size:13.5px;">@'+escapeHtml(u.username)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">🏛️ '+escapeHtml(u.institutionalPartnerLabel)+'</p></div></div>' +
      (sellerProducts.length > 0 ? '<div class="grid3" style="margin-top:10px;">' + sellerProducts.map(p =>
        '<div class="thumb" style="cursor:pointer;" onclick="go(\'shop\')">' + (p.image ? '<img src="'+p.image+'" loading="lazy">' : '') + '</div>'
      ).join('') + '</div>' : '') +
      '</div>';
  }).join('');
}
/* ---------- CRÉATEUR DU MOIS (un seul actif à la fois) ---------- */
async function toggleCreatorOfTheMonth(){
  if(!currentUserDetailTarget) return;
  const u = await safeGet('user:' + currentUserDetailTarget, true);
  if(!u) return;
  if(u.isCreatorOfTheMonth){
    u.isCreatorOfTheMonth = false;
    await saveWithRetry('user:' + currentUserDetailTarget, u, true);
    showToast('Retiré du créateur du mois');
    await logAdminAction('Retiré du statut Créateur du mois', '@' + currentUserDetailTarget);
  } else {
    const previousHolderUsername = await safeGet('settings:creatorOfTheMonth', true);
    if(previousHolderUsername && previousHolderUsername !== currentUserDetailTarget){
      const previousUser = await safeGet('user:' + previousHolderUsername, true);
      if(previousUser){
        previousUser.isCreatorOfTheMonth = false;
        await saveWithRetry('user:' + previousHolderUsername, previousUser, true);
      }
    }
    u.isCreatorOfTheMonth = true;
    await saveWithRetry('user:' + currentUserDetailTarget, u, true);
    await saveWithRetry('settings:creatorOfTheMonth', currentUserDetailTarget, true);
    await createNotification(currentUserDetailTarget, 'creator_of_the_month', 'Suktum', null, null);
    showToast('Désigné(e) Créateur du mois ✓ — mis en avant sur Explorer');
    await logAdminAction('Désigné Créateur du mois', '@' + currentUserDetailTarget);
  }
  await renderCreatorOfMonthButton();
}
async function renderCreatorOfMonthButton(){
  const btn = document.getElementById('creator-of-month-btn');
  if(!btn || !currentUserDetailTarget) return;
  const u = await safeGet('user:' + currentUserDetailTarget, true);
  btn.textContent = (u && u.isCreatorOfTheMonth) ? '✕ Retirer le statut Créateur du mois' : '🎉 Désigner comme Créateur du mois';
}
/* ---------- GROUPES À THÈME COMMUNAUTAIRES ---------- */
async function fetchCommunityGroups(){
  const keys = await safeList('communitygroup:', true);
  const list = [];
  for(const k of keys){ const g = await safeGet(k, true); if(g) list.push(g); }
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list;
}
async function createCommunityGroup(){
  if(!requireAccount('Créez un compte pour créer un groupe')) return;
  const name = document.getElementById('new-community-group-name').value.trim();
  const description = document.getElementById('new-community-group-desc').value.trim();
  if(!name){ showToast('Donnez un nom au groupe'); return; }
  const id = 'group_' + Date.now();
  await saveWithRetry('communitygroup:' + id, {
    id, name, description, createdBy: currentUser, members: [currentUser], createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-community-group-name').value = '';
  document.getElementById('new-community-group-desc').value = '';
  showToast('Groupe créé ✓');
  openCommunityGroupWall(id);
}
async function renderCommunityGroupsList(){
  const el = document.getElementById('community-groups-list');
  if(!el) return;
  const groups = await fetchCommunityGroups();
  el.innerHTML = groups.length === 0 ? '<div class="empty">Aucun groupe pour l’instant — créez le premier !</div>' : groups.map(g =>
    '<div class="card" style="cursor:pointer;" onclick="openCommunityGroupWall(\''+g.id+'\')">' +
    '<strong style="font-size:13.5px;">'+escapeHtml(g.name)+'</strong>' +
    '<p style="margin:4px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(g.description||'')+'</p>' +
    '<p style="margin:4px 0 0; font-size:11.5px; color:var(--gold);">👥 '+(g.members||[]).length+' membre(s)</p>' +
    '</div>'
  ).join('');
}
let currentCommunityGroupId = null;
async function openCommunityGroupWall(groupId){
  if(!requireAccount('Créez un compte pour accéder à ce groupe')) return;
  currentCommunityGroupId = groupId;
  go('community-group-wall');
  await renderCommunityGroupWall();
}
async function renderCommunityGroupWall(){
  const g = await safeGet('communitygroup:' + currentCommunityGroupId, true);
  if(!g) return;
  document.getElementById('community-group-wall-title').textContent = g.name;
  document.getElementById('community-group-wall-desc').textContent = g.description || '';
  const isMember = (g.members || []).includes(currentUser);
  const joinBtn = document.getElementById('community-group-join-btn');
  joinBtn.textContent = isMember ? '✓ Membre — quitter le groupe' : '➕ Rejoindre le groupe';
  document.getElementById('community-group-composer').style.display = isMember ? 'block' : 'none';
  await renderCommunityGroupPosts();
}
async function toggleCommunityGroupMembership(){
  const g = await safeGet('communitygroup:' + currentCommunityGroupId, true);
  if(!g) return;
  const members = g.members || [];
  const idx = members.indexOf(currentUser);
  if(idx !== -1) members.splice(idx, 1);
  else members.push(currentUser);
  g.members = members;
  await saveWithRetry('communitygroup:' + currentCommunityGroupId, g, true);
  await renderCommunityGroupWall();
}
async function publishCommunityGroupPost(){
  const g = await safeGet('communitygroup:' + currentCommunityGroupId, true);
  if(!g || !(g.members || []).includes(currentUser)) return;
  const text = document.getElementById('community-group-post-input').value.trim();
  if(!text){ showToast('Écrivez quelque chose'); return; }
  const id = 'communitypost_' + Date.now();
  await saveWithRetry('communitypost:' + currentCommunityGroupId + '__' + id, {
    id, groupId: currentCommunityGroupId, userId: currentUser, text, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('community-group-post-input').value = '';
  await renderCommunityGroupPosts();
}
async function renderCommunityGroupPosts(){
  const el = document.getElementById('community-group-wall-posts');
  if(!el) return;
  const keys = await safeList('communitypost:' + currentCommunityGroupId + '__', true);
  const posts = [];
  for(const k of keys){ const p = await safeGet(k, true); if(p) posts.push(p); }
  posts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = posts.length === 0 ? '<div class="empty">Aucune publication pour l’instant dans ce groupe.</div>' : posts.map(p =>
    '<div class="card"><p style="margin:0 0 4px; font-size:12.5px; color:var(--lagoon); cursor:pointer;" onclick="openUserProfile(\''+escapeHtml(p.userId)+'\')">@'+escapeHtml(p.userId)+'</p>' +
    '<p style="margin:0; font-size:13px;">'+escapeHtml(p.text)+'</p></div>'
  ).join('');
}
/* ---------- "EN CE MOMENT" — HASHTAGS QUI MONTENT (croissance réelle semaine/semaine) ---------- */
async function renderTrendingHashtagsGrowth(){
  const el = document.getElementById('trending-hashtags-growth-section');
  if(!el) return;
  const allPosts = await fetchPosts();
  const relevantPosts = currentUserCountry ? allPosts.filter(p => p.country === currentUserCountry) : allPosts;
  const now = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);
  const twoWeeksAgo = new Date(now - 14*24*60*60*1000);
  const thisWeekCounts = {};
  const lastWeekCounts = {};
  relevantPosts.forEach(p => {
    const created = new Date(p.createdAt);
    const tags = extractHashtags(p.caption);
    if(created > weekAgo){
      tags.forEach(t => { thisWeekCounts[t] = (thisWeekCounts[t] || 0) + 1; });
    } else if(created > twoWeeksAgo){
      tags.forEach(t => { lastWeekCounts[t] = (lastWeekCounts[t] || 0) + 1; });
    }
  });
  const rows = Object.entries(thisWeekCounts).map(([tag, count]) => {
    const previous = lastWeekCounts[tag] || 0;
    const growthPercent = previous > 0 ? Math.round((count - previous) / previous * 100) : null;
    return { tag, count, previous, growthPercent };
  }).filter(r => r.count >= 2).sort((a,b) => b.count - a.count).slice(0, 5);
  if(rows.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="eyebrow" style="margin-top:0;">📈 En ce moment'+(currentUserCountry ? ' — ' + escapeHtml(currentUserCountry) : '')+'</div>' +
    rows.map(r => '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="openHashtagPage(\''+r.tag.replace('#','')+'\')">' +
      '<div style="flex:1;"><strong style="font-size:13px; color:var(--gold);">'+escapeHtml(r.tag)+'</strong>' +
      '<p style="margin:2px 0 0; font-size:11.5px; color:rgba(245,239,227,0.55);">'+r.count+' publication(s) cette semaine</p></div>' +
      (r.growthPercent !== null ? '<span style="font-size:12px; color:'+(r.growthPercent >= 0 ? 'var(--lagoon)' : 'rgba(245,239,227,0.4)')+'; font-weight:600;">'+(r.growthPercent >= 0 ? '+' : '')+r.growthPercent+'%</span>' : '<span style="font-size:11px; color:var(--coral);">🆕 Nouveau</span>') +
      '</div>'
    ).join('');
}
async function renderFeaturedCreatorOfMonth(){
  const el = document.getElementById('featured-creator-of-month');
  if(!el) return;
  const holderUsername = await safeGet('settings:creatorOfTheMonth', true);
  if(!holderUsername){ el.innerHTML = ''; return; }
  const u = await safeGet('user:' + holderUsername, true);
  if(!u || !u.isCreatorOfTheMonth){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="eyebrow" style="margin-top:0;">🎉 Créateur du mois</div>' +
    '<div class="card" style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:16px;" onclick="openUserProfile(\''+escapeHtml(holderUsername)+'\')">' +
    smallAvatarBadge(holderUsername, 44) +
    '<div><strong style="font-size:14px;">@'+escapeHtml(holderUsername)+'</strong>' +
    '<p style="margin:2px 0 0; font-size:11.5px; color:var(--gold);">Mis en avant par l’équipe Suktum</p></div></div>';
}
async function saveInstitutionalPartnerLabel(){
  if(!currentUserDetailTarget) return;
  const label = document.getElementById('user-detail-institutional-label').value.trim();
  const u = await safeGet('user:' + currentUserDetailTarget, true);
  if(!u) return;
  u.institutionalPartnerLabel = label || null;
  await saveWithRetry('user:' + currentUserDetailTarget, u, true);
  showToast(label ? 'Mis en avant dans le coin institutionnel ✓' : 'Retiré du coin institutionnel');
  await logAdminAction(label ? 'Ajouté au coin institutionnel (' + label + ')' : 'Retiré du coin institutionnel', '@' + currentUserDetailTarget);
}
async function analyzeUserAccountWithAI(){
  const el = document.getElementById('user-detail-ai-assessment');
  if(!el || !currentUserDetailTarget) return;
  el.textContent = '⏳ Analyse en cours...';
  try{
    const reports = (await fetchReports()).filter(r => r.targetUser === currentUserDetailTarget);
    const u = await safeGet('user:' + currentUserDetailTarget, true);
    const warnings = (u && u.warnings) || [];
    if(reports.length === 0 && warnings.length === 0){
      el.textContent = '🧠 Aucun signalement ni avertissement — rien ne justifie une action pour l’instant.';
      return;
    }
    const prompt = "Tu aides un modérateur à évaluer un compte utilisateur sur Suktum (réseau social). Voici son historique réel :\n\n" +
      "Signalements reçus (" + reports.length + ") : " + reports.map(r => '"' + r.reason + '" (' + r.status + ')').join(', ') +
      "\nAvertissements déjà envoyés (" + warnings.length + ") : " + warnings.map(w => '"' + w.reason + '"').join(', ') +
      "\n\nAu vu de cet historique, ce compte présente-t-il un vrai risque nécessitant une suspension/bannissement, ou les signalements semblent-ils mineurs/isolés ? Réponds en 2-3 phrases, sans décider à la place du modérateur — c'est un avis, pas une décision automatique.";
    const assessment = await callAIProvider(prompt, 250, await getGovernanceAIProvider());
    el.textContent = assessment ? '🧠 ' + assessment : 'Avis indisponible.';
  }catch(e){
    el.textContent = 'Avis indisponible (connexion).';
  }
}
async function openDashboardWidgetKebabMenu(widgetId, title, hasPeriod){
  const items = [];
  items.push({ icon: '📄', label: 'Exporter', action: 'closeGenericKebabMenu(); exportDashboardWidget(\''+widgetId+'\', \''+title.replace(/'/g,"\\'")+'\')' });
  if(hasPeriod){
    items.push({ icon: '📅', label: 'Changer la période', action: 'closeGenericKebabMenu(); document.getElementById(\'finance-period-30\').scrollIntoView({behavior:\'smooth\', block:\'center\'})' });
  }
  items.push({ icon: '🔍', label: 'Agrandir en plein écran', action: 'closeGenericKebabMenu(); fullscreenDashboardWidget(\''+widgetId+'\', \''+title.replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🔄', label: hasPeriod ? 'Réinitialiser la période (Tout)' : 'Réinitialiser le formulaire', action: 'closeGenericKebabMenu(); resetDashboardWidget(\''+widgetId+'\', '+hasPeriod+')' });
  openGenericKebabMenu(items);
}
function exportDashboardWidget(widgetId, title){
  const contentEl = document.getElementById(widgetId);
  if(!contentEl) return;
  const printWindow = window.open('', '_blank');
  printWindow.document.write('<html><head><title>Suktum — '+title+'</title><style>body{font-family:sans-serif; padding:24px; color:#0B2E3D;} p{margin:0 0 8px;}</style></head><body><h2>'+title+'</h2>'+contentEl.innerHTML.replace(/<span onclick="openDashboardWidgetKebabMenu[^<]*<\/span>/,'')+'</body></html>');
  printWindow.document.close();
  printWindow.print();
}
function fullscreenDashboardWidget(widgetId, title){
  const contentEl = document.getElementById(widgetId);
  if(!contentEl) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:220; background:var(--night); overflow-y:auto; padding:calc(20px + env(safe-area-inset-top)) 18px;';
  overlay.innerHTML = '<div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;"><span onclick="this.closest(\'div[style*=fixed]\').remove()" style="font-size:22px; cursor:pointer;">✕</span><strong style="font-family:\'Baloo 2\'; font-size:16px;">'+title+'</strong></div>' + contentEl.innerHTML.replace(/<span onclick="openDashboardWidgetKebabMenu[^<]*<\/span>/,'');
  document.body.appendChild(overlay);
}
async function resetDashboardWidget(widgetId, hasPeriod){
  if(hasPeriod){
    setFinanceDashboardPeriod(null);
    showToast('Période réinitialisée sur « Tout »');
  } else {
    document.getElementById('new-expense-category').value = 'Hébergement';
    document.getElementById('new-expense-amount').value = '';
    document.getElementById('new-expense-description').value = '';
    showToast('Formulaire réinitialisé');
  }
}
let financeDashboardPeriodDays = null;
function setFinanceDashboardPeriod(days){
  financeDashboardPeriodDays = days;
  ['7','30','60','all'].forEach(d => {
    const btn = document.getElementById('finance-period-' + d);
    const isActive = (d === 'all' && days === null) || (d !== 'all' && parseInt(d,10) === days);
    btn.style.background = isActive ? 'var(--coral)' : 'transparent';
    btn.style.color = isActive ? 'var(--night)' : 'var(--cream)';
  });
  renderFinanceDashboard();
}
function isWithinFinancePeriod(createdAt){
  if(financeDashboardPeriodDays === null) return true;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs <= financeDashboardPeriodDays * 24 * 60 * 60 * 1000;
}
async function renderFinanceDashboard(){
  const el = document.getElementById('finance-dashboard-content');
  if(!el) return;
  const orderKeys = await safeList('order:', true);
  let commissionRevenue = 0;
  for(const k of orderKeys){
    const o = await safeGet(k, true);
    if(!o || o.status !== 'fulfilled' || !isWithinFinancePeriod(o.createdAt)) continue;
    const refund = await safeGet('refundrequest:' + o.id, true).catch(() => null);
    if(refund && refund.status === 'resolved') continue;
    commissionRevenue += (o.commissionAmount || 0);
  }
  const premiumKeys = await safeList('premiumpurchase:', true);
  let premiumRevenue = 0;
  for(const k of premiumKeys){ const p = await safeGet(k, true); if(p && isWithinFinancePeriod(p.createdAt)) premiumRevenue += p.price; }
  const eduKeys = await safeList('edupurchase:', true);
  let eduRevenue = 0;
  for(const k of eduKeys){ const p = await safeGet(k, true); if(p && isWithinFinancePeriod(p.createdAt)) eduRevenue += p.price; }
  const seriesKeys = await safeList('seriespurchase:', true);
  let seriesRevenue = 0;
  for(const k of seriesKeys){ const p = await safeGet(k, true); if(p && isWithinFinancePeriod(p.createdAt)) seriesRevenue += p.price; }
  const coinKeys = await safeList('coinpurchase:', true);
  let coinRevenue = 0;
  for(const k of coinKeys){ const p = await safeGet(k, true); if(p && isWithinFinancePeriod(p.createdAt)) coinRevenue += p.priceFcfa; }
  const adKeys = await safeList('ad:', true);
  let adRevenue = 0;
  for(const k of adKeys){ const a = await safeGet(k, true); if(a && isWithinFinancePeriod(a.createdAt)) adRevenue += (a.spent || 0); }
  const expenseKeys = await safeList('platformexpense:', true);
  let totalExpenses = 0;
  for(const k of expenseKeys){ const e = await safeGet(k, true); if(e && isWithinFinancePeriod(e.createdAt)) totalExpenses += e.amount; }
  const totalRevenue = commissionRevenue + premiumRevenue + eduRevenue + seriesRevenue + coinRevenue + adRevenue;
  const netBalance = totalRevenue - totalExpenses;
  const fmt = n => n.toLocaleString('fr-FR') + ' FCFA';

  const allUsers = await fetchUsers();
  const todayKey = new Date().toISOString().slice(0,10);
  const dau = allUsers.filter(u => u.lastLoginDate === todayKey).length;
  const thirtyDaysAgo = Date.now() - 30*24*60*60*1000;
  const mau = allUsers.filter(u => u.lastLoginDate && new Date(u.lastLoginDate + 'T00:00:00').getTime() >= thirtyDaysAgo).length;

  const fulfilledOrdersForCart = [];
  for(const k of orderKeys){
    const o = await safeGet(k, true).catch(() => null);
    if(o && o.status === 'fulfilled' && isWithinFinancePeriod(o.createdAt)) fulfilledOrdersForCart.push(o);
  }
  const averageCartValue = fulfilledOrdersForCart.length > 0 ? Math.round(fulfilledOrdersForCart.reduce((s,o) => s + o.total, 0) / fulfilledOrdersForCart.length) : null;

  const viewKeys = await safeList('recentlyviewed:', true);
  const viewedProductIds = new Set();
  for(const k of viewKeys){
    const v = await safeGet(k, true).catch(() => null);
    if(v && isWithinFinancePeriod(v.viewedAt)) viewedProductIds.add(v.productId);
  }
  const orderedProductIds = new Set();
  for(const o of fulfilledOrdersForCart) orderedProductIds.add(o.productId);
  const funnelConversionRate = viewedProductIds.size > 0 ? Math.round((orderedProductIds.size / viewedProductIds.size) * 100) : null;

  el.innerHTML = '<div id="widget-solde-net" style="position:relative;"><span onclick="openDashboardWidgetKebabMenu(\'widget-solde-net\', \'Solde net\', true)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; z-index:2;">⋮</span><div class="card" style="margin-bottom:16px; border-color:'+(netBalance >= 0 ? 'var(--lagoon)' : 'var(--coral)')+';">' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.5);">Solde net (revenus − dépenses)</p>' +
    '<p style="margin:0; font-size:22px; font-weight:700; color:'+(netBalance >= 0 ? 'var(--lagoon)' : 'var(--coral)')+';">'+fmt(netBalance)+'</p></div></div>' +
    '<div id="widget-revenus-source" style="position:relative;"><span onclick="openDashboardWidgetKebabMenu(\'widget-revenus-source\', \'Revenus par source\', true)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; z-index:2;">⋮</span>' +
    '<div class="eyebrow" style="margin-top:0;">Revenus par source</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 6px; font-size:13px;">🛍️ Commissions boutique (commandes traitées) : <strong>'+fmt(commissionRevenue)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">⭐ Abonnements Premium : <strong>'+fmt(premiumRevenue)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">🎓 Abonnements Éducation : <strong>'+fmt(eduRevenue)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">🎬 Séries payantes : <strong>'+fmt(seriesRevenue)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">🪙 Pièces virtuelles : <strong>'+fmt(coinRevenue)+'</strong></p>' +
    '<p style="margin:0; font-size:13px;">📣 Campagnes publicitaires : <strong>'+fmt(adRevenue)+'</strong></p>' +
    '<p style="margin:10px 0 0; font-size:13px; border-top:1px solid var(--line); padding-top:10px;">Total revenus : <strong>'+fmt(totalRevenue)+'</strong></p>' +
    '</div></div>' +
    '<div id="widget-indicateurs-croissance" style="position:relative;"><span onclick="openDashboardWidgetKebabMenu(\'widget-indicateurs-croissance\', \'Indicateurs de croissance\', true)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; z-index:2;">⋮</span>' +
    '<div class="eyebrow">📈 Indicateurs de croissance</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<p style="margin:0 0 6px; font-size:13px;">👤 Utilisateurs actifs aujourd’hui (DAU) : <strong>'+dau+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">👥 Utilisateurs actifs sur 30 jours (MAU) : <strong>'+mau+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:13px;">🛒 Panier moyen : <strong>'+(averageCartValue !== null ? fmt(averageCartValue) : 'Aucune commande sur cette période')+'</strong></p>' +
    '<p style="margin:0; font-size:13px;">🔻 Entonnoir de conversion (vue produit → achat) : <strong>'+(funnelConversionRate !== null ? funnelConversionRate+'% ('+orderedProductIds.size+' produit(s) achetés sur '+viewedProductIds.size+' vu(s))' : 'Aucune vue de produit sur cette période')+'</strong></p>' +
    '</div></div>' +
    '<div id="widget-depenses" style="position:relative;"><span onclick="openDashboardWidgetKebabMenu(\'widget-depenses\', \'Dépenses de la plateforme\', false)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; z-index:2;">⋮</span>' +
    '<div class="eyebrow">💸 Dépenses de la plateforme</div>' +
    '<div class="card" style="margin-bottom:16px;">' +
    '<label style="margin-top:0;">Catégorie</label>' +
    '<select id="new-expense-category"><option value="Hébergement">Hébergement</option><option value="Personnel">Personnel</option><option value="Marketing">Marketing</option><option value="Autre">Autre</option></select>' +
    '<label>Montant (FCFA)</label>' +
    '<input type="number" id="new-expense-amount" placeholder="Ex : 50000">' +
    '<label>Description</label>' +
    '<input type="text" id="new-expense-description" placeholder="Ex : Renouvellement hébergement mensuel">' +
    '<button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="addPlatformExpense()">Ajouter la dépense</button>' +
    '</div>' +
    '<div class="eyebrow">Dépenses récentes (total : '+fmt(totalExpenses)+')</div>' +
    '<div id="platform-expenses-list" style="margin-bottom:16px;"></div></div>' +
    '<button class="btn btn-outline" style="width:100%;" onclick="exportFinanceReport()">📥 Télécharger un rapport financier</button>';
  await renderPlatformExpensesList();
}
async function addPlatformExpense(){
  const category = document.getElementById('new-expense-category').value;
  const amount = parseInt(document.getElementById('new-expense-amount').value, 10);
  const description = document.getElementById('new-expense-description').value.trim();
  if(isNaN(amount) || amount <= 0){ showToast('Renseignez un montant valide'); return; }
  if(!description){ showToast('Une description est requise'); return; }
  const id = 'expense_' + Date.now();
  await saveWithRetry('platformexpense:' + id, { id, category, amount, description, addedBy: currentUser, createdAt: new Date().toISOString() }, true);
  await logAdminAction('Dépense de plateforme ajoutée', category + ' — ' + amount.toLocaleString('fr-FR') + ' FCFA — ' + description);
  document.getElementById('new-expense-amount').value = '';
  document.getElementById('new-expense-description').value = '';
  showToast('Dépense enregistrée ✓');
  await renderFinanceDashboard();
}
async function renderPlatformExpensesList(){
  const el = document.getElementById('platform-expenses-list');
  if(!el) return;
  const keys = await safeList('platformexpense:', true);
  const expenses = [];
  for(const k of keys){ const e = await safeGet(k, true); if(e) expenses.push(e); }
  expenses.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = expenses.length === 0 ? '<div class="empty">Aucune dépense enregistrée pour l’instant.</div>' :
    expenses.slice(0,30).map(e => '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 3px; font-size:12.5px;">'+escapeHtml(e.category)+' — '+e.amount.toLocaleString('fr-FR')+' FCFA · '+new Date(e.createdAt).toLocaleDateString('fr-FR')+'</p><p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.5);">'+escapeHtml(e.description)+'</p></div>').join('');
}
async function exportFinanceReport(){
  const orderKeys = await safeList('order:', true);
  let commissionRevenue = 0;
  for(const k of orderKeys){
    const o = await safeGet(k, true);
    if(!o || o.status !== 'fulfilled') continue;
    const refund = await safeGet('refundrequest:' + o.id, true).catch(() => null);
    if(refund && refund.status === 'resolved') continue;
    commissionRevenue += (o.commissionAmount || 0);
  }
  const premiumKeys = await safeList('premiumpurchase:', true);
  let premiumRevenue = 0;
  for(const k of premiumKeys){ const p = await safeGet(k, true); if(p) premiumRevenue += p.price; }
  const eduKeys = await safeList('edupurchase:', true);
  let eduRevenue = 0;
  for(const k of eduKeys){ const p = await safeGet(k, true); if(p) eduRevenue += p.price; }
  const seriesKeys = await safeList('seriespurchase:', true);
  let seriesRevenue = 0;
  for(const k of seriesKeys){ const p = await safeGet(k, true); if(p) seriesRevenue += p.price; }
  const coinKeys = await safeList('coinpurchase:', true);
  let coinRevenue = 0;
  for(const k of coinKeys){ const p = await safeGet(k, true); if(p) coinRevenue += p.priceFcfa; }
  const adKeys = await safeList('ad:', true);
  let adRevenue = 0;
  for(const k of adKeys){ const a = await safeGet(k, true); if(a) adRevenue += (a.spent || 0); }
  const expenseKeys = await safeList('platformexpense:', true);
  const expenses = [];
  let totalExpenses = 0;
  for(const k of expenseKeys){ const e = await safeGet(k, true); if(e){ expenses.push(e); totalExpenses += e.amount; } }
  const totalRevenue = commissionRevenue + premiumRevenue + eduRevenue + seriesRevenue + coinRevenue + adRevenue;
  const fmt = n => n.toLocaleString('fr-FR') + ' FCFA';
  let text = 'RAPPORT FINANCIER SUKTUM\n';
  text += 'Généré le ' + new Date().toLocaleString('fr-FR') + '\n\n';
  text += 'REVENUS\n';
  text += '- Commissions boutique : ' + fmt(commissionRevenue) + '\n';
  text += '- Abonnements Premium : ' + fmt(premiumRevenue) + '\n';
  text += '- Abonnements Éducation : ' + fmt(eduRevenue) + '\n';
  text += '- Séries payantes : ' + fmt(seriesRevenue) + '\n';
  text += '- Pièces virtuelles : ' + fmt(coinRevenue) + '\n';
  text += '- Campagnes publicitaires : ' + fmt(adRevenue) + '\n';
  text += 'TOTAL REVENUS : ' + fmt(totalRevenue) + '\n\n';
  text += 'DÉPENSES (' + expenses.length + ')\n';
  text += (expenses.length === 0 ? 'Aucune dépense enregistrée.\n' : expenses.map(e => '- ' + e.category + ' : ' + fmt(e.amount) + ' — ' + e.description + ' (' + new Date(e.createdAt).toLocaleDateString('fr-FR') + ')').join('\n') + '\n');
  text += 'TOTAL DÉPENSES : ' + fmt(totalExpenses) + '\n\n';
  text += 'SOLDE NET : ' + fmt(totalRevenue - totalExpenses) + '\n';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rapport-financier-suktum-' + new Date().toISOString().slice(0,10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Rapport téléchargé ✓');
}
async function loadUserDetailCoinBalance(username){
  const el = document.getElementById('user-detail-coin-balance');
  if(!el) return;
  const balance = (await safeGet('coinbalance:' + username, false)) || 0;
  el.textContent = balance;
}
async function adjustUserCoinBalance(){
  if(!currentUserDetailTarget) return;
  const amount = parseInt(document.getElementById('coin-adjustment-amount').value, 10);
  const reason = document.getElementById('coin-adjustment-reason').value.trim();
  if(isNaN(amount) || amount === 0){ showToast('Renseignez un ajustement non nul'); return; }
  if(!reason){ showToast('Un motif est requis pour tout ajustement manuel'); return; }
  const balance = (await safeGet('coinbalance:' + currentUserDetailTarget, false)) || 0;
  const newBalance = Math.max(0, balance + amount);
  await saveWithRetry('coinbalance:' + currentUserDetailTarget, newBalance, false);
  await saveWithRetry('coinadjustment:' + currentUserDetailTarget + '__' + Date.now(), {
    username: currentUserDetailTarget, amount, reason, adjustedBy: currentUser, createdAt: new Date().toISOString()
  }, true);
  await logAdminAction('Ajustement manuel de solde de pièces', '@' + currentUserDetailTarget + ' — ' + (amount > 0 ? '+' : '') + amount + ' pièces — ' + reason);
  document.getElementById('coin-adjustment-amount').value = '';
  document.getElementById('coin-adjustment-reason').value = '';
  showToast('Ajustement appliqué ✓');
  await loadUserDetailCoinBalance(currentUserDetailTarget);
}
async function openUserDetail(username){
  currentUserDetailTarget = username;
  document.getElementById('user-detail-title').textContent = '@' + username;
  go('user-detail');
  const u = await safeGet('user:' + username, true);
  const status = u ? (u.status || 'active') : 'active';
  const statusLabel = status === 'banned' ? '🚫 Compte banni' : status === 'suspended' ? '⏸ Compte suspendu' : '🟢 Compte actif';
  document.getElementById('user-detail-status').textContent = statusLabel;
  await renderUserStrikeInfo();
  await renderShadowBanToggle();
  await renderRepeatOffenderWarning(username);
  const institutionalInput = document.getElementById('user-detail-institutional-label');
  if(institutionalInput) institutionalInput.value = (u && u.institutionalPartnerLabel) || '';
  await renderCreatorOfMonthButton();
  await loadUserDetailCoinBalance(username);

  const posts = (await fetchPosts(true)).filter(p => p.userId === username);
  const postsEl = document.getElementById('user-detail-posts');
  postsEl.innerHTML = posts.length === 0 ? '<div class="empty">Aucune publication.</div>' :
    posts.map(p => '<div class="thumb">' + (p.type==='video' ? '<video src="'+p.data+'" muted loop preload="metadata" onmouseenter="this.play().catch(()=>{})" onmouseleave="this.pause(); this.currentTime=0;" ontouchstart="this.play().catch(()=>{})" ontouchend="this.pause(); this.currentTime=0;"></video>' : '<img src="'+p.data+'">') + '</div>').join('');

  const reports = (await fetchReports()).filter(r => r.targetUser === username);
  const reportsEl = document.getElementById('user-detail-reports');
  reportsEl.innerHTML = reports.length === 0 ? '<div class="empty">Aucun signalement reçu.</div>' :
    reports.map(r => '<div class="card"><p style="margin:0; font-size:12.5px;">'+escapeHtml(r.reason)+' <span style="color:rgba(245,239,227,0.45);">('+r.status+')</span></p></div>').join('');

  const warnings = (u && u.warnings) || [];
  const warningsEl = document.getElementById('user-detail-warnings');
  warningsEl.innerHTML = warnings.length === 0 ? '<div class="empty">Aucun avertissement envoyé.</div>' :
    warnings.map(w => '<div class="card" style="padding:9px 13px;"><p style="margin:0; font-size:12.5px;">'+escapeHtml(w.reason)+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+new Date(w.createdAt).toLocaleString('fr-FR')+'</p></div>').join('');

  const suspHistory = (u && u.suspensionHistory) || [];
  const suspHistoryEl = document.getElementById('user-detail-suspension-history');
  const actionLabels = { suspended: '⏸ Suspendu', banned: '🚫 Banni', reactivated: '▶️ Réactivé' };
  suspHistoryEl.innerHTML = suspHistory.length === 0 ? '<div class="empty">Aucune suspension ni bannissement pour l’instant.</div>' :
    [...suspHistory].reverse().map(h => '<div class="card" style="padding:9px 13px;"><p style="margin:0; font-size:12.5px;">'+(actionLabels[h.action]||h.action)+(h.durationDays ? ' ('+h.durationDays+' jours)' : (h.action === 'suspended' ? ' (indéfini)' : ''))+' par '+escapeHtml(h.by)+(h.reason ? ' — '+escapeHtml(h.reason) : '')+'</p><p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+new Date(h.createdAt).toLocaleString('fr-FR')+'</p></div>').join('');

  const linkedEl = document.getElementById('user-detail-linked-accounts');
  const linkedAccounts = await findLinkedAccounts(username);
  if(linkedAccounts.length === 0){
    linkedEl.innerHTML = '<div class="empty">Aucun autre compte détecté sur le même appareil.</div>';
  } else {
    const rows = [];
    for(const other of linkedAccounts){
      const ou = await safeGet('user:' + other, true);
      const otherStatus = ou ? (ou.status || 'active') : 'active';
      rows.push(
        '<div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;'+(otherStatus==='banned'?' border-color:var(--coral);':'')+'">' +
        '<span style="display:flex; align-items:center; gap:10px; font-size:13px; cursor:pointer;" onclick="openUserDetail(\''+escapeHtml(other)+'\')">'+smallAvatarBadge(other, 28)+'@'+escapeHtml(other)+'</span>' +
        '<span style="font-size:11px; color:'+(otherStatus==='banned'?'var(--coral)':otherStatus==='suspended'?'var(--gold)':'var(--lagoon)')+';">'+(otherStatus==='banned'?'🚫 Banni':otherStatus==='suspended'?'⏸ Suspendu':'🟢 Actif')+'</span>' +
        '</div>'
      );
    }
    linkedEl.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:0 0 8px;">Ces comptes ont été utilisés sur le même appareil que @'+escapeHtml(username)+'. Si l’un est banni pour contourner une sanction, vérifiez les autres.</p>' + rows.join('');
  }

  const shopSuspended = u && u.shopSuspended;
  const shopStatusEl = document.getElementById('user-detail-shop-status');
  const allProducts = await fetchProducts();
  const myProducts = allProducts.filter(p => p.sellerUsername === username);
  shopStatusEl.innerHTML = '<p style="margin:0 0 10px; font-size:13px;">'+(shopSuspended ? '⏸ Boutique suspendue — plus visible par les acheteurs' : '🟢 Boutique active')+' — '+myProducts.length+' produit(s)</p>' +
    (shopSuspended
      ? '<button class="btn btn-outline btn-sm" onclick="toggleShopSuspension(false)">✓ Réactiver la boutique</button>'
      : '<button class="btn btn-outline btn-sm" onclick="toggleShopSuspension(true)">⏸ Suspendre la boutique</button>');
  const productsEl = document.getElementById('user-detail-products');
  productsEl.innerHTML = myProducts.length === 0 ? '' : myProducts.map(p =>
    '<div class="card" style="display:flex; gap:12px; align-items:center;">' +
    (p.image ? '<img src="'+p.image+'" style="width:44px; height:44px; border-radius:8px; object-fit:cover;">' : '') +
    '<div style="flex:1;"><strong style="font-size:12.5px;">'+escapeHtml(p.name)+'</strong>' +
    '<p style="font-size:11.5px; color:var(--gold); margin:2px 0 0;">'+p.price.toLocaleString('fr-FR')+' FCFA</p></div>' +
    '<button class="btn btn-outline btn-sm" onclick="adminDeleteProduct(\''+p.id+'\')">✕</button></div>'
  ).join('');

  const revenueEl = document.getElementById('user-detail-shop-revenue');
  if(revenueEl){
    const sellerOrders = (await fetchOrders()).filter(o => o.sellerUsername === username);
    const realSales = sellerOrders.reduce((s,o) => s + o.total, 0);
    const realEarnings = sellerOrders.reduce((s,o) => s + (o.netAmount || 0), 0);
    const paidOrders = sellerOrders.filter(o => o.payoutStatus === 'paid');
    const totalPaidOut = paidOrders.reduce((s,o) => s + (o.netAmount || 0), 0);
    const totalOwed = realEarnings - totalPaidOut;
    const priceHistoryLines = myProducts.filter(p => p.priceHistory && p.priceHistory.length > 0).map(p =>
      '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+escapeHtml(p.name)+' : '+p.priceHistory.map(h => h.oldPrice.toLocaleString('fr-FR')+'→'+h.newPrice.toLocaleString('fr-FR')).join(', ')+'</p>'
    ).join('');
    revenueEl.innerHTML =
      '<p style="margin:0 0 4px; font-size:11px; color:var(--gold); text-transform:uppercase; letter-spacing:.04em;">🔍 Revenus réels vérifiés (calculés depuis les vraies commandes, jamais depuis ce que le commerçant affiche)</p>' +
      '<p style="margin:0 0 4px; font-size:13px;">🧾 '+sellerOrders.length+' commande(s) réelle(s)</p>' +
      '<p style="margin:0 0 4px; font-size:13px;">💵 Ventes réelles : <strong>'+realSales.toLocaleString('fr-FR')+' FCFA</strong></p>' +
      '<p style="margin:0 0 4px; font-size:13px;">💰 Gains nets réels : <strong>'+realEarnings.toLocaleString('fr-FR')+' FCFA</strong></p>' +
      '<p style="margin:0 0 4px; font-size:13px; color:var(--lagoon);">✓ Déjà reversé : <strong>'+totalPaidOut.toLocaleString('fr-FR')+' FCFA</strong></p>' +
      '<p style="margin:0; font-size:14px; color:var(--coral); font-family:\'Baloo 2\'; font-weight:700;">⏳ Reste dû au vendeur : '+totalOwed.toLocaleString('fr-FR')+' FCFA</p>' +
      (priceHistoryLines ? '<div style="margin-top:8px;">'+priceHistoryLines+'</div>' : '');

    const payoutsEl = document.getElementById('user-detail-payouts');
    const unpaidOrders = sellerOrders.filter(o => o.payoutStatus !== 'paid');
    if(unpaidOrders.length === 0){
      payoutsEl.innerHTML = sellerOrders.length > 0 ? '<div class="empty">Toutes les commandes ont été reversées ✓</div>' : '';
    } else {
      payoutsEl.innerHTML = '<div class="eyebrow">💸 Reversements en attente</div>' +
        (u && u.sellerPaymentNumber
          ? '<p style="margin:0 0 10px; font-size:12.5px; color:var(--lagoon);">💳 Numéro de reversement : <strong>'+escapeHtml(u.sellerPaymentNumber)+'</strong></p>'
          : '<p style="margin:0 0 10px; font-size:12.5px; color:var(--coral);">⚠️ Ce vendeur n’a renseigné aucun numéro Wave/Orange Money — contactez-le avant de le reverser.</p>') +
        unpaidOrders.map(o =>
        '<div class="card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<span style="font-size:12.5px;">'+escapeHtml(o.productName)+' — <strong style="color:var(--gold);">'+(o.netAmount||0).toLocaleString('fr-FR')+' FCFA</strong> — @'+escapeHtml(o.sellerUsername)+'</span>' +
        '</div>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="btn btn-outline btn-sm" onclick="draftPayoutConfirmationMessage(\''+o.id+'\')">✍️ Rédiger le message</button>' +
        '<button class="btn btn-outline btn-sm" onclick="markOrderPaidOut(\''+o.id+'\')">✓ Marquer reversé</button>' +
        '</div>' +
        '<p id="payout-draft-'+o.id+'" style="margin:8px 0 0; font-size:12px; color:var(--gold); white-space:pre-line;"></p>' +
        '</div>'
      ).join('');
    }
  }
}
const draftedPayoutMessages = {};
async function draftPayoutConfirmationMessage(orderId){
  const el = document.getElementById('payout-draft-' + orderId);
  if(!el) return;
  const o = await safeGet('order:' + orderId, true);
  if(!o) return;
  el.textContent = '⏳ Rédaction en cours...';
  try{
    const prompt = "Rédige un court message en français, chaleureux et professionnel, qu'un responsable de plateforme (Suktum) envoie à un vendeur pour confirmer qu'il vient de recevoir son reversement.\n\n" +
      "Vendeur : @" + o.sellerUsername + "\nProduit vendu : " + o.productName + "\nMontant reversé : " + (o.netAmount||0).toLocaleString('fr-FR') + " FCFA" +
      "\n\n2-3 phrases maximum, sans formule d'ouverture type \"Cher\", direct et naturel.";
    const message = await callAIProvider(prompt, 200, await getGovernanceAIProvider());
    if(!message){ el.textContent = 'Rédaction indisponible pour le moment.'; return; }
    draftedPayoutMessages[orderId] = { sellerUsername: o.sellerUsername, message };
    el.innerHTML = '📝 ' + escapeHtml(message) + '<br><span style="cursor:pointer; text-decoration:underline;" onclick="useDraftedPayoutMessage(\''+orderId+'\')">Ouvrir dans la messagerie →</span>';
  }catch(e){
    el.textContent = 'Rédaction indisponible (connexion).';
  }
}
async function useDraftedPayoutMessage(orderId){
  const draft = draftedPayoutMessages[orderId];
  if(!draft) return;
  await openThread(draft.sellerUsername);
  const input = document.getElementById('thread-input');
  if(input) input.value = draft.message;
}
async function renderSellerLedger(){
  const el = document.getElementById('seller-ledger-list');
  const summaryEl = document.getElementById('seller-ledger-summary');
  const exportBtn = document.getElementById('seller-ledger-export-btn');
  const noteCard = document.getElementById('seller-internal-note-card');
  if(!el) return;
  const sellerUsername = document.getElementById('seller-ledger-search').value.trim();
  if(!sellerUsername){ el.innerHTML = ''; summaryEl.innerHTML = ''; exportBtn.style.display = 'none'; noteCard.style.display = 'none'; return; }
  noteCard.style.display = 'block';
  const existingNote = await safeGet('sellerinternalnote:' + sellerUsername, true).catch(() => null);
  document.getElementById('seller-internal-note-text').value = existingNote ? existingNote.text : '';
  const archive = await safeGet('accountarchive:' + sellerUsername, true).catch(() => null);
  const archiveEl = document.getElementById('seller-ledger-archive-banner');
  if(archive){
    archiveEl.style.display = 'block';
    archiveEl.innerHTML = '<div class="card" style="border-color:var(--coral);">' +
      '<p style="margin:0 0 6px; font-size:13px; color:var(--coral); font-weight:600;">⚠️ Ce compte a été supprimé le '+new Date(archive.archivedAt).toLocaleDateString('fr-FR')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px;">Nom légal (KYC) : '+(archive.kycFullName ? escapeHtml(archive.kycFullName) : 'jamais vérifié')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px;">Téléphone : '+(archive.phone ? escapeHtml(archive.phone) : '—')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px;">Pays : '+(archive.country ? escapeHtml(archive.country) : '—')+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px;">Compte créé le : '+(archive.accountCreatedAt ? new Date(archive.accountCreatedAt).toLocaleDateString('fr-FR') : '—')+'</p>' +
      (archive.internalNote ? '<p style="margin:8px 0 0; font-size:12px; color:rgba(245,239,227,0.7);">Note archivée : '+escapeHtml(archive.internalNote)+'</p>' : '') +
      '<p style="margin:8px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Archivé par @'+escapeHtml(archive.archivedBy)+' — conservé à des fins de preuve</p>' +
      '</div>';
  } else {
    archiveEl.style.display = 'none';
    archiveEl.innerHTML = '';
  }
  const allOrders = await fetchOrders();
  const sellerOrders = allOrders.filter(o => o.sellerUsername === sellerUsername);
  if(sellerOrders.length === 0){ el.innerHTML = '<div class="empty">Aucune vraie commande trouvée pour ce vendeur.</div>'; summaryEl.innerHTML = ''; exportBtn.style.display = 'none'; return; }
  sellerOrders.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  let totalPaid = 0, totalPending = 0, activeDisputeCount = 0, resolvedDisputeCount = 0, sellerCancelledCount = 0;
  const rows = [];
  for(const o of sellerOrders){
    const refund = await safeGet('refundrequest:' + o.id, true).catch(() => null);
    const isPaid = o.payoutStatus === 'paid';
    if(isPaid) totalPaid += (o.netAmount || 0);
    else totalPending += (o.netAmount || 0);
    if(refund){
      if(refund.status === 'resolved') resolvedDisputeCount++;
      else activeDisputeCount++;
    }
    if(o.status === 'cancelled' && o.cancelledBy === 'seller') sellerCancelledCount++;
    rows.push({ o, refund, isPaid });
  }
  const sellerCancelRate = sellerOrders.length > 0 ? Math.round((sellerCancelledCount / sellerOrders.length) * 100) : 0;
  summaryEl.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">📦 '+sellerOrders.length+' vraie(s) commande(s) au total</p>' +
    '<p style="margin:0 0 4px; font-size:13px; color:var(--lagoon);">✓ Reversé : '+totalPaid.toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0 0 4px; font-size:13px; color:var(--gold);">⏳ En attente : '+totalPending.toLocaleString('fr-FR')+' FCFA</p>' +
    (activeDisputeCount > 0 ? '<p style="margin:0 0 4px; font-size:13px; color:var(--coral);">⚠️ '+activeDisputeCount+' litige(s) réel(s) ENCORE ACTIF(S)</p>' : '<p style="margin:0 0 4px; font-size:13px; color:rgba(245,239,227,0.4);">Aucun litige actif en ce moment</p>') +
    (resolvedDisputeCount > 0 ? '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.4);">('+resolvedDisputeCount+' litige(s) déjà résolu(s) dans l’historique)</p>' : '') +
    (sellerCancelledCount > 0 ? '<p style="margin:0; font-size:13px; color:'+(sellerCancelRate >= 15 ? 'var(--coral)' : 'rgba(245,239,227,0.6)')+';">✕ '+sellerCancelledCount+' commande(s) annulée(s) par le vendeur ('+sellerCancelRate+'%)'+(sellerCancelRate >= 15 ? ' — taux élevé à surveiller' : '')+'</p>' : '') +
    '</div>';
  exportBtn.style.display = 'block';
  el.innerHTML = rows.map(({o, refund, isPaid}) => '<div class="card" style="margin-bottom:8px; '+(refund ? 'border-color:var(--coral);' : '')+'">' +
    '<p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(o.productName)+' × '+o.quantity+' — '+new Date(o.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">Réf : '+o.id+' · Acheteur : @'+escapeHtml(o.buyerUsername||'—')+'</p>' +
    '<p style="margin:0 0 4px; font-size:13px; font-weight:600;">Net vendeur : '+(o.netAmount||0).toLocaleString('fr-FR')+' FCFA</p>' +
    '<p style="margin:0; font-size:11.5px; color:'+(o.status === 'cancelled' ? 'var(--coral)' : (isPaid ? 'var(--lagoon)' : 'var(--gold)'))+';">'+(o.status === 'cancelled' ? '✕ Annulée par '+(o.cancelledBy === 'seller' ? 'le vendeur' : 'l’acheteur')+(o.cancellationReason ? ' — '+escapeHtml(o.cancellationReason) : '') : (isPaid ? '✓ Reversé le '+new Date(o.paidOutAt).toLocaleDateString('fr-FR')+(o.paidOutBy ? ' par @'+escapeHtml(o.paidOutBy) : '') : '⏳ En attente de reversement'))+'</p>' +
    (refund ? '<p style="margin:6px 0 0; font-size:11.5px; color:var(--coral);">⚠️ Litige réel : '+escapeHtml(refund.reason)+' ('+refund.status+')</p>' : '') +
    '</div>').join('');
}
async function exportSellerLedger(){
  const sellerUsername = document.getElementById('seller-ledger-search').value.trim();
  if(!sellerUsername) return;
  const allOrders = await fetchOrders();
  const sellerOrders = allOrders.filter(o => o.sellerUsername === sellerUsername).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  let text = 'HISTORIQUE DES TRANSACTIONS — @'+sellerUsername+' — SUKTUM\n';
  text += 'Généré le '+new Date().toLocaleString('fr-FR')+'\n\n';
  for(const o of sellerOrders){
    const refund = await safeGet('refundrequest:' + o.id, true).catch(() => null);
    text += '- '+new Date(o.createdAt).toLocaleDateString('fr-FR')+' | Réf '+o.id+' | '+o.productName+' × '+o.quantity+' | Net : '+(o.netAmount||0).toLocaleString('fr-FR')+' FCFA | '+(o.payoutStatus === 'paid' ? 'Reversé le '+new Date(o.paidOutAt).toLocaleDateString('fr-FR')+(o.paidOutBy ? ' par @'+o.paidOutBy : '') : 'En attente')+(refund ? ' | LITIGE : '+refund.reason+' ('+refund.status+')' : '')+'\n';
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'historique-vendeur-'+sellerUsername+'-suktum-'+new Date().toISOString().slice(0,10)+'.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Historique téléchargé ✓');
}
async function markOrderPaidOut(orderId){
  const o = await safeGet('order:' + orderId, true);
  if(!o) return;
  o.payoutStatus = 'paid';
  o.paidOutAt = new Date().toISOString();
  o.paidOutBy = currentUser;
  await saveWithRetry('order:' + orderId, o, true);
  showToast('Reversement enregistré ✓');
  await logAdminAction('Reversement effectué', '@' + o.sellerUsername + ' — ' + (o.netAmount||0).toLocaleString('fr-FR') + ' FCFA (' + o.productName + ')');
  if(document.getElementById('screen-payout-specialist').classList.contains('active')) await renderPayoutSpecialistList();
  else if(currentUserDetailTarget) await openUserDetail(currentUserDetailTarget);
}
async function requestCoinWithdrawal(){
  const amountRaw = document.getElementById('withdrawal-amount-input').value.trim();
  const amount = parseInt(amountRaw, 10);
  const method = document.getElementById('withdrawal-method-select').value;
  const phone = document.getElementById('withdrawal-phone-input').value.trim();
  if(!amount || amount <= 0){ showToast('Entrez un nombre de pièces valide'); return; }
  if(!phone){ showToast('Entrez votre numéro de téléphone'); return; }
  const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
  if(amount > balance){ showToast('Vous n’avez pas assez de pièces (solde : ' + balance + ')'); return; }
  const id = 'withdrawal_' + Date.now();
  await saveWithRetry('coinbalance:' + currentUser, balance - amount, false);
  await saveWithRetry('coinwithdrawal:' + id, {
    id, username: currentUser, amount, method, phone, status: 'pending', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('withdrawal-amount-input').value = '';
  document.getElementById('withdrawal-phone-input').value = '';
  showToast('Demande de retrait envoyée ✓ — traitement sous quelques jours');
  await renderMyWithdrawalRequests();
  await renderCoinWallet();
}
async function renderMyWithdrawalRequests(){
  const el = document.getElementById('my-withdrawal-requests-list');
  if(!el) return;
  const keys = await safeList('coinwithdrawal:', true);
  const mine = [];
  for(const k of keys){ const w = await safeGet(k, true).catch(() => null); if(w && w.username === currentUser) mine.push(w); }
  mine.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = mine.length === 0 ? '<div class="empty">Aucune demande de retrait pour l’instant.</div>' : mine.map(w =>
    '<div class="card" style="margin-bottom:6px;"><p style="margin:0; font-size:12.5px;">🪙 '+w.amount+' pièces — '+(w.method === 'wave' ? 'Wave' : 'Orange Money')+' ('+escapeHtml(w.phone)+')</p>' +
    '<p style="margin:2px 0 0; font-size:11px; color:'+(w.status === 'paid' ? 'var(--lagoon)' : 'var(--gold)')+';">'+(w.status === 'paid' ? '✓ Payé le ' + new Date(w.paidAt).toLocaleDateString('fr-FR') : '⏳ En attente de traitement')+'</p></div>'
  ).join('');
}
async function fetchAllPendingPayouts(){
  const orders = (await fetchOrders()).filter(o => o.sellerUsername && o.payoutStatus !== 'paid' && o.netAmount);
  orders.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return orders;
}
async function renderCoinWithdrawalSpecialistList(){
  const stillValid = await verifyCurrentAdminSessionStillValid();
  if(!stillValid) return;
  const el = document.getElementById('coin-withdrawal-specialist-list');
  if(!el) return;
  const keys = await safeList('coinwithdrawal:', true);
  const pending = [];
  for(const k of keys){ const w = await safeGet(k, true).catch(() => null); if(w && w.status === 'pending') pending.push(w); }
  pending.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if(pending.length === 0){ el.innerHTML = '<div class="empty">Aucun retrait en attente ✓</div>'; return; }
  el.innerHTML = pending.map(w =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">@'+escapeHtml(w.username)+' — 🪙 '+w.amount+' pièces</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">'+(w.method === 'wave' ? 'Wave' : 'Orange Money')+' : '+escapeHtml(w.phone)+' — demandé le '+new Date(w.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    '<button class="btn btn-primary btn-sm" onclick="markCoinWithdrawalPaid(\''+w.id+'\')">✓ Marquer comme payé (versement fait manuellement)</button></div>'
  ).join('');
}
async function markCoinWithdrawalPaid(withdrawalId){
  const w = await safeGet('coinwithdrawal:' + withdrawalId, true);
  if(!w) return;
  if(!confirm('Confirmez-vous avoir réellement envoyé '+w.amount+' pièces (en FCFA équivalent) à @'+w.username+' via '+(w.method === 'wave' ? 'Wave' : 'Orange Money')+' au '+w.phone+' ?')) return;
  w.status = 'paid';
  w.paidAt = new Date().toISOString();
  w.paidBy = currentAdminName;
  await saveWithRetry('coinwithdrawal:' + withdrawalId, w, true);
  await logAdminAction('Retrait de pièces payé', '@' + w.username + ' — ' + w.amount + ' pièces');
  showToast('Retrait marqué comme payé ✓');
  await renderCoinWithdrawalSpecialistList();
}
async function renderPayoutSpecialistList(){
  const stillValid = await verifyCurrentAdminSessionStillValid();
  if(!stillValid) return;
  const el = document.getElementById('payout-specialist-list');
  if(!el) return;
  const pending = await fetchAllPendingPayouts();
  if(pending.length === 0){ el.innerHTML = '<div class="empty">Aucun reversement en attente ✓</div>'; return; }
  const paymentNumbers = {};
  for(const o of pending){
    if(!(o.sellerUsername in paymentNumbers)){
      const seller = await safeGet('user:' + o.sellerUsername, true);
      paymentNumbers[o.sellerUsername] = (seller && seller.sellerPaymentNumber) || null;
    }
  }
  el.innerHTML = pending.map(o =>
    '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;"><strong>@'+escapeHtml(o.sellerUsername)+'</strong> — '+escapeHtml(o.productName)+'</p>' +
    '<p style="margin:0 0 4px; font-size:14px; color:var(--gold); font-family:\'Baloo 2\'; font-weight:700;">'+(o.netAmount||0).toLocaleString('fr-FR')+' FCFA</p>' +
    (paymentNumbers[o.sellerUsername]
      ? '<p style="margin:0 0 8px; font-size:12px; color:var(--lagoon);">💳 '+escapeHtml(paymentNumbers[o.sellerUsername])+'</p>'
      : '<p style="margin:0 0 8px; font-size:12px; color:var(--coral);">⚠️ Aucun numéro de reversement renseigné</p>') +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="draftPayoutConfirmationMessage(\''+o.id+'\')">✍️ Rédiger le message</button>' +
    '<button class="btn btn-outline btn-sm" onclick="markOrderPaidOut(\''+o.id+'\')">✓ Marquer reversé</button>' +
    '</div>' +
    '<p id="payout-draft-'+o.id+'" style="margin:8px 0 0; font-size:12px; color:var(--gold); white-space:pre-line;"></p>' +
    '</div>'
  ).join('');
}
async function logoutPayoutSpecialist(){
  currentPayoutSpecialistName = null;
  currentAdminPasswordHash = null;
  isPayoutSpecialist = false;
  go('profile');
}
/* ---------- SYSTÈME DE STRIKES (escalade automatique formelle) ---------- */
async function fetchUserStrikes(username){
  const keys = await safeList('userstrike:' + username + '__', true);
  const strikes = [];
  for(const k of keys){ const s = await safeGet(k, true); if(s) strikes.push(s); }
  strikes.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return strikes;
}
const MODERATION_ACTION_PREFIXES = ['Compte suspendu', 'Compte réactivé', 'Compte banni', 'Strike donné', 'Visibilité réduite', 'Suspension groupée', 'Contestation de suspension', 'Contestation de bannissement'];
async function fetchFilteredModerationEntries(){
  const searchInput = document.getElementById('moderation-history-search');
  const filter = searchInput ? searchInput.value.trim().toLowerCase().replace(/^@/, '') : '';
  const keys = await safeList('auditlog:', true);
  let entries = [];
  for(const k of keys){
    const e = await safeGet(k, true);
    if(e && MODERATION_ACTION_PREFIXES.some(prefix => e.action.startsWith(prefix))) entries.push(e);
  }
  if(filter) entries = entries.filter(e => (e.detail || '').toLowerCase().includes(filter));
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return entries;
}
async function renderModerationHistory(){
  const el = document.getElementById('moderation-history-list');
  if(!el) return;
  const entries = await fetchFilteredModerationEntries();
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune action de modération de compte trouvée.</div>'; return; }
  el.innerHTML = entries.map(e =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;"><strong>'+escapeHtml(e.action)+'</strong></p>' +
    '<p style="margin:0 0 6px; font-size:12.5px; color:rgba(245,239,227,0.6);">'+escapeHtml(e.detail || '')+'</p>' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.45);">'+escapeHtml(e.actorName)+' ('+escapeHtml(e.actorRole)+') · '+new Date(e.createdAt).toLocaleString('fr-FR')+'</p></div>'
  ).join('');
}
async function exportModerationHistory(){
  const entries = await fetchFilteredModerationEntries();
  if(entries.length === 0){ showToast('Aucune entrée à exporter'); return; }
  const lines = [['Date', 'Action', 'Détail', 'Effectué par', 'Rôle'].map(csvEscapeField).join(',')];
  entries.forEach(e => {
    lines.push([
      new Date(e.createdAt).toLocaleString('fr-FR'), e.action, e.detail || '', e.actorName, e.actorRole
    ].map(csvEscapeField).join(','));
  });
  downloadCsvFile(lines, 'suktum-journal-moderation');
  showToast('Journal exporté ✓ — ' + entries.length + ' entrée(s)');
  await logAdminAction('Journal de modération exporté', entries.length + ' entrée(s)');
}
async function renderRepeatOffenderWarning(username){
  const el = document.getElementById('user-detail-repeat-offender-warning');
  if(!el) return;
  const linked = await findLinkedAccounts(username);
  if(linked.length === 0){ el.innerHTML = ''; return; }
  const sanctionedLinked = [];
  for(const linkedUsername of linked){
    const u = await safeGet('user:' + linkedUsername, true);
    const history = (u && u.suspensionHistory) || [];
    const realSanctions = history.filter(h => h.action === 'suspended' || h.action === 'banned');
    if(realSanctions.length > 0) sanctionedLinked.push({ username: linkedUsername, count: realSanctions.length, lastAction: realSanctions[realSanctions.length - 1] });
  }
  if(sanctionedLinked.length === 0){ el.innerHTML = ''; return; }
  el.innerHTML = '<div class="card" style="border-color:var(--coral);"><p style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--coral);">⚠️ Récidive potentielle détectée</p>' +
    '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">Ce compte partage le même appareil que '+sanctionedLinked.length+' compte(s) ayant déjà été sanctionné(s) :</p>' +
    sanctionedLinked.map(s => '<p style="margin:0 0 4px; font-size:12px;">@'+escapeHtml(s.username)+' — '+s.count+' sanction(s), dernière : '+(s.lastAction.action === 'banned' ? 'banni' : 'suspendu')+' le '+new Date(s.lastAction.createdAt).toLocaleDateString('fr-FR')+'</p>').join('') +
    '</div>';
}
async function renderShadowBanToggle(){
  const btn = document.getElementById('shadow-ban-toggle-btn');
  if(!btn || !currentUserDetailTarget) return;
  const list = (await safeGet('settings:shadowbannedusers', true)) || [];
  const isShadowBanned = list.includes(currentUserDetailTarget);
  btn.textContent = isShadowBanned ? '▶️ Retirer la visibilité réduite' : '👻 Activer la visibilité réduite';
  btn.style.borderColor = isShadowBanned ? 'var(--coral)' : '';
  btn.style.color = isShadowBanned ? 'var(--coral)' : '';
}
async function toggleShadowBan(){
  if(!currentUserDetailTarget) return;
  const list = (await safeGet('settings:shadowbannedusers', true)) || [];
  const isShadowBanned = list.includes(currentUserDetailTarget);
  if(!confirm((isShadowBanned ? 'Retirer' : 'Activer') + ' la visibilité réduite pour @' + currentUserDetailTarget + ' ?')) return;
  const newList = isShadowBanned ? list.filter(u => u !== currentUserDetailTarget) : [...list, currentUserDetailTarget];
  await saveWithRetry('settings:shadowbannedusers', newList, true);
  showToast('Visibilité réduite ' + (isShadowBanned ? 'retirée' : 'activée') + ' ✓');
  await logAdminAction(isShadowBanned ? 'Visibilité réduite retirée' : 'Visibilité réduite activée', '@' + currentUserDetailTarget);
  await renderShadowBanToggle();
}
async function issueStrike(){
  if(!currentUserDetailTarget) return;
  const reason = prompt('Motif du strike pour @' + currentUserDetailTarget + ' (visible par cette personne) :');
  if(reason === null || !reason.trim()) return;
  const existingStrikes = await fetchUserStrikes(currentUserDetailTarget);
  const strikeNumber = existingStrikes.length + 1;
  const id = 'strike_' + Date.now();
  await saveWithRetry('userstrike:' + currentUserDetailTarget + '__' + id, {
    id, reason: reason.trim(), strikeNumber, createdAt: new Date().toISOString()
  }, true);
  let escalationMessage;
  if(strikeNumber === 1){
    escalationMessage = '1er strike — avertissement formel.';
    await createNotification(currentUserDetailTarget, 'strike_issued', 'Suktum', null, '1er strike : ' + reason.trim());
  } else if(strikeNumber === 2){
    const u = (await safeGet('user:' + currentUserDetailTarget, true)) || {username: currentUserDetailTarget, createdAt: new Date().toISOString()};
    u.status = 'suspended';
    u.suspendedUntil = null;
    if(!u.suspensionHistory) u.suspensionHistory = [];
    u.suspensionHistory.push({ action: 'suspended', by: 'Suktum (automatique — 2e strike)', reason: reason.trim(), durationDays: null, createdAt: new Date().toISOString() });
    await saveWithRetry('user:' + currentUserDetailTarget, u, true);
    escalationMessage = '2e strike — compte automatiquement suspendu.';
    await createNotification(currentUserDetailTarget, 'strike_issued', 'Suktum', null, '2e strike (compte suspendu) : ' + reason.trim());
  } else {
    const u = (await safeGet('user:' + currentUserDetailTarget, true)) || {username: currentUserDetailTarget, createdAt: new Date().toISOString()};
    u.status = 'banned';
    if(!u.suspensionHistory) u.suspensionHistory = [];
    u.suspensionHistory.push({ action: 'banned', by: 'Suktum (automatique — ' + strikeNumber + 'e strike)', reason: reason.trim(), durationDays: null, createdAt: new Date().toISOString() });
    await saveWithRetry('user:' + currentUserDetailTarget, u, true);
    escalationMessage = strikeNumber + 'e strike — compte automatiquement banni.';
    await createNotification(currentUserDetailTarget, 'strike_issued', 'Suktum', null, strikeNumber + 'e strike (compte banni) : ' + reason.trim());
  }
  showToast('Strike enregistré ✓ — ' + escalationMessage);
  await logAdminAction('Strike donné (' + escalationMessage + ')', '@' + currentUserDetailTarget + ' — ' + reason.trim().slice(0,60));
  await openUserDetail(currentUserDetailTarget);
}
async function renderUserStrikeInfo(){
  const countEl = document.getElementById('user-strike-count');
  const historyEl = document.getElementById('user-strike-history');
  if(!countEl || !currentUserDetailTarget) return;
  const strikes = await fetchUserStrikes(currentUserDetailTarget);
  countEl.textContent = strikes.length === 0 ? 'Aucun strike pour l’instant.' : strikes.length + ' strike(s) — prochain strike entraînera ' + (strikes.length + 1 === 2 ? 'une suspension automatique' : strikes.length + 1 >= 3 ? 'un bannissement automatique' : 'un avertissement');
  historyEl.innerHTML = strikes.map(s =>
    '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">Strike '+s.strikeNumber+' — '+escapeHtml(s.reason)+' ('+new Date(s.createdAt).toLocaleDateString('fr-FR')+')</p>'
  ).join('');
}
async function warnUserAccount(){
  if(!currentUserDetailTarget) return;
  const reason = prompt('Motif de l’avertissement envoyé à @' + currentUserDetailTarget + ' (visible par cette personne) :');
  if(reason === null || !reason.trim()) return;
  const u = (await safeGet('user:' + currentUserDetailTarget, true)) || {username: currentUserDetailTarget, createdAt: new Date().toISOString()};
  if(!u.warnings) u.warnings = [];
  u.warnings.push({reason: reason.trim(), createdAt: new Date().toISOString()});
  await saveWithRetry('user:' + currentUserDetailTarget, u, true);
  await createNotification(currentUserDetailTarget, 'warning', 'Suktum', null, reason.trim());
  showToast('Avertissement envoyé ✓');
  await logAdminAction('Avertissement envoyé', '@' + currentUserDetailTarget + ' — ' + reason.trim().slice(0, 60));
  await openUserDetail(currentUserDetailTarget);
}
async function toggleShopSuspension(suspend){
  if(!currentUserDetailTarget) return;
  const u = (await safeGet('user:' + currentUserDetailTarget, true)) || {username: currentUserDetailTarget, createdAt: new Date().toISOString()};
  u.shopSuspended = suspend;
  await saveWithRetry('user:' + currentUserDetailTarget, u, true);
  showToast(suspend ? 'Boutique suspendue ✓' : 'Boutique réactivée ✓');
  await logAdminAction(suspend ? 'Boutique suspendue' : 'Boutique réactivée', '@' + currentUserDetailTarget);
  await openUserDetail(currentUserDetailTarget);
}
async function setUserStatus(status){
  if(!currentUserDetailTarget) return;
  const u = (await safeGet('user:' + currentUserDetailTarget, true)) || {username: currentUserDetailTarget, createdAt: new Date().toISOString()};
  if(status === 'active' && u.status === 'banned'){
    const justification = prompt('Déblocage forcé d’un compte banni — ceci est un passe-droit exceptionnel qui sera consigné. Expliquez le motif (30 caractères minimum) :');
    if(justification === null) return;
    const category = prompt('Catégorie du motif : Urgence technique, Réquisition administrative, ou Erreur système / Bug ?') || 'Non précisé';
    const logged = await logPrivilegeException('Déblocage forcé d’un utilisateur banni', currentUserDetailTarget, category, justification);
    if(!logged) return;
  }
  u.status = status;
  await saveWithRetry('user:' + currentUserDetailTarget, u, true);
  showToast('Statut mis à jour ✓');
  await logAdminAction('Statut du compte changé (' + status + ')', '@' + currentUserDetailTarget);
  if(status === 'banned' || status === 'suspended'){
    const theirLives = (await fetchLives()).filter(l => l.username === currentUserDetailTarget && (l.status === 'approved' || l.status === 'pending' || l.status === 'scheduled'));
    for(const l of theirLives){
      await window.storage.delete('live:' + l.id, true).catch(() => {});
    }
    if(theirLives.length > 0){
      await logAdminAction('Sanction croisée : ' + theirLives.length + ' live(s) fermé(s) suite à la sanction', '@' + currentUserDetailTarget);
    }
  }
  if(status === 'banned'){
    const linked = await findLinkedAccounts(currentUserDetailTarget);
    const activeLinked = [];
    for(const other of linked){
      const ou = await safeGet('user:' + other, true);
      if(ou && ou.status !== 'banned') activeLinked.push(other);
    }
    if(activeLinked.length > 0){
      alert('⚠️ @' + currentUserDetailTarget + ' a d’autres comptes actifs sur le même appareil : ' + activeLinked.map(a => '@'+a).join(', ') + '.\n\nVérifiez-les pour éviter un contournement de ce bannissement.');
    }
  }
  await openUserDetail(currentUserDetailTarget);
}
async function deleteUserAccount(){
  if(!currentUserDetailTarget) return;
  const ok = confirm('Supprimer définitivement le compte @' + currentUserDetailTarget + ' et toutes ses publications ?');
  if(!ok) return;
  const u = await safeGet('user:' + currentUserDetailTarget, true).catch(() => null);
  const note = await safeGet('sellerinternalnote:' + currentUserDetailTarget, true).catch(() => null);
  await saveWithRetry('accountarchive:' + currentUserDetailTarget, {
    username: currentUserDetailTarget, kycStatus: u ? u.kycStatus : null, kycFullName: u ? u.kycFullName : null, kycVerifiedAt: u ? u.kycVerifiedAt : null,
    phone: u ? u.phone : null, country: u ? u.country : null, googleEmail: u ? u.googleEmail : null,
    accountCreatedAt: u ? u.createdAt : null, internalNote: note ? note.text : null,
    archivedAt: new Date().toISOString(), archivedBy: currentUser
  }, true);
  await window.storage.delete('user:' + currentUserDetailTarget, true).catch(() => {});
  const posts = (await fetchPosts()).filter(p => p.userId === currentUserDetailTarget);
  for(const p of posts){ await window.storage.delete('post:' + p.id, true).catch(() => {}); }
  await window.storage.delete('sellerinternalnote:' + currentUserDetailTarget, true).catch(() => {});
  const blockedCommentKeysTarget = await safeList('autoblockedcomment:', true);
  for(const k of blockedCommentKeysTarget){ const b = await safeGet(k, true).catch(() => null); if(b && b.username === currentUserDetailTarget) await window.storage.delete(k, true).catch(() => {}); }
  await cleanupFollowSourceRecords(currentUserDetailTarget);
  showToast('Compte supprimé — archive de preuve conservée');
  await logAdminAction('Compte supprimé — archive de preuve créée', '@' + currentUserDetailTarget);
  go('admin');
}

/* ---------- FONCTIONNALITÉS & CONFIGURATION GLOBALE ---------- */
const FEATURE_LIST = [
  {key: 'shop', label: '🛍️ Boutique'},
  {key: 'messages', label: '✉️ Messages'},
  {key: 'publish', label: '➕ Publication'},
  {key: 'comments', label: '💬 Commentaires'}
];
async function getFeatureFlags(){
  return (await safeGet('settings:features', true)) || {};
}
async function loadFeatureTogglesUI(){
  const flags = await getFeatureFlags();
  const el = document.getElementById('admin-feature-toggles');
  el.innerHTML = FEATURE_LIST.map(f => {
    const enabled = flags[f.key] !== false;
    return '<div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--line);">' +
      '<span style="font-size:13.5px;">'+f.label+'</span>' +
      '<label class="switch" style="position:relative; display:inline-block; width:42px; height:24px;">' +
      '<input type="checkbox" '+(enabled?'checked':'')+' onchange="toggleFeature(\''+f.key+'\', this.checked)" style="opacity:0; width:0; height:0;">' +
      '<span style="position:absolute; inset:0; background:'+(enabled?'var(--lagoon)':'rgba(245,239,227,0.2)')+'; border-radius:30px; transition:.2s;"></span>' +
      '</label></div>';
  }).join('');
}
async function toggleFeature(key, value){
  const flags = await getFeatureFlags();
  flags[key] = value;
  await saveWithRetry('settings:features', flags, true);
  showToast('Réglage enregistré ✓');
  await loadFeatureTogglesUI();
  await applyFeatureFlags();
}
async function applyFeatureFlags(){
  const flags = await getFeatureFlags();
  const shopTab = document.querySelector('#screen-feed button[onclick="go(\'shop\')"]');
  if(shopTab) shopTab.style.display = flags.shop === false ? 'none' : '';
  const messagesTab = document.querySelector('.tab[data-screen="messages"]');
  if(messagesTab) messagesTab.style.display = flags.messages === false ? 'none' : '';
  const publishTab = document.querySelector('.tab[data-screen="publish"]');
  if(publishTab) publishTab.style.display = flags.publish === false ? 'none' : '';
}

/* ---------- ANNONCES ---------- */
async function previewSystemUpdateNotifCount(){
  const el = document.getElementById('system-update-notif-preview');
  if(!el) return;
  const allUsers = await fetchUsers();
  el.textContent = allUsers.length + ' utilisateur(s) réel(s) recevront cette notification.';
}
async function scheduleSystemUpdateNotification(){
  const text = document.getElementById('system-update-notif-text').value.trim();
  const scheduleRaw = document.getElementById('system-update-notif-schedule').value;
  if(!text){ showToast('Écrivez un texte avant de programmer'); return; }
  if(!scheduleRaw){ showToast('Choisissez une date et une heure'); return; }
  const scheduledFor = new Date(scheduleRaw);
  if(scheduledFor <= new Date()){ showToast('Choisissez une date dans le futur'); return; }
  const id = 'scheduledsystemnotif_' + Date.now();
  await saveWithRetry('scheduledsystemnotif:' + id, {
    id, text: text.slice(0,300), scheduledFor: scheduledFor.toISOString(), scheduledBy: currentUser, sent: false, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('system-update-notif-text').value = '';
  document.getElementById('system-update-notif-schedule').value = '';
  showToast('Notification programmée ✓');
  await renderScheduledSystemNotifications();
}
async function cancelScheduledSystemNotification(id){
  await window.storage.delete('scheduledsystemnotif:' + id, true).catch(() => {});
  showToast('Envoi programmé annulé');
  await renderScheduledSystemNotifications();
}
async function renderScheduledSystemNotifications(){
  const el = document.getElementById('system-update-scheduled-list');
  if(!el) return;
  const keys = await safeList('scheduledsystemnotif:', true);
  const scheduled = [];
  for(const k of keys){ const s = await safeGet(k, true).catch(() => null); if(s && !s.sent) scheduled.push(s); }
  scheduled.sort((a,b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  el.innerHTML = scheduled.length === 0 ? '<div class="empty">Aucun envoi programmé pour l’instant.</div>' :
    scheduled.map(s => '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(s.text)+'</p><p style="margin:0 0 8px; font-size:11px; color:var(--gold);">📅 '+new Date(s.scheduledFor).toLocaleString('fr-FR')+'</p><span onclick="cancelScheduledSystemNotification(\''+s.id+'\')" style="color:var(--coral); font-size:11px; cursor:pointer;">✕ Annuler</span></div>').join('');
}
async function checkScheduledSystemNotifications(){
  const keys = await safeList('scheduledsystemnotif:', true);
  const now = new Date();
  for(const k of keys){
    const s = await safeGet(k, true).catch(() => null);
    if(!s || s.sent || new Date(s.scheduledFor) > now) continue;
    s.sent = true;
    await saveWithRetry(k, s, true);
    const allUsers = await fetchUsers();
    let sentCount = 0;
    for(const u of allUsers){
      if(u.username === s.scheduledBy) continue;
      await createNotification(u.username, 'system_update', s.scheduledBy, null, s.text);
      sentCount++;
    }
    await saveWithRetry('systemupdatelog:' + Date.now(), {
      text: s.text, sentBy: s.scheduledBy, recipientCount: sentCount, sentAt: new Date().toISOString(), wasScheduled: true
    }, true);
  }
}
async function sendSystemUpdateNotification(){
  const text = document.getElementById('system-update-notif-text').value.trim();
  if(!text){ showToast('Écrivez un texte avant d’envoyer'); return; }
  const allUsers = await fetchUsers();
  if(allUsers.length === 0){ showToast('Aucun utilisateur pour l’instant'); return; }
  if(!confirm('Envoyer cette notification à ' + allUsers.length + ' utilisateur(s) réel(s) ? Cette action est irréversible.')) return;
  showToast('Envoi en cours...');
  let sentCount = 0;
  for(const u of allUsers){
    if(u.username === currentUser) continue;
    await createNotification(u.username, 'system_update', currentUser, null, text.slice(0,300));
    sentCount++;
  }
  await saveWithRetry('systemupdatelog:' + Date.now(), {
    text: text.slice(0,300), sentBy: currentUser, recipientCount: sentCount, sentAt: new Date().toISOString()
  }, true);
  document.getElementById('system-update-notif-text').value = '';
  await previewSystemUpdateNotifCount();
  await renderSystemUpdateHistory();
  await logAdminAction('Notification de mise à jour envoyée à tous les utilisateurs', text.slice(0,300));
  showToast('Notification envoyée à ' + sentCount + ' utilisateur(s) ✓');
}
async function renderSystemUpdateHistory(){
  const el = document.getElementById('system-update-history-list');
  if(!el) return;
  const keys = await safeList('systemupdatelog:', true);
  const logs = [];
  for(const k of keys){ const l = await safeGet(k, true).catch(() => null); if(l) logs.push(l); }
  logs.sort((a,b) => new Date(b.sentAt) - new Date(a.sentAt));
  el.innerHTML = logs.length === 0 ? '<div class="empty">Aucune notification système envoyée pour l’instant.</div>' :
    logs.slice(0,30).map(l => '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:12.5px;">'+escapeHtml(l.text)+'</p><p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">Envoyée à '+l.recipientCount+' utilisateur(s) le '+new Date(l.sentAt).toLocaleString('fr-FR')+' par @'+escapeHtml(l.sentBy)+'</p></div>').join('');
}
async function saveAnnouncement(active){
  const text = document.getElementById('admin-announcement-text').value.trim();
  if(active && !text){ showToast('Écrivez un texte avant de publier'); return; }
  await saveWithRetry('settings:announcement', {active, text}, true);
  showToast(active ? 'Annonce publiée ✓' : 'Annonce retirée');
  await checkAnnouncementBanner();
}
let currentZoneDetailCity = null;
async function renderAboutSuktum(){
  document.getElementById('about-suktum-logo').src = effectivePlatformLogo;
  const bio = await safeGet('settings:platformBio', true).catch(() => null);
  document.getElementById('about-suktum-bio').textContent = bio || 'Suktum ⛵ — notre pirogue, notre réseau.';
  const links = (await safeGet('settings:platformSocialLinks', true).catch(() => null)) || {};
  const networkIcons = { website: '🌐', instagram: '📸', facebook: '👥', tiktok: '🎵', youtube: '▶️', x: '✖️', whatsapp: '💬' };
  const linksEl = document.getElementById('about-suktum-links');
  const activeLinks = Object.keys(networkIcons).filter(n => links[n]);
  if(activeLinks.length === 0){
    linksEl.innerHTML = '';
  } else {
    linksEl.innerHTML = activeLinks.map(n => {
      const href = n === 'whatsapp' ? 'https://wa.me/' + links[n].replace(/[^0-9+]/g, '').replace('+', '') : links[n];
      return '<a href="'+escapeHtml(href)+'" target="_blank" style="display:flex; align-items:center; justify-content:center; width:44px; height:44px; border-radius:50%; background:rgba(245,239,227,0.1); text-decoration:none; font-size:20px;">'+networkIcons[n]+'</a>';
    }).join('');
  }
}
async function createSupplierPartnership(){
  if(!isGenuineOwnerSession) return;
  const name = document.getElementById('new-supplier-name').value.trim();
  const type = document.getElementById('new-supplier-type').value;
  const contact = document.getElementById('new-supplier-contact').value.trim();
  const notes = document.getElementById('new-supplier-notes').value.trim();
  if(!name){ showToast('Renseignez au moins le nom du prestataire'); return; }
  const id = 'supplier_' + Date.now();
  await saveWithRetry('supplierpartnership:' + id, {
    id, name, type, contact, notes,
    status: 'contacted', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-supplier-name').value = '';
  document.getElementById('new-supplier-contact').value = '';
  document.getElementById('new-supplier-notes').value = '';
  showToast('Prestataire ajouté ✓');
  await renderSupplierPartnerships();
}
async function advanceSupplierPartnershipStatus(id){
  if(!isGenuineOwnerSession) return;
  const p = await safeGet('supplierpartnership:' + id, true);
  if(!p) return;
  const progression = ['contacted', 'negotiating', 'active', 'completed'];
  const currentIndex = progression.indexOf(p.status);
  if(currentIndex === progression.length - 1){ showToast('Ce partenariat est déjà terminé'); return; }
  p.status = progression[currentIndex + 1];
  await saveWithRetry('supplierpartnership:' + id, p, true);
  showToast('Statut mis à jour : ' + p.status);
  await renderSupplierPartnerships();
}
async function renderSupplierPartnerships(){
  const el = document.getElementById('supplier-partnerships-list');
  if(!el) return;
  const filter = document.getElementById('supplier-status-filter').value;
  const keys = await safeList('supplierpartnership:', true);
  let partnerships = [];
  for(const k of keys){ const p = await safeGet(k, true).catch(() => null); if(p) partnerships.push(p); }
  if(filter !== 'all') partnerships = partnerships.filter(p => p.status === filter);
  partnerships.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(partnerships.length === 0){ el.innerHTML = '<div class="empty">Aucun prestataire pour l’instant.</div>'; return; }
  const statusLabels = { contacted: '📨 Contacté', negotiating: '💬 En négociation', active: '🚀 Actif', completed: '✅ Terminé' };
  const statusColors = { contacted: 'rgba(245,239,227,0.6)', negotiating: 'var(--gold)', active: 'var(--lagoon)', completed: 'var(--coral)' };
  el.innerHTML = partnerships.map(p =>
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(p.name)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">🏷️ '+escapeHtml(p.type)+'</p>' +
    (p.contact ? '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">📞 '+escapeHtml(p.contact)+'</p>' : '') +
    (p.notes ? '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">📝 '+escapeHtml(p.notes)+'</p>' : '') +
    '<p style="margin:0 0 8px; font-size:12px; color:'+statusColors[p.status]+';">'+statusLabels[p.status]+'</p>' +
    (p.status !== 'completed' ? '<button class="btn btn-outline btn-sm" onclick="advanceSupplierPartnershipStatus(\''+p.id+'\')">Passer à l’étape suivante</button>' : '') +
    '</div>'
  ).join('');
}
async function createCreatorPartnership(){
  if(!isGenuineOwnerSession) return;
  const creator = document.getElementById('new-partnership-creator').value.trim().replace(/^@/, '');
  const objective = document.getElementById('new-partnership-objective').value.trim();
  const deliverables = document.getElementById('new-partnership-deliverables').value.trim();
  const compensation = document.getElementById('new-partnership-compensation').value.trim();
  if(!creator || !objective){ showToast('Renseignez au moins le créateur et l’objectif'); return; }
  const id = 'partnership_' + Date.now();
  await saveWithRetry('partnership:' + id, {
    id, creatorUsername: creator, objective, deliverables, compensation,
    status: 'contacted', createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-partnership-creator').value = '';
  document.getElementById('new-partnership-objective').value = '';
  document.getElementById('new-partnership-deliverables').value = '';
  document.getElementById('new-partnership-compensation').value = '';
  showToast('Partenariat ajouté ✓');
  await renderCreatorPartnerships();
}
async function advanceCreatorPartnershipStatus(id){
  if(!isGenuineOwnerSession) return;
  const p = await safeGet('partnership:' + id, true);
  if(!p) return;
  const progression = ['contacted', 'negotiating', 'active', 'completed'];
  const currentIndex = progression.indexOf(p.status);
  if(currentIndex === progression.length - 1){ showToast('Ce partenariat est déjà terminé'); return; }
  p.status = progression[currentIndex + 1];
  await saveWithRetry('partnership:' + id, p, true);
  showToast('Statut mis à jour : ' + p.status);
  await renderCreatorPartnerships();
}
async function renderCreatorPartnerships(){
  const el = document.getElementById('creator-partnerships-list');
  if(!el) return;
  const filter = document.getElementById('partnership-status-filter').value;
  const keys = await safeList('partnership:', true);
  let partnerships = [];
  for(const k of keys){ const p = await safeGet(k, true).catch(() => null); if(p) partnerships.push(p); }
  if(filter !== 'all') partnerships = partnerships.filter(p => p.status === filter);
  partnerships.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(partnerships.length === 0){ el.innerHTML = '<div class="empty">Aucun partenariat pour l’instant.</div>'; return; }
  const statusLabels = { contacted: '📨 Contacté', negotiating: '💬 En négociation', active: '🚀 Actif', completed: '✅ Terminé' };
  const statusColors = { contacted: 'rgba(245,239,227,0.6)', negotiating: 'var(--gold)', active: 'var(--lagoon)', completed: 'var(--coral)' };
  el.innerHTML = partnerships.map(p =>
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">@'+escapeHtml(p.creatorUsername)+'</p>' +
    '<p style="margin:0 0 4px; font-size:12.5px;">🎯 '+escapeHtml(p.objective)+'</p>' +
    (p.deliverables ? '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">📦 '+escapeHtml(p.deliverables)+'</p>' : '') +
    (p.compensation ? '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">💰 '+escapeHtml(p.compensation)+'</p>' : '') +
    '<p style="margin:0 0 8px; font-size:12px; color:'+statusColors[p.status]+';">'+statusLabels[p.status]+'</p>' +
    (p.status !== 'completed' ? '<button class="btn btn-outline btn-sm" onclick="advanceCreatorPartnershipStatus(\''+p.id+'\')">Passer à l’étape suivante</button>' : '') +
    '</div>'
  ).join('');
}
async function renderPlatformIdentitySettings(){
  document.getElementById('platform-identity-logo-preview').src = effectivePlatformLogo;
  const bio = await safeGet('settings:platformBio', true).catch(() => null);
  document.getElementById('platform-identity-bio-input').value = bio || '';
  const links = (await safeGet('settings:platformSocialLinks', true).catch(() => null)) || {};
  document.getElementById('platform-identity-link-website').value = links.website || '';
  document.getElementById('platform-identity-link-instagram').value = links.instagram || '';
  document.getElementById('platform-identity-link-facebook').value = links.facebook || '';
  document.getElementById('platform-identity-link-tiktok').value = links.tiktok || '';
  document.getElementById('platform-identity-link-youtube').value = links.youtube || '';
  document.getElementById('platform-identity-link-x').value = links.x || '';
  document.getElementById('platform-identity-link-whatsapp').value = links.whatsapp || '';
}
async function savePlatformLogo(){
  if(!isGenuineOwnerSession) return;
  const file = document.getElementById('platform-identity-logo-input').files[0];
  if(!file){ showToast('Choisissez une image'); return; }
  const dataUrl = await readFileAsDataURL(file);
  effectivePlatformLogo = dataUrl;
  await saveWithRetry('settings:platformLogo', dataUrl, true);
  document.getElementById('platform-identity-logo-preview').src = dataUrl;
  const adminHeaderLogo = document.getElementById('admin-header-logo');
  if(adminHeaderLogo) adminHeaderLogo.src = dataUrl;
  showToast('Logo mis à jour ✓ — visible partout dans l’application');
}
async function resetPlatformLogo(){
  if(!isGenuineOwnerSession) return;
  effectivePlatformLogo = PIROGUE_LOGO_DATAURL;
  await window.storage.delete('settings:platformLogo', true).catch(() => {});
  document.getElementById('platform-identity-logo-preview').src = effectivePlatformLogo;
  const adminHeaderLogo = document.getElementById('admin-header-logo');
  if(adminHeaderLogo) adminHeaderLogo.src = effectivePlatformLogo;
  showToast('Logo par défaut restauré ✓');
}
async function savePlatformIdentityText(){
  if(!isGenuineOwnerSession) return;
  const bio = document.getElementById('platform-identity-bio-input').value.trim();
  const links = {
    website: document.getElementById('platform-identity-link-website').value.trim() || null,
    instagram: document.getElementById('platform-identity-link-instagram').value.trim() || null,
    facebook: document.getElementById('platform-identity-link-facebook').value.trim() || null,
    tiktok: document.getElementById('platform-identity-link-tiktok').value.trim() || null,
    youtube: document.getElementById('platform-identity-link-youtube').value.trim() || null,
    x: document.getElementById('platform-identity-link-x').value.trim() || null,
    whatsapp: document.getElementById('platform-identity-link-whatsapp').value.trim() || null
  };
  await saveWithRetry('settings:platformBio', bio, true);
  await saveWithRetry('settings:platformSocialLinks', links, true);
  showToast('Identité mise à jour ✓');
}
async function renderAudienceDemographics(){
  const ageEl = document.getElementById('demographics-age-breakdown');
  const genderEl = document.getElementById('demographics-gender-breakdown');
  if(!ageEl || !genderEl) return;
  const users = await fetchUsers();
  const ageCounts = {};
  let ageKnownCount = 0;
  users.forEach(u => { if(u.ageBracket){ ageCounts[u.ageBracket] = (ageCounts[u.ageBracket] || 0) + 1; ageKnownCount++; } });
  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'];
  if(ageKnownCount === 0){
    ageEl.innerHTML = '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.5);">Aucune donnée pour l’instant — cette tranche est enregistrée uniquement pour les comptes créés après l’activation de cette fonctionnalité.</p>';
  } else {
    ageEl.innerHTML = ageOrder.filter(a => ageCounts[a]).map(a => {
      const pct = Math.round(ageCounts[a] / ageKnownCount * 100);
      return '<p style="margin:0 0 6px; font-size:13px;">'+a+' ans : <strong>'+ageCounts[a]+'</strong> ('+pct+'%)</p>';
    }).join('') + '<p style="margin:10px 0 0; font-size:11px; color:rgba(245,239,227,0.5); border-top:1px solid var(--line); padding-top:8px;">'+ageKnownCount+' compte(s) sur '+users.length+' au total renseigné(s)</p>';
  }
  const genderCounts = {};
  let genderKnownCount = 0;
  users.forEach(u => { if(u.gender){ genderCounts[u.gender] = (genderCounts[u.gender] || 0) + 1; genderKnownCount++; } });
  if(genderKnownCount === 0){
    genderEl.innerHTML = '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.5);">Aucune donnée pour l’instant — ce champ est entièrement facultatif, aucun compte ne l’a encore renseigné.</p>';
  } else {
    genderEl.innerHTML = Object.keys(genderCounts).map(g => {
      const pct = Math.round(genderCounts[g] / genderKnownCount * 100);
      return '<p style="margin:0 0 6px; font-size:13px;">'+escapeHtml(g)+' : <strong>'+genderCounts[g]+'</strong> ('+pct+'%)</p>';
    }).join('') + '<p style="margin:10px 0 0; font-size:11px; color:rgba(245,239,227,0.5); border-top:1px solid var(--line); padding-top:8px;">'+genderKnownCount+' compte(s) sur '+users.length+' au total renseigné(s)</p>';
  }
}
async function renderAdminServiceCalendar(){
  const el = document.getElementById('admin-service-calendar-list');
  if(!el) return;
  const filter = document.getElementById('admin-booking-filter').value;
  const keys = await safeList('servicebooking:', true);
  let bookings = [];
  for(const k of keys){ const b = await safeGet(k, true).catch(() => null); if(b) bookings.push(b); }
  if(filter === 'upcoming') bookings = bookings.filter(b => new Date(b.slot) >= new Date());
  bookings.sort((a,b) => new Date(a.slot) - new Date(b.slot));
  if(bookings.length === 0){ el.innerHTML = '<div class="empty">Aucune réservation pour l’instant.</div>'; return; }
  el.innerHTML = bookings.map(b => {
    const statusLabel = b.status === 'confirmed' ? '✓ Confirmée' : b.status === 'cancelled' ? '✕ Annulée' : '⏳ ' + b.status;
    const statusColor = b.status === 'confirmed' ? 'var(--lagoon)' : b.status === 'cancelled' ? 'var(--coral)' : 'var(--gold)';
    return '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(b.productName)+'</p>' +
      '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">@'+escapeHtml(b.sellerUsername)+' ↔ @'+escapeHtml(b.buyerUsername)+'</p>' +
      '<p style="margin:0 0 4px; font-size:12.5px;">🕒 '+new Date(b.slot).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})+' à '+new Date(b.slot).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</p>' +
      '<p style="margin:0; font-size:12px; color:'+statusColor+';">'+statusLabel+'</p></div>';
  }).join('');
}
async function renderAdminMediaLibrary(){
  const listEl = document.getElementById('media-library-list');
  const countEl = document.getElementById('media-library-count');
  if(!listEl) return;
  const sortBy = document.getElementById('media-library-sort').value;
  const formatFilter = document.getElementById('media-library-format').value;
  const statusFilter = document.getElementById('media-library-status').value;
  let posts = (await fetchPosts(true)).filter(p => p.type === 'video' || p.type === 'image');
  if(formatFilter !== 'all') posts = posts.filter(p => p.type === formatFilter);
  if(statusFilter !== 'all') posts = posts.filter(p => p.status === statusFilter);
  if(sortBy === 'popularity'){
    posts.sort((a,b) => ((b.views||0) + (b.likes||[]).length*3) - ((a.views||0) + (a.likes||[]).length*3));
  } else {
    posts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  countEl.textContent = posts.length + ' média(s)';
  if(posts.length === 0){ listEl.innerHTML = '<div class="empty">Aucun média ne correspond à ces filtres.</div>'; return; }
  listEl.innerHTML = posts.map(p => {
    const thumb = p.type === 'video' ? '<video src="'+p.data+'" muted style="width:60px; height:60px; object-fit:cover; border-radius:8px; flex-shrink:0;"></video>' : '<img src="'+p.data+'" style="width:60px; height:60px; object-fit:cover; border-radius:8px; flex-shrink:0;">';
    const statusLabel = p.status === 'scheduled' ? '⏳ Programmée' : '✓ Publiée';
    return '<div class="card" style="display:flex; gap:10px; align-items:center; margin-bottom:8px; cursor:pointer;" onclick="openSinglePostView(\''+p.id+'\')">' + thumb +
      '<div style="flex:1; min-width:0;"><p style="margin:0 0 2px; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@'+escapeHtml(p.userId)+' — '+escapeHtml((p.caption||'').slice(0,40))+'</p>' +
      '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5);">'+statusLabel+' · 👁️ '+(p.views||0)+' · ❤️ '+(p.likes||[]).length+'</p></div></div>';
  }).join('');
}
async function renderAdminTrendingSounds(){
  const el = document.getElementById('admin-trending-sounds-list');
  if(!el) return;
  const sounds = await fetchSounds();
  const top = sounds.slice(0, 10);
  if(top.length === 0){ el.innerHTML = '<div class="empty">Aucun son partagé pour l’instant.</div>'; return; }
  el.innerHTML = top.map((s,i) =>
    '<div class="card" style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">' +
    '<span style="font-size:15px; font-family:\'Baloo 2\'; color:var(--gold); width:20px;">'+(i+1)+'</span>' +
    '<div style="flex:1;"><p style="margin:0; font-size:13px;">'+escapeHtml(s.name)+(s.artist ? ' — 🎤 '+escapeHtml(s.artist) : '')+'</p>' +
    '<p style="margin:2px 0 0; font-size:11px; color:rgba(245,239,227,0.5);">'+(s.usageCount||0)+' utilisation(s)</p></div>' +
    '<button class="btn btn-outline btn-sm" onclick="toggleFeaturedSound(\''+s.id+'\')">'+(s.featuredOnHome ? '✓ En avant' : 'Mettre en avant')+'</button>' +
    '</div>'
  ).join('');
}
async function toggleFeaturedSound(soundId){
  const s = await safeGet('sound:' + soundId, true);
  if(!s) return;
  s.featuredOnHome = !s.featuredOnHome;
  await saveWithRetry('sound:' + soundId, s, true);
  showToast(s.featuredOnHome ? 'Son mis en avant sur l’accueil ✓' : 'Retiré de la mise en avant');
  await logAdminAction('Son ' + (s.featuredOnHome ? 'mis en avant' : 'retiré de la mise en avant'), s.name);
  await renderAdminTrendingSounds();
}
async function renderAdminRoyaltyTracking(){
  const el = document.getElementById('admin-royalty-tracking-list');
  if(!el) return;
  const rate = (await safeGet('settings:soundRoyaltyRatePerListen', true)) || 0;
  const sounds = await fetchSounds();
  const withArtist = sounds.filter(s => s.artist);
  if(withArtist.length === 0){ el.innerHTML = '<div class="empty">Aucun son avec artiste renseigné pour l’instant.</div>'; return; }
  const byArtist = {};
  withArtist.forEach(s => {
    if(!byArtist[s.artist]) byArtist[s.artist] = { totalUsage: 0, sounds: [] };
    byArtist[s.artist].totalUsage += (s.usageCount || 0);
    byArtist[s.artist].sounds.push(s.name);
  });
  el.innerHTML = '<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">' +
    '<label style="margin:0; font-size:12px; white-space:nowrap;">FCFA / écoute :</label>' +
    '<input type="number" id="royalty-rate-input" value="'+rate+'" style="margin:0; flex:1;" onchange="saveRoyaltyRate()">' +
    '</div>' +
    Object.entries(byArtist).sort((a,b) => b[1].totalUsage - a[1].totalUsage).map(([artist, data]) =>
      '<div class="card" style="margin-bottom:6px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">🎤 '+escapeHtml(artist)+'</p>' +
      '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">'+data.sounds.length+' son(s) · '+data.totalUsage+' utilisation(s) au total</p>' +
      '<p style="margin:0; font-size:14px; color:var(--gold); font-weight:600;">≈ '+(data.totalUsage * rate).toLocaleString('fr-FR')+' FCFA (indicatif)</p></div>'
    ).join('');
}
async function saveRoyaltyRate(){
  const rate = parseFloat(document.getElementById('royalty-rate-input').value) || 0;
  await saveWithRetry('settings:soundRoyaltyRatePerListen', rate, true);
  showToast('Taux mis à jour ✓');
  await renderAdminRoyaltyTracking();
}
async function renderSfxLibrary(){
  const el = document.getElementById('sfx-library-list');
  if(!el) return;
  const keys = await safeList('sfx:', true);
  const items = [];
  for(const k of keys){ const s = await safeGet(k, true).catch(() => null); if(s) items.push(s); }
  items.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = items.length === 0 ? '<div class="empty">Aucun son pour l’instant.</div>' : items.map(s =>
    '<div class="card" style="margin-bottom:8px; display:flex; align-items:center; gap:10px;"><p style="margin:0; font-size:13px; flex:1;">'+(s.category === 'ambiance' ? '🎵' : s.category === 'trending' ? '🔥' : '🔔')+' '+escapeHtml(s.name)+'</p>' +
    '<audio controls style="width:120px; height:32px;" src="'+s.audioData+'"></audio>' +
    '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="deleteSfx(\''+s.id+'\')">🗑️</button></div>'
  ).join('');
}
async function addSfx(){
  if(!isGenuineOwnerSession) return;
  const name = document.getElementById('new-sfx-name').value.trim();
  const category = document.getElementById('new-sfx-category').value;
  const fileInput = document.getElementById('new-sfx-input');
  const file = fileInput.files[0];
  if(!name || !file){ showToast('Renseignez un nom et choisissez un fichier audio'); return; }
  if(file.size > 5 * 1024 * 1024){ showToast('Fichier trop lourd (5 Mo max)'); fileInput.value = ''; return; }
  const audioData = await readFileAsDataURL(file);
  const id = 'sfx_' + Date.now();
  await saveWithRetry('sfx:' + id, { id, name, category, audioData, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-sfx-name').value = '';
  fileInput.value = '';
  showToast('Son ajouté à la bibliothèque ✓');
  await renderSfxLibrary();
}
async function deleteSfx(id){
  if(!isGenuineOwnerSession) return;
  const ok = confirm('Retirer définitivement ce bruitage ?');
  if(!ok) return;
  await window.storage.delete('sfx:' + id, true).catch(() => {});
  showToast('Bruitage retiré');
  await renderSfxLibrary();
}
async function populateSfxSelect(){
  const select = document.getElementById('vp-sfx-select');
  if(!select) return;
  const keys = await safeList('sfx:', true);
  const items = [];
  for(const k of keys){ const s = await safeGet(k, true).catch(() => null); if(s) items.push(s); }
  select.innerHTML = '<option value="">Aucun</option>' + items.map(s => '<option value="'+s.id+'">'+escapeHtml(s.name)+'</option>').join('');
}
async function suggestSoundsForVideo(){
  const theme = prompt('Décrivez brièvement le thème de votre vidéo (pour suggérer des sons adaptés) :');
  if(theme === null || !theme.trim()) return;
  const resultEl = document.getElementById('vp-sound-suggestions');
  resultEl.innerHTML = '<p style="font-size:11.5px; color:rgba(245,239,227,0.5);">Recherche des sons adaptés...</p>';
  const keys = await safeList('sfx:', true);
  const items = [];
  for(const k of keys){ const s = await safeGet(k, true).catch(() => null); if(s) items.push(s); }
  if(items.length === 0){ resultEl.innerHTML = '<div class="empty">Aucun son dans la bibliothèque pour l’instant.</div>'; return; }
  const catalog = items.map(s => s.id + ' : ' + s.name + ' (' + (s.category === 'ambiance' ? 'musique d’ambiance' : s.category === 'trending' ? 'son tendance' : 'effet sonore') + ')').join('\n');
  const prompt2 = "Voici le catalogue réel de sons disponibles sur Suktum :\n" + catalog +
    "\n\nThème de la vidéo du créateur : " + theme.trim() +
    "\n\nParmi ce catalogue UNIQUEMENT, propose jusqu'à 3 identifiants (le texte avant les deux-points) les plus adaptés à ce thème, un par ligne, rien d'autre. Si rien ne convient vraiment, réponds juste « aucun ».";
  const provider = getAIProviderChoice('dailysummary');
  const answer = await callAIProvider(prompt2, 150, provider).catch(() => null);
  if(!answer || answer.toLowerCase().includes('aucun')){
    resultEl.innerHTML = '<div class="empty">Aucun son de la bibliothèque ne correspond vraiment à ce thème.</div>';
    return;
  }
  const suggestedIds = answer.split('\n').map(l => l.trim().split(' ')[0]).filter(id => items.some(s => s.id === id));
  if(suggestedIds.length === 0){ resultEl.innerHTML = '<div class="empty">Aucun son de la bibliothèque ne correspond vraiment à ce thème.</div>'; return; }
  resultEl.innerHTML = suggestedIds.map(id => {
    const s = items.find(x => x.id === id);
    return '<button class="btn btn-outline btn-sm" style="margin:4px 4px 0 0;" onclick="document.getElementById(\'vp-sfx-select\').value=\''+id+'\'">'+(s.category === 'ambiance' ? '🎵' : s.category === 'trending' ? '🔥' : '🔔')+' '+escapeHtml(s.name)+'</button>';
  }).join('');
}
async function renderZoneControllerList(){
  const el = document.getElementById('zone-controller-list');
  if(!el) return;
  const allUsers = await fetchUsers();
  const cityCounts = {};
  allUsers.forEach(u => { if(u.city) cityCounts[u.city] = (cityCounts[u.city] || 0) + 1; });
  const cities = Object.entries(cityCounts).sort((a,b) => b[1] - a[1]);
  el.innerHTML = cities.length === 0 ? '<div class="empty">Aucune ville renseignée par vos utilisateurs pour l’instant.</div>' : cities.map(([city, count]) =>
    '<div class="card" style="cursor:pointer; margin-bottom:8px;" onclick="openZoneDetail(\''+escapeHtml(city)+'\')"><p style="margin:0; font-size:13.5px; font-weight:600;">📍 '+escapeHtml(city)+'</p><p style="margin:2px 0 0; font-size:12px; color:rgba(245,239,227,0.6);">'+count+' utilisateur(s)</p></div>'
  ).join('');
}
async function openZoneDetail(city){
  currentZoneDetailCity = city;
  go('zone-detail');
  document.getElementById('zone-detail-title').textContent = '📍 ' + city;
  const [allUsers, allPosts, allProducts] = await Promise.all([fetchUsers(), fetchPosts(true), fetchProducts()]);
  const usersHere = allUsers.filter(u => u.city === city).length;
  const postsHere = allPosts.filter(p => p.city === city).length;
  const sellersInZone = new Set(allUsers.filter(u => u.city === city).map(u => u.username));
  const productsHere = allProducts.filter(p => sellersInZone.has(p.sellerUsername)).length;
  const sellersHere = new Set(allProducts.filter(p => sellersInZone.has(p.sellerUsername)).map(p => p.sellerUsername)).size;
  document.getElementById('zone-detail-stats').innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px;">👥 '+usersHere+' utilisateur(s)</p><p style="margin:0 0 4px; font-size:13px;">🎬 '+postsHere+' publication(s)</p><p style="margin:0 0 4px; font-size:13px;">🛍️ '+productsHere+' produit(s) en vente</p><p style="margin:0; font-size:13px;">🏪 '+sellersHere+' vendeur(s) actif(s)</p></div>';
  const existing = await safeGet('zonecampaign:' + city.toLowerCase(), true).catch(() => null);
  document.getElementById('zone-campaign-text').value = existing ? (existing.text || '') : '';
}
async function renderDisputesAgainstMe(){
  const el = document.getElementById('disputes-against-me-list');
  if(!el || !currentUser) return;
  const allDisputeKeys = await safeList('refundrequest:', true);
  const disputesAgainstMe = [];
  for(const k of allDisputeKeys){
    const r = await safeGet(k, true).catch(() => null);
    if(r && r.sellerUsername === currentUser) disputesAgainstMe.push(r);
  }
  if(disputesAgainstMe.length === 0){ el.innerHTML = '<div class="empty">Aucune réclamation n’a été déposée contre vous pour l’instant.</div>'; return; }
  const statusLabels = { pending: '⏳ En attente', processing: '🔧 En cours de traitement', resolved: '✓ Résolue' };
  el.innerHTML = disputesAgainstMe.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">Acheteur : @'+escapeHtml(r.buyerUsername||'—')+' — '+escapeHtml(r.productName||'—')+'</p>' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
    '<p style="margin:0; font-size:12px; color:'+(r.outcome === 'upheld' ? 'var(--coral)' : r.outcome === 'rejected' ? 'var(--lagoon)' : 'var(--gold)')+';">'+(r.outcome === 'upheld' ? '⚠️ Jugée fondée' : r.outcome === 'rejected' ? '✓ Jugée infondée — vous êtes mis hors de cause' : (statusLabels[r.status] || r.status))+'</p>' +
    '<p style="margin:4px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">'+new Date(r.createdAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
const MAX_EBOOK_SIZE = 5 * 1024 * 1024;
let currentWorkGroupDetailId = null;
let currentWorkGroupDetailOpenedFromTrainer = false;
let currentAltAudioCourseId = null, currentAltAudioVideoId = null, currentAltAudioVideoData = null;
let altAudioRecorder = null, altAudioChunks = [], recordedAltAudioBlob = null;
function toggleVideoLanguage(videoId){
  const video = document.getElementById('coursevideo_' + videoId);
  const labelEl = document.getElementById('coursevideo_' + videoId + '_langlabel');
  if(!video) return;
  const isOnAlt = video.src === video.dataset.altSrc;
  const wasPlaying = !video.paused;
  const currentTime = video.currentTime;
  video.src = isOnAlt ? video.dataset.originalSrc : video.dataset.altSrc;
  labelEl.textContent = isOnAlt ? 'Original' : video.dataset.altLabel;
  video.addEventListener('loadedmetadata', function onLoaded(){
    video.currentTime = currentTime;
    if(wasPlaying) video.play();
    video.removeEventListener('loadedmetadata', onLoaded);
  });
}
async function startAltAudioRecording(courseId, videoId){
  const keys = await safeList('coursevideo:' + courseId + '__', true);
  let video = null, videoKey = null;
  for(const k of keys){ const v = await safeGet(k, true).catch(() => null); if(v && v.id === videoId){ video = v; videoKey = k; break; } }
  if(!video || !video.data){ showToast('Vidéo introuvable'); return; }
  currentAltAudioCourseId = courseId;
  currentAltAudioVideoId = videoId;
  currentAltAudioVideoData = video.data;
  recordedAltAudioBlob = null;
  document.getElementById('alt-audio-preview-video').src = video.data;
  document.getElementById('alt-audio-status').textContent = '';
  document.getElementById('alt-audio-preview').style.display = 'none';
  document.getElementById('alt-audio-save-btn').style.display = 'none';
  document.getElementById('alt-audio-record-btn').textContent = '🔴 Démarrer l’enregistrement';
  go('alt-audio-record');
}
async function toggleAltAudioRecording(){
  const btn = document.getElementById('alt-audio-record-btn');
  const statusEl = document.getElementById('alt-audio-status');
  const previewVideo = document.getElementById('alt-audio-preview-video');
  if(!altAudioRecorder || altAudioRecorder.state === 'inactive'){
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(e){
      showToast('Accès au microphone refusé ou indisponible');
      return;
    }
    altAudioChunks = [];
    altAudioRecorder = new MediaRecorder(stream);
    altAudioRecorder.ondataavailable = (e) => { if(e.data.size > 0) altAudioChunks.push(e.data); };
    altAudioRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      recordedAltAudioBlob = new Blob(altAudioChunks, { type: 'audio/webm' });
      const previewEl = document.getElementById('alt-audio-preview');
      previewEl.src = URL.createObjectURL(recordedAltAudioBlob);
      previewEl.style.display = 'block';
      document.getElementById('alt-audio-save-btn').style.display = 'block';
      statusEl.textContent = '✓ Narration enregistrée — vérifiez-la avant d’enregistrer';
      btn.textContent = '🔴 Réenregistrer';
    };
    altAudioRecorder.start();
    previewVideo.currentTime = 0;
    previewVideo.play();
    btn.textContent = '⏹️ Arrêter l’enregistrement';
    statusEl.textContent = 'Enregistrement en cours...';
  } else {
    altAudioRecorder.stop();
    previewVideo.pause();
  }
}
async function saveAltAudioTrack(){
  if(!recordedAltAudioBlob || !currentAltAudioVideoData) return;
  const label = prompt('Nom de cette langue (ex : Wolof, Anglais...) :');
  if(!label || !label.trim()) return;
  document.getElementById('alt-audio-status').textContent = '⏳ Traitement en cours...';
  try{
    const ffmpeg = await getFFmpegInstance();
    const videoData = await (await fetch(currentAltAudioVideoData)).arrayBuffer();
    ffmpeg.FS('writeFile', 'original.mp4', new Uint8Array(videoData));
    ffmpeg.FS('writeFile', 'altaudio.webm', new Uint8Array(await recordedAltAudioBlob.arrayBuffer()));
    await ffmpeg.run('-i', 'original.mp4', '-i', 'altaudio.webm', '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', 'altoutput.mp4');
    const data = ffmpeg.FS('readFile', 'altoutput.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const dataUrl = await blobToDataURL(blob);
    const keys = await safeList('coursevideo:' + currentAltAudioCourseId + '__', true);
    for(const k of keys){
      const v = await safeGet(k, true).catch(() => null);
      if(v && v.id === currentAltAudioVideoId){
        v.altAudioData = dataUrl;
        v.altAudioLabel = label.trim();
        await saveWithRetry(k, v, true);
        break;
      }
    }
    showToast('Piste audio « ' + label.trim() + ' » enregistrée ✓');
    go('manage-course');
    await renderManageCourseVideos();
  }catch(e){
    showToast('Erreur lors du traitement — réessayez');
  }
}
let currentCourseGroupDetailOpenedFromTrainer = false;
async function renderManageCourseWorkGroups(){
  if(!currentManagedCourseId) return;
  const listEl = document.getElementById('manage-course-groups-list');
  const checkboxEl = document.getElementById('new-group-student-checkboxes');
  if(!listEl || !checkboxEl) return;
  const students = await fetchApprovedStudentsForCourse(currentManagedCourseId);
  checkboxEl.innerHTML = students.length === 0 ? '<p style="font-size:12px; color:rgba(245,239,227,0.5); margin:0;">Aucun élève inscrit pour l’instant.</p>' : students.map(s =>
    '<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:12.5px;"><input type="checkbox" class="new-group-student-checkbox" value="'+escapeHtml(s)+'" style="width:auto;"> @'+escapeHtml(s)+'</label>'
  ).join('');
  const keys = await safeList('workgroup:' + currentManagedCourseId + '__', true);
  const groups = [];
  for(const k of keys){ const g = await safeGet(k, true).catch(() => null); if(g) groups.push(g); }
  listEl.innerHTML = groups.length === 0 ? '<div class="empty">Aucun groupe pour l’instant.</div>' : groups.map(g =>
    '<div class="card" style="cursor:pointer; margin-bottom:8px;" onclick="openWorkGroupDetail(\''+g.id+'\', true)"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(g.name)+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">'+g.members.length+' élève(s) — '+escapeHtml((g.topic||'').slice(0,50))+(g.topic && g.topic.length > 50 ? '…' : '')+'</p></div>'
  ).join('');
}
async function renderManageCourseChallenge(){
  if(!currentManagedCourseId) return;
  const statusEl = document.getElementById('manage-course-challenge-status');
  const formEl = document.getElementById('new-course-challenge-form');
  if(!statusEl || !formEl) return;
  const keys = await safeList('challenge:', true);
  let activeChallenge = null;
  for(const k of keys){
    const c = await safeGet(k, true).catch(() => null);
    if(c && c.courseId === currentManagedCourseId && c.status === 'active'){ activeChallenge = c; break; }
  }
  if(activeChallenge){
    formEl.style.display = 'none';
    statusEl.innerHTML = '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">🏆 '+escapeHtml(activeChallenge.title)+'</p>' +
      '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">#'+escapeHtml(activeChallenge.hashtag)+'</p>' +
      '<button class="btn btn-outline btn-sm" onclick="openChallengeDetail(\''+activeChallenge.id+'\')">Voir les participations</button> ' +
      '<button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="closeCourseChallenge(\''+activeChallenge.id+'\')">Clore le défi</button></div>';
  } else {
    formEl.style.display = 'block';
    statusEl.innerHTML = '';
  }
}
async function createPronunciationChallenge(){
  if(!currentManagedCourseId) return;
  const term = document.getElementById('new-pronunciation-term').value.trim();
  if(!term){ showToast('Renseignez un terme à prononcer'); return; }
  const id = 'pron_' + Date.now();
  await saveWithRetry('pronunciationchallenge:' + currentManagedCourseId + '__' + id, {
    id, courseId: currentManagedCourseId, term, createdAt: new Date().toISOString()
  }, true);
  document.getElementById('new-pronunciation-term').value = '';
  showToast('Défi de prononciation ajouté ✓');
  await renderManageCoursePronunciation();
}
async function fetchPronunciationChallenges(courseId){
  const keys = await safeList('pronunciationchallenge:' + courseId + '__', true);
  const list = [];
  for(const k of keys){ const p = await safeGet(k, true).catch(() => null); if(p) list.push(p); }
  list.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  return list;
}
async function renderManageCoursePronunciation(){
  if(!currentManagedCourseId) return;
  const el = document.getElementById('manage-course-pronunciation-list');
  if(!el) return;
  const items = await fetchPronunciationChallenges(currentManagedCourseId);
  el.innerHTML = items.length === 0 ? '' : items.map(p =>
    '<div class="card" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:13px;">🗣️ '+escapeHtml(p.term)+'</span>' +
    '<span onclick="deletePronunciationChallenge(\''+p.id+'\')" style="color:var(--coral); cursor:pointer; font-size:12px;">Retirer</span></div>'
  ).join('');
}
async function deletePronunciationChallenge(id){
  if(!currentManagedCourseId) return;
  await window.storage.delete('pronunciationchallenge:' + currentManagedCourseId + '__' + id, true).catch(() => {});
  showToast('Défi retiré');
  await renderManageCoursePronunciation();
}
function normalizeForPronunciation(text){
  return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
}
let pronunciationRecognizer = null;
function startPronunciationAttempt(term, resultElId){
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const resultEl = document.getElementById(resultElId);
  if(!SpeechRecognitionAPI){
    resultEl.textContent = 'Reconnaissance vocale indisponible sur cet appareil';
    return;
  }
  resultEl.textContent = '🎙️ Parlez maintenant...';
  pronunciationRecognizer = new SpeechRecognitionAPI();
  pronunciationRecognizer.lang = 'fr-FR';
  pronunciationRecognizer.interimResults = false;
  pronunciationRecognizer.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const normalizedTranscript = normalizeForPronunciation(transcript);
    const normalizedTerm = normalizeForPronunciation(term);
    let result;
    if(normalizedTranscript === normalizedTerm){
      result = '✓ Prononciation réussie ! Vous avez dit : « '+transcript+' »';
    } else if(normalizedTranscript.includes(normalizedTerm) || normalizedTerm.includes(normalizedTranscript)){
      result = '〜 Presque ! Vous avez dit : « '+transcript+' » — réessayez pour plus de précision';
    } else {
      result = '✕ Pas tout à fait. Vous avez dit : « '+transcript+' » — réessayez';
    }
    resultEl.textContent = result;
  };
  pronunciationRecognizer.onerror = () => {
    resultEl.textContent = 'Impossible de capter votre voix — réessayez';
  };
  pronunciationRecognizer.start();
}
async function createCourseChallenge(){
  if(!currentManagedCourseId) return;
  const title = document.getElementById('new-course-challenge-title').value.trim();
  const desc = document.getElementById('new-course-challenge-desc').value.trim();
  if(!title || !desc){ showToast('Renseignez le titre et la description'); return; }
  const c = await safeGet('course:' + currentManagedCourseId, true);
  const id = 'challenge_' + Date.now();
  const hashtag = 'Defi' + currentManagedCourseId.replace(/[^a-z0-9]/gi, '').slice(0,10) + Date.now().toString().slice(-4);
  await saveWithRetry('challenge:' + id, {
    id, title, hashtag, description: desc, reward: null, courseId: currentManagedCourseId,
    createdBy: currentUser, status: 'active', createdAt: new Date().toISOString()
  }, true);
  const students = await fetchApprovedStudentsForCourse(currentManagedCourseId);
  for(const s of students){
    await createNotification(s, 'new_course_challenge', currentUser, id, title);
  }
  document.getElementById('new-course-challenge-title').value = '';
  document.getElementById('new-course-challenge-desc').value = '';
  showToast('Défi lancé ✓');
  await renderManageCourseChallenge();
}
async function closeCourseChallenge(challengeId){
  const c = await safeGet('challenge:' + challengeId, true);
  if(!c) return;
  const ok = confirm('Clore ce défi ? Les participations déjà publiées resteront visibles.');
  if(!ok) return;
  c.status = 'closed';
  await saveWithRetry('challenge:' + challengeId, c, true);
  showToast('Défi clos ✓');
  await renderManageCourseChallenge();
}
async function createWorkGroup(){
  if(!currentManagedCourseId) return;
  const name = document.getElementById('new-group-name').value.trim();
  const topic = document.getElementById('new-group-topic').value.trim();
  const members = Array.from(document.querySelectorAll('.new-group-student-checkbox:checked')).map(cb => cb.value);
  if(!name){ showToast('Donnez un nom au groupe'); return; }
  if(members.length === 0){ showToast('Choisissez au moins un élève'); return; }
  const id = 'group_' + Date.now();
  await saveWithRetry('workgroup:' + currentManagedCourseId + '__' + id, {
    id, courseId: currentManagedCourseId, name, topic, members, createdAt: new Date().toISOString()
  }, true);
  for(const m of members){
    await createNotification(m, 'added_to_group', currentUser, currentManagedCourseId, name);
  }
  document.getElementById('new-group-name').value = '';
  document.getElementById('new-group-topic').value = '';
  showToast('Groupe créé ✓');
  await renderManageCourseWorkGroups();
}
async function renderStudentWorkGroups(courseId){
  const el = document.getElementById('student-course-groups-list');
  if(!el) return;
  const keys = await safeList('workgroup:' + courseId + '__', true);
  const myGroups = [];
  for(const k of keys){ const g = await safeGet(k, true).catch(() => null); if(g && g.members.includes(currentUser)) myGroups.push(g); }
  el.innerHTML = myGroups.length === 0 ? '<div class="empty">Vous n’êtes dans aucun groupe pour l’instant.</div>' : myGroups.map(g =>
    '<div class="card" style="cursor:pointer; margin-bottom:8px;" onclick="openWorkGroupDetail(\''+g.id+'\', false)"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+escapeHtml(g.name)+'</p>' +
    '<p style="margin:0; font-size:11.5px; color:rgba(245,239,227,0.6);">'+escapeHtml((g.topic||'').slice(0,50))+(g.topic && g.topic.length > 50 ? '…' : '')+'</p></div>'
  ).join('');
}
async function openWorkGroupDetail(groupId, fromTrainer){
  const g = await safeGet('workgroup:' + (fromTrainer ? currentManagedCourseId : currentCourseDetailId) + '__' + groupId, true);
  if(!g){ showToast('Groupe introuvable'); return; }
  currentWorkGroupDetailId = groupId;
  currentWorkGroupDetailOpenedFromTrainer = fromTrainer;
  go('work-group-detail');
  document.getElementById('work-group-detail-title').textContent = g.name;
  document.getElementById('work-group-detail-topic').textContent = g.topic || 'Aucun sujet précisé';
  document.getElementById('work-group-detail-members').textContent = 'Membres : ' + g.members.map(m => '@'+m).join(', ');
  await renderWorkGroupChat();
}
function closeWorkGroupDetail(){
  go(currentWorkGroupDetailOpenedFromTrainer ? 'manage-course' : 'course-detail');
}
async function fetchWorkGroupChatMessages(groupId){
  return (await safeGet('workgroupchat:' + groupId, true)) || [];
}
async function renderWorkGroupChat(){
  const messages = await fetchWorkGroupChatMessages(currentWorkGroupDetailId);
  const el = document.getElementById('work-group-chat-messages');
  el.innerHTML = messages.length === 0 ? '<div class="empty">Aucun message pour l’instant.</div>' : messages.map(m =>
    '<div style="margin-bottom:8px;"><strong style="font-size:12px;">@'+escapeHtml(m.from)+'</strong><p style="margin:2px 0 0; font-size:13px;">'+escapeHtml(m.text)+'</p></div>'
  ).join('');
}
async function sendWorkGroupChatMessage(){
  const input = document.getElementById('work-group-chat-input');
  const text = input.value.trim();
  if(!text || !currentWorkGroupDetailId) return;
  const messages = await fetchWorkGroupChatMessages(currentWorkGroupDetailId);
  messages.push({ from: currentUser, text, ts: new Date().toISOString() });
  await saveWithRetry('workgroupchat:' + currentWorkGroupDetailId, messages, true);
  input.value = '';
  await renderWorkGroupChat();
}
async function saveCertificateConditions(){
  if(!currentManagedCourseId) return;
  const c = await safeGet('course:' + currentManagedCourseId, true);
  if(!c) return;
  const avgRaw = document.getElementById('cert-min-average').value;
  const attRaw = document.getElementById('cert-min-attendance').value;
  c.certMinAverage = avgRaw === '' ? null : Math.max(0, Math.min(20, parseFloat(avgRaw)));
  c.certMinAttendance = attRaw === '' ? null : Math.max(0, Math.min(100, parseInt(attRaw, 10)));
  await saveWithRetry('course:' + currentManagedCourseId, c, true);
  showToast('Conditions enregistrées ✓');
}
async function openCourseEngagementJournal(courseId){
  if(!courseId) return;
  go('course-engagement-journal');
  const el = document.getElementById('course-engagement-journal-list');
  el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Chargement...</p>';
  const students = await fetchApprovedStudentsForCourse(courseId);
  if(students.length === 0){ el.innerHTML = '<div class="empty">Aucun élève inscrit pour l’instant.</div>'; return; }
  const exercises = await fetchExercisesForCourse(courseId);
  const attendanceKeys = await safeList('conferenceattendance:', true);
  const mySessions = [];
  for(const k of attendanceKeys){
    const s = await safeGet(k, true).catch(() => null);
    if(s && s.trainerUsername === currentUser) mySessions.push(s);
  }
  const rows = [];
  for(const student of students){
    let submittedCount = 0;
    for(const ex of exercises){
      const sub = await safeGet('submission:' + ex.id + '__' + student, true).catch(() => null);
      if(sub) submittedCount++;
    }
    const submissionRate = exercises.length > 0 ? Math.round((submittedCount / exercises.length) * 100) : null;
    const attendedCount = mySessions.filter(s => s.attendees.includes(student)).length;
    const attendanceRate = mySessions.length > 0 ? Math.round((attendedCount / mySessions.length) * 100) : null;
    const needsSupport = (submissionRate !== null && submissionRate < 50) || (attendanceRate !== null && attendanceRate < 50);
    rows.push({ student, submittedCount, exerciseCount: exercises.length, submissionRate, attendedCount, sessionCount: mySessions.length, attendanceRate, needsSupport });
  }
  el.innerHTML = rows.map(r =>
    '<div class="card" style="margin-bottom:8px;'+(r.needsSupport ? ' border-color:var(--coral);' : '')+'"><p style="margin:0 0 6px; font-size:13.5px; font-weight:600;">@'+escapeHtml(r.student)+(r.needsSupport ? ' ⚠️' : '')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px;">📝 Devoirs rendus : '+(r.exerciseCount > 0 ? r.submittedCount+'/'+r.exerciseCount+' ('+r.submissionRate+'%)' : 'aucun devoir donné')+'</p>' +
    '<p style="margin:0; font-size:12px;">🎥 Présence conférences : '+(r.sessionCount > 0 ? r.attendedCount+'/'+r.sessionCount+' ('+r.attendanceRate+'%)' : 'aucune session tenue')+'</p>' +
    (r.needsSupport ? '<p style="margin:6px 0 0; font-size:11.5px; color:var(--coral);">Élève potentiellement en difficulté — un soutien ciblé pourrait aider</p>' : '') +
    '</div>'
  ).join('');
}
async function renderMyEducationCalendar(){
  const el = document.getElementById('my-education-calendar-list');
  if(!el || !currentUser) return;
  const enrollmentKeys = await safeList('enrollment:', true);
  const myCourseIds = new Set();
  for(const k of enrollmentKeys){
    const e = await safeGet(k, true).catch(() => null);
    if(e && e.studentUsername === currentUser && e.status === 'approved') myCourseIds.add(e.courseId);
  }
  if(myCourseIds.size === 0){ el.innerHTML = '<div class="empty">Inscrivez-vous à un cours pour voir apparaître votre calendrier.</div>'; return; }
  const allCourses = await fetchCourses(true);
  const myCourses = allCourses.filter(c => myCourseIds.has(c.id));
  const myTrainerUsernames = new Set(myCourses.map(c => c.trainerUsername));
  const events = [];
  for(const courseId of myCourseIds){
    const exerciseKeys = await safeList('exercise:' + courseId + '__', true);
    for(const k of exerciseKeys){
      const ex = await safeGet(k, true).catch(() => null);
      if(ex && ex.deadline && new Date(ex.deadline) > new Date()){
        const course = myCourses.find(c => c.id === courseId);
        events.push({ type: 'devoir', date: ex.deadline, title: ex.title, courseTitle: course ? course.title : '' });
      }
    }
  }
  const allLives = await fetchLives();
  for(const l of allLives){
    if(l.isEducational && l.scheduledTime && myTrainerUsernames.has(l.username) && new Date(l.scheduledTime) > new Date()){
      events.push({ type: 'conférence', date: l.scheduledTime, title: 'Conférence de @' + l.username, courseTitle: '' });
    }
  }
  if(events.length === 0){ el.innerHTML = '<div class="empty">Aucune échéance à venir pour l’instant.</div>'; return; }
  events.sort((a,b) => new Date(a.date) - new Date(b.date));
  el.innerHTML = events.map(ev =>
    '<div class="card" style="margin-bottom:8px; border-color:'+(ev.type === 'devoir' ? 'var(--gold)' : 'var(--lagoon)')+';">' +
    '<p style="margin:0 0 4px; font-size:12.5px; color:'+(ev.type === 'devoir' ? 'var(--gold)' : 'var(--lagoon)')+';">'+(ev.type === 'devoir' ? '📝 Devoir à rendre' : '🎥 Conférence')+'</p>' +
    '<p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">'+escapeHtml(ev.title)+'</p>' +
    (ev.courseTitle ? '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(ev.courseTitle)+'</p>' : '') +
    '<p style="margin:0; font-size:12px;">'+new Date(ev.date).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})+' à '+new Date(ev.date).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</p>' +
    '</div>'
  ).join('');
}
async function renderConferenceAttendanceHistory(){
  const el = document.getElementById('conference-attendance-history-list');
  if(!el || !currentUser) return;
  const keys = await safeList('conferenceattendance:', true);
  const sessions = [];
  for(const k of keys){ const s = await safeGet(k, true).catch(() => null); if(s && s.trainerUsername === currentUser) sessions.push(s); }
  if(sessions.length === 0){ el.innerHTML = '<div class="empty">Aucune session terminée pour l’instant.</div>'; return; }
  sessions.sort((a,b) => new Date(b.endedAt) - new Date(a.endedAt));
  el.innerHTML = sessions.map(s =>
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">'+new Date(s.endedAt).toLocaleDateString('fr-FR')+' à '+new Date(s.endedAt).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})+'</p>' +
    (s.attendees.length === 0
      ? '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Aucun élève présent</p>'
      : '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6);">'+s.attendees.length+' présent(s) :</p>' +
        s.attendees.map(a => '<span style="display:inline-block; background:rgba(47,184,166,0.15); color:var(--lagoon); font-size:11.5px; padding:2px 8px; border-radius:8px; margin:0 4px 4px 0;">@'+escapeHtml(a)+'</span>').join('')
    ) + '</div>'
  ).join('');
}
async function renderEbookLibrary(){
  const ownerPanel = document.getElementById('ebook-library-owner-panel');
  if(ownerPanel) ownerPanel.style.display = isGenuineOwnerSession ? 'block' : 'none';
  const el = document.getElementById('ebook-library-list');
  if(!el) return;
  const keys = await safeList('ebook:', true);
  const ebooks = [];
  for(const k of keys){ const b = await safeGet(k, true).catch(() => null); if(b) ebooks.push(b); }
  ebooks.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if(ebooks.length === 0){ el.innerHTML = '<div class="empty">Aucun guide pour l’instant.</div>'; return; }
  const rows = [];
  for(const b of ebooks){
    const isFree = !b.price || b.price === 0;
    const purchase = isFree ? null : await safeGet('ebookpurchase:' + b.id + '__' + currentUser, true).catch(() => null);
    const unlocked = isFree || !!purchase;
    rows.push(
      '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 4px; font-size:13.5px; font-weight:600;">📄 '+escapeHtml(b.title)+'</p>' +
      (b.description ? '<p style="margin:0 0 8px; font-size:12px; color:rgba(245,239,227,0.6);">'+escapeHtml(b.description)+'</p>' : '') +
      (unlocked
        ? '<button class="btn btn-outline btn-sm" onclick="downloadEbook(\''+b.id+'\')">📥 Télécharger'+(isFree ? ' (gratuit)' : '')+'</button>'
        : '<button class="btn btn-primary btn-sm" onclick="unlockEbook(\''+b.id+'\')">🔓 Débloquer — '+b.price.toLocaleString('fr-FR')+' FCFA</button>') +
      (isGenuineOwnerSession ? ' <button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="deleteEbook(\''+b.id+'\')">🗑️</button>' : '') +
      '</div>'
    );
  }
  el.innerHTML = rows.join('');
}
async function addEbook(){
  if(!isGenuineOwnerSession) return;
  const title = document.getElementById('new-ebook-title').value.trim();
  const description = document.getElementById('new-ebook-description').value.trim();
  const price = Math.max(0, parseInt(document.getElementById('new-ebook-price').value, 10) || 0);
  const fileInput = document.getElementById('new-ebook-input');
  const file = fileInput.files[0];
  if(!title || !file){ showToast('Renseignez un titre et choisissez un fichier PDF'); return; }
  if(file.size > MAX_EBOOK_SIZE){ showToast('Fichier trop lourd (5 Mo max)'); fileInput.value = ''; return; }
  const dataUrl = await readFileAsDataURL(file);
  const id = 'ebook_' + Date.now();
  await saveWithRetry('ebook:' + id, { id, title, description, price, data: dataUrl, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-ebook-title').value = '';
  document.getElementById('new-ebook-description').value = '';
  document.getElementById('new-ebook-price').value = '';
  fileInput.value = '';
  showToast('Guide publié ✓');
  await renderEbookLibrary();
}
async function unlockEbook(ebookId){
  const b = await safeGet('ebook:' + ebookId, true);
  if(!b) return;
  await saveWithRetry('ebookpurchase:' + ebookId + '__' + currentUser, { ebookId, username: currentUser, price: b.price, purchasedAt: new Date().toISOString() }, true);
  showToast('Achat enregistré ✓ — accès débloqué');
  await renderEbookLibrary();
}
function downloadEbook(ebookId){
  safeGet('ebook:' + ebookId, true).then(b => {
    if(!b) return;
    const a = document.createElement('a');
    a.href = b.data;
    a.download = b.title.replace(/[^a-z0-9]/gi, '-') + '.pdf';
    a.click();
  });
}
async function deleteEbook(ebookId){
  if(!isGenuineOwnerSession) return;
  const ok = confirm('Retirer définitivement ce guide ?');
  if(!ok) return;
  await window.storage.delete('ebook:' + ebookId, true).catch(() => {});
  showToast('Guide retiré');
  await renderEbookLibrary();
}
async function renderWisdomCapsulesScreen(){
  const ownerPanel = document.getElementById('wisdom-capsules-owner-panel');
  if(ownerPanel) ownerPanel.style.display = isGenuineOwnerSession ? 'block' : 'none';
  const el = document.getElementById('wisdom-capsules-list');
  if(!el) return;
  const keys = await safeList('wisdomcapsule:', true);
  const capsules = [];
  for(const k of keys){ const c = await safeGet(k, true).catch(() => null); if(c) capsules.push(c); }
  capsules.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  el.innerHTML = capsules.length === 0 ? '<div class="empty">Aucune capsule pour l’instant.</div>' : capsules.map(c =>
    '<div class="card" style="margin-bottom:10px;"><p style="margin:0 0 8px; font-size:13.5px; font-weight:600;">🕯️ '+escapeHtml(c.title)+'</p>' +
    '<audio controls style="width:100%;" src="'+c.data+'"></audio>' +
    '<p style="margin:6px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">'+new Date(c.createdAt).toLocaleDateString('fr-FR')+'</p>' +
    (isGenuineOwnerSession ? '<button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="deleteWisdomCapsule(\''+c.id+'\')">🗑️ Retirer</button>' : '') +
    '</div>'
  ).join('');
}
async function addWisdomCapsule(){
  if(!isGenuineOwnerSession) return;
  const title = document.getElementById('new-wisdom-capsule-title').value.trim();
  const fileInput = document.getElementById('new-wisdom-capsule-input');
  const file = fileInput.files[0];
  if(!title || !file){ showToast('Renseignez un titre et choisissez un fichier audio'); return; }
  if(file.size > MAX_LESSON_ATTACHMENT_SIZE){ showToast('Fichier trop lourd (5 Mo max)'); fileInput.value = ''; return; }
  const dataUrl = await readFileAsDataURL(file);
  const id = 'wisdomcapsule_' + Date.now();
  await saveWithRetry('wisdomcapsule:' + id, { id, title, data: dataUrl, createdAt: new Date().toISOString() }, true);
  document.getElementById('new-wisdom-capsule-title').value = '';
  fileInput.value = '';
  showToast('Capsule publiée ✓');
  await renderWisdomCapsulesScreen();
}
async function deleteWisdomCapsule(id){
  if(!isGenuineOwnerSession) return;
  const ok = confirm('Retirer définitivement cette capsule ?');
  if(!ok) return;
  await window.storage.delete('wisdomcapsule:' + id, true).catch(() => {});
  showToast('Capsule retirée');
  await renderWisdomCapsulesScreen();
}
async function renderMyDisputes(){
  const el = document.getElementById('my-disputes-list');
  if(!el || !currentUser) return;
  const allDisputeKeys = await safeList('refundrequest:', true);
  const myDisputes = [];
  for(const k of allDisputeKeys){
    const r = await safeGet(k, true).catch(() => null);
    if(r && r.buyerUsername === currentUser) myDisputes.push(r);
  }
  if(myDisputes.length === 0){ el.innerHTML = '<div class="empty">Vous n’avez déposé aucune réclamation pour l’instant.</div>'; return; }
  const statusLabels = { pending: '⏳ En attente', processing: '🔧 En cours de traitement', resolved: '✓ Résolue' };
  el.innerHTML = myDisputes.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r =>
    '<div class="card" style="margin-bottom:8px;"><p style="margin:0 0 4px; font-size:13px;">Vendeur : @'+escapeHtml(r.sellerUsername||'—')+' — '+escapeHtml(r.productName||'—')+'</p>' +
    '<p style="margin:0 0 6px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
    '<p style="margin:0; font-size:12px; color:'+(r.outcome === 'upheld' ? 'var(--lagoon)' : r.outcome === 'rejected' ? 'var(--coral)' : 'var(--gold)')+';">'+(r.outcome === 'upheld' ? '✓ Jugée fondée' : r.outcome === 'rejected' ? '✕ Jugée infondée' : (statusLabels[r.status] || r.status))+'</p>' +
    '<p style="margin:4px 0 0; font-size:11px; color:rgba(245,239,227,0.4);">'+new Date(r.createdAt).toLocaleDateString('fr-FR')+'</p></div>'
  ).join('');
}
async function renderBuyerPatternReview(){
  const el = document.getElementById('buyer-pattern-list');
  const summaryEl = document.getElementById('buyer-pattern-summary');
  if(!el) return;
  const buyerUsername = document.getElementById('buyer-pattern-search').value.trim();
  if(!buyerUsername){ el.innerHTML = ''; summaryEl.innerHTML = ''; return; }
  const allDisputeKeys = await safeList('refundrequest:', true);
  const disputes = [];
  for(const k of allDisputeKeys){
    const r = await safeGet(k, true).catch(() => null);
    if(r && r.buyerUsername === buyerUsername) disputes.push(r);
  }
  const myOrders = (await fetchOrders()).filter(o => o.buyerUsername === buyerUsername);
  const nonReceiptDisputes = disputes.filter(r => r.reason && r.reason.includes('jamais reçu'));
  const concerningNonReceiptDisputes = nonReceiptDisputes.filter(r => r.outcome !== 'rejected');
  const rejectedCount = nonReceiptDisputes.filter(r => r.outcome === 'rejected').length;
  if(disputes.length === 0){ summaryEl.innerHTML = '<div class="card"><p style="margin:0; font-size:13px; color:rgba(245,239,227,0.5);">Aucun litige réel enregistré pour cet acheteur, sur '+myOrders.length+' commande(s) au total.</p></div>'; el.innerHTML = ''; return; }
  summaryEl.innerHTML = '<div class="card">' +
    '<p style="margin:0 0 4px; font-size:13px;">📦 '+myOrders.length+' commande(s) au total</p>' +
    '<p style="margin:0 0 4px; font-size:13px;">⚠️ '+disputes.length+' litige(s) réel(s) au total, tous vendeurs confondus</p>' +
    '<p style="margin:0; font-size:13px; color:'+(concerningNonReceiptDisputes.length >= 3 ? 'var(--coral)' : 'rgba(245,239,227,0.75)')+';">📭 '+concerningNonReceiptDisputes.length+' signalement(s) « colis jamais reçu » fondé(s) ou en cours'+(concerningNonReceiptDisputes.length >= 3 ? ' — motif répété, à examiner avec attention' : '')+'</p>' +
    (rejectedCount > 0 ? '<p style="margin:4px 0 0; font-size:11.5px; color:rgba(245,239,227,0.4);">('+rejectedCount+' signalement(s) similaire(s) déjà examiné(s) et jugé(s) infondé(s), honnêtement exclu(s) du décompte ci-dessus)</p>' : '') +
    '</div>';
  el.innerHTML = disputes.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(r =>
    '<div class="card" style="margin-bottom:8px;'+(r.reason && r.reason.includes('jamais reçu') && r.outcome !== 'rejected' ? ' border-color:var(--coral);' : '')+'"><p style="margin:0 0 4px; font-size:12.5px;">Vendeur : @'+escapeHtml(r.sellerUsername||'—')+' — '+escapeHtml(r.productName||'—')+'</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
    '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.4);">'+new Date(r.createdAt).toLocaleDateString('fr-FR')+' — statut : '+r.status+(r.outcome ? ' ('+(r.outcome === 'upheld' ? 'fondée' : 'infondée')+')' : '')+'</p></div>'
  ).join('');
}
async function saveZoneCampaign(active){
  if(!currentZoneDetailCity) return;
  const text = document.getElementById('zone-campaign-text').value.trim();
  if(active && !text){ showToast('Écrivez un texte avant de publier'); return; }
  await saveWithRetry('zonecampaign:' + currentZoneDetailCity.toLowerCase(), { city: currentZoneDetailCity, active, text }, true);
  showToast(active ? 'Campagne publiée ✓' : 'Campagne retirée');
  await logAdminAction(active ? 'Campagne locale publiée' : 'Campagne locale retirée', currentZoneDetailCity);
}
async function checkWeeklyTrendBanner(){
  const el = document.getElementById('weekly-trend-banner');
  if(!el) return;
  const weekKey = getISOWeekKey(new Date());
  const keys = await safeList('trendvote:' + weekKey + '__', true);
  const nominees = [];
  for(const k of keys){ const v = await safeGet(k, true).catch(() => null); if(v) nominees.push(v); }
  nominees.sort((a,b) => (b.votes?b.votes.length:0) - (a.votes?a.votes.length:0));
  const winner = nominees[0];
  if(winner && winner.votes && winner.votes.length > 0){
    el.style.display = 'block';
    el.textContent = '👑 Trend de la semaine : ' + winner.soundName + ' (' + winner.votes.length + ' vote(s))';
  } else {
    el.style.display = 'none';
  }
}
async function checkZoneCampaignBanner(){
  const el = document.getElementById('zone-campaign-banner');
  if(!el) return;
  if(!currentUserCity){ el.style.display = 'none'; return; }
  const campaign = await safeGet('zonecampaign:' + currentUserCity.toLowerCase(), true).catch(() => null);
  if(campaign && campaign.active && campaign.text){
    el.style.display = 'block';
    el.textContent = '📍 ' + currentUserCity + ' — ' + campaign.text;
  } else {
    el.style.display = 'none';
  }
}
async function checkAnnouncementBanner(){
  const el = document.getElementById('announcement-banner');
  if(!el) return;
  const a = await safeGet('settings:announcement', true);
  if(a && a.active && a.text){
    el.style.display = 'block';
    el.textContent = '📢 ' + a.text;
  } else {
    el.style.display = 'none';
  }
}
async function loadAnnouncementAdmin(){
  const a = await safeGet('settings:announcement', true);
  document.getElementById('admin-announcement-text').value = a ? (a.text || '') : '';
}

/* ---------- CGU / CONFIDENTIALITÉ ---------- */
async function setupLegalCountrySelect(){
  const sel = document.getElementById('admin-legal-country');
  if(adminScope === 'all'){
    sel.disabled = false;
  } else {
    sel.value = adminScope;
    sel.disabled = true;
  }
}
function legalKeySuffix(){
  const country = document.getElementById('admin-legal-country').value || 'Sénégal';
  return country.replace(/[^a-zA-Z0-9]/g, '_');
}
async function saveLegalTexts(){
  const cgu = document.getElementById('admin-cgu-text').value.trim();
  const privacy = document.getElementById('admin-privacy-text').value.trim();
  const suffix = legalKeySuffix();
  await saveWithRetry('settings:cgu_' + suffix, cgu, true);
  await saveWithRetry('settings:privacy_' + suffix, privacy, true);
  showToast('Textes enregistrés pour ' + document.getElementById('admin-legal-country').value + ' ✓');
}
async function loadLegalTextsAdmin(){
  const suffix = legalKeySuffix();
  const cgu = await safeGet('settings:cgu_' + suffix, true);
  const privacy = await safeGet('settings:privacy_' + suffix, true);
  document.getElementById('admin-cgu-text').value = cgu || '';
  document.getElementById('admin-privacy-text').value = privacy || '';
}

/* ---------- ADMINS RÉGIONAUX ---------- */
function updateRegionalAdminPasswordStrength(){
  const pw = document.getElementById('regional-admin-pin').value;
  const el = document.getElementById('regional-admin-password-strength');
  if(!pw){ el.textContent = ''; return; }
  const r = renderPasswordStrengthLabel(pw);
  el.style.color = r.color;
  el.textContent = r.text;
}
async function addRegionalAdmin(){
  const name = document.getElementById('regional-admin-name').value.trim();
  const pin = document.getElementById('regional-admin-pin').value;
  const country = document.getElementById('regional-admin-country').value;
  const domain = document.getElementById('regional-admin-domain').value;
  if(!name){ showToast('Renseignez un nom'); return; }
  const {strong} = checkPasswordStrength(pin);
  if(!strong){ showToast('Le mot de passe ne respecte pas encore toutes les règles'); return; }
  const pinHash = await sha256Hex(pin);
  const superHash = await safeGet('settings:adminpin_hash', true);
  if(pinHash === superHash){ showToast('Choisissez un mot de passe différent du vôtre'); return; }
  const admins = (await safeGet('settings:regionaladmins', true)) || [];
  if(admins.some(a => a.pinHash === pinHash)){ showToast('Ce mot de passe est déjà utilisé par un autre admin'); return; }
  const mustChangePassword = document.getElementById('regional-admin-must-change').checked;
  admins.push({name, pinHash, country, domain, mustChangePassword});
  await saveWithRetry('settings:regionaladmins', admins, true);
  document.getElementById('regional-admin-name').value = '';
  document.getElementById('regional-admin-pin').value = '';
  document.getElementById('regional-admin-must-change').checked = false;
  showToast('Admin régional ajouté ✓');
  await loadRegionalAdminsList();
}
async function loadRegionalAdminsList(){
  const el = document.getElementById('regional-admins-list');
  if(!el) return;
  const allAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  const admins = allAdmins.filter(a => !a.revokedAt);
  const revoked = allAdmins.filter(a => a.revokedAt);
  const domainLabels = { general: 'Général', moderation: '🛡️ Modération', marketplace: '🏪 Marketplace', lives: '🔴 Lives', education: '🎓 Éducation', ads: '📢 Publicités', support: '🎫 Support' };
  let html = admins.length === 0 ? '<div class="empty">Aucun admin régional actif pour l’instant.</div>' : admins.map((a, i) =>
    '<div class="card" style="display:flex; justify-content:space-between; align-items:center;">' +
    '<div><strong style="font-size:13.5px;">'+escapeHtml(a.name)+'</strong>'+(a.active === false ? ' <span style="color:var(--coral); font-size:11px;">⏸ Suspendu</span>' : '')+
    '<p style="font-size:12px; color:rgba(245,239,227,0.55); margin:3px 0 0;">'+escapeHtml(a.country)+' · '+(domainLabels[a.domain] || 'Général')+'</p></div>' +
    '<div style="position:relative; padding-right:30px;"><span onclick="openRegionalAdminKebabMenu('+allAdmins.indexOf(a)+')" style="position:absolute; top:0; right:0; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span></div>' +
    '</div>'
  ).join('');
  if(revoked.length > 0){
    html += '<div class="eyebrow" style="margin-top:16px;">🗄️ DG révoqués (historique conservé)</div>' +
      revoked.map(a =>
        '<div class="card" style="opacity:0.6;"><strong style="font-size:13px;">'+escapeHtml(a.name)+'</strong> <span style="color:var(--coral); font-size:11px;">✕ Révoqué</span>' +
        '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:3px 0 0;">'+escapeHtml(a.country)+' — le '+new Date(a.revokedAt).toLocaleDateString('fr-FR')+'</p></div>'
      ).join('');
  }
  el.innerHTML = html;
}
async function openRegionalAdminKebabMenu(index){
  const admins = (await safeGet('settings:regionaladmins', true)) || [];
  const a = admins[index];
  if(!a) return;
  const items = [];
  items.push({ icon: a.active === false ? '▶️' : '⏸', label: a.active === false ? 'Réactiver' : 'Suspendre', action: 'closeGenericKebabMenu(); toggleAdminAccountActive(\'settings:regionaladmins\', '+index+', \'index\', \''+escapeHtml(a.name).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🔑', label: 'Réinitialiser le mot de passe', action: 'closeGenericKebabMenu(); changeAdminAccountPassword(\'settings:regionaladmins\', '+index+', \'index\', \''+escapeHtml(a.name).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🔄', label: 'Transférer les droits', action: 'closeGenericKebabMenu(); transferRegionalAdmin('+index+')' });
  items.push({ icon: '🌍', label: 'Suspendre toute la branche', action: 'closeGenericKebabMenu(); suspendEntireRegionalBranch('+index+')' });
  items.push({ icon: '✕', label: 'Retirer de l’équipe', action: 'closeGenericKebabMenu(); removeRegionalAdmin('+index+')' });
  openGenericKebabMenu(items);
}
async function openModeratorKebabMenu(index){
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const m = moderators[index];
  if(!m) return;
  const items = [];
  items.push({ icon: m.active === false ? '▶️' : '⏸', label: m.active === false ? 'Réactiver' : 'Suspendre', action: 'closeGenericKebabMenu(); toggleAdminAccountActive(\'settings:moderators\', '+index+', \'index\', \''+escapeHtml(m.name).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🔑', label: 'Réinitialiser le mot de passe', action: 'closeGenericKebabMenu(); changeAdminAccountPassword(\'settings:moderators\', '+index+', \'index\', \''+escapeHtml(m.name).replace(/'/g,"\\'")+'\')' });
  items.push({ icon: '🔄', label: 'Réassigner le domaine', action: 'closeGenericKebabMenu(); reassignModeratorDomain('+index+')' });
  items.push({ icon: '✕', label: 'Révoquer (kill switch)', action: 'closeGenericKebabMenu(); removeModerator('+index+')' });
  openGenericKebabMenu(items);
}
async function reassignModeratorDomain(index){
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const m = moderators[index];
  if(!m) return;
  const domainLabels = { moderation: '🛡️ Modération', marketplace: '🏪 Boutique & Marketplace', lives: '🔴 Lives', education: '🎓 Éducation', ads: '📢 Publicités', support: '🎫 Support', general: '⚠️ Accès complet' };
  const choice = prompt('Nouveau domaine d’accès pour ' + m.name + ' (actuel : ' + (domainLabels[m.restrictedDomain] || m.restrictedDomain) + ') :\n\nTapez : moderation, marketplace, lives, education, ads, support ou general');
  if(!choice || !domainLabels[choice.trim()]) { if(choice !== null) showToast('Domaine non reconnu'); return; }
  const oldDomainLabel = domainLabels[m.restrictedDomain] || m.restrictedDomain;
  m.restrictedDomain = choice.trim();
  await saveWithRetry('settings:moderators', moderators, true);
  await logAdminAction('Domaine du modérateur réassigné', m.name + ' : ' + oldDomainLabel + ' → ' + domainLabels[choice.trim()]);
  showToast('Domaine réassigné ✓');
  await loadModeratorsList();
}
async function transferRegionalAdmin(index){
  const admins = (await safeGet('settings:regionaladmins', true)) || [];
  const target = admins[index];
  if(!target) return;
  const newName = prompt('Nom complet du nouveau DG pour ' + target.country + ' (' + target.name + ' perdra immédiatement son accès) :');
  if(!newName || !newName.trim()) return;
  const tempPin = prompt('Mot de passe temporaire pour ' + newName.trim() + ' (il/elle devra le changer à sa première connexion) :');
  if(!tempPin || tempPin.length < 4){ showToast('Mot de passe temporaire trop court'); return; }
  const ok = confirm('Transférer les droits DG — ' + target.country + ' de « ' + target.name + ' » vers « ' + newName.trim() + ' » ?\n\n' + target.name + ' perdra son accès immédiatement. ' + newName.trim() + ' héritera exactement du même pays et du même domaine, avec un mot de passe à changer à sa première connexion.');
  if(!ok) return;
  const pinHash = await sha256Hex(tempPin);
  const superHash = await safeGet('settings:adminpin_hash', true);
  if(pinHash === superHash){ showToast('Choisissez un mot de passe différent de celui du propriétaire'); return; }
  admins[index] = { name: newName.trim(), pinHash, country: target.country, domain: target.domain, mustChangePassword: true, active: true };
  await saveWithRetry('settings:regionaladmins', admins, true);
  await logAdminAction('Droits DG transférés', target.country + ' : ' + target.name + ' → ' + newName.trim());
  showToast('Droits transférés à ' + newName.trim() + ' ✓');
  await loadRegionalAdminsList();
}
async function logPrivilegeException(exceptionType, targetId, category, justification){
  if(!justification || justification.trim().length < 30){ showToast('Le motif doit contenir au moins 30 caractères'); return false; }
  const role = isPayoutSpecialist ? 'Spécialiste reversements' : (isModerator ? 'Modérateur' : (isGenuineOwnerSession ? 'Propriétaire' : 'DG — ' + adminScope));
  const now = new Date();
  const id = 'exception_' + Date.now();
  await saveWithRetry('exceptionregistry:' + id, {
    id, actorName: currentAdminName, actorRole: role,
    utcTimestamp: now.toISOString(), localTimestamp: now.toLocaleString('fr-FR'),
    exceptionType, targetId: targetId || null,
    justification: justification.trim(), category,
    status: 'pending', createdAt: now.toISOString()
  }, true);
  await logAdminAction('⚠️ Passe-droit administratif utilisé', exceptionType + ' — ' + justification.trim().slice(0, 60));
  return true;
}
function getExceptionRiskLevel(exceptionType){
  const highRisk = ['Validation manuelle de compte sans 2FA', 'Déblocage forcé d’un utilisateur banni'];
  const mediumRisk = ['Accès exceptionnel à un journal de données personnelles'];
  if(highRisk.includes(exceptionType)) return 'high';
  if(mediumRisk.includes(exceptionType)) return 'medium';
  return 'low';
}
function isSuspiciousJustification(text, actorName, recentCount){
  const vagueWords = ['test', 'ok', 'urgent', 'bug', 'rien', 'divers'];
  const lower = text.toLowerCase().trim();
  const isVague = vagueWords.some(w => lower === w || lower.length < 40);
  return isVague || recentCount >= 5;
}
async function renderExceptionsRegistry(){
  const el = document.getElementById('exceptions-registry-list');
  if(!el) return;
  const dateFilter = document.getElementById('exceptions-filter-date') ? document.getElementById('exceptions-filter-date').value : '';
  const employeeFilter = document.getElementById('exceptions-filter-employee') ? document.getElementById('exceptions-filter-employee').value.trim().toLowerCase() : '';
  const riskFilter = document.getElementById('exceptions-filter-risk') ? document.getElementById('exceptions-filter-risk').value : '';
  const keys = await safeList('exceptionregistry:', true);
  let entries = [];
  for(const k of keys){ const e = await safeGet(k, true).catch(() => null); if(e) entries.push({...e, key: k}); }
  entries.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const byActor = {};
  entries.forEach(e => { byActor[e.actorName] = (byActor[e.actorName] || 0) + 1; });
  entries = entries.map(e => ({ ...e, riskLevel: getExceptionRiskLevel(e.exceptionType), suspicious: isSuspiciousJustification(e.justification, e.actorName, byActor[e.actorName]) }));
  if(dateFilter) entries = entries.filter(e => e.createdAt.slice(0,10) === dateFilter);
  if(employeeFilter) entries = entries.filter(e => e.actorName.toLowerCase().includes(employeeFilter));
  if(riskFilter) entries = entries.filter(e => e.riskLevel === riskFilter || (riskFilter === 'suspicious' && e.suspicious));
  if(entries.length === 0){ el.innerHTML = '<div class="empty">Aucune exception enregistrée pour ces filtres.</div>'; return; }
  const riskColors = { high: 'var(--coral)', medium: 'var(--gold)', low: 'var(--lagoon)' };
  el.innerHTML = entries.map(e =>
    '<div class="card" style="margin-bottom:8px; border-color:'+(e.suspicious ? 'var(--coral)' : riskColors[e.riskLevel])+';'+(e.suspicious ? ' background:rgba(255,100,100,0.06);' : '')+'">' +
    (e.suspicious ? '<p style="margin:0 0 4px; font-size:11px; color:var(--coral); font-weight:600;">🚩 Motif suspect ou fréquence anormale</p>' : '') +
    '<p style="margin:0 0 4px; font-size:12.5px;"><strong>'+escapeHtml(e.actorName)+'</strong> ('+escapeHtml(e.actorRole)+')</p>' +
    '<p style="margin:0 0 4px; font-size:12px; color:'+riskColors[e.riskLevel]+';">'+escapeHtml(e.exceptionType)+(e.targetId ? ' — cible : '+escapeHtml(e.targetId) : '')+'</p>' +
    '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.6);">« '+escapeHtml(e.justification)+' » — '+escapeHtml(e.category)+'</p>' +
    '<p style="margin:0 0 8px; font-size:10.5px; color:rgba(245,239,227,0.4);">'+e.localTimestamp+' (UTC : '+new Date(e.utcTimestamp).toISOString()+') — Statut : '+(e.status === 'pending' ? 'En attente d’examen' : e.status === 'validated' ? '✓ Validé par le DG' : '⚠️ Signalé comme anomalie')+'</p>' +
    (e.status === 'pending' ? '<div style="display:flex; gap:8px;"><button class="btn btn-outline btn-sm" onclick="resolveExceptionEntry(\''+e.key+'\', \'validated\')">✓ Audité et conforme</button><button class="btn btn-outline btn-sm" style="border-color:var(--coral); color:var(--coral);" onclick="resolveExceptionEntry(\''+e.key+'\', \'flagged\')">⚠️ Anomalie</button></div>' : '') +
    '</div>'
  ).join('');
}
async function resolveExceptionEntry(key, status){
  const e = await safeGet(key, true);
  if(!e) return;
  e.status = status;
  await saveWithRetry(key, e, true);
  await logAdminAction('Exception examinée (' + (status === 'validated' ? 'conforme' : 'anomalie') + ')', e.actorName + ' — ' + e.exceptionType);
  showToast('Entrée mise à jour ✓');
  await renderExceptionsRegistry();
}
async function exportExceptionsRegistryReport(){
  const keys = await safeList('exceptionregistry:', true);
  const entries = [];
  for(const k of keys){ const e = await safeGet(k, true).catch(() => null); if(e) entries.push(e); }
  entries.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const now = new Date().toLocaleDateString('fr-FR');
  let text = 'Suktum — Registre des exceptions et passe-droits administratifs\nGénéré le : ' + now + '\n\n';
  text += 'Nombre total d’exceptions enregistrées : ' + entries.length + '\n\n';
  entries.forEach(e => {
    text += '---\n';
    text += 'Auteur : ' + e.actorName + ' (' + e.actorRole + ')\n';
    text += 'Horodatage : ' + e.localTimestamp + ' (UTC : ' + e.utcTimestamp + ')\n';
    text += 'Type d’exception : ' + e.exceptionType + (e.targetId ? ' — cible : ' + e.targetId : '') + '\n';
    text += 'Motif (' + e.category + ') : ' + e.justification + '\n';
    text += 'Statut : ' + (e.status === 'pending' ? 'En attente d’examen' : e.status === 'validated' ? 'Validé par le DG' : 'Signalé comme anomalie') + '\n';
  });
  text += '\n---\nCe rapport reflète les données réellement enregistrées sur Suktum. Il ne constitue pas un document certifié par un tiers indépendant.';
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'registre-exceptions-suktum-' + now.replace(/\//g,'-') + '.txt';
  a.click();
  await logAdminAction('Registre des exceptions exporté', entries.length + ' entrée(s)');
}
async function confirmWithPinReentry(){
  const pin = prompt('Pour confirmer cette action critique, ressaisissez votre mot de passe :');
  if(pin === null) return false;
  const pinHash = await sha256Hex(pin);
  const storedHash = await safeGet('settings:adminpin_hash', true);
  if(pinHash !== storedHash){ showToast('Mot de passe incorrect — action annulée'); return false; }
  return true;
}
async function renderServiceHealthDashboard(){
  const el = document.getElementById('service-health-dashboard');
  if(!el) return;
  el.innerHTML = '<p style="font-size:11px; color:rgba(245,239,227,0.5);">Mesure en cours...</p>';
  const writeStart = performance.now();
  const testKey = 'healthcheck:' + Date.now();
  await saveWithRetry(testKey, { ts: Date.now() }, true).catch(() => {});
  const writeLatency = Math.round(performance.now() - writeStart);
  const readStart = performance.now();
  await safeGet(testKey, true).catch(() => {});
  const readLatency = Math.round(performance.now() - readStart);
  await window.storage.delete(testKey, true).catch(() => {});
  const reportKeys = await safeList('report:', true);
  let lastAutoDetection = null;
  for(const k of reportKeys){ const r = await safeGet(k, true).catch(() => null); if(r && r.autoDetected && (!lastAutoDetection || new Date(r.createdAt) > new Date(lastAutoDetection))) lastAutoDetection = r.createdAt; }
  const geminiKey = await safeGet('settings:geminiApiKey', true).catch(() => null);
  const storageOk = writeLatency < 3000 && readLatency < 3000;
  const badge = (label, ok, detail) => '<div class="card" style="margin-bottom:6px;"><p style="margin:0; font-size:12.5px;"><span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:'+(ok?'var(--lagoon)':'var(--coral)')+'; margin-right:6px;"></span>'+label+'</p><p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.5); margin-left:14px;">'+detail+'</p></div>';
  el.innerHTML = '<p style="font-size:10.5px; color:rgba(245,239,227,0.4); margin:0 0 10px;">Suktum n’a pas de base de données propre — le stockage est géré directement par Anthropic. Ces indicateurs mesurent la latence réellement observée depuis cette session, pas un vrai serveur Suktum dédié.</p>' +
    badge('Stockage (lecture/écriture)', storageOk, 'Écriture : ' + writeLatency + ' ms · Lecture : ' + readLatency + ' ms') +
    badge('Filtrage IA de modération', !!geminiKey, geminiKey ? (lastAutoDetection ? 'Dernière détection automatique : ' + new Date(lastAutoDetection).toLocaleString('fr-FR') : 'Configuré, aucune détection récente') : 'Aucune clé IA configurée') +
    badge('Connexion réseau', navigator.onLine, navigator.onLine ? 'Appareil en ligne' : 'Appareil hors ligne');
}
async function suspendEntireRegionalBranch(index){
  const admins = (await safeGet('settings:regionaladmins', true)) || [];
  const target = admins[index];
  if(!target) return;
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const localModerators = moderators.filter(m => m.country === target.country && !m.revokedAt && m.active !== false);
  const ok = confirm('Suspendre TOUTE la branche de ' + target.country + ' ?\n\nCela suspendra ' + target.name + ' (DG) ET ses ' + localModerators.length + ' modérateur(s) local/locaux d’un coup. Le reste de la plateforme n’est pas affecté.');
  if(!ok) return;
  if(!(await confirmWithPinReentry())) return;
  target.active = false;
  let count = 1;
  localModerators.forEach(m => { m.active = false; count++; });
  await saveWithRetry('settings:regionaladmins', admins, true);
  await saveWithRetry('settings:moderators', moderators, true);
  await logAdminAction('🌍 Branche régionale suspendue entièrement', target.country + ' — ' + count + ' accès désactivé(s)');
  showToast('Branche de ' + target.country + ' suspendue ✓ (' + count + ' accès)');
  await loadRegionalAdminsList();
}
async function suspendEntireDepartment(){
  const domainLabels = { moderation: '🛡️ Modération', marketplace: '🏪 Boutique & Marketplace', lives: '🔴 Lives', education: '🎓 Éducation', ads: '📢 Publicités', support: '🎫 Support' };
  const domain = prompt('Département à suspendre entièrement (tous ses modérateurs, tous pays confondus) :\n\nTapez : moderation, marketplace, lives, education, ads ou support');
  if(!domain || !domainLabels[domain.trim()]){ if(domain !== null) showToast('Département non reconnu'); return; }
  const trimmed = domain.trim();
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const departmentModerators = moderators.filter(m => m.restrictedDomain === trimmed && !m.revokedAt && m.active !== false);
  if(departmentModerators.length === 0){ showToast('Aucun modérateur actif dans ce département'); return; }
  const ok = confirm('Suspendre TOUT le département ' + domainLabels[trimmed] + ' ?\n\nCela suspendra ses ' + departmentModerators.length + ' modérateur(s), dans TOUS les pays, d’un coup. Les autres départements ne sont pas affectés.');
  if(!ok) return;
  if(!(await confirmWithPinReentry())) return;
  departmentModerators.forEach(m => { m.active = false; });
  await saveWithRetry('settings:moderators', moderators, true);
  await logAdminAction('🏢 Département suspendu entièrement', domainLabels[trimmed] + ' — ' + departmentModerators.length + ' accès désactivé(s)');
  showToast('Département ' + domainLabels[trimmed] + ' suspendu ✓ (' + departmentModerators.length + ' accès)');
  await loadModeratorsList();
}
async function removeRegionalAdmin(index){
  const admins = (await safeGet('settings:regionaladmins', true)) || [];
  const target = admins[index];
  if(!target) return;
  const ok = confirm('Révoquer ' + target.name + ' (DG — ' + target.country + ') ?\n\nSes modérateurs locaux, les publications, commandes et données de ' + target.country + ' resteront intacts. Son accès à l’administration sera coupé immédiatement et vous reprenez directement la gestion de ' + target.country + ' jusqu’à nommer un remplaçant.');
  if(!ok) return;
  if(isGenuineOwnerSession && !(await confirmWithPinReentry())) return;
  target.active = false;
  target.revokedAt = new Date().toISOString();
  await saveWithRetry('settings:regionaladmins', admins, true);
  showToast('DG révoqué ✓ — accès coupé immédiatement, vous gérez désormais ' + target.country);
  await logAdminAction('DG régional révoqué', target.name + ' (' + target.country + ')');
  await loadRegionalAdminsList();
}

/* ---------- ÉQUIPE REVERSEMENTS ---------- */
function updatePayoutSpecialistPasswordStrength(){
  const pw = document.getElementById('payout-specialist-pin-input').value;
  const el = document.getElementById('payout-specialist-password-strength');
  if(!pw){ el.textContent = ''; return; }
  const r = renderPasswordStrengthLabel(pw);
  el.style.color = r.color;
  el.textContent = r.text;
}
async function addPayoutSpecialist(){
  const name = document.getElementById('payout-specialist-name-input').value.trim();
  const pin = document.getElementById('payout-specialist-pin-input').value;
  if(!name){ showToast('Renseignez un nom'); return; }
  const {strong} = checkPasswordStrength(pin);
  if(!strong){ showToast('Le mot de passe ne respecte pas encore toutes les règles'); return; }
  const pinHash = await sha256Hex(pin);
  const superHash = await safeGet('settings:adminpin_hash', true);
  if(pinHash === superHash){ showToast('Choisissez un mot de passe différent du vôtre'); return; }
  const specialists = (await safeGet('settings:payoutspecialists', true)) || [];
  if(specialists.some(s => s.pinHash === pinHash)){ showToast('Ce mot de passe est déjà utilisé'); return; }
  specialists.push({name, pinHash, active: true, addedAt: new Date().toISOString()});
  await saveWithRetry('settings:payoutspecialists', specialists, true);
  document.getElementById('payout-specialist-name-input').value = '';
  document.getElementById('payout-specialist-pin-input').value = '';
  showToast('Ajouté à l’équipe reversements ✓');
  await logAdminAction('Membre ajouté — équipe reversements', name);
  await loadPayoutSpecialistsList();
}
async function togglePayoutSpecialistActive(index){
  const specialists = (await safeGet('settings:payoutspecialists', true)) || [];
  if(!specialists[index]) return;
  specialists[index].active = !specialists[index].active;
  await saveWithRetry('settings:payoutspecialists', specialists, true);
  showToast(specialists[index].active ? 'Accès réactivé ✓' : 'Accès désactivé à distance ✓');
  await logAdminAction(specialists[index].active ? 'Accès réactivé — équipe reversements' : 'Accès désactivé — équipe reversements', specialists[index].name);
  await loadPayoutSpecialistsList();
}
async function resetPayoutSpecialistPassword(index){
  const specialists = (await safeGet('settings:payoutspecialists', true)) || [];
  if(!specialists[index]) return;
  const newPw = prompt('Nouveau mot de passe pour ' + specialists[index].name + ' (8+ caractères, majuscule, minuscule, chiffre, caractère spécial) :');
  if(newPw === null) return;
  const {strong} = checkPasswordStrength(newPw);
  if(!strong){ showToast('Ce mot de passe ne respecte pas encore toutes les règles'); return; }
  specialists[index].pinHash = await sha256Hex(newPw);
  await saveWithRetry('settings:payoutspecialists', specialists, true);
  showToast('Mot de passe réinitialisé ✓');
  await logAdminAction('Mot de passe réinitialisé — équipe reversements', specialists[index].name);
  await loadPayoutSpecialistsList();
}
async function removePayoutSpecialist(index){
  const specialists = (await safeGet('settings:payoutspecialists', true)) || [];
  const target = specialists[index];
  if(!target) return;
  const ok = confirm('Limoger ' + target.name + ' de l’équipe reversements ?\n\nL’historique de ses actions reste dans le journal d’audit. Son accès sera coupé immédiatement, même s’il est déjà connecté ailleurs.');
  if(!ok) return;
  specialists.splice(index, 1);
  await saveWithRetry('settings:payoutspecialists', specialists, true);
  showToast('Retiré de l’équipe ✓ — le reste de l’application n’est pas affecté');
  await logAdminAction('Membre limogé — équipe reversements', target.name);
  await loadPayoutSpecialistsList();
}
async function loadPayoutSpecialistsList(){
  const el = document.getElementById('payout-specialists-list');
  if(!el) return;
  const specialists = (await safeGet('settings:payoutspecialists', true)) || [];
  if(specialists.length === 0){ el.innerHTML = '<div class="empty">Aucun membre pour l’instant.</div>'; return; }
  el.innerHTML = specialists.map((s, i) =>
    '<div class="card">' +
    '<p style="margin:0 0 10px; font-size:13px;"><strong>'+escapeHtml(s.name)+'</strong> — '+(s.active ? '<span style="color:var(--lagoon);">🟢 Actif</span>' : '<span style="color:var(--coral);">⏸ Désactivé</span>')+'</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
    '<button class="btn btn-outline btn-sm" onclick="togglePayoutSpecialistActive('+i+')">'+(s.active ? '⏸ Désactiver à distance' : '▶️ Réactiver')+'</button>' +
    '<button class="btn btn-outline btn-sm" onclick="resetPayoutSpecialistPassword('+i+')">🔑 Réinitialiser le mot de passe</button>' +
    '<button class="btn btn-outline btn-sm" onclick="removePayoutSpecialist('+i+')">🗑️ Limoger</button>' +
    '</div></div>'
  ).join('');
}

/* ---------- MODÉRATEURS DE CONTENU ---------- */
function updateModeratorPasswordStrength(){
  const pw = document.getElementById('moderator-pin').value;
  const el = document.getElementById('moderator-password-strength');
  if(!pw){ el.textContent = ''; return; }
  const r = renderPasswordStrengthLabel(pw);
  el.style.color = r.color;
  el.textContent = r.text;
}
async function addModerator(){
  const name = document.getElementById('moderator-name').value.trim();
  const pin = document.getElementById('moderator-pin').value;
  if(!name){ showToast('Renseignez un nom'); return; }
  const {strong} = checkPasswordStrength(pin);
  if(!strong){ showToast('Le mot de passe ne respecte pas encore toutes les règles'); return; }
  const pinHash = await sha256Hex(pin);
  const superHash = await safeGet('settings:adminpin_hash', true);
  if(pinHash === superHash){ showToast('Choisissez un mot de passe différent du vôtre'); return; }
  const regionalAdmins = (await safeGet('settings:regionaladmins', true)) || [];
  if(regionalAdmins.some(a => a.pinHash === pinHash)){ showToast('Ce mot de passe est déjà utilisé par un admin régional'); return; }
  const moderators = (await safeGet('settings:moderators', true)) || [];
  if(moderators.some(m => m.pinHash === pinHash)){ showToast('Ce mot de passe est déjà utilisé par un autre modérateur'); return; }
  const country = adminScope !== 'all' ? adminScope : null;
  const restrictedDomain = document.getElementById('moderator-domain-select').value || 'moderation';
  const mustChangePassword = document.getElementById('moderator-must-change').checked;
  const expiresInput = document.getElementById('moderator-expires-input').value;
  const expiresAt = expiresInput ? new Date(expiresInput + 'T23:59:59').toISOString() : null;
  moderators.push({name, pinHash, country, restrictedDomain, expiresAt, addedBy: currentAdminName, mustChangePassword});
  await saveWithRetry('settings:moderators', moderators, true);
  document.getElementById('moderator-name').value = '';
  document.getElementById('moderator-pin').value = '';
  document.getElementById('moderator-must-change').checked = false;
  showToast('Modérateur ajouté ✓');
  await logAdminAction('Ajout d’un modérateur', name + (country ? ' (' + country + ')' : ' (global)'));
  await loadModeratorsList();
}
async function loadModeratorsList(){
  const el = document.getElementById('moderators-list');
  if(!el) return;
  const allModerators = (await safeGet('settings:moderators', true)) || [];
  const visible = allModerators.map((m, i) => ({m, i})).filter(({m}) => !m.revokedAt && (adminScope === 'all' || m.country === adminScope));
  const revoked = allModerators.filter(m => m.revokedAt && (adminScope === 'all' || m.country === adminScope));
  let html = visible.length === 0 ? '<div class="empty">Aucun modérateur actif pour l’instant.</div>' : visible.map(({m, i}) =>
    '<div class="card" style="display:flex; justify-content:space-between; align-items:center;">' +
    '<div><strong style="font-size:13.5px;">'+escapeHtml(m.name)+'</strong>'+(m.active === false ? ' <span style="color:var(--coral); font-size:11px;">⏸ Suspendu</span>' : '')+
    (m.country ? '<span style="font-size:11px; color:rgba(245,239,227,0.5); margin-left:6px;">'+escapeHtml(m.country)+'</span>' : '') +
    (m.restrictedDomain ? '<p style="margin:2px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Domaine : '+escapeHtml(m.restrictedDomain)+'</p>' : '') +
    (m.expiresAt ? '<p style="margin:2px 0 0; font-size:10.5px; color:var(--gold);">⏳ Délégation temporaire — expire le '+new Date(m.expiresAt).toLocaleDateString('fr-FR')+'</p>' : '') + '</div>' +
    '<span onclick="openModeratorKebabMenu('+i+')" style="font-size:18px; cursor:pointer; padding:6px;">⋮</span>' +
    '</div>'
  ).join('');
  if(revoked.length > 0){
    html += '<div class="eyebrow" style="margin-top:16px;">🗄️ Modérateurs révoqués (historique conservé)</div>' +
      revoked.map(m =>
        '<div class="card" style="opacity:0.6;"><strong style="font-size:13px;">'+escapeHtml(m.name)+'</strong> <span style="color:var(--coral); font-size:11px;">✕ Révoqué</span>' +
        '<p style="font-size:11.5px; color:rgba(245,239,227,0.5); margin:3px 0 0;">le '+new Date(m.revokedAt).toLocaleDateString('fr-FR')+'</p></div>'
      ).join('');
  }
  el.innerHTML = html;
}
async function removeModerator(index){
  const moderators = (await safeGet('settings:moderators', true)) || [];
  const target = moderators[index];
  if(!target) return;
  const ok = confirm('Révoquer ' + target.name + ' de l’équipe de modération ?\n\nSon accès sera coupé immédiatement.');
  if(!ok) return;
  if(isGenuineOwnerSession && !(await confirmWithPinReentry())) return;
  target.active = false;
  target.revokedAt = new Date().toISOString();
  await saveWithRetry('settings:moderators', moderators, true);
  showToast('Modérateur révoqué ✓ — accès coupé immédiatement');
  await logAdminAction('Modérateur révoqué', target.name);
  await loadModeratorsList();
}

