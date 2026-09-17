// Surcharges du domaine « pieces » (phase 06) : pièces, cadeaux/pourboires, fonds créateur, badge/boost/Premium payants,
// billets de live. Chargé après les scripts legacy et avant 20-init.js. Les fonctions globales du prototype sont
// réassignées ; textes, toasts et enchaînements d'écrans sont ceux du prototype ; aucun montant n'est calculé ici.
(function () {
  const P = window.SuktumPlatform;
  if (window.__SUKTUM_STORAGE_INJECTED || !P || !P.api || !P.env) return; // pas de plateforme (tests mémoire) → legacy intact
  const call = (name, data) => P.api.call(name, Object.assign({ username: currentUser }, data || {}));
  const fr = (n) => Number(n).toLocaleString('fr-FR');
  const fail = (e) => { showToast(e && e.message ? e.message : 'Erreur serveur'); };

  // ---- Lecture du solde et des déblocages : le prototype les lit en espace privé (bug, shared=false), le serveur les
  // écrit en espace partagé (kv_coinbalance, kv_episodeunlock, kv_adcoinwatches). On redirige ces lectures sans toucher
  // aux 4 lecteurs du legacy (l. 5391, 5513, 5642, 6099 de 19-backoffice.js).
  const SERVER_PREFIXES = /^(coinbalance|episodeunlock|adcoinwatches):/;
  const originalGet = window.storage.get;
  window.storage.get = function (key, shared) { return originalGet.call(window.storage, key, shared || SERVER_PREFIXES.test(key)); };

  // ---- Récompense quotidienne (updateDailyStreak l. 7233-7236) : le bloc de crédit est retiré du legacy ; le serveur crédite une fois par jour.
  const originalUpdateDailyStreak = window.updateDailyStreak;
  window.updateDailyStreak = async function (u) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const alreadyToday = u.lastLoginDate === todayKey;
    await originalUpdateDailyStreak(u);
    if (alreadyToday) return;
    try {
      const r = await call('claimDailyCoins');
      if (r.claimed) showToast('🪙 +' + r.reward + ' pièces offertes pour votre connexion du jour !');
    } catch (e) { /* solde indisponible : pas de toast, comme un réglage absent */ }
  };

  // ---- Achat de pack (l. 34641-34656)
  window.purchaseCoinPack = async function (packId) {
    let r;
    try { r = await call('purchaseCoinPack', { packId }); } catch (e) { fail(e); return; }
    showToast(r.coins + ' pièces ajoutées à votre solde ✓');
    await renderCoinWallet();
  };

  // ---- Déblocage d'épisode (l. 34657-34664) : le prix est relu dans series: par le serveur
  window.unlockEpisodeWithCoins = async function (seriesId, episodeIndex) {
    try { await call('spendCoins', { purpose: 'episode', seriesId, episodeIndex: Number(episodeIndex) }); }
    catch (e) { fail(e); if (e.code === 'functions/failed-precondition' && /^Solde insuffisant/.test(e.message || '')) go('coin-wallet'); return; }
    showToast('Épisode débloqué ✓');
    await openSeriesDetail(seriesId);
  };

  // ---- Publicité récompensée (l. 34669-34700) : plafond et crédit côté serveur, minuterie conservée
  window.startRewardedAd = async function () {
    let session;
    try { session = await call('startRewardedAd'); } catch (e) { fail(e); return; }
    const adReward = session.adReward;
    const ad = await pickAdForFeed();
    if (!ad) { showToast('Aucune publicité disponible pour l’instant'); return; }
    go('rewarded-ad');
    const contentEl = document.getElementById('rewarded-ad-content');
    const timerEl = document.getElementById('rewarded-ad-timer');
    let durationSeconds = 15;
    if (ad.type === 'video') {
      contentEl.innerHTML = '<video id="rewarded-ad-video" src="' + ad.mediaData + '" autoplay muted style="width:100%; border-radius:12px;"></video><p style="margin:10px 0 0; font-size:13px;">' + escapeHtml(ad.caption || '') + '</p>';
      const video = document.getElementById('rewarded-ad-video');
      await new Promise((resolve) => { video.onloadedmetadata = resolve; setTimeout(resolve, 2000); });
      if (video.duration && isFinite(video.duration)) durationSeconds = Math.ceil(video.duration);
    } else {
      contentEl.innerHTML = '<img src="' + ad.mediaData + '" style="width:100%; border-radius:12px;"><p style="margin:10px 0 0; font-size:13px;">' + escapeHtml(ad.caption || '') + '</p>';
    }
    if (durationSeconds < 15) { try { await call('startRewardedAd', { adId: ad.id, durationSeconds }); } catch (e) { /* session déjà ouverte à 15 s */ } }
    let remaining = durationSeconds;
    timerEl.textContent = 'Récompense dans ' + remaining + 's...';
    if (rewardedAdTimerInterval) clearInterval(rewardedAdTimerInterval);
    rewardedAdTimerInterval = setInterval(async () => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(rewardedAdTimerInterval);
        try { await call('rewardedAdReward'); } catch (e) { fail(e); go('coin-wallet'); await renderCoinWallet(); return; }
        showToast('🪙 +' + adReward + ' pièces gagnées !');
        go('coin-wallet');
        await renderCoinWallet();
      } else {
        timerEl.textContent = 'Récompense dans ' + remaining + 's...';
      }
    }, 1000);
  };

  // ---- Retrait (l. 35460-35473)
  window.requestCoinWithdrawal = async function () {
    const amountRaw = document.getElementById('withdrawal-amount-input').value.trim();
    const amount = parseInt(amountRaw, 10);
    const method = document.getElementById('withdrawal-method-select').value;
    const phone = document.getElementById('withdrawal-phone-input').value.trim();
    if (!amount || amount <= 0) { showToast('Entrez un nombre de pièces valide'); return; }
    if (!phone) { showToast('Entrez votre numéro de téléphone'); return; }
    try { await call('requestCoinWithdrawal', { amount, method, phone }); } catch (e) { fail(e); return; }
    document.getElementById('withdrawal-amount-input').value = '';
    document.getElementById('withdrawal-phone-input').value = '';
    showToast('Demande de retrait envoyée ✓ — traitement sous quelques jours');
    await renderMyWithdrawalRequests();
    await renderCoinWallet();
  };

  // ---- Marquage payé par le spécialiste reversements (l. 35515-35523)
  window.markCoinWithdrawalPaid = async function (withdrawalId) {
    const w = await safeGet('coinwithdrawal:' + withdrawalId, true);
    if (!w) return;
    if (!confirm('Confirmez-vous avoir réellement envoyé ' + w.amount + ' pièces (en FCFA équivalent) à @' + w.username + ' via ' + (w.method === 'wave' ? 'Wave' : 'Orange Money') + ' au ' + w.phone + ' ?')) return;
    try { await call('markWithdrawalPaid', { withdrawalId }); } catch (e) { fail(e); return; }
    showToast('Retrait marqué comme payé ✓');
    await renderCoinWithdrawalSpecialistList();
  };

  // ---- Ajustement admin (l. 35205-35214)
  window.adjustUserCoinBalance = async function () {
    if (!currentUserDetailTarget) return;
    const amount = parseInt(document.getElementById('coin-adjustment-amount').value, 10);
    const reason = document.getElementById('coin-adjustment-reason').value.trim();
    if (isNaN(amount) || amount === 0) { showToast('Renseignez un ajustement non nul'); return; }
    if (!reason) { showToast('Un motif est requis pour tout ajustement manuel'); return; }
    try { await P.api.call('adjustCoins', { username: currentUserDetailTarget, amount, reason }); } catch (e) { fail(e); return; }
    document.getElementById('coin-adjustment-amount').value = '';
    document.getElementById('coin-adjustment-reason').value = '';
    showToast('Ajustement appliqué ✓');
    await loadUserDetailCoinBalance(currentUserDetailTarget);
  };

  // ---- Cadeaux, pourboires, dons, soutien de battle (l. 24676-24683, 25558-25584, 25620-25628) : commission serveur
  window.sendBattleGift = async function (side, amount) {
    if (!requireAccount('Créez un compte pour soutenir un camp')) return;
    let r;
    try { r = await call('sendGift', { amount, target: { kind: 'battle', battleId: currentBattleId, side } }); } catch (e) { fail(e); return; }
    showToast('Soutien envoyé à @' + r.toUser + ' ✓');
    await renderBattleScore();
  };
  window.sendDirectGift = async function (amount) {
    if (!requireAccount('Créez un compte pour envoyer un don')) return;
    const toUser = currentViewedProfileUsername;
    if (!toUser || toUser === currentUser) return;
    try { await call('sendGift', { amount, target: { kind: 'direct', toUser } }); } catch (e) { fail(e); return; }
    document.getElementById('direct-gift-picker').style.display = 'none';
    showToast('💝 Don de ' + fr(amount) + ' FCFA envoyé à @' + toUser + ' ✓');
  };
  window.sendPostTip = async function (amount) {
    if (!currentTipPostId) return;
    let r;
    try { r = await call('sendGift', { amount, target: { kind: 'post', postId: currentTipPostId } }); } catch (e) { fail(e); return; }
    document.getElementById('tip-status').textContent = '💰 Pourboire de ' + fr(amount) + ' FCFA envoyé à @' + r.toUser + ' ✓';
    showToast('Merci pour votre soutien ⛵');
  };
  window.sendGift = async function (amount) {
    if (!currentLiveView) { showToast('Aucun live sélectionné'); return; }
    const statusEl = document.getElementById('gift-status');
    try { await call('sendGift', { amount, target: { kind: 'live', liveId: currentLiveView.id } }); } catch (e) { fail(e); return; }
    statusEl.textContent = '🎁 Cadeau de ' + fr(amount) + ' FCFA envoyé à @' + currentLiveView.username + ' ✓';
    showToast('Merci pour votre soutien ⛵');
    const giftEmoji = amount >= 5000 ? '👑' : amount >= 1000 ? '💎' : amount >= 500 ? '🌟' : '🎈';
    const floatContainer = document.getElementById('live-gift-float-container');
    for (let i = 0; i < 3; i++) { setTimeout(() => showFloatingAnimation(giftEmoji, floatContainer), i * 150); }
    await renderLiveTopGifters();
    await renderLiveRecentDonors();
    await renderLiveEarningsDashboard();
    await checkRewardTierMilestone(currentLiveView);
  };

  // ---- Fin de battle (l. 24685-24695) : vainqueur calculé serveur
  window.endBattle = async function (battleId) {
    try { await call('endBattle', { battleId }); } catch (e) { fail(e); return; }
    document.getElementById('battle-end-controls').innerHTML = '';
    await renderBattleScore();
    if (battleRefreshInterval) { clearInterval(battleRefreshInterval); battleRefreshInterval = null; }
  };

  // ---- Fonds créateur (l. 25802-25852, 33815-33817, 33854-33858)
  window.computeCreatorFundDistribution = async function () {
    return P.api.call('previewCreatorFund');
  };
  window.confirmCreatorFundDistribution = async function () {
    if (!confirm('Distribuer le fonds de récompense de ce mois ? Chaque créateur recevra une vraie notification avec son montant — le paiement reste manuel, comme pour tous les reversements.')) return;
    let r;
    try { r = await P.api.call('distributeCreatorFund'); } catch (e) { fail(e); return; }
    showToast('Fonds distribué à ' + r.count + ' créateur(s) ✓');
    document.getElementById('creator-fund-preview').innerHTML = '<p style="font-size:12px; color:var(--lagoon);">✓ Distribué à ' + r.count + ' créateur(s).</p>';
  };
  window.submitPayoutDispute = async function (monthKey) {
    const reason = document.getElementById('dispute-reason-' + monthKey).value.trim();
    if (!reason) { showToast('Expliquez la raison de votre contestation'); return; }
    try { await call('disputePayout', { monthKey, reason }); } catch (e) { fail(e); return; }
    showToast('Contestation envoyée ✓ — en attente d’examen');
    await renderMyFundPayouts();
  };
  window.resolveFundDispute = async function (username, monthKey) {
    const noteInput = document.getElementById('dispute-note-' + username + '-' + monthKey);
    const note = noteInput ? noteInput.value.trim() : '';
    try { await P.api.call('resolvePayoutDispute', { username, monthKey, note }); } catch (e) { fail(e); return; }
    showToast('Contestation marquée comme examinée ✓');
    await renderFundDisputesAdmin();
  };

  // ---- Badge vérifié payant (l. 23772-23802)
  window.requestVerifiedBadge = async function () {
    let r;
    try { r = await call('requestBadge'); } catch (e) { fail(e); return; }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour obtenir votre badge vérifié permanent (' + fr(r.price) + ' FCFA, paiement unique) :\n\n' + instructions + '\n\nVotre badge apparaîtra dès que votre paiement sera vérifié.');
    showToast('Demande envoyée — en attente de validation ✓');
    await renderProfile();
  };
  window.approveBadgeRequest = async function (id) {
    try { await P.api.call('approveBadge', { id }); } catch (e) { fail(e); return; }
    showToast('Badge vérifié activé ✓');
    await loadAdminBadgeRequests();
  };
  window.rejectBadgeRequest = async function (id) {
    try { await P.api.call('rejectBadge', { id }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadAdminBadgeRequests();
  };

  // ---- Boost de publication (l. 23832-23864) : prix affichés depuis settings, prix facturé fixé par le serveur
  window.requestBoostPost = async function (postId) {
    const price24h = await getBoostPrice();
    const price3d = await getBoostPrice3d();
    const price7d = await getBoostPrice7d();
    const choice = prompt('Choisissez la durée du boost :\n1 = 24h (' + fr(price24h) + ' FCFA)\n2 = 3 jours (' + fr(price3d) + ' FCFA)\n3 = 7 jours (' + fr(price7d) + ' FCFA)', '1');
    if (choice === null) return;
    if (!['1', '2', '3'].includes(choice.trim())) { showToast('Choix invalide'); return; }
    let r;
    try { r = await call('requestBoost', { postId, choice: choice.trim() }); } catch (e) { fail(e); return; }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour booster votre publication (' + fr(r.price) + ' FCFA) :\n\n' + instructions);
    showToast('Demande de boost envoyée — en attente de validation ✓');
  };
  window.approveBoostRequest = async function (id) {
    try { await P.api.call('approveBoost', { id }); } catch (e) { fail(e); return; }
    showToast('Boost activé ✓');
    await loadAdminBoostRequests();
  };
  window.rejectBoostRequest = async function (id) {
    try { await P.api.call('rejectBoost', { id }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadAdminBoostRequests();
  };

  // ---- Premium (l. 23566-23614, 23641, 23661) : auto-approbation évaluée par le serveur
  window.subscribeToPremium = async function () {
    let r;
    try { r = await call('subscribePremium'); } catch (e) { fail(e); return; }
    if (r.autoApproved) {
      showToast('Abonnement Premium activé automatiquement ✓');
      await renderProfile();
      return;
    }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour activer votre abonnement Premium (' + fr(r.price) + ' FCFA) :\n\n' + instructions + '\n\nVotre abonnement sera activé dès que votre paiement sera vérifié.');
    showToast('Demande envoyée — en attente de validation du paiement ✓');
    await renderProfile();
  };
  window.approvePremiumRequest = async function (id) {
    try { await P.api.call('approvePremium', { id }); } catch (e) { fail(e); return; }
    showToast('Paiement validé — abonnement activé ✓');
    await loadPremiumRequestsAdmin();
    await loadAdminPremiumList();
  };
  window.rejectPremiumRequest = async function (id) {
    try { await P.api.call('rejectPremium', { id }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadPremiumRequestsAdmin();
  };
  window.cancelPremiumSubscription = async function () {
    const sub = await safeGet('subscription:' + currentUser, true);
    if (!sub) return;
    if (!confirm('Annuler votre abonnement Premium ? Vous garderez l’accès jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', mais il ne sera plus renouvelé après cette date.')) return;
    try { await call('cancelPremium'); } catch (e) { fail(e); return; }
    showToast('Abonnement annulé — accès conservé jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR'));
    await loadPremiumCard();
  };
  window.reactivatePremiumSubscription = async function () {
    const sub = await safeGet('subscription:' + currentUser, true);
    if (!sub) return;
    try { await call('reactivatePremium'); } catch (e) { fail(e); return; }
    showToast('Renouvellement réactivé ✓');
    await loadPremiumCard();
  };

  // ---- Billets de live payants (l. 25371-25403) : prix relu dans live: par le serveur
  window.buyLiveTicket = async function (liveId) {
    let r;
    try { r = await call('buyLiveTicket', { liveId }); } catch (e) { fail(e); return; }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour accéder à ce live payant (' + fr(r.price) + ' FCFA) :\n\n' + instructions);
    showToast('Demande de billet envoyée — en attente de validation ✓');
    await openLiveView(liveId);
  };
  window.approveTicketRequest = async function (liveId, username) {
    try { await P.api.call('approveLiveTicket', { liveId, username }); } catch (e) { fail(e); return; }
    showToast('Billet validé ✓');
    await loadAdminTicketRequests();
  };
  window.rejectTicketRequest = async function (liveId, username) {
    try { await P.api.call('rejectLiveTicket', { liveId, username }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadAdminTicketRequests();
  };
})();
