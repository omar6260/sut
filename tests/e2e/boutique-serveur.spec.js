// Garantit (phase 06, boutique) : les montants d'une commande (promo, fidélité, commission, net vendeur, stock) sont
// calculés par le serveur ; la machine à états de la commande, les enchères, la négociation, les notations et les
// actions admin sont gardées côté serveur ; une écriture directe de triche est refusée une fois les règles strictes actives.
import { test, expect, BACKEND } from '../support/fixtures.js';

test.skip(BACKEND !== 'firebase', 'logique serveur = backend firebase');

const api = (page, name, data) => page.evaluate(async ({ name, data }) => {
  try { return { ok: true, result: await window.SuktumPlatform.api.call(name, Object.assign({ currentUser: window.currentUser }, data)) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}, { name, data });

async function openShop(page) {
  await page.locator('#screen-feed [onclick="go(\'shop\')"]').click();
  await expect(page.locator('#screen-shop')).toHaveClass(/active/);
}
async function openSellerDashboard(page) {
  await openShop(page);
  await page.locator('#screen-shop [onclick="openMyShopDrawer()"]').click();
  await expect(page.locator('#screen-my-shop-drawer')).toHaveClass(/active/);
  await page.locator('#screen-my-shop-drawer [onclick="go(\'seller-dashboard\')"]').click();
  await expect(page.locator('#screen-seller-dashboard')).toHaveClass(/active/);
}
async function publishProduct(suktum, page, { name, price, stock }) {
  await openSellerDashboard(page);
  await page.locator('#seller-product-name').fill(name);
  await page.locator('#seller-product-desc').fill('Description ' + name);
  await page.locator('#seller-product-price').fill(String(price));
  await page.locator('#seller-product-category').fill('Vêtement');
  await page.locator('#seller-product-stock').fill(String(stock));
  await page.locator('#screen-seller-dashboard button[onclick="addSellerProduct()"]').click();
  await expect.poll(async () => (await suktum.storage.list(null, 'product:', true)).keys.length).toBeGreaterThan(0);
  const key = (await suktum.storage.list(null, 'product:', true)).keys.slice(-1)[0];
  return suktum.storage.readJSON(key);
}
async function twoAccounts(suktum) {
  const a = await suktum.openDevice('A');
  await suktum.signUp(a, 'Awa_Dakar');
  await suktum.dismissTour(a);
  const b = await suktum.openDevice('B');
  await suktum.signUp(b, 'Moussa_Thies');
  await suktum.dismissTour(b);
  return { a, b };
}

test.describe('Boutique — logique serveur', () => {
  test('commande : promo, fidélité, commission et stock calculés par le serveur ; toast et écrans du prototype', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Robe wax', price: 15000, stock: 3 });
    // Réglages et données que le client ne doit pas pouvoir influencer : taux 10 %, code promo du vendeur, 40 points de fidélité.
    await suktum.storage.writeJSON('settings:commission_rate', 10);
    await suktum.storage.writeJSON('promocode:Awa_Dakar__FETE', { sellerUsername: 'Awa_Dakar', code: 'FETE', discountType: 'percent', discountValue: 10, active: true, createdAt: new Date().toISOString() });
    await suktum.storage.writeJSON('loyaltypoints:Moussa_Thies', 40);

    await openShop(b);
    await expect(b.locator('#shop-list')).toContainText('Robe wax');
    await b.locator(`#shop-list button[onclick="openOrderScreen('${product.id}')"]`).click();
    await expect(b.locator('#screen-order')).toHaveClass(/active/);
    await b.locator('#order-quantity').fill('2');
    await b.locator('#order-name').fill('Moussa Ndiaye');
    await b.locator('#order-phone').fill('77 123 45 67');
    await b.locator('#order-address').fill('Thiès, quartier Randoulène');
    await b.locator('#order-promo-code-input').fill('fete');
    await b.locator('#screen-order button[onclick="applyPromoCode()"]').click();
    await expect(b.locator('#order-promo-code-status')).toContainText('Code appliqué');
    await b.locator('#use-loyalty-points-toggle').check();
    b.once('dialog', (d) => d.accept()); // alert « Pour finaliser votre commande »
    await b.locator('#screen-order button[onclick="submitOrder()"]').click();
    await expect(b.locator('#screen-shop')).toHaveClass(/active/);
    expect(suktum.lastToast(b)).toMatch(/^Commande envoyée ✓ Référence : [A-Z0-9]{6} — \+268 points fidélité$/);

    const orderKeys = (await suktum.storage.list(null, 'order:', true)).keys;
    expect(orderKeys).toHaveLength(1);
    const order = await suktum.storage.readJSON(orderKeys[0]);
    // 30 000 − 10 % promo = 27 000 ; − 40 × 5 FCFA fidélité = 26 800 ; commission 10 % = 2 680 ; net 24 120.
    expect(order).toMatchObject({
      productId: product.id, quantity: 2, unitPrice: 15000, subtotal: 27000, promoCodeApplied: 'FETE', promoDiscount: 3000,
      loyaltyDiscount: 200, loyaltyPointsUsed: 40, total: 26800, commissionRate: 10, commissionAmount: 2680, netAmount: 24120,
      buyerUsername: 'Moussa_Thies', sellerUsername: 'Awa_Dakar', status: 'pending', country: 'Sénégal', server: true,
    });
    expect((await suktum.storage.readJSON(`product:${product.id}`)).stock).toBe(1);
    expect(await suktum.storage.readJSON('loyaltypoints:Moussa_Thies')).toBe(268); // 40 − 40 + floor(26 800 / 100)
    // Stock bas (≤ 2) : notification au vendeur écrite par le serveur.
    const notifKeys = (await suktum.storage.list(null, 'notif:', true)).keys;
    const notifs = await Promise.all(notifKeys.map((k) => suktum.storage.readJSON(k)));
    expect(notifs.some((n) => n.type === 'stock_low' && n.toUser === 'Awa_Dakar' && n.fromUser === 'Moussa_Thies')).toBe(true);

    // Côté B et côté A : écrans du prototype inchangés.
    await b.locator('#screen-shop [onclick="go(\'my-orders\')"]').click();
    await expect(b.locator('#my-orders-list')).toContainText('Robe wax');
    await a.locator('.tab[data-screen="feed"]').click();
    await openSellerDashboard(a);
    await expect(a.locator('#seller-orders-list')).toContainText('@Moussa_Thies');
    await expect(a.locator('#seller-orders-list')).toContainText('En attente');
    expect(suktum.errors).toEqual([]);
  });

  test('stock insuffisant, mise gagnante falsifiée et prix négocié non accepté sont refusés par le serveur', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Sac', price: 5000, stock: 1 });
    const base = { productId: product.id, buyerName: 'M', buyerPhone: '77', buyerAddress: 'Thiès' };
    expect(await api(b, 'createOrder', { ...base, quantity: 2 })).toMatchObject({ ok: false, message: 'Il ne reste que 1 en stock' });
    expect(await api(b, 'createOrder', { ...base, quantity: 1, auctionWinningBid: 1 })).toMatchObject({ ok: false, message: 'Cette mise gagnante n’est plus valide — commande annulée' });
    // Prix négocié non accepté → prix normal appliqué (avertissement du prototype), aucun ordre à 1 FCFA.
    const r = await api(b, 'createOrder', { ...base, quantity: 1, negotiatedPrice: 1 });
    expect(r.ok).toBe(true);
    expect(r.result.warnings).toEqual(['Ce prix négocié n’est plus valide — prix normal appliqué']);
    expect(r.result.total).toBe(5000);
    expect((await suktum.storage.readJSON(`product:${product.id}`)).stock).toBe(0);
    expect(await api(b, 'createOrder', { ...base, quantity: 1 })).toMatchObject({ ok: false, message: 'Ce produit est en rupture de stock' });
    // Le vendeur ne peut pas commander « pour » l'acheteur : le nom transmis doit appartenir au compte appelant.
    expect(await api(a, 'createOrder', { ...base, quantity: 1, currentUser: 'Moussa_Thies' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
  });

  test('statuts : expédition par le vendeur seul, annulation impossible après expédition, réception puis notation avec délai calculé serveur', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Boubou', price: 20000, stock: 5 });
    const created = await api(b, 'createOrder', { productId: product.id, quantity: 1, buyerName: 'M', buyerPhone: '77', buyerAddress: 'Thiès' });
    const orderId = created.result.orderId;
    expect(await api(b, 'updateShipment', { orderId, stage: 'shipped' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect(await api(a, 'updateShipment', { orderId, stage: 'shipped' })).toMatchObject({ ok: true });
    expect(await api(b, 'cancelOrder', { orderId })).toMatchObject({ ok: false, message: 'Trop tard — votre colis a déjà été expédié' });
    expect(await api(a, 'cancelOrder', { orderId, reason: 'rupture' })).toMatchObject({ ok: false, message: 'Trop tard — cette commande a déjà été expédiée' });
    expect(await api(b, 'rateSeller', { orderId, stars: 5 })).toMatchObject({ ok: false, code: 'functions/failed-precondition' });
    expect(await api(a, 'updateShipment', { orderId, stage: 'delivered' })).toMatchObject({ ok: true });
    expect(await api(b, 'confirmReceipt', { orderId })).toMatchObject({ ok: true });
    const order = await suktum.storage.readJSON(`order:${orderId}`);
    expect(order).toMatchObject({ shipmentStage: 'delivered', buyerConfirmedReceipt: true });
    expect(typeof order.deliveredAt).toBe('string');
    expect(await api(b, 'rateSeller', { orderId, stars: 5, comment: 'Parfait' })).toMatchObject({ ok: true });
    expect(await api(b, 'rateSeller', { orderId, stars: 1 })).toMatchObject({ ok: false, code: 'functions/already-exists' });
    expect(await api(a, 'rateSeller', { orderId, stars: 5 })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    const rating = await suktum.storage.readJSON(`sellerrating:${orderId}`);
    expect(rating).toMatchObject({ sellerUsername: 'Awa_Dakar', buyerUsername: 'Moussa_Thies', stars: 5, comment: 'Parfait' });
    expect(rating.shippingDays).toBeGreaterThanOrEqual(0);
    expect(await api(a, 'rateBuyer', { orderId, stars: 4 })).toMatchObject({ ok: true });
    expect(await suktum.storage.readJSON(`buyerrating:${orderId}`)).toMatchObject({ buyerUsername: 'Moussa_Thies', sellerUsername: 'Awa_Dakar', stars: 4 });
  });

  test('enchères et négociation : mise minimale, vendeur exclu, réponse réservée à l’autre partie', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Tableau', price: 10000, stock: 1 });
    await suktum.storage.writeJSON(`product:${product.id}`, { ...product, isAuction: true, auctionCurrentBid: 10000, auctionHighestBidder: null, auctionEndTime: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    expect(await api(b, 'placeBid', { productId: product.id, amount: 10000 })).toMatchObject({ ok: false, message: 'Votre mise doit être d’au moins 10 001 FCFA' });
    expect(await api(a, 'placeBid', { productId: product.id, amount: 12000 })).toMatchObject({ ok: false, message: 'Vous ne pouvez pas enchérir sur votre propre produit' });
    expect(await api(b, 'placeBid', { productId: product.id, amount: 12000 })).toMatchObject({ ok: true });
    expect(await suktum.storage.readJSON(`product:${product.id}`)).toMatchObject({ auctionCurrentBid: 12000, auctionHighestBidder: 'Moussa_Thies' });
    expect((await suktum.storage.list(null, `auctionbid:${product.id}__`, true)).keys).toHaveLength(1);
    expect(await api(b, 'settleAuction', { productId: product.id })).toMatchObject({ ok: false, message: 'Cette enchère n’est pas terminée' });

    const neg = await api(b, 'openNegotiation', { productId: product.id });
    expect(neg).toMatchObject({ ok: true, result: { negotiationId: `${product.id}__Moussa_Thies` } });
    expect(await api(b, 'submitNegotiationOffer', { negotiationId: neg.result.negotiationId, amount: 8000 })).toMatchObject({ ok: true });
    // L'acheteur ne peut pas accepter sa propre offre (garde absente du prototype, l. 26798).
    expect(await api(b, 'respondToNegotiation', { negotiationId: neg.result.negotiationId, action: 'accept' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect(await api(a, 'respondToNegotiation', { negotiationId: neg.result.negotiationId, action: 'accept' })).toMatchObject({ ok: true, result: { status: 'accepted' } });
    const order = await api(b, 'createOrder', { productId: product.id, quantity: 1, negotiatedPrice: 8000, buyerName: 'M', buyerPhone: '77', buyerAddress: 'Thiès' });
    expect(order).toMatchObject({ ok: true, result: { total: 8000, warnings: [] } });
  });

  test('actions admin : rôle exigé par le serveur, journal d’audit écrit côté serveur', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Chaussures', price: 12000, stock: 2 });
    const { result } = await api(b, 'createOrder', { productId: product.id, quantity: 1, buyerName: 'M', buyerPhone: '77', buyerAddress: 'Thiès' });
    expect(await api(b, 'markOrderFulfilled', { orderId: result.orderId })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect(await api(b, 'requestRefund', { orderId: result.orderId, reason: 'Taille incorrecte' })).toMatchObject({ ok: true });
    expect(await api(b, 'requestRefund', { orderId: result.orderId, reason: 'Encore' })).toMatchObject({ ok: false, message: 'Une demande existe déjà pour cette commande' });
    expect(await api(b, 'resolveRefund', { orderId: result.orderId, outcome: 'upheld' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });

    const admin = await suktum.openDevice('ADMIN');
    await suktum.signUp(admin, 'Gorgui');
    await suktum.grantRole(admin, { superadmin: true, adminName: 'Gorgui' });
    expect(await api(admin, 'markOrderFulfilled', { orderId: result.orderId })).toMatchObject({ ok: true });
    expect(await api(admin, 'resolveRefund', { orderId: result.orderId, outcome: 'upheld' })).toMatchObject({ ok: true });
    expect(await api(admin, 'markOrderPaidOut', { orderId: result.orderId })).toMatchObject({ ok: true });
    expect(await suktum.storage.readJSON(`order:${result.orderId}`)).toMatchObject({ status: 'fulfilled', payoutStatus: 'paid', paidOutBy: 'Gorgui' });
    expect(await suktum.storage.readJSON(`refundrequest:${result.orderId}`)).toMatchObject({ status: 'resolved', outcome: 'upheld' });
    const auditKeys = (await suktum.storage.list(null, 'auditlog:', true)).keys;
    const audits = await Promise.all(auditKeys.map((k) => suktum.storage.readJSON(k)));
    expect(audits.map((e) => e.action)).toEqual(expect.arrayContaining(['Nouvelle demande de remboursement', 'Commande marquée traitée', 'Litige résolu — réclamation fondée', 'Reversement effectué']));
    expect(audits.every((e) => e.server === true)).toBe(true);
  });

  // Règles strictes générées par l'orchestrateur : à activer pour vérifier.
  test.fixme('tentative de triche : écrire directement son solde de fidélité ou une commande est refusé', async ({ suktum }) => {
    const { a, b } = await twoAccounts(suktum);
    const product = await publishProduct(suktum, a, { name: 'Robe', price: 15000, stock: 3 });
    const { result } = await api(b, 'createOrder', { productId: product.id, quantity: 1, buyerName: 'M', buyerPhone: '77', buyerAddress: 'Thiès' });
    expect(await suktum.cheatWrite(b, 'loyaltypoints:Moussa_Thies', 999999)).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, `order:${result.orderId}`, { ...(await suktum.storage.readJSON(`order:${result.orderId}`)), total: 1, netAmount: 1 })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, `product:${product.id}`, { ...product, stock: 999 })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'coinbalance:Awa', 999999)).toBe('permission-denied');
  });
});
