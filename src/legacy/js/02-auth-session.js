/* ---------- MESSAGE DE BIENVENUE AU RETOUR (après une vraie absence) ---------- */
async function logUserLoginEvent(username){
  const id = 'loginevent_' + Date.now();
  await saveWithRetry('loginevent:' + username + '__' + id, { username, createdAt: new Date().toISOString() }, true).catch(() => {});
}
async function updateDailyStreak(u){
  const todayKey = new Date().toISOString().slice(0,10);
  if(u.lastLoginDate === todayKey) return;
  let newStreak = 1;
  let daysSinceLastLogin = null;
  if(u.lastLoginDate){
    const lastDate = new Date(u.lastLoginDate + 'T00:00:00');
    const today = new Date(todayKey + 'T00:00:00');
    const diffDays = Math.round((today - lastDate) / (1000*60*60*24));
    daysSinceLastLogin = diffDays;
    if(diffDays === 1) newStreak = (u.currentStreak || 0) + 1;
  }
  u.lastLoginDate = todayKey;
  u.currentStreak = newStreak;
  u.longestStreak = Math.max(u.longestStreak || 0, newStreak);
  await saveWithRetry('user:' + currentUser, u, true);
  if(daysSinceLastLogin !== null && daysSinceLastLogin >= 14){
    const notifs = await fetchMyNotifications();
    const unread = notifs.filter(n => !n.read).length;
    showToast('👋 Content de vous revoir après ' + daysSinceLastLogin + ' jours !' + (unread > 0 ? ' ' + unread + ' notification(s) vous attendent.' : ''));
  } else if(newStreak > 1 && newStreak % 5 === 0){
    showToast('🔥 ' + newStreak + ' jours de suite sur Suktum !');
  }
  const dailyReward = await safeGet('settings:dailycoinreward', true);
  if(dailyReward && dailyReward > 0){
    const balance = (await safeGet('coinbalance:' + currentUser, false)) || 0;
    await saveWithRetry('coinbalance:' + currentUser, balance + dailyReward, false);
    showToast('🪙 +' + dailyReward + ' pièces offertes pour votre connexion du jour !');
  }
}
async function checkWelcomeBackMessage(u){
  if(!u) return;
  const now = new Date();
  const lastActive = u.lastActiveAt ? new Date(u.lastActiveAt) : null;
  if(lastActive) u.previousSessionAt = lastActive.toISOString();
  u.lastActiveAt = now.toISOString();
  await saveWithRetry('user:' + currentUser, u, true);
  if(!lastActive) return; // première visite suivie, rien à annoncer
  const daysAway = Math.floor((now - lastActive) / (24*60*60*1000));
  if(daysAway < 3) return;
  const allPosts = await fetchPosts();
  const newSinceAbsence = allPosts.filter(p => p.country === u.country && new Date(p.createdAt) > lastActive).length;
  const message = newSinceAbsence > 0
    ? '👋 Content de vous revoir ! ' + newSinceAbsence + ' nouvelle(s) publication(s) de votre région depuis votre dernière visite.'
    : '👋 Content de vous revoir sur Suktum !';
  showToast(message);
}
async function initIdentity(){
  pendingSharedProductId = new URLSearchParams(window.location.search).get('produit') || null;
  populateCountrySelects();
  const savedLogo = await safeGet('settings:platformLogo', true).catch(() => null);
  if(savedLogo) effectivePlatformLogo = savedLogo;
  const adminHeaderLogo = document.getElementById('admin-header-logo');
  if(adminHeaderLogo) adminHeaderLogo.src = effectivePlatformLogo;
  const commandCenterHeaderLogo = document.getElementById('command-center-header-logo');
  if(commandCenterHeaderLogo) commandCenterHeaderLogo.src = effectivePlatformLogo;
  releaseScheduledPosts();
  await checkMaintenanceMode('onboarding');
  const savedTheme = await safeGet('settings:theme', false);
  if(savedTheme === 'light') document.body.classList.add('light-mode');
  await loadAppLanguagePreference();
  checkReferralLinkInUrl();
  attemptAutoDetectCountry();
  await applyAutoDarkModeIfEnabled();
  setInterval(applyAutoDarkModeIfEnabled, 5 * 60 * 1000);
  setInterval(checkAndSendLiveReminders, 60 * 1000);
  await loadSelectedTheme();
  await loadAccessibilityModeToggle();
  setInterval(trackScreenTimeTick, 60 * 1000);
  document.addEventListener('click', () => { hasUserInteractedThisSession = true; }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){
      document.querySelectorAll('video').forEach(v => { if(!v.paused) v.pause(); });
    }
  });
  document.addEventListener('keydown', (e) => {
    const activeScreen = document.querySelector('.screen.active');
    if(!activeScreen || activeScreen.id !== 'screen-single-post') return;
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const video = document.querySelector('#single-post-content video');
    if(!video) return;
    if(e.code === 'Space'){
      e.preventDefault();
      if(video.paused) video.play().catch(() => {}); else video.pause();
    } else if(e.code === 'ArrowRight'){
      video.currentTime = Math.min(video.duration || video.currentTime, video.currentTime + 5);
    } else if(e.code === 'ArrowLeft'){
      video.currentTime = Math.max(0, video.currentTime - 5);
    }
  });
  setInterval(updatePresenceHeartbeat, 45 * 1000);
  const savedColorTheme = await safeGet('settings:colorTheme', false);
  if(savedColorTheme && savedColorTheme !== 'pirogue') document.body.classList.add('theme-' + savedColorTheme);
  await loadDataSaverPreference();
  await loadSubtitlesPreference();
  await loadHideLikeCountPreference();
  await loadHideViewCountPreference();
  await loadDisplayCurrencyPreference();
  const saved = await safeGet('settings:username', false);
  if(saved){
    currentUser = saved;
    const u = await safeGet('user:' + saved, true);
    currentUserCountry = u ? u.country : null;
    currentUserCity = u ? u.city : null;
    await recordDeviceAccountLink(saved);
    document.getElementById('screen-onboarding').classList.remove('active');
    if(pendingSharedProductId){
      const sharedProduct = await safeGet('product:' + pendingSharedProductId, true);
      if(sharedProduct){ await openOrderScreen(pendingSharedProductId); pendingSharedProductId = null; }
      else go('feed');
    } else {
      go('feed');
    }
    await checkWelcomeBackMessage(u);
    await updateDailyStreak(u);
    await logUserLoginEvent(u.username);
  } else {
    const guestStart = await safeGet('settings:guestStartedAt', false);
    if(guestStart && (new Date() - new Date(guestStart)) < GUEST_BROWSING_LIMIT_MS){
      document.getElementById('screen-onboarding').classList.remove('active');
      if(pendingSharedProductId){
        const sharedProduct = await safeGet('product:' + pendingSharedProductId, true);
        if(sharedProduct){ await openOrderScreen(pendingSharedProductId); pendingSharedProductId = null; }
        else go('feed');
      } else {
        go('feed');
      }
    } else {
      forceOnboardingScreen();
      if(guestStart){
        showToast('Votre accès libre de 24h est terminé — créez un compte pour continuer ⛵');
      }
      setTimeout(initGoogleSignIn, 300);
    }
  }
}
function forceOnboardingScreen(){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-onboarding').classList.add('active');
  const livesBtn = document.getElementById('global-lives-btn');
  const searchBtn = document.getElementById('global-search-btn');
  const notifBtn = document.getElementById('global-notif-btn');
  if(livesBtn) livesBtn.style.display = 'none';
  if(searchBtn) searchBtn.style.display = 'none';
  if(notifBtn) notifBtn.style.display = 'none';
}
const GUEST_BROWSING_LIMIT_MS = 24 * 60 * 60 * 1000;
async function checkGuestBrowsingExpiry(){
  if(currentUser) return; // compte réel, jamais concerné
  const guestStart = await safeGet('settings:guestStartedAt', false);
  if(guestStart && (new Date() - new Date(guestStart)) >= GUEST_BROWSING_LIMIT_MS){
    showToast('Votre accès libre de 24h est terminé — créez un compte pour continuer ⛵');
    forceOnboardingScreen();
  }
}
async function browseFeedAsGuest(){
  const existingStart = await safeGet('settings:guestStartedAt', false);
  if(existingStart && (new Date() - new Date(existingStart)) >= GUEST_BROWSING_LIMIT_MS){
    showToast('Votre accès libre de 24h est déjà terminé — créez un compte pour continuer ⛵');
    return;
  }
  if(!existingStart){
    await saveWithRetry('settings:guestStartedAt', new Date().toISOString(), false);
  }
  document.getElementById('screen-onboarding').classList.remove('active');
  go('feed');
}
function requireAccount(message){
  if(currentUser) return true;
  showToast(message || 'Créez un compte pour continuer');
  forceOnboardingScreen();
  return false;
}
/**
 * Accepte les faux noms, surnoms, noms abrégés — presque tout est permis.
 * Rejette uniquement : longueur hors 3-20, absence totale de lettre (ex: "123456" ou "!!!!"),
 * et les guillemets (' ou ") qui casseraient techniquement l'affichage ailleurs dans l'app.
 */
