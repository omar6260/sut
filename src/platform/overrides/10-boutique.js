// Surcharges boutique (phase 06) : commandes, statuts, enchères, négociation, créneaux, litiges, notations, abonnement.
// Chargé après les scripts legacy et avant 20-init.js. Les montants viennent du serveur ; les écrans, toasts et
// enchaînements sont ceux du prototype (fonctions de rendu legacy réutilisées, jamais de rendu ad hoc).
(function () {
  const P = window.SuktumPlatform;
  if (window.__SUKTUM_STORAGE_INJECTED || !P || !P.api || !P.env) return; // pas de plateforme (tests mémoire) → legacy intact
  const call = (name, data) => P.api.call(name, Object.assign({ currentUser }, data));
  const fail = (e) => { showToast(e.message || 'Erreur serveur'); };

  // ---- Commande unitaire (submitOrder l. 27168-27300) ----
  window.submitOrder = async function () {
    if (!currentOrderProduct) return;
    const name = document.getElementById('order-name').value.trim();
    const phone = document.getElementById('order-phone').value.trim();
    const address = document.getElementById('order-address').value.trim();
    const qty = Math.max(1, parseInt(document.getElementById('order-quantity').value, 10) || 1);
    if (!name || !phone || !address) { showToast('Renseignez votre nom, téléphone et adresse'); return; }
    const selectedVariants = {};
    document.querySelectorAll('.order-variant-select').forEach((sel) => { selectedVariants[sel.dataset.variantName] = sel.value; });
    const toggle = document.getElementById('use-loyalty-points-toggle');
    const payload = {
      productId: currentOrderProduct.id, quantity: qty, buyerName: name, buyerPhone: phone, buyerAddress: address,
      promoCode: currentAppliedPromoCode || null, useLoyaltyPoints: !!(toggle && toggle.checked),
      selectedVariants: Object.keys(selectedVariants).length > 0 ? selectedVariants : null,
      flashSaleLiveId: currentOrderFlashSalePrice && currentLiveView ? currentLiveView.id : null,
      negotiatedPrice: currentOrderNegotiatedPriceApplied || null, auctionWinningBid: currentOrderAuctionWinningBidApplied || null,
      affiliateCreator: pendingAffiliateCreator || null, sourceLiveId: currentPurchaseSourceLiveId || null,
    };
    let r;
    try { r = await call('createOrder', payload); }
    catch (e) {
      fail(e);
      if (e.message === 'Ce produit est en rupture de stock') go('shop');
      if (e.message === 'Cette mise gagnante n’est plus valide — commande annulée') currentOrderAuctionWinningBidApplied = null;
      return;
    }
    currentOrderNegotiatedPriceApplied = null; currentOrderAuctionWinningBidApplied = null; currentAppliedPromoCode = null;
    currentPurchaseSourceLiveId = null; currentOrderFlashSalePrice = null; pendingAffiliateCreator = null;
    for (const w of r.warnings || []) showToast(w);
    await logUserActivity(currentUser, 'achats', 'Commande passée : ' + r.productName + ' — ' + r.total.toLocaleString('fr-FR') + ' FCFA');
    const instructions = await getPaymentInstructions(currentUserCountry);
    showToast('Commande envoyée ✓ Référence : ' + r.reference + (r.earnedPoints > 0 ? ' — +' + r.earnedPoints + ' points fidélité' : ''));
    alert('Pour finaliser votre commande :\n\n' + instructions);
    currentOrderProduct = null;
    go('shop');
  };

  // ---- Panier (submitCartCheckout l. 14684-14727) ----
  window.submitCartCheckout = async function () {
    const name = document.getElementById('cart-buyer-name').value.trim();
    const phone = document.getElementById('cart-buyer-phone').value.trim();
    const address = document.getElementById('cart-buyer-address').value.trim();
    if (!name || !phone || !address) { showToast('Renseignez votre nom, téléphone et adresse'); return; }
    let r;
    try { r = await call('checkoutCart', { buyerName: name, buyerPhone: phone, buyerAddress: address }); } catch (e) { fail(e); return; }
    if (r.orderIds.length === 0) return;
    await recordAdConversionIfAttributed();
    const instructions = await getPaymentInstructions(currentUserCountry);
    showToast(r.orderIds.length + ' commande(s) envoyée(s) ✓' + (r.totalDiscountApplied > 0 ? ' — ' + r.totalDiscountApplied.toLocaleString('fr-FR') + ' FCFA de réduction sur lot appliquée' : ''));
    alert('Pour finaliser vos ' + r.orderIds.length + ' commande(s) :\n\n' + instructions);
    go('shop');
  };

  // ---- Statuts de commande ----
  window.setOrderShipmentStage = async function (orderId, stage) { // l. 22362-22374
    try { await call('updateShipment', { orderId, stage }); } catch (e) { fail(e); return; }
    showToast('Suivi mis à jour ✓');
    await renderSellerDashboard();
  };
  window.sellerCancelOrder = async function (orderId) { // l. 22954-22967
    const o = await safeGet('order:' + orderId, true);
    if (!o || o.sellerUsername !== currentUser) return;
    if (o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered') { showToast('Trop tard — cette commande a déjà été expédiée'); return; }
    const reason = prompt('Pourquoi annulez-vous cette commande de « ' + o.productName + ' » ? (rupture de stock, adresse incorrecte...)');
    if (reason === null || !reason.trim()) return;
    try { await call('cancelOrder', { orderId, reason: reason.trim() }); } catch (e) { fail(e); return; }
    showToast('Commande annulée ✓');
    await renderSellerDashboard();
  };
  window.cancelMyOrder = async function (orderId) { // l. 22968-22981
    const o = await safeGet('order:' + orderId, true);
    if (!o || o.buyerUsername !== currentUser) return;
    if (o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered') { showToast('Trop tard — votre colis a déjà été expédié'); return; }
    if (!confirm('Annuler définitivement cette commande de « ' + o.productName + ' » ?')) return;
    try { await call('cancelOrder', { orderId }); } catch (e) { fail(e); return; }
    showToast('Commande annulée ✓');
    await openOrderReceipt(orderId);
  };
  window.confirmOrderReceipt = async function (orderId) { // l. 22997-23005
    try { await call('confirmReceipt', { orderId }); } catch (e) { fail(e); return; }
    showToast('Réception confirmée ✓');
    await openOrderReceipt(orderId);
  };
  window.checkVerifiedDeliveryBadge = async function () { /* phase 06 : recalculé côté serveur (confirmReceipt, resolveRefund) */ };
  window.markOrderFulfilled = async function (id) { // l. 31608-31615
    try { await call('markOrderFulfilled', { orderId: id }); } catch (e) { fail(e); return; }
    showToast('Commande marquée comme traitée ✓');
    await loadOrdersAndRevenue();
  };
  window.markOrderPaidOut = async function (orderId) { // l. 35455-35465
    try { await call('markOrderPaidOut', { orderId }); } catch (e) { fail(e); return; }
    showToast('Reversement enregistré ✓');
    if (document.getElementById('screen-payout-specialist').classList.contains('active')) await renderPayoutSpecialistList();
    else if (currentUserDetailTarget) await openUserDetail(currentUserDetailTarget);
  };

  // ---- Enchères (l. 27000-27024) ----
  window.placeBid = async function () {
    if (!requireAccount('Créez un compte pour enchérir')) return;
    const amount = parseInt(document.getElementById('auction-bid-amount').value, 10);
    try { await call('placeBid', { productId: currentAuctionProductId, amount: isNaN(amount) ? null : amount }); }
    catch (e) { fail(e); if (e.message === 'Cette enchère est terminée') await renderAuctionDetail(); return; }
    showToast('Mise enregistrée ✓');
    await renderAuctionDetail();
  };
  window.proceedToAuctionCheckout = async function () {
    let r;
    try { r = await call('settleAuction', { productId: currentAuctionProductId }); } catch (e) { fail(e); return; }
    currentOrderAuctionWinningBid = r.winningBid;
    await openOrderScreen(currentAuctionProductId);
  };

  // ---- Négociation (l. 26756-26804) ----
  window.openPriceNegotiation = async function (productId) {
    if (!requireAccount('Créez un compte pour négocier un prix')) return;
    let r;
    try { r = await call('openNegotiation', { productId }); } catch (e) { fail(e); return; }
    currentNegotiationId = r.negotiationId;
    go('price-negotiation');
    await renderPriceNegotiation();
  };
  window.submitNegotiationOffer = async function () {
    const amount = parseInt(document.getElementById('negotiation-offer-amount').value, 10);
    if (isNaN(amount) || amount <= 0) { showToast('Entrez un montant valide'); return; }
    try { await call('submitNegotiationOffer', { negotiationId: currentNegotiationId, amount }); } catch (e) { fail(e); return; }
    showToast('Offre envoyée ✓');
    await renderPriceNegotiation();
  };
  window.respondToNegotiation = async function (action) {
    try { await call('respondToNegotiation', { negotiationId: currentNegotiationId, action: action === 'accept' ? 'accept' : 'reject' }); } catch (e) { fail(e); return; }
    showToast(action === 'accept' ? 'Offre acceptée ✓' : 'Offre refusée');
    await renderPriceNegotiation();
  };

  // ---- Réservation de créneau (l. 27569-27581) ----
  window.bookServiceSlot = async function (slotIso) {
    try { await call('bookServiceSlot', { productId: currentServiceBookingProductId, slot: slotIso, sourceLiveId: currentPurchaseSourceLiveId || null }); }
    catch (e) { fail(e); if (e.message === 'Ce créneau n’est plus disponible') await renderServiceBookingSlots(); return; }
    currentPurchaseSourceLiveId = null;
    showToast('Réservation confirmée ✓');
    go('shop');
  };

  // ---- Litiges / remboursements ----
  window.reportNonReceipt = async function (orderId) { // l. 23006-23022
    const o = await safeGet('order:' + orderId, true);
    if (!o || o.buyerUsername !== currentUser) return;
    if (await safeGet('refundrequest:' + orderId, true)) { showToast('Un signalement existe déjà pour cette commande'); return; }
    if (!confirm('Signaler que vous n’avez pas reçu cette commande, malgré le statut déclaré par le vendeur ? Le vendeur et l’équipe Suktum en seront informés.')) return;
    try { await call('reportNonReceipt', { orderId }); } catch (e) { fail(e); return; }
    showToast('Signalement envoyé ✓');
    await openOrderReceipt(orderId);
  };
  window.requestRefund = async function (orderId) { // l. 23023-23037
    const order = await safeGet('order:' + orderId, true);
    if (!order || order.buyerUsername !== currentUser) return;
    if (await safeGet('refundrequest:' + orderId, true)) { showToast('Une demande existe déjà pour cette commande'); return; }
    const reason = prompt('Pourquoi souhaitez-vous être remboursé(e) ?');
    if (reason === null || !reason.trim()) return;
    try { await call('requestRefund', { orderId, reason: reason.trim() }); } catch (e) { fail(e); return; }
    showToast('Demande envoyée ✓');
    await openOrderReceipt(orderId);
  };
  window.resolveRefundRequest = async function (orderId, outcome) { // l. 23097-23117
    try { await call('resolveRefund', { orderId, outcome }); } catch (e) { fail(e); return; }
    showToast(outcome === 'upheld' ? 'Réclamation marquée fondée ✓' : 'Réclamation marquée infondée ✓');
    await renderRefundRequestsAdmin();
  };
  window.setRefundRequestStatus = async function (orderId, status) { // l. 23118-23126
    try { await call('setRefundStatus', { orderId, status }); } catch (e) { fail(e); return; }
    showToast('Statut mis à jour ✓');
    await renderRefundRequestsAdmin();
  };

  // ---- Notations et badges (l. 21558-21580, 21616-21630, 22084-22100) ----
  window.rateBuyerForOrder = async function (orderId, stars) {
    try { await call('rateBuyer', { orderId, stars }); } catch (e) { fail(e); return; }
    showToast('Merci pour votre note ⭐');
    await renderSellerDashboard();
  };
  window.rateSellerForOrder = async function (orderId, stars) {
    const o = await safeGet('order:' + orderId, true);
    if (!o || o.buyerUsername !== currentUser || o.shipmentStage !== 'delivered') return;
    if (await safeGet('sellerrating:' + orderId, true)) return;
    const comment = prompt('Un commentaire à ajouter sur ce vendeur ? (facultatif, laissez vide pour passer)');
    try { await call('rateSeller', { orderId, stars, comment: comment && comment.trim() ? comment.trim() : null }); } catch (e) { fail(e); return; }
    showToast('Merci pour votre note ⭐');
    await renderMyOrdersScreen();
  };
  window.checkRecommendedSellerBadge = async function () { /* phase 06 : recalculé côté serveur (rateSeller) */ };
  window.checkReliableBuyerBadge = async function () { /* phase 06 : recalculé côté serveur (rateBuyer) */ };

  // ---- Abonnement boutique (l. 16522-16545, 16610-16644) ----
  window.subscribeToShop = async function () {
    let r;
    try { r = await call('subscribeShop', {}); } catch (e) { fail(e); return; }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour garder votre boutique visible (' + r.price.toLocaleString('fr-FR') + ' FCFA/mois) :\n\n' + instructions + '\n\nVotre boutique sera activée dès que votre paiement sera vérifié, et à renouveler chaque mois.');
    showToast('Demande envoyée — en attente de validation ✓');
    await renderSellerDashboard();
  };
  window.approveShopSubRequest = async function (id) {
    try { await call('approveShopSub', { requestId: id }); } catch (e) { fail(e); return; }
    showToast('Abonnement boutique activé ✓');
    await loadAdminReportsList();
  };
  window.rejectShopSubRequest = async function (id) {
    try { await call('rejectShopSub', { requestId: id }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadAdminReportsList();
  };
  window.cancelShopSub = async function () {
    const sub = await safeGet('shopsubscription:' + currentUser, true);
    if (!sub) return;
    if (!confirm('Annuler le renouvellement de votre abonnement Boutique ? Vous garderez l’accès jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', mais il ne sera plus renouvelé après cette date.')) return;
    try { await call('cancelShopSub', {}); } catch (e) { fail(e); return; }
    showToast('Renouvellement annulé — accès conservé jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR'));
    await renderMySubscriptions();
  };
  window.reactivateShopSub = async function () {
    if (!(await safeGet('shopsubscription:' + currentUser, true))) return;
    try { await call('reactivateShopSub', {}); } catch (e) { fail(e); return; }
    showToast('Renouvellement réactivé ✓');
    await renderMySubscriptions();
  };
})();
