/* ---------- LANGUE DE L'INTERFACE (FR / WOLOF) ---------- */
let dataSaverEnabled = false;
async function toggleDataSaver(){
  dataSaverEnabled = document.getElementById('data-saver-toggle').checked;
  document.getElementById('data-saver-toggle-visual').style.background = dataSaverEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  await saveWithRetry('settings:datasaver', dataSaverEnabled, false);
  showToast(dataSaverEnabled ? 'Économie de données activée ✓' : 'Économie de données désactivée');
}
/* ---------- SOUS-TITRES AUTOMATIQUES (générés à partir de la légende) ---------- */
let subtitlesEnabled = false;
async function toggleHideViewCount(){
  if(!currentUser) return;
  const hideViewCount = document.getElementById('hide-view-count-toggle').checked;
  document.getElementById('hide-view-count-toggle-visual').style.background = hideViewCount ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  const me = await safeGet('user:' + currentUser, true);
  if(me){ me.hideViewCount = hideViewCount; await saveWithRetry('user:' + currentUser, me, true); }
  showToast(hideViewCount ? 'Compteur de vues masqué ✓' : 'Compteur de vues visible à nouveau');
  await renderFeed();
}
async function loadHideViewCountPreference(){
  if(!currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const checkbox = document.getElementById('hide-view-count-toggle');
  if(checkbox && me){ checkbox.checked = !!me.hideViewCount; document.getElementById('hide-view-count-toggle-visual').style.background = me.hideViewCount ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)'; }
}
async function toggleHideLikeCount(){
  if(!currentUser) return;
  const hideLikeCount = document.getElementById('hide-like-count-toggle').checked;
  document.getElementById('hide-like-count-toggle-visual').style.background = hideLikeCount ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  const me = await safeGet('user:' + currentUser, true);
  if(me){ me.hideLikeCount = hideLikeCount; await saveWithRetry('user:' + currentUser, me, true); }
  showToast(hideLikeCount ? 'Compteur de j’aime masqué ✓' : 'Compteur de j’aime visible à nouveau');
  await renderFeed();
}
async function loadHideLikeCountPreference(){
  if(!currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  const checkbox = document.getElementById('hide-like-count-toggle');
  if(checkbox && me){ checkbox.checked = !!me.hideLikeCount; document.getElementById('hide-like-count-toggle-visual').style.background = me.hideLikeCount ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)'; }
}
async function generateVideoSubtitles(cacheId, videoData, targetLang){
  const existing = await safeGet('videosubtitles:' + cacheId + '__' + targetLang, true);
  if(existing) return existing.text;
  if(!videoData || !videoData.startsWith('data:video')) return null;
  const geminiKey = await safeGet('settings:geminiApiKey', true);
  if(!geminiKey) return null;
  const base64Data = videoData.split(',')[1];
  const mimeType = videoData.split(';')[0].replace('data:', '');
  const langLabel = targetLang === 'en' ? 'anglais' : 'français';
  try{
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + geminiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: 'Transcris exactement ce qui est dit dans cette vidéo, puis traduis-le en ' + langLabel + ' si ce n’est pas déjà dans cette langue. Réponds uniquement avec le texte final en ' + langLabel + ', sans préambule, sans horodatage, sans description de la scène. Si aucune parole n’est audible, réponds exactement : AUCUNE_PAROLE_DETECTEE' }
        ] }],
        generationConfig: { maxOutputTokens: 600 }
      })
    });
    const data = await response.json();
    const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.map(pt => pt.text).join('');
    if(!text || text.trim() === 'AUCUNE_PAROLE_DETECTEE') return null;
    await saveWithRetry('videosubtitles:' + cacheId + '__' + targetLang, { text: text.trim(), generatedAt: new Date().toISOString() }, true);
    return text.trim();
  }catch(e){ return null; }
}
async function toggleSubtitles(){
  subtitlesEnabled = document.getElementById('subtitles-toggle').checked;
  document.getElementById('subtitles-toggle-visual').style.background = subtitlesEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  await saveWithRetry('settings:subtitles', subtitlesEnabled, false);
  showToast(subtitlesEnabled ? 'Sous-titres activés ✓' : 'Sous-titres désactivés');
  await renderFeed();
}
async function loadSubtitlesPreference(){
  const saved = await safeGet('settings:subtitles', false);
  subtitlesEnabled = saved === true;
  const toggle = document.getElementById('subtitles-toggle');
  const visual = document.getElementById('subtitles-toggle-visual');
  if(toggle) toggle.checked = subtitlesEnabled;
  if(visual) visual.style.background = subtitlesEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  const langSelect = document.getElementById('subtitle-language-select');
  if(langSelect) langSelect.value = (await safeGet('settings:subtitleLanguage', false)) || 'fr';
}
/* ---------- AFFICHAGE MULTI-DEVISES (INDICATIF) ---------- */
let displayCurrency = 'FCFA';
async function loadDisplayCurrencyPreference(){
  const saved = await safeGet('settings:displayCurrency', false);
  displayCurrency = saved || 'FCFA';
}
async function setDisplayCurrency(value){
  displayCurrency = value;
  await saveWithRetry('settings:displayCurrency', value, false);
  showToast('Devise d’affichage mise à jour ✓');
}
async function saveCurrencyRates(){
  const rates = {
    EUR: parseFloat(document.getElementById('rate-eur').value) || null,
    USD: parseFloat(document.getElementById('rate-usd').value) || null,
    CAD: parseFloat(document.getElementById('rate-cad').value) || null
  };
  await saveWithRetry('settings:currencyRates', rates, true);
  showToast('Taux de change enregistrés ✓');
}
async function loadCurrencyRatesAdmin(){
  const rates = (await safeGet('settings:currencyRates', true)) || {};
  const eurEl = document.getElementById('rate-eur');
  if(!eurEl) return;
  eurEl.value = rates.EUR || '';
  document.getElementById('rate-usd').value = rates.USD || '';
  document.getElementById('rate-cad').value = rates.CAD || '';
}
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', CAD: 'CAD $' };
async function formatPriceIndicative(fcfaAmount){
  const base = fcfaAmount.toLocaleString('fr-FR') + ' FCFA';
  if(displayCurrency === 'FCFA') return base;
  const rates = (await safeGet('settings:currencyRates', true)) || {};
  const rate = rates[displayCurrency];
  if(!rate || rate <= 0) return base;
  const converted = (fcfaAmount / rate).toLocaleString('fr-FR', {maximumFractionDigits: 2});
  return base + ' (≈ ' + converted + ' ' + CURRENCY_SYMBOLS[displayCurrency] + ')';
}
async function updateGiftButtonLabels(prefix){
  const amounts = [[100,'🎈'], [500,'🌟'], [1000,'💎'], [5000,'👑']];
  for(const [amount, emoji] of amounts){
    const btn = document.getElementById(prefix + '-btn-' + amount);
    if(btn) btn.textContent = emoji + ' ' + await formatPriceIndicative(amount);
  }
}
async function loadDataSaverPreference(){
  const saved = await safeGet('settings:datasaver', false);
  dataSaverEnabled = saved === true;
}
function loadVideoOnTap(postId){
  const video = document.getElementById('video-' + postId);
  const overlay = document.getElementById('video-play-overlay-' + postId);
  if(!video) return;
  if(!video.src && video.dataset.src){ video.src = video.dataset.src; }
  video.play();
  if(overlay) overlay.style.display = 'none';
}
/* ---------- PALETTES DE COULEURS ALTERNATIVES ---------- */
const COLOR_THEMES = [
  { id: 'pirogue', name: '🛶 Pirogue', colors: ['#E8552F', '#F2B705', '#2FB8A6'] },
  { id: 'baobab', name: '🌳 Baobab', colors: ['#C1440E', '#D4A017', '#2D6A4F'] },
  { id: 'sahel', name: '🌅 Sahel', colors: ['#C0392B', '#D4AC0D', '#E67E22'] },
  { id: 'recif', name: '🌊 Récif', colors: ['#EC7063', '#F4D03F', '#16A085'] },
];
async function renderThemePicker(){
  const el = document.getElementById('theme-picker-options');
  if(!el) return;
  const current = (await safeGet('settings:colorTheme', false)) || 'pirogue';
  el.innerHTML = COLOR_THEMES.map(t =>
    '<button type="button" onclick="setColorTheme(\''+t.id+'\')" style="display:flex; align-items:center; gap:6px; padding:8px 10px; border-radius:10px; border:1px solid '+(current===t.id?'var(--gold)':'var(--line)')+'; background:transparent; color:var(--cream); font-size:12px; cursor:pointer;">' +
    '<span style="display:flex; gap:2px;">' + t.colors.map(c => '<span style="width:10px; height:10px; border-radius:50%; background:'+c+'; display:inline-block;"></span>').join('') + '</span>' +
    t.name + (current===t.id ? ' ✓' : '') +
    '</button>'
  ).join('');
}
async function setColorTheme(themeId){
  COLOR_THEMES.forEach(t => document.body.classList.remove('theme-' + t.id));
  if(themeId !== 'pirogue') document.body.classList.add('theme-' + themeId);
  await saveWithRetry('settings:colorTheme', themeId, false);
  showToast('Palette appliquée ✓');
  await renderThemePicker();
}
function toggleLightMode(){
  const enabled = document.getElementById('light-mode-toggle').checked;
  document.body.classList.toggle('light-mode', enabled);
  document.getElementById('light-mode-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  saveWithRetry('settings:theme', enabled ? 'light' : 'dark', false);
}
/* ---------- MODE SOMBRE AUTOMATIQUE SELON L'HEURE (19h-7h) ---------- */
async function toggleWishlistVisibility(){
  const enabled = document.getElementById('wishlist-visible-toggle').checked;
  const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
  me.wishlistVisible = enabled;
  await saveWithRetry('user:' + currentUser, me, true);
  document.getElementById('wishlist-visible-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
async function loadWishlistVisibilityToggle(){
  const me = await safeGet('user:' + currentUser, true);
  const enabled = !!(me && me.wishlistVisible);
  const toggle = document.getElementById('wishlist-visible-toggle');
  const visual = document.getElementById('wishlist-visible-toggle-visual');
  if(toggle) toggle.checked = enabled;
  if(visual) visual.style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
async function shareMyWishlist(){
  const list = (await safeGet('wishlist:' + currentUser, true)) || [];
  if(list.length === 0){ showToast('Votre liste de souhaits est vide pour l’instant'); return; }
  const products = [];
  for(const productId of list){ const p = await safeGet('product:' + productId, true).catch(() => null); if(p) products.push(p); }
  if(products.length === 0){ showToast('Votre liste de souhaits est vide pour l’instant'); return; }
  const text = '🎁 La liste de souhaits de @' + currentUser + ' sur Suktum :\n\n' +
    products.map(p => '• ' + p.name + ' — ' + p.price.toLocaleString('fr-FR') + ' FCFA').join('\n');
  if(navigator.share){ await navigator.share({ title: 'Ma liste de souhaits Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Liste copiée ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function toggleAccessibilityMode(){
  const enabled = document.getElementById('accessibility-mode-toggle').checked;
  await saveWithRetry('settings:accessibilityMode', enabled, false);
  document.getElementById('accessibility-mode-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  document.body.classList.toggle('accessibility-mode', enabled);
}
async function loadAccessibilityModeToggle(){
  const enabled = await safeGet('settings:accessibilityMode', false);
  const toggle = document.getElementById('accessibility-mode-toggle');
  const visual = document.getElementById('accessibility-mode-toggle-visual');
  if(toggle) toggle.checked = !!enabled;
  if(visual) visual.style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  document.body.classList.toggle('accessibility-mode', !!enabled);
}
async function applyTheme(themeId){
  document.body.classList.remove('theme-baobab', 'theme-sahel', 'theme-recif');
  document.documentElement.style.removeProperty('--coral');
  document.documentElement.style.removeProperty('--gold');
  document.documentElement.style.removeProperty('--lagoon');
  if(themeId && themeId.startsWith('custom:')){
    const id = themeId.replace('custom:', '');
    const theme = await safeGet('customtheme:' + currentUser + '__' + id, false).catch(() => null);
    if(theme){
      document.documentElement.style.setProperty('--coral', theme.coral);
      document.documentElement.style.setProperty('--gold', theme.gold);
      document.documentElement.style.setProperty('--lagoon', theme.lagoon);
    }
  } else if(themeId && themeId !== 'default'){
    document.body.classList.add('theme-' + themeId);
  }
  await saveWithRetry('settings:selectedTheme', themeId || 'default', false);
}
async function loadSelectedTheme(){
  const themeId = await safeGet('settings:selectedTheme', false).catch(() => 'default');
  await applyTheme(themeId || 'default');
}
const BUILTIN_THEMES = {
  default: { name: 'Suktum (par défaut)', coral: '#E8552F', gold: '#F2B705', lagoon: '#2FB8A6' },
  baobab: { name: '🌳 Baobab', coral: '#C1440E', gold: '#D4A017', lagoon: '#2D6A4F' },
  sahel: { name: '🏜️ Sahel', coral: '#C0392B', gold: '#D4AC0D', lagoon: '#E67E22' },
  recif: { name: '🐠 Récif', coral: '#EC7063', gold: '#F4D03F', lagoon: '#16A085' }
};
async function renderThemeManager(){
  const currentThemeId = await safeGet('settings:selectedTheme', false).catch(() => 'default') || 'default';
  const builtinEl = document.getElementById('builtin-themes-list');
  builtinEl.innerHTML = Object.entries(BUILTIN_THEMES).map(([id, t]) =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:8px; display:flex; align-items:center; gap:10px;'+(currentThemeId === id ? ' border-color:var(--lagoon);' : '')+'">' +
    '<span onclick="openThemeKebabMenu(\''+id+'\', true)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<div style="display:flex; gap:3px;"><span style="width:16px; height:16px; border-radius:50%; background:'+t.coral+';"></span><span style="width:16px; height:16px; border-radius:50%; background:'+t.gold+';"></span><span style="width:16px; height:16px; border-radius:50%; background:'+t.lagoon+';"></span></div>' +
    '<span style="flex:1; font-size:13px;">'+t.name+(currentThemeId === id ? ' ✓' : '')+'</span>' +
    '</div>'
  ).join('');
  const keys = await safeList('customtheme:' + currentUser + '__', false);
  const customThemes = [];
  for(const k of keys){ const t = await safeGet(k, false).catch(() => null); if(t) customThemes.push({...t, id: k.replace('customtheme:' + currentUser + '__', '')}); }
  const customEl = document.getElementById('custom-themes-list');
  customEl.innerHTML = customThemes.length === 0 ? '<div class="empty">Aucun thème personnalisé pour l’instant.</div>' : customThemes.map(t =>
    '<div class="card" style="position:relative; padding-right:40px; margin-bottom:8px; display:flex; align-items:center; gap:10px;'+(currentThemeId === 'custom:'+t.id ? ' border-color:var(--lagoon);' : '')+'">' +
    '<span onclick="openThemeKebabMenu(\''+t.id+'\', false)" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:6px; line-height:1;">⋮</span>' +
    '<div style="display:flex; gap:3px;"><span style="width:16px; height:16px; border-radius:50%; background:'+t.coral+';"></span><span style="width:16px; height:16px; border-radius:50%; background:'+t.gold+';"></span><span style="width:16px; height:16px; border-radius:50%; background:'+t.lagoon+';"></span></div>' +
    '<span style="flex:1; font-size:13px;">'+escapeHtml(t.name)+(currentThemeId === 'custom:'+t.id ? ' ✓' : '')+'</span>' +
    '</div>'
  ).join('');
}
async function createCustomTheme(){
  const name = document.getElementById('new-theme-name').value.trim();
  if(!name){ showToast('Donnez un nom à votre thème'); return; }
  const coral = document.getElementById('new-theme-coral').value;
  const gold = document.getElementById('new-theme-gold').value;
  const lagoon = document.getElementById('new-theme-lagoon').value;
  const id = 'theme_' + Date.now();
  await saveWithRetry('customtheme:' + currentUser + '__' + id, { name, coral, gold, lagoon, createdAt: new Date().toISOString() }, false);
  document.getElementById('new-theme-name').value = '';
  showToast('Thème créé ✓');
  await renderThemeManager();
}
async function openThemeKebabMenu(id, isBuiltin){
  const items = [];
  items.push({ icon: '✓', label: 'Sélectionner', action: 'closeGenericKebabMenu(); applyTheme(\''+(isBuiltin ? id : 'custom:'+id)+'\'); renderThemeManager()' });
  if(isBuiltin){
    items.push({ icon: '📑', label: 'Dupliquer vers mes thèmes (modifiable)', action: 'closeGenericKebabMenu(); duplicateThemeToCustom(\''+id+'\', true)' });
  } else {
    items.push({ icon: '✏️', label: 'Modifier les couleurs', action: 'closeGenericKebabMenu(); editCustomTheme(\''+id+'\')' });
    items.push({ icon: '📑', label: 'Dupliquer', action: 'closeGenericKebabMenu(); duplicateThemeToCustom(\''+id+'\', false)' });
  }
  items.push({ icon: '📤', label: 'Exporter la configuration', action: 'closeGenericKebabMenu(); exportThemeConfig(\''+id+'\', '+isBuiltin+')' });
  if(!isBuiltin){
    items.push({ icon: '🗑️', label: 'Supprimer', action: 'closeGenericKebabMenu(); deleteCustomTheme(\''+id+'\')' });
  }
  openGenericKebabMenu(items);
}
async function editCustomTheme(id){
  const theme = await safeGet('customtheme:' + currentUser + '__' + id, false);
  if(!theme) return;
  const newCoral = prompt('Couleur corail (code hex) :', theme.coral);
  if(newCoral === null) return;
  const newGold = prompt('Couleur or (code hex) :', theme.gold);
  if(newGold === null) return;
  const newLagoon = prompt('Couleur lagon (code hex) :', theme.lagoon);
  if(newLagoon === null) return;
  theme.coral = newCoral.trim() || theme.coral;
  theme.gold = newGold.trim() || theme.gold;
  theme.lagoon = newLagoon.trim() || theme.lagoon;
  await saveWithRetry('customtheme:' + currentUser + '__' + id, theme, false);
  showToast('Thème mis à jour ✓');
  const currentThemeId = await safeGet('settings:selectedTheme', false).catch(() => null);
  if(currentThemeId === 'custom:' + id) await applyTheme(currentThemeId);
  await renderThemeManager();
}
async function duplicateThemeToCustom(id, fromBuiltin){
  const source = fromBuiltin ? BUILTIN_THEMES[id] : await safeGet('customtheme:' + currentUser + '__' + id, false);
  if(!source) return;
  const newName = prompt('Nom du nouveau thème dupliqué :', source.name + ' (copie)');
  if(!newName || !newName.trim()) return;
  const newId = 'theme_' + Date.now();
  await saveWithRetry('customtheme:' + currentUser + '__' + newId, { name: newName.trim(), coral: source.coral, gold: source.gold, lagoon: source.lagoon, createdAt: new Date().toISOString() }, false);
  showToast('Thème dupliqué ✓ — modifiable dans « Mes thèmes personnalisés »');
  await renderThemeManager();
}
async function exportThemeConfig(id, isBuiltin){
  const theme = isBuiltin ? BUILTIN_THEMES[id] : await safeGet('customtheme:' + currentUser + '__' + id, false);
  if(!theme) return;
  const text = 'Suktum — Configuration de thème\n\nNom : '+theme.name+'\nCorail : '+theme.coral+'\nOr : '+theme.gold+'\nLagon : '+theme.lagoon;
  if(navigator.share){ await navigator.share({ title: 'Suktum', text }); return; }
  if(navigator.clipboard){ await navigator.clipboard.writeText(text); showToast('Configuration copiée ✓'); return; }
  showToast('Partage indisponible sur cet appareil');
}
async function deleteCustomTheme(id){
  const currentThemeId = await safeGet('settings:selectedTheme', false).catch(() => null);
  if(currentThemeId === 'custom:' + id) await applyTheme('default');
  await window.storage.delete('customtheme:' + currentUser + '__' + id, false).catch(() => {});
  showToast('Thème supprimé');
  await renderThemeManager();
}
async function toggleAutoDarkMode(){
  const enabled = document.getElementById('auto-dark-mode-toggle').checked;
  await saveWithRetry('settings:autoDarkMode', enabled, false);
  document.getElementById('auto-dark-mode-toggle-visual').style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  await applyAutoDarkModeIfEnabled();
}
async function loadAutoDarkModeToggle(){
  const enabled = await safeGet('settings:autoDarkMode', false);
  const toggle = document.getElementById('auto-dark-mode-toggle');
  const visual = document.getElementById('auto-dark-mode-toggle-visual');
  if(toggle) toggle.checked = !!enabled;
  if(visual) visual.style.background = enabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
}
/* ---------- TEMPS D'ÉCRAN ---------- */
function getTodayDateKey(){
  return new Date().toISOString().slice(0,10);
}
async function getScreenTimeSettings(){
  return (await safeGet('settings:screenTimeLimit', false).catch(() => null)) || { enabled: false, dailyLimitMinutes: 60 };
}
async function toggleScreenTimeLimit(){
  const enabled = document.getElementById('screen-time-enabled-toggle').checked;
  const settings = await getScreenTimeSettings();
  settings.enabled = enabled;
  await saveWithRetry('settings:screenTimeLimit', settings, false);
  document.getElementById('screen-time-limit-field').style.display = enabled ? 'block' : 'none';
  showToast(enabled ? 'Rappel de temps d’écran activé ✓' : 'Rappel de temps d’écran désactivé');
}
async function saveScreenTimeLimit(){
  const value = parseInt(document.getElementById('screen-time-limit-input').value, 10);
  if(isNaN(value) || value <= 0){ showToast('Entrez une limite valide'); return; }
  const settings = await getScreenTimeSettings();
  settings.dailyLimitMinutes = value;
  await saveWithRetry('settings:screenTimeLimit', settings, false);
  showToast('Limite enregistrée ✓');
}
async function loadScreenTimeSettingsForm(){
  const toggle = document.getElementById('screen-time-enabled-toggle');
  if(!toggle) return;
  const settings = await getScreenTimeSettings();
  toggle.checked = !!settings.enabled;
  document.getElementById('screen-time-limit-field').style.display = settings.enabled ? 'block' : 'none';
  document.getElementById('screen-time-limit-input').value = settings.dailyLimitMinutes || 60;
  await renderScreenTimeToday();
}
async function renderScreenTimeToday(){
  const el = document.getElementById('screen-time-today-display');
  if(!el) return;
  const today = await safeGet('screentimetoday:' + getTodayDateKey(), false).catch(() => null);
  el.textContent = today ? (today.minutesUsed || 0) : 0;
}
/* ---------- STATUT EN LIGNE ---------- */
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
async function updatePresenceHeartbeat(){
  if(document.visibilityState !== 'visible' || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  if(!me) return;
  me.lastActiveAt = new Date().toISOString();
  await saveWithRetry('user:' + currentUser, me, true);
}
function formatOnlineStatus(lastActiveAtIso){
  if(!lastActiveAtIso) return null;
  const diffMs = Date.now() - new Date(lastActiveAtIso).getTime();
  if(diffMs < ONLINE_THRESHOLD_MS) return { online: true, label: '🟢 En ligne' };
  const minutes = Math.floor(diffMs / 60000);
  if(minutes < 60) return { online: false, label: 'Vu il y a ' + minutes + ' min' };
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return { online: false, label: 'Vu il y a ' + hours + ' h' };
  const days = Math.floor(hours / 24);
  return { online: false, label: 'Vu il y a ' + days + ' j' };
}
async function trackScreenTimeTick(){
  if(document.visibilityState !== 'visible') return;
  const dateKey = getTodayDateKey();
  const today = (await safeGet('screentimetoday:' + dateKey, false).catch(() => null)) || { date: dateKey, minutesUsed: 0, reminderShownToday: false };
  today.minutesUsed = (today.minutesUsed || 0) + 1;
  await saveWithRetry('screentimetoday:' + dateKey, today, false);
  const displayEl = document.getElementById('screen-time-today-display');
  if(displayEl) displayEl.textContent = today.minutesUsed;
  const settings = await getScreenTimeSettings();
  if(settings.enabled && !today.reminderShownToday && today.minutesUsed >= settings.dailyLimitMinutes){
    today.reminderShownToday = true;
    await saveWithRetry('screentimetoday:' + dateKey, today, false);
    showToast('⏰ Vous avez atteint votre limite de ' + settings.dailyLimitMinutes + ' min sur Suktum aujourd’hui.');
  }
}
async function applyAutoDarkModeIfEnabled(){
  const autoEnabled = await safeGet('settings:autoDarkMode', false);
  if(!autoEnabled) return;
  const hour = new Date().getHours();
  const isEveningOrNight = hour >= 19 || hour < 7;
  if(isEveningOrNight){
    document.body.classList.remove('light-mode');
  } else {
    const savedTheme = await safeGet('settings:theme', false);
    document.body.classList.toggle('light-mode', savedTheme === 'light');
  }
}
function toggleFaqAnswer(index){
  const el = document.getElementById('faq-answer-' + index);
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
/* ---------- AUTORISATION DE LIVE SANS 1000 ABONNÉS ---------- */
async function requestLiveAuthorization(){
  const reason = prompt('Pourquoi souhaitez-vous démarrer un live sans avoir 1000 abonnés ? (visible par l’administration)');
  if(reason === null || !reason.trim()) return;
  const id = 'liveauthreq_' + Date.now();
  await saveWithRetry('liveauthrequest:' + id, {
    id, username: currentUser, country: currentUserCountry, reason: reason.trim(), status: 'pending', createdAt: new Date().toISOString()
  }, true);
  showToast('Demande envoyée — en attente de validation ✓');
  await renderSettingsLiveAuthCard();
}
async function fetchLiveAuthRequests(){
  const keys = await safeList('liveauthrequest:', true);
  const requests = [];
  for(const k of keys){ const r = await safeGet(k, true); if(r) requests.push(r); }
  requests.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return requests;
}
async function renderSettingsLiveAuthCard(){
  const el = document.getElementById('settings-live-auth-card');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  const followerCount = (me && me.followers) ? me.followers.length : 0;
  if(followerCount >= LIVE_FOLLOWER_THRESHOLD){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Vous avez déjà assez d’abonnés pour faire un live — aucune demande nécessaire.</p>';
    return;
  }
  if(me && me.liveAuthorizedOverride){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Autorisation spéciale déjà accordée par l’administration.</p>';
    return;
  }
  const pendingReq = (await fetchLiveAuthRequests()).find(r => r.username === currentUser && r.status === 'pending');
  if(pendingReq){
    el.innerHTML = '<p style="margin:0; font-size:13px; color:var(--gold);">⏳ Votre demande est en attente de validation.</p>';
    return;
  }
  el.innerHTML = '<p style="margin:0 0 10px; font-size:12.5px; color:rgba(245,239,227,0.6);">Vous n’avez pas encore 1000 abonnés ('+followerCount+' actuellement). Vous pouvez demander une autorisation spéciale à l’équipe.</p>' +
    '<button class="btn btn-outline" onclick="requestLiveAuthorization()">Demander l’autorisation de faire un live</button>';
}
async function grantLiveAuthorization(){
  const username = document.getElementById('live-auth-username').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe pas'); return; }
  if(adminScope !== 'all' && u.country !== adminScope){ showToast('Ce compte n’est pas dans votre pays'); return; }
  u.liveAuthorizedOverride = true;
  await saveWithRetry('user:' + username, u, true);
  document.getElementById('live-auth-username').value = '';
  showToast('Autorisation accordée ✓');
  await logAdminAction('Autorisation de live spéciale accordée', '@' + username);
  await loadLiveAuthAdmin();
}
async function revokeLiveAuthorization(username){
  const u = await safeGet('user:' + username, true);
  if(!u) return;
  u.liveAuthorizedOverride = false;
  await saveWithRetry('user:' + username, u, true);
  showToast('Autorisation retirée');
  await logAdminAction('Autorisation de live spéciale retirée', '@' + username);
  await loadLiveAuthAdmin();
}
async function approveLiveAuthRequest(id){
  const req = await safeGet('liveauthrequest:' + id, true);
  if(!req) return;
  const u = await safeGet('user:' + req.username, true);
  if(u){ u.liveAuthorizedOverride = true; await saveWithRetry('user:' + req.username, u, true); }
  req.status = 'approved';
  await saveWithRetry('liveauthrequest:' + id, req, true);
  showToast('Demande approuvée ✓');
  await logAdminAction('Demande de live spéciale approuvée', '@' + req.username);
  await loadLiveAuthAdmin();
}
async function rejectLiveAuthRequest(id){
  const req = await safeGet('liveauthrequest:' + id, true);
  if(req){ req.status = 'rejected'; await saveWithRetry('liveauthrequest:' + id, req, true); }
  showToast('Demande refusée');
  await logAdminAction('Demande de live spéciale refusée', req ? '@' + req.username : id);
  await loadLiveAuthAdmin();
}
async function loadLiveAuthAdmin(){
  const requestsEl = document.getElementById('live-auth-requests-list');
  const authorizedEl = document.getElementById('live-auth-authorized-list');
  if(!requestsEl) return;
  let requests = (await fetchLiveAuthRequests()).filter(r => r.status === 'pending');
  if(adminScope !== 'all') requests = requests.filter(r => r.country === adminScope);
  requestsEl.innerHTML = requests.length === 0 ? '<div class="empty">Aucune demande en attente.</div>' : requests.map(r =>
    '<div class="card"><p style="margin:0 0 6px; font-size:13px;">@'+escapeHtml(r.username)+(r.country ? ' · '+escapeHtml(r.country) : '')+'</p>' +
    '<p style="margin:0 0 10px; font-size:12px; color:rgba(245,239,227,0.6); font-style:italic;">« '+escapeHtml(r.reason)+' »</p>' +
    '<div style="display:flex; gap:8px; flex-wrap:wrap;"><button class="btn btn-outline btn-sm" onclick="approveLiveAuthRequest(\''+r.id+'\')">✓ Autoriser</button>' +
    '<button class="btn btn-outline btn-sm" onclick="rejectLiveAuthRequest(\''+r.id+'\')">✕ Refuser</button></div></div>'
  ).join('');

  const allUsers = await fetchUsers();
  let authorized = allUsers.filter(u => u.liveAuthorizedOverride);
  if(adminScope !== 'all') authorized = authorized.filter(u => u.country === adminScope);
  authorizedEl.innerHTML = authorized.length === 0 ? '<div class="empty">Aucun utilisateur autorisé pour l’instant.</div>' : authorized.map(u =>
    '<div class="card" style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:13px;">@'+escapeHtml(u.username)+'</span>' +
    '<button class="btn btn-outline btn-sm" onclick="revokeLiveAuthorization(\''+escapeHtml(u.username)+'\')">Retirer</button></div>'
  ).join('');
}

async function renderBlockedAccountsList(){
  const el = document.getElementById('settings-blocked-list');
  if(!el) return;
  const me = await safeGet('user:' + currentUser, true);
  const blocked = (me && me.blocked) || [];
  if(blocked.length === 0){ el.innerHTML = '<div class="empty">Aucun compte bloqué.</div>'; }
  else{
    el.innerHTML = blocked.map(u =>
      '<div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">' +
      '<span style="display:flex; align-items:center; gap:10px; font-size:13px;">' + smallAvatarBadge(u, 30) + '@'+escapeHtml(u) + '</span>' +
      '<button class="btn btn-outline btn-sm" onclick="unblockFromSettings(\''+escapeHtml(u)+'\')">Débloquer</button>' +
      '</div>'
    ).join('');
  }
}
async function renderSettingsScreen(){
  await renderSettingsLiveAuthCard();
  await loadLiveEligibilityCard();
  await renderScheduledLivesOnProfile(currentUser, 'my-scheduled-lives');
  await renderAccountSwitchList();
  await loadAutoDarkModeToggle();
  await loadDefaultCommentRestrictionSetting();
  await renderReferralCount();
  const myadCpmEl = document.getElementById('myad-cpm-info');
  if(myadCpmEl){ const cpm = await getSelfServeCpm(); myadCpmEl.textContent = '💰 Tarif actuel : ' + cpm.toLocaleString('fr-FR') + ' FCFA pour 1000 vues — jamais plus que votre budget fixé, la diffusion s’arrête automatiquement une fois le budget atteint.'; }
  await loadPremiumCard();
  await loadPremiumStatsCard();
  const meForSettings = await safeGet('user:' + currentUser, true);
  await renderBadgeCard(meForSettings);
  await renderKycStatusCard();
  await loadMyBlockedCommentWords();
  await renderNotificationPreferences();
  await loadReadReceiptsToggle();
  await renderBusinessAccountCard();
  await renderAudienceCreatorBadgeCard();
  await renderSecurityPinCard();
  await render2FACard();
  await renderMeetingRoomStaffAccess();
  const marketplaceOpen = await isMarketplaceOpen();
  document.getElementById('sell-product-section').style.display = marketplaceOpen ? 'block' : 'none';
  await renderMyAdsList();
  const lightToggle = document.getElementById('light-mode-toggle');
  document.getElementById('data-saver-toggle').checked = dataSaverEnabled;
  document.getElementById('currency-select').value = displayCurrency;
  document.getElementById('data-saver-toggle-visual').style.background = dataSaverEnabled ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';
  const isLight = document.body.classList.contains('light-mode');
  lightToggle.checked = isLight;
  document.getElementById('light-mode-toggle-visual').style.background = isLight ? 'var(--lagoon)' : 'rgba(245,239,227,0.2)';

  const helpEl = document.getElementById('help-center-list');
  const faqItems = FAQ_ITEMS;
  helpEl.innerHTML = faqItems.map((item, i) =>
    '<div class="card" style="cursor:pointer;" onclick="toggleFaqAnswer('+i+')">' +
    '<p style="margin:0; font-size:13px; font-weight:600;">'+escapeHtml(item.q)+'</p>' +
    '<p id="faq-answer-'+i+'" style="display:none; margin:8px 0 0; font-size:12.5px; color:rgba(245,239,227,0.65); line-height:1.5;">'+escapeHtml(item.a)+'</p>' +
    '</div>'
  ).join('');

  const instructions = await getPaymentInstructions(currentUserCountry);
  document.getElementById('settings-payment-info').textContent =
    'Les paiements (commandes boutique, abonnement Premium, badge vérifié, billets de live) se font actuellement de façon manuelle, selon votre pays : ' + instructions + ' Aucune carte ni moyen de paiement n’est enregistré dans l’application.';

  await renderBlockedAccountsList();

  const suffix = (currentUserCountry || 'Sénégal').replace(/[^a-zA-Z0-9]/g, '_');
  const privacy = await safeGet('settings:privacy_' + suffix, true);
  const cgu = await safeGet('settings:cgu_' + suffix, true);
  document.getElementById('settings-privacy-text').textContent = privacy || 'Aucune politique de confidentialité n’a encore été publiée pour votre pays.';
  document.getElementById('settings-cgu-text').textContent = cgu || 'Aucune condition d’utilisation n’a encore été publiée pour votre pays.';
}
async function unblockFromSettings(username){
  const me = await safeGet('user:' + currentUser, true);
  if(!me || !me.blocked) return;
  const idx = me.blocked.indexOf(username);
  if(idx === -1) return;
  me.blocked.splice(idx, 1);
  await saveWithRetry('user:' + currentUser, me, true);
  showToast('@' + username + ' débloqué(e)');
  await renderSettingsScreen();
}

