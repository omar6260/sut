/* ---------- DISCOVER ---------- */
function normalizePhoneNumber(raw){
  const digitsOnly = (raw || '').replace(/\D/g, '');
  return digitsOnly.slice(-8); // compare les 8 derniers chiffres pour tolérer les indicatifs pays différents
}
async function findFriendsFromContacts(){
  const statusEl = document.getElementById('contacts-import-status');
  const matchesEl = document.getElementById('contacts-matches-list');
  if(!('contacts' in navigator) || !('ContactsManager' in window)){
    statusEl.textContent = 'La lecture des contacts n’est disponible que sur certains navigateurs Android (pas sur iPhone). Vous pouvez inviter vos amis directement via le parrainage à la place.';
    return;
  }
  try{
    statusEl.textContent = 'Choisissez les contacts à vérifier...';
    const props = ['tel'];
    const contacts = await navigator.contacts.select(props, { multiple: true });
    if(!contacts || contacts.length === 0){ statusEl.textContent = 'Aucun contact sélectionné.'; return; }
    const myPhones = new Set();
    contacts.forEach(c => (c.tel || []).forEach(t => { const n = normalizePhoneNumber(t); if(n) myPhones.add(n); }));

    const allUsers = await fetchUsers();
    const me = await safeGet('user:' + currentUser, true);
    const myFollowing = new Set((me && me.following) || []);
    const myBlocked = await getMyBlockedUsernames();
    const matches = allUsers.filter(u =>
      u.username !== currentUser && !myFollowing.has(u.username) && !myBlocked.has(u.username) &&
      u.phone && myPhones.has(normalizePhoneNumber(u.phone))
    );

    if(matches.length === 0){
      statusEl.textContent = 'Aucun de vos contacts n’a encore de compte Suktum avec un numéro renseigné.';
      matchesEl.innerHTML = '';
      return;
    }
    statusEl.textContent = matches.length + ' ami(s) trouvé(s) parmi vos contacts ✓';
    matchesEl.innerHTML = matches.map(u =>
      '<div class="card" style="display:flex; align-items:center; gap:10px;">' +
      '<span onclick="openUserProfile(\''+escapeHtml(u.username)+'\')" style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer;">' + smallAvatarBadge(u.username, 30) + '<span style="font-size:13px;">@'+escapeHtml(u.username)+'</span></span>' +
      '<button class="btn btn-outline btn-sm" onclick="followFromSuggestion(\''+escapeHtml(u.username)+'\')">Suivre</button>' +
      '</div>'
    ).join('');
  }catch(e){
    statusEl.textContent = 'Accès aux contacts refusé ou indisponible.';
  }
}
async function fetchSuggestedAccounts(){
  const me = await safeGet('user:' + currentUser, true);
  const myFollowing = new Set((me && me.following) || []);
  const myBlocked = await getMyBlockedUsernames();
  const scores = {};

  // Signal 1 : abonnements en commun (amis d'amis) — le plus fort signal
  for(const followedUser of myFollowing){
    const fu = await safeGet('user:' + followedUser, true);
    const theirFollowing = (fu && fu.following) || [];
    for(const candidate of theirFollowing){
      if(candidate === currentUser || myFollowing.has(candidate) || myBlocked.has(candidate)) continue;
      scores[candidate] = (scores[candidate] || 0) + 3;
    }
  }

  // Signal 2 : contacts en messagerie privée, pas encore suivis
  const dmKeys = await safeList('dm:', true);
  for(const k of dmKeys){
    const threadKey = k.replace('dm:', '');
    const parts = threadKey.split('__');
    if(!parts.includes(currentUser)) continue;
    const other = parts.find(u => u !== currentUser);
    if(!other || other === currentUser || myFollowing.has(other) || myBlocked.has(other)) continue;
    scores[other] = (scores[other] || 0) + 2;
  }

  // Signal 3 : même ville/quartier, léger coup de pouce
  if(me && me.city){
    const allUsers = await fetchUsers();
    allUsers.forEach(u => {
      if(u.username === currentUser || myFollowing.has(u.username) || myBlocked.has(u.username)) return;
      if(u.city && u.city.toLowerCase() === me.city.toLowerCase()) scores[u.username] = (scores[u.username] || 0) + 1;
    });
  }

  // Repli honnête si aucun signal personnalisé (nouveau compte) : comptes réellement les plus suivis
  if(Object.keys(scores).length === 0){
    const allUsersForFallback = await fetchUsers();
    const popular = allUsersForFallback
      .filter(u => u.username !== currentUser && !myFollowing.has(u.username) && !myBlocked.has(u.username) && (u.followers || []).length > 0)
      .sort((a,b) => (b.followers||[]).length - (a.followers||[]).length)
      .slice(0, 10)
      .map(u => u.username);
    return popular;
  }

  return Object.entries(scores).sort((a,b) => b[1] - a[1]).slice(0, 10).map(([username]) => username);
}
async function renderSuggestedAccounts(){
  const label = document.getElementById('suggested-accounts-label');
  const el = document.getElementById('suggested-accounts-list');
  const suggestions = await fetchSuggestedAccounts();
  if(suggestions.length === 0){ label.style.display = 'none'; el.innerHTML = ''; return; }
  label.style.display = 'block';
  el.innerHTML = suggestions.map(u =>
    '<div style="flex-shrink:0; width:100px; text-align:center; background:var(--night-2); border-radius:12px; padding:12px 8px;">' +
    '<div onclick="openUserProfile(\''+escapeHtml(u)+'\')" style="cursor:pointer;">' + smallAvatarBadge(u, 48) +
    '<p style="margin:6px 0 0; font-size:11.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@'+escapeHtml(u)+'</p></div>' +
    '<button class="btn btn-outline btn-sm" style="margin-top:6px; padding:4px 8px; font-size:11px; width:100%;" onclick="followFromSuggestion(\''+escapeHtml(u)+'\')">Suivre</button>' +
    '</div>'
  ).join('');
}
async function followFromSuggestion(username){
  await toggleFollow(username);
  showToast('Vous suivez maintenant @' + username + ' ✓');
  await renderSuggestedAccounts();
}
async function saveSearchRecommendation(){
  const keywordsRaw = document.getElementById('search-reco-keywords').value.trim();
  const username = document.getElementById('search-reco-username').value.trim();
  const text = document.getElementById('search-reco-text').value.trim();
  if(!keywordsRaw || !username){ showToast('Renseignez au moins les mots-clés et le compte'); return; }
  const keywords = keywordsRaw.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
  await saveWithRetry('settings:search_recommendation', { keywords, username, text }, true);
  showToast('Recommandation enregistrée ✓');
}