function validateUsernameFormat(name){
  const trimmed = (name || '').trim();
  if(trimmed.length < 3 || trimmed.length > 20) return { valid: false, reason: 'Le nom doit faire entre 3 et 20 caractères' };
  if(/['"]/.test(trimmed)) return { valid: false, reason: 'Les guillemets ne sont pas autorisés dans un nom d’utilisateur' };
  if(!/\p{L}/u.test(trimmed)) return { valid: false, reason: 'Le nom doit contenir au moins une lettre — impossible avec uniquement des chiffres ou des symboles' };
  return { valid: true };
}
let pendingPinLogin = null;
async function logInAsExistingUser(existing, name, country){
  if(existing.status === 'banned'){
    showToast('Ce compte a été banni');
    const alreadyAppealed = (await safeGet('banappeal:' + name, true).catch(() => null));
    if(!alreadyAppealed || alreadyAppealed.status !== 'pending'){
      if(confirm('Souhaitez-vous contester ce bannissement ? Votre message sera examiné par l’équipe Suktum.')){
        const appealText = prompt('Expliquez pourquoi vous pensez que ce bannissement est injustifié :');
        if(appealText && appealText.trim()){
          await saveWithRetry('banappeal:' + name, {
            username: name, text: appealText.trim(), status: 'pending', createdAt: new Date().toISOString()
          }, true);
          showToast('Votre contestation a été envoyée ✓');
        }
      }
    } else {
      showToast('Votre contestation précédente est encore en cours d’examen');
    }
    return false;
  }
  if(existing.status === 'suspended' && existing.suspendedUntil && new Date(existing.suspendedUntil) <= new Date()){
    existing.status = 'active';
    existing.suspendedUntil = null;
    if(!existing.suspensionHistory) existing.suspensionHistory = [];
    existing.suspensionHistory.push({ action: 'reactivated', by: 'Suktum (automatique — durée écoulée)', reason: null, createdAt: new Date().toISOString() });
    await saveWithRetry('user:' + name, existing, true);
  }
  if(existing.status === 'suspended'){
    showToast('Ce compte est temporairement suspendu — contactez le support pour plus d’informations');
    const alreadyAppealed = (await safeGet('suspensionappeal:' + name, true).catch(() => null));
    if(!alreadyAppealed || alreadyAppealed.status !== 'pending'){
      if(confirm('Souhaitez-vous contester cette suspension ? Votre message sera examiné par l’équipe Suktum.')){
        const appealText = prompt('Expliquez pourquoi vous pensez que cette suspension est injustifiée :');
        if(appealText && appealText.trim()){
          await saveWithRetry('suspensionappeal:' + name, {
            username: name, text: appealText.trim(), status: 'pending', createdAt: new Date().toISOString()
          }, true);
          showToast('Votre contestation a été envoyée ✓');
        }
      }
    } else {
      showToast('Votre contestation précédente est encore en cours d’examen');
    }
    return false;
  }
  if(existing.securityPin){
    pendingPinLogin = { existing, name, country };
    const input = document.getElementById('pin-login-input');
    if(input) input.value = '';
    go('pin-verify');
    return false;
  }
  if(existing.totpSecret){
    pending2FALogin = { existing, name, country };
    const input = document.getElementById('totp-login-input');
    if(input) input.value = '';
    go('totp-verify');
    return false;
  }
  return await completeLoginAsUser(existing, name, country);
}
async function completeLoginAsUser(existing, name, country){
  currentUser = name;
  currentUserCountry = existing.country || country;
  if(googleSignInEmail && !existing.googleEmail){
    existing.googleEmail = googleSignInEmail;
    await saveWithRetry('user:' + name, existing, true);
  }
  let reactivated = false;
  if(existing.paused){
    existing.paused = false;
    existing.pausedAt = null;
    await saveWithRetry('user:' + name, existing, true);
    reactivated = true;
  }
  googleSignInEmail = null;
  await saveWithRetry('settings:username', name, false);
  await recordDeviceAccountLink(name);
  showToast(reactivated ? '✓ Compte réactivé — content de vous revoir !' : 'Bon retour ⛵');
  go('feed');
  return true;
}
async function submitPinVerification(){
  const entered = document.getElementById('pin-login-input').value.trim();
  if(!pendingPinLogin) return;
  if(entered !== pendingPinLogin.existing.securityPin){
    showToast('Code incorrect');
    return;
  }
  const { existing, name, country } = pendingPinLogin;
  pendingPinLogin = null;
  if(existing.totpSecret){
    pending2FALogin = { existing, name, country };
    const input = document.getElementById('totp-login-input');
    if(input) input.value = '';
    go('totp-verify');
    return;
  }
  await completeLoginAsUser(existing, name, country);
}
let pending2FALogin = null;
async function submit2FALoginVerification(){
  const entered = document.getElementById('totp-login-input').value.trim();
  if(!pending2FALogin) return;
  const { existing, name, country } = pending2FALogin;
  const validTotp = await verifyTotpCode(existing.totpSecret, entered.replace(/\s/g, ''));
  const validBackup = existing.totpBackupCode && entered.toUpperCase() === existing.totpBackupCode;
  if(!validTotp && !validBackup){
    showToast('Code incorrect');
    return;
  }
  pending2FALogin = null;
  await completeLoginAsUser(existing, name, country);
}
async function checkDeviceHasBannedAccount(){
  const deviceId = await getOrCreateDeviceId();
  const link = await safeGet('devicelink:' + deviceId, true);
  if(!link || !link.accounts || link.accounts.length === 0) return null;
  for(const acc of link.accounts){
    const u = await safeGet('user:' + acc, true);
    if(u && u.status === 'banned') return acc;
  }
  return null;
}
const ONBOARDING_TOUR_STEPS = [
  { icon: '⛵', title: 'Bienvenue sur Suktum !', text: 'Un vrai tour rapide de ce qui rend Suktum unique — vous pouvez le passer à tout moment.' },
  { icon: '🏠', title: 'Votre fil "Pour vous"', text: 'Faites défiler verticalement pour découvrir des vidéos courtes et longues, adaptées à vos vrais intérêts au fil du temps.' },
  { icon: '🛍️', title: 'Une vraie boutique intégrée', text: 'Achetez et vendez directement dans l\'app, avec négociation, avis, et livraison Yango — sans jamais quitter Suktum.' },
  { icon: '🌳', title: 'Les Penc — salons vocaux', text: 'Rejoignez de vrais arbres à palabres audio en direct, à tout moment, pour discuter en communauté.' },
  { icon: '🎓', title: 'Un vrai espace éducation', text: 'Suivez des cours, passez des examens, obtenez des attestations — le tout intégré à votre fil habituel.' },
  { icon: '🎬', title: 'Des mini-séries à découvrir', text: 'Des séries courtes captivantes, avec les premiers épisodes toujours gratuits pour vous laisser découvrir.' },
  { icon: '➕', title: 'Publiez en un instant', text: 'Le bouton central vous permet de publier vidéos, photos, ou même un simple texte.' },
  { icon: '✅', title: 'Vous êtes prêt(e) !', text: 'Explorez à votre rythme — vous pouvez toujours revenir sur cette visite guidée depuis vos réglages.' }
];
let currentTourStepIndex = 0;
function startOnboardingTour(){
  currentTourStepIndex = 0;
  renderOnboardingTourStep();
  document.getElementById('onboarding-tour-overlay').style.display = 'flex';
}
function renderOnboardingTourStep(){
  const step = ONBOARDING_TOUR_STEPS[currentTourStepIndex];
  document.getElementById('tour-step-icon').textContent = step.icon;
  document.getElementById('tour-step-title').textContent = step.title;
  document.getElementById('tour-step-text').textContent = step.text;
  document.getElementById('tour-step-counter').textContent = (currentTourStepIndex + 1) + ' / ' + ONBOARDING_TOUR_STEPS.length;
  document.getElementById('tour-next-btn').textContent = (currentTourStepIndex === ONBOARDING_TOUR_STEPS.length - 1) ? 'Terminer' : 'Suivant';
}
async function advanceOnboardingTour(){
  currentTourStepIndex++;
  if(currentTourStepIndex >= ONBOARDING_TOUR_STEPS.length){ await finishOnboardingTour(); return; }
  renderOnboardingTourStep();
}
async function skipOnboardingTour(){
  await finishOnboardingTour();
}
async function finishOnboardingTour(){
  document.getElementById('onboarding-tour-overlay').style.display = 'none';
  if(currentUser){
    const me = await safeGet('user:' + currentUser, true);
    if(me){ me.hasSeenOnboardingTour = true; await saveWithRetry('user:' + currentUser, me, true); }
  }
}
const APP_TRANSLATIONS = {
  fr: {
    btn_start: 'Commencer', feed_foryou: 'Pour vous', feed_community: 'Communauté', feed_recent: 'Récent',
    btn_publish: 'Publier', nav_home: 'Accueil', nav_discover: 'Explorer', nav_messages: 'Messages', nav_profile: 'Profil',
    nav_settings: 'Paramètres', nav_notifications: 'Notifications', discover_title: 'Découvrir',
    action_follow: 'Suivre', action_following: 'Abonné(e)', action_message: 'Envoyer un message', action_report: 'Signaler',
    action_block: 'Bloquer', action_unblock: 'Débloquer', action_logout: 'Se déconnecter',
    onboard_username: 'Choisissez votre nom d’utilisateur', onboard_country: 'Votre pays', onboard_birthdate: 'Date de naissance',
    tab_posts: 'Publications', tab_favorites: 'Favoris', tab_likes: 'Vidéos likées', tab_private: 'Privé', tab_duo: 'Duo et Stitch',
    menu_wallet: 'Solde et pièces', menu_activity: 'Centre d’activités', menu_creator_studio: 'Outils de création',
    menu_education: 'Espace Éducation', menu_qr: 'QR code & parrainage', menu_support: 'Support / Signaler un litige',
    menu_settings: 'Paramètres et confidentialité', menu_logout: 'Se déconnecter',
    live_start: 'Démarrer un live', story_add: 'Ajouter une story', interface_language: 'Langue de l’interface',
    post_save: 'Enregistrer', post_saved: 'Enregistré', post_watch_later: 'À regarder plus tard', post_watch_later_added: 'Dans ma liste',
    post_send: 'Envoyer', post_tip: 'Pourboire', post_friend: 'Ami', post_repost: 'Repartager', post_quote: 'Citer', post_duo: 'Duo',
    discover_section_tools: 'Outils & Services', discover_section_community: 'Communauté & Social', discover_section_learning: 'Apprentissage & Culture', discover_section_entertainment: 'Divertissement & Médias', discover_section_settings: 'Paramètres & Participation',
    publish_add_sound: '🎵 Ajouter un son', publish_format_photo: 'PHOTO', publish_format_text: 'TEXTE', publish_tab_publish: 'PUBLIER', publish_tab_create: 'CRÉER',
    onboard_age_minor: "J'ai moins de 18 ans", onboard_age_adult: "J'ai 18 ans ou plus", onboard_age_label: 'Votre âge', onboard_age_required: 'Merci d’indiquer votre âge avant de continuer'
  },
  wo: {
    btn_start: 'Tàmbali', feed_foryou: 'Ci yow', feed_community: 'Mbootaay', feed_recent: 'Bu léegi',
    btn_publish: 'Yebbi', nav_home: 'Kër', nav_discover: 'Seet', nav_messages: 'Bataaxal', nav_profile: 'Profil',
    nav_settings: 'Tëriin', nav_notifications: 'Xibaar', discover_title: 'Seet',
    action_follow: 'Toppatoo', action_following: 'Toppatook nga', action_message: 'Yonnee bataaxal', action_report: 'Yëgal',
    action_block: 'Tere', action_unblock: 'Ubbil', action_logout: 'Génn',
    onboard_username: 'Tannal sa tur bu njëkk', onboard_country: 'Sa réew', onboard_birthdate: 'Bés bu nga judd',
    tab_posts: 'Yebalu', tab_favorites: 'Njëkke', tab_likes: 'Neex na ma', tab_private: 'Sutura', tab_duo: 'Duo ak Stitch',
    menu_wallet: 'Xaalis ak pièces', menu_activity: 'Barabu jëf', menu_creator_studio: 'Jumtukaayu yebal',
    menu_education: 'Barabu njàng', menu_qr: 'QR code ak invitation', menu_support: 'Ndimbal / Yëgal',
    menu_settings: 'Jubluwaay ak sutura', menu_logout: 'Génn',
    live_start: 'Tambali live', story_add: 'Yokk story', interface_language: 'Làkku interface bi',
    post_save: 'Denc', post_saved: 'Denc na', post_watch_later: 'Xool ci kanam', post_watch_later_added: 'Nekk na ci sama lëkkalekaay',
    post_send: 'Yonnee', post_tip: 'Pourboire', post_friend: 'Xarit', post_repost: 'Wàll yeneen yoon', post_quote: 'Naxal', post_duo: 'Duo',
    discover_section_tools: 'Jumtukaay ak Ndimbal', discover_section_community: 'Mbootaay', discover_section_learning: 'Njàng ak Aada', discover_section_entertainment: 'Rekreyaasioŋ ak Yeneen', discover_section_settings: 'Jubluwaay ak Wote',
    publish_add_sound: '🎵 Yokk baat', publish_format_photo: 'NATAL', publish_format_text: 'BAAT', publish_tab_publish: 'YÉBBI', publish_tab_create: 'SOS',
    onboard_age_minor: 'Dama gëna néew 18 at', onboard_age_adult: 'Am naa 18 at walla ëpp', onboard_age_label: 'Sa at', onboard_age_required: 'Baax na nga wax sa at balaa nga jëmm kanam'
  },
  en: {
    btn_start: 'Get Started', feed_foryou: 'For You', feed_community: 'Community', feed_recent: 'Recent',
    btn_publish: 'Publish', nav_home: 'Home', nav_discover: 'Discover', nav_messages: 'Messages', nav_profile: 'Profile',
    nav_settings: 'Settings', nav_notifications: 'Notifications', discover_title: 'Discover',
    action_follow: 'Follow', action_following: 'Following', action_message: 'Send message', action_report: 'Report',
    action_block: 'Block', action_unblock: 'Unblock', action_logout: 'Log out',
    onboard_username: 'Choose your username', onboard_country: 'Your country', onboard_birthdate: 'Date of birth',
    tab_posts: 'Posts', tab_favorites: 'Favorites', tab_likes: 'Liked videos', tab_private: 'Private', tab_duo: 'Duet and Stitch',
    menu_wallet: 'Balance and coins', menu_activity: 'Activity center', menu_creator_studio: 'Creator tools',
    menu_education: 'Education space', menu_qr: 'QR code & referrals', menu_support: 'Support / Report an issue',
    menu_settings: 'Settings and privacy', menu_logout: 'Log out',
    live_start: 'Go live', story_add: 'Add a story', interface_language: 'Interface language',
    post_save: 'Save', post_saved: 'Saved', post_watch_later: 'Watch later', post_watch_later_added: 'In my list',
    post_send: 'Send', post_tip: 'Tip', post_friend: 'Friend', post_repost: 'Repost', post_quote: 'Quote', post_duo: 'Duet',
    discover_section_tools: 'Tools & Services', discover_section_community: 'Community & Social', discover_section_learning: 'Learning & Culture', discover_section_entertainment: 'Entertainment & Media', discover_section_settings: 'Settings & Participation',
    publish_add_sound: '🎵 Add a sound', publish_format_photo: 'PHOTO', publish_format_text: 'TEXT', publish_tab_publish: 'POST', publish_tab_create: 'CREATE',
    onboard_age_minor: "I'm under 18", onboard_age_adult: "I'm 18 or older", onboard_age_label: 'Your age', onboard_age_required: 'Please indicate your age before continuing'
  },
  ar: {
    btn_start: 'ابدأ', feed_foryou: 'من أجلك', feed_community: 'المجتمع', feed_recent: 'الأحدث',
    btn_publish: 'نشر', nav_home: 'الرئيسية', nav_discover: 'استكشف', nav_messages: 'الرسائل', nav_profile: 'الملف الشخصي',
    nav_settings: 'الإعدادات', nav_notifications: 'الإشعارات', discover_title: 'استكشف',
    action_follow: 'متابعة', action_following: 'متابَع', action_message: 'إرسال رسالة', action_report: 'إبلاغ',
    action_block: 'حظر', action_unblock: 'إلغاء الحظر', action_logout: 'تسجيل الخروج',
    onboard_username: 'اختر اسم المستخدم', onboard_country: 'بلدك', onboard_birthdate: 'تاريخ الميلاد',
    tab_posts: 'المنشورات', tab_favorites: 'المفضلة', tab_likes: 'الفيديوهات المعجب بها', tab_private: 'خاص', tab_duo: 'دويتو',
    menu_wallet: 'الرصيد والعملات', menu_activity: 'مركز النشاط', menu_creator_studio: 'أدوات المنشئ',
    menu_education: 'فضاء التعليم', menu_qr: 'رمز QR والإحالات', menu_support: 'الدعم / الإبلاغ عن مشكلة',
    menu_settings: 'الإعدادات والخصوصية', menu_logout: 'تسجيل الخروج',
    live_start: 'بث مباشر', story_add: 'إضافة قصة', interface_language: 'لغة الواجهة',
    post_save: 'حفظ', post_saved: 'محفوظ', post_watch_later: 'مشاهدة لاحقاً', post_watch_later_added: 'في قائمتي',
    post_send: 'إرسال', post_tip: 'إكرامية', post_friend: 'صديق', post_repost: 'إعادة نشر', post_quote: 'اقتباس', post_duo: 'دويتو',
    discover_section_tools: 'أدوات وخدمات', discover_section_community: 'المجتمع والتواصل', discover_section_learning: 'التعلم والثقافة', discover_section_entertainment: 'الترفيه والوسائط', discover_section_settings: 'الإعدادات والمشاركة',
    publish_add_sound: '🎵 إضافة صوت', publish_format_photo: 'صورة', publish_format_text: 'نص', publish_tab_publish: 'نشر', publish_tab_create: 'إنشاء',
    onboard_age_minor: 'عمري أقل من 18 عامًا', onboard_age_adult: 'عمري 18 عامًا أو أكثر', onboard_age_label: 'عمرك', onboard_age_required: 'يرجى تحديد عمرك قبل المتابعة'
  }
};
const RTL_LANGUAGES = ['ar'];
let currentAppLanguage = 'fr';
function applyTranslations(lang){
  currentAppLanguage = lang;
  const dict = APP_TRANSLATIONS[lang] || APP_TRANSLATIONS.fr;
  const isRtl = RTL_LANGUAGES.includes(lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if(dict[key]) el.textContent = dict[key];
    el.dir = isRtl ? 'rtl' : 'ltr';
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if(dict[key]) el.placeholder = dict[key];
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if(dict[key]) el.setAttribute('aria-label', dict[key]);
  });
}
function t(key){
  const dict = APP_TRANSLATIONS[currentAppLanguage] || APP_TRANSLATIONS.fr;
  return dict[key] || APP_TRANSLATIONS.fr[key] || key;
}
async function saveAppLanguage(lang){
  const settingsSelect = document.getElementById('app-language-select');
  const onboardingSelect = document.getElementById('onboarding-language-select');
  if(!lang) lang = settingsSelect ? settingsSelect.value : (onboardingSelect ? onboardingSelect.value : 'fr');
  applyTranslations(lang);
  if(settingsSelect) settingsSelect.value = lang;
  if(onboardingSelect) onboardingSelect.value = lang;
  const discoverSelect = document.getElementById('discover-language-select');
  if(discoverSelect) discoverSelect.value = lang;
  if(currentUser){
    const me = (await safeGet('user:' + currentUser, true)) || {username: currentUser, createdAt: new Date().toISOString()};
    me.appLanguage = lang;
    await saveWithRetry('user:' + currentUser, me, true);
  } else {
    await saveWithRetry('settings:guestlanguage', lang, false).catch(() => {});
  }
  showToast('Langue appliquée ✓');
}
async function loadAppLanguagePreference(){
  let lang = null;
  if(currentUser){
    const me = await safeGet('user:' + currentUser, true);
    if(me && me.appLanguage) lang = me.appLanguage;
    else{
      const legacyLang = await safeGet('settings:language', false).catch(() => null);
      if(legacyLang) lang = legacyLang;
    }
  } else {
    lang = (await safeGet('settings:guestlanguage', false).catch(() => null)) || (await safeGet('settings:language', false).catch(() => null));
  }
  if(!lang){
    const deviceLang = (navigator.language || 'fr').slice(0,2).toLowerCase();
    lang = APP_TRANSLATIONS[deviceLang] ? deviceLang : 'fr';
  }
  applyTranslations(lang);
  const settingsSelect = document.getElementById('app-language-select');
  if(settingsSelect) settingsSelect.value = lang;
  const onboardingSelect = document.getElementById('onboarding-language-select');
  if(onboardingSelect) onboardingSelect.value = lang;
  const discoverSelect = document.getElementById('discover-language-select');
  if(discoverSelect) discoverSelect.value = lang;
}
async function copyReferralLink(){
  if(!currentUser) return;
  const url = window.location.href.split('#')[0] + '#ref-' + currentUser;
  try{
    await navigator.clipboard.writeText(url);
    showToast('Lien de parrainage copié ✓');
  }catch(e){
    showToast('Impossible de copier le lien sur cet appareil');
  }
}
async function attemptAutoDetectCountry(){
  const fallback = document.getElementById('onboard-country-fallback');
  if(!navigator.geolocation){ fallback.style.display = 'block'; return; }
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try{
        const { latitude, longitude } = position.coords;
        const response = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + latitude + '&lon=' + longitude + '&zoom=3', { headers: { 'Accept-Language': 'fr' } });
        const data = await response.json();
        const countryName = data && data.address && data.address.country;
        const countrySelect = document.getElementById('onboard-country');
        const matchingOption = countryName && [...countrySelect.options].find(o => o.value === countryName);
        if(matchingOption){
          countrySelect.value = countryName;
          window.__autoDetectedCountry = countryName;
        } else {
          fallback.style.display = 'block';
        }
      }catch(e){ fallback.style.display = 'block'; }
    },
    () => { fallback.style.display = 'block'; },
    { timeout: 6000 }
  );
}
function checkReferralLinkInUrl(){
  const hash = window.location.hash;
  if(hash.startsWith('#ref-')){
    const referrerUsername = hash.slice(5);
    const field = document.getElementById('onboard-referral');
    if(field && referrerUsername){
      field.value = referrerUsername;
      const area = document.getElementById('onboard-referral-area');
      if(area) area.style.display = 'block';
    }
  }
}
async function renderReferralCount(){
  const el = document.getElementById('referral-count-display');
  if(!el || !currentUser) return;
  const me = await safeGet('user:' + currentUser, true);
  el.textContent = '👥 ' + ((me && me.referralCount) || 0) + ' ami(s) parrainé(s)';
}
function handleBirthdateTextInput(input){
  let digits = input.value.replace(/[^0-9]/g, '').slice(0, 8);
  let formatted = digits;
  if(digits.length > 4) formatted = digits.slice(0,2) + '/' + digits.slice(2,4) + '/' + digits.slice(4);
  else if(digits.length > 2) formatted = digits.slice(0,2) + '/' + digits.slice(2);
  input.value = formatted;
  if(digits.length === 8){
    const day = parseInt(digits.slice(0,2), 10);
    const month = parseInt(digits.slice(2,4), 10);
    const year = parseInt(digits.slice(4,8), 10);
    const testDate = new Date(year, month - 1, day);
    const isRealDate = testDate.getFullYear() === year && testDate.getMonth() === month - 1 && testDate.getDate() === day;
    const hiddenInput = document.getElementById('onboard-birthdate');
    if(isRealDate){
      hiddenInput.value = year + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    } else {
      hiddenInput.value = '';
    }
  } else {
    document.getElementById('onboard-birthdate').value = '';
  }
}
function openBirthdatePicker(){
  const picker = document.getElementById('onboard-birthdate');
  if(picker.showPicker){ picker.showPicker(); }
  else { picker.style.pointerEvents = 'auto'; picker.style.opacity = '1'; picker.focus(); picker.click(); }
}
function syncBirthdateTextFromPicker(){
  const picker = document.getElementById('onboard-birthdate');
  if(!picker.value) return;
  const [year, month, day] = picker.value.split('-');
  document.getElementById('onboard-birthdate-text').value = day + '/' + month + '/' + year;
  picker.style.pointerEvents = 'none';
  picker.style.opacity = '0';
}
function toggleOnboardTopic(el){
  const selected = document.querySelectorAll('.onboard-topic-chip[data-selected="true"]');
  if(el.dataset.selected === 'true'){
    el.dataset.selected = 'false';
    el.style.background = 'transparent';
    el.style.borderColor = 'var(--line)';
    el.style.color = 'var(--cream)';
  } else {
    if(selected.length >= 3){ showToast('Choisissez jusqu’à 3 centres d’intérêt maximum'); return; }
    el.dataset.selected = 'true';
    el.style.background = 'var(--coral)';
    el.style.borderColor = 'var(--coral)';
    el.style.color = 'var(--night)';
  }
}
function selectOnboardAgeChoice(isMinor){
  const minorBtn = document.getElementById('onboard-age-minor-btn');
  const adultBtn = document.getElementById('onboard-age-adult-btn');
  minorBtn.dataset.selected = isMinor ? 'true' : 'false';
  adultBtn.dataset.selected = isMinor ? 'false' : 'true';
  minorBtn.style.background = isMinor ? 'var(--coral)' : 'transparent';
  minorBtn.style.color = isMinor ? 'var(--night)' : 'var(--cream)';
  adultBtn.style.background = isMinor ? 'transparent' : 'var(--coral)';
  adultBtn.style.color = isMinor ? 'var(--cream)' : 'var(--night)';
}
async function completeOnboarding(){
  const frozen = await safeGet('settings:transactionsFrozen', true);
  if(frozen){ showToast('Les nouvelles inscriptions sont temporairement suspendues par la direction — réessayez plus tard'); return; }
  const name = document.getElementById('onboard-username').value.trim();
  const country = document.getElementById('onboard-country').value;
  const readOnlyCountries = (await safeGet('settings:readOnlyCountries', true)) || [];
  if(readOnlyCountries.includes(country)){ showToast('Les nouvelles inscriptions sont temporairement en lecture seule pour ' + country + ' — réessayez plus tard'); return; }
  if(!name){ showToast('Choisissez un nom d’utilisateur'); return; }
  const usernameCheck = validateUsernameFormat(name);
  if(!usernameCheck.valid){ showToast(usernameCheck.reason); return; }
  const existing = await safeGet('user:' + name, true);
  if(existing){
    await logInAsExistingUser(existing, name, country);
    return;
  }
  const minorBtn = document.getElementById('onboard-age-minor-btn');
  const adultBtn = document.getElementById('onboard-age-adult-btn');
  if(minorBtn.dataset.selected !== 'true' && adultBtn.dataset.selected !== 'true'){
    showToast(t('onboard_age_required'));
    return;
  }
  const isMinorAccount = minorBtn.dataset.selected === 'true';
  const bannedDeviceAccount = await checkDeviceHasBannedAccount();
  if(bannedDeviceAccount){
    showToast('Impossible de créer un nouveau compte — cet appareil est associé à un compte banni');
    const auditId = 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await saveWithRetry('auditlog:' + auditId, {
      id: auditId, actorName: 'Suktum (système)', actorRole: 'Blocage automatique', action: 'Tentative de contournement de bannissement bloquée',
      detail: 'Nouveau compte @' + name + ' refusé — appareil déjà lié à @' + bannedDeviceAccount + ' (banni)', createdAt: new Date().toISOString()
    }, true);
    return;
  }
  currentUser = name;
  currentUserCountry = country;
  await saveWithRetry('settings:username', name, false);
  const langSelect = document.getElementById('onboarding-language-select');
  const likelyLang = getLikelyLanguageForCountry(country);
  const chosenLang = (langSelect && langSelect.dataset.manuallyChanged === 'true') ? langSelect.value : likelyLang;
  const initialTopics = [...document.querySelectorAll('.onboard-topic-chip[data-selected="true"]')].map(el => el.dataset.topic);
  await saveWithRetry('user:' + name, {username: name, country, status: 'active', isMinor: isMinorAccount, ageBracket: isMinorAccount ? '13-17' : null, googleEmail: googleSignInEmail || null, appLanguage: chosenLang, initialTopics, createdAt: new Date().toISOString()}, true);
  applyTranslations(chosenLang);
  if(isMinorAccount){
    await saveWithRetry('restrictedmode:' + name, true, true);
  }
  await recordDeviceAccountLink(name);
  googleSignInEmail = null;
  const referralCode = document.getElementById('onboard-referral').value.trim();
  if(referralCode && referralCode !== name){
    const referrer = await safeGet('user:' + referralCode, true);
    if(referrer){
      referrer.referralCount = (referrer.referralCount || 0) + 1;
      await saveWithRetry('user:' + referralCode, referrer, true);
      const rewardPoints = await getReferralRewardPoints();
      if(rewardPoints > 0){
        const currentReferrerPoints = await fetchLoyaltyPoints(referralCode);
        await saveWithRetry('loyaltypoints:' + referralCode, currentReferrerPoints + rewardPoints, true);
      }
      await createNotification(referralCode, 'referral', name, null, String(rewardPoints));
    }
  }
  showToast('Bienvenue à bord ⛵');
  if(pendingSharedProductId){
    const sharedProduct = await safeGet('product:' + pendingSharedProductId, true);
    if(sharedProduct){ await openOrderScreen(pendingSharedProductId); pendingSharedProductId = null; return; }
  }
  const newUserForStreak = await safeGet('user:' + currentUser, true);
  if(newUserForStreak) await updateDailyStreak(newUserForStreak);
  go('feed');
  startOnboardingTour();
}
async function logoutAccount(){
  await window.storage.delete('settings:username', false).catch(() => {});
  currentUser = null;
  document.getElementById('onboard-username').value = '';
  go('onboarding');
}
/* ---------- CHANGEMENT RAPIDE DE COMPTE ---------- */
const MAX_ACCOUNTS_PER_DEVICE = 3;
async function getOrCreateDeviceId(){
  let id = await safeGet('settings:deviceId', false);
  if(!id){
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
    await saveWithRetry('settings:deviceId', id, false);
  }
  return id;
}
async function recordDeviceAccountLink(username){
  const deviceId = await getOrCreateDeviceId();
  const link = (await safeGet('devicelink:' + deviceId, true)) || { deviceId, accounts: [] };
  if(!link.accounts.includes(username)) link.accounts.push(username);
  await saveWithRetry('devicelink:' + deviceId, link, true);
}
async function findLinkedAccounts(username){
  const keys = await safeList('devicelink:', true);
  const linked = new Set();
  for(const k of keys){
    const link = await safeGet(k, true);
    if(link && link.accounts.includes(username)){
      link.accounts.forEach(a => { if(a !== username) linked.add(a); });
    }
  }
  return [...linked];
}
async function fetchKnownAccounts(){
  const list = (await safeGet('settings:knownAccounts', false)) || [];
  if(!list.includes(currentUser)) list.push(currentUser);
  return list;
}
async function addAccountToSwitcher(){
  const username = document.getElementById('add-account-username').value.trim();
  if(!username){ showToast('Renseignez un nom d’utilisateur'); return; }
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe pas — créez-le d’abord en vous déconnectant'); return; }
  if(u.status === 'banned'){ showToast('Ce compte est banni et ne peut pas être ajouté'); return; }
  const list = await fetchKnownAccounts();
  if(list.includes(username)){ showToast('Déjà dans vos comptes'); return; }
  if(list.length >= MAX_ACCOUNTS_PER_DEVICE){ showToast('Limite de ' + MAX_ACCOUNTS_PER_DEVICE + ' comptes par appareil atteinte'); return; }
  list.push(username);
  await saveWithRetry('settings:knownAccounts', list, false);
  await recordDeviceAccountLink(username);
  document.getElementById('add-account-username').value = '';
  showToast('Compte ajouté ✓');
  await renderAccountSwitchList();
}
async function switchToAccount(username){
  if(username === currentUser) return;
  const u = await safeGet('user:' + username, true);
  if(!u){ showToast('Ce compte n’existe plus'); return; }
  if(u.status === 'banned'){ showToast('Ce compte a été banni — bascule impossible'); return; }
  if(u.status === 'suspended'){ showToast('Ce compte est temporairement suspendu — bascule impossible'); return; }
  currentUser = username;
  currentUserCountry = u.country || null;
  currentUserCity = u.city || null;
  await saveWithRetry('settings:username', username, false);
  showToast('Basculé sur @' + username + ' ✓');
  go('feed');
}
async function renderAccountSwitchList(){
  const el = document.getElementById('account-switch-list');
  if(!el) return;
  const list = await fetchKnownAccounts();
  el.innerHTML = list.map(u =>
    '<div class="card" style="position:relative; display:flex; align-items:center; gap:10px;'+(u===currentUser?' border-color:var(--gold); padding-right:16px;':' cursor:pointer; padding-right:40px;')+'"'+(u===currentUser?'':' onclick="switchToAccount(\''+escapeHtml(u)+'\')"')+'>' +
    smallAvatarBadge(u, 28) +
    '<span style="flex:1; font-size:13px;">@'+escapeHtml(u)+'</span>' +
    (u===currentUser ? '<span style="font-size:11px; color:var(--gold);">✓ Actif</span>' : '<span style="font-size:11px; color:rgba(245,239,227,0.4);">Basculer</span><span onclick="event.stopPropagation(); unlinkAccountFromSwitcher(\''+escapeHtml(u)+'\')" style="position:absolute; top:8px; right:8px; font-size:18px; cursor:pointer; padding:4px;">⋮</span>') +
    '</div>'
  ).join('');
}
async function unlinkAccountFromSwitcher(username){
  const ok = confirm('Retirer @' + username + ' de votre liste de bascule rapide ? Le compte lui-même n’est pas supprimé — vous pourrez toujours vous y reconnecter normalement.');
  if(!ok) return;
  const list = (await safeGet('settings:knownAccounts', false)) || [];
  const updated = list.filter(u => u !== username);
  await saveWithRetry('settings:knownAccounts', updated, false);
  showToast('@' + username + ' retiré de la liste');
  await renderAccountSwitchList();
}
async function cleanupFollowSourceRecords(username){
  const asCreatorKeys = await safeList('followsource:' + username + '__', true);
  for(const k of asCreatorKeys){ await window.storage.delete(k, true).catch(() => {}); }
  const allKeys = await safeList('followsource:', true);
  for(const k of allKeys){
    if(k.endsWith('__' + username)) await window.storage.delete(k, true).catch(() => {});
  }
}
async function deleteMyOwnAccount(){
  const ok = confirm('Supprimer définitivement votre compte @' + currentUser + ' et toutes vos publications ? Cette action est irréversible.');
  if(!ok) return;
  const confirmName = prompt('Pour confirmer, retapez votre nom d’utilisateur : ' + currentUser);
  if(confirmName !== currentUser){ showToast('Nom d’utilisateur incorrect — suppression annulée'); return; }
  const u = await safeGet('user:' + currentUser, true).catch(() => null);
  const note = await safeGet('sellerinternalnote:' + currentUser, true).catch(() => null);
  await saveWithRetry('accountarchive:' + currentUser, {
    username: currentUser, kycStatus: u ? u.kycStatus : null, kycFullName: u ? u.kycFullName : null, kycVerifiedAt: u ? u.kycVerifiedAt : null,
    phone: u ? u.phone : null, country: u ? u.country : null, googleEmail: u ? u.googleEmail : null,
    accountCreatedAt: u ? u.createdAt : null, internalNote: note ? note.text : null,
    archivedAt: new Date().toISOString(), archivedBy: currentUser + ' (auto-suppression)'
  }, true);
  const myPosts = (await fetchPosts(true)).filter(p => p.userId === currentUser);
  for(const p of myPosts){ await window.storage.delete('post:' + p.id, true).catch(() => {}); }
  await window.storage.delete('user:' + currentUser, true).catch(() => {});
  await window.storage.delete('sellerinternalnote:' + currentUser, true).catch(() => {});
  const blockedCommentKeysMine = await safeList('autoblockedcomment:', true);
  for(const k of blockedCommentKeysMine){ const b = await safeGet(k, true).catch(() => null); if(b && b.username === currentUser) await window.storage.delete(k, true).catch(() => {}); }
  await cleanupFollowSourceRecords(currentUser);
  await window.storage.delete('settings:username', false).catch(() => {});
  showToast('Votre compte a été supprimé');
  currentUser = null;
  go('onboarding');
}
