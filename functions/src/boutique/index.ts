// Boutique (phase 06) : commandes, commissions, statuts, enchères, négociation, réservations, litiges, notations,
// abonnement boutique. Mêmes taux, mêmes arrondis, mêmes messages que le legacy (lignes citées = legacy/suktum-app.html).
// Toute écriture dépendant d'une lecture est faite en transaction ; le client ne calcule aucun montant.
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION, db, kvGet, kvSet, kvDelete, requireUsername, requireRole, audit, nowIso, genId } from '../lib/kv.js';

/* ============================== RÈGLES PURES (testées unitairement) ============================== */
export const DEFAULT_COMMISSION_RATE = 5; // l. 26630
export const DEFAULT_AFFILIATE_PLATFORM_FEE = 20; // l. 26631
export const LOYALTY_POINT_VALUE_FCFA = 5; // l. 27130
export const LOYALTY_POINTS_PER_100_FCFA = 1; // l. 27131
export const DEFAULT_BIG_ORDER_THRESHOLD = 50000; // l. 29580
export const DEFAULT_SHOP_SUB_PRICE = 2000; // l. 16511
export const SHOP_SUB_DURATION_DAYS = 30; // l. 16512

export type Promo = { active?: boolean; discountType?: string; discountValue?: number; expiresAt?: string | null } | null;

/** Remise d'un code promo (l. 27222-27224) : % arrondi ou montant plafonné au sous-total. 0 si inactif. */
export function promoDiscountFor(promo: Promo, subtotal: number): number {
  if (!promo || !promo.active) return 0;
  const value = Number(promo.discountValue) || 0;
  if (value <= 0) return 0;
  return promo.discountType === 'percent' ? Math.round(subtotal * Math.min(value, 100) / 100) : Math.min(Math.round(value), subtotal);
}
/** Code promo utilisable à la commande : actif et non expiré (l. 26954-26956). */
export function promoIsValid(promo: Promo, now = Date.now()): boolean {
  if (!promo || !promo.active) return false;
  return !(promo.expiresAt && new Date(promo.expiresAt).getTime() < now);
}
/** Remise fidélité (l. 26749-26754) : points × 5 FCFA, plafonnée au sous-total ; pointsUsed = ceil(discount / 5). */
export function loyaltyDiscountFor(points: number, subtotal: number): { discount: number; pointsUsed: number } {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  const discount = Math.min(p * LOYALTY_POINT_VALUE_FCFA, subtotal);
  return { discount, pointsUsed: Math.ceil(discount / LOYALTY_POINT_VALUE_FCFA) };
}
/** Montants d'une commande unitaire (l. 27217-27234, 27269-27274). */
export function computeOrderAmounts(a: { unitPrice: number; quantity: number; promo?: Promo; loyaltyPoints?: number; useLoyalty?: boolean; commissionRate: number }) {
  let subtotal = a.unitPrice * a.quantity;
  const promoDiscount = promoDiscountFor(a.promo ?? null, subtotal);
  subtotal -= promoDiscount;
  const { discount, pointsUsed } = a.useLoyalty ? loyaltyDiscountFor(a.loyaltyPoints ?? 0, subtotal) : { discount: 0, pointsUsed: 0 };
  const total = subtotal - discount;
  const commissionAmount = Math.round(total * a.commissionRate / 100);
  const netAmount = total - commissionAmount;
  const earnedPoints = Math.floor(total / 100) * LOYALTY_POINTS_PER_100_FCFA;
  return { subtotal, promoDiscount, discount, pointsUsed, total, commissionAmount, netAmount, earnedPoints };
}
/** Commission d'affiliation (l. 27251-27256). */
export function affiliateAmounts(total: number, affiliatePercent: number, platformFeePercent: number) {
  const grossCommissionAmount = Math.round(total * affiliatePercent / 100);
  const platformFeeAmount = Math.round(grossCommissionAmount * platformFeePercent / 100);
  return { grossCommissionAmount, platformFeeAmount, commissionAmount: grossCommissionAmount - platformFeeAmount };
}
/** Ligne du panier avec remise sur lot (l. 14707-14713). */
export function cartLineAmounts(price: number, quantity: number, discountPercent: number, commissionRate: number) {
  const rawTotal = price * quantity;
  const discountAmount = Math.round(rawTotal * discountPercent / 100);
  const total = rawTotal - discountAmount;
  const commissionAmount = Math.round(total * commissionRate / 100);
  return { rawTotal, discountAmount, total, commissionAmount, netAmount: total - commissionAmount };
}
/** Mise minimale (l. 27007). */
export const minBidFor = (currentBid: number) => (Number(currentBid) || 0) + 1;
/** Quarantaine des nouveaux comptes très actifs (l. 26154-26159). */
export function isInQuarantine(u: any, now = Date.now()): boolean {
  if (!u) return false;
  if (now - new Date(u.createdAt).getTime() > 60 * 60 * 1000) return false;
  return (u.earlyActivityCount || 0) >= 8;
}
/** Badge « livraison vérifiée » (l. 23012-23016) : ≥ 5 commandes traitées expédiées/livrées et ≥ 80 % confirmées. null = pas assez de commandes. */
export function verifiedDeliveryEvaluation(orders: any[]): { qualifies: boolean; rate: number } | null {
  const eligible = orders.filter((o) => o.status === 'fulfilled' && (o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered'));
  if (eligible.length < 5) return null;
  const rate = eligible.filter((o) => o.buyerConfirmedReceipt).length / eligible.length;
  return { qualifies: rate >= 0.8, rate };
}
/** Badge vendeur recommandé (l. 22084-22090) : ≥ 5 avis, moyenne ≥ 4, délai moyen ≤ 5 j. */
export function recommendedSellerQualifies(ratings: any[]): boolean | null {
  if (ratings.length < 5) return null;
  const avgStars = ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
  const speed = ratings.filter((r) => r.shippingDays !== null && r.shippingDays !== undefined);
  const avgSpeed = speed.length > 0 ? speed.reduce((s, r) => s + r.shippingDays, 0) / speed.length : null;
  return avgStars >= 4 && (avgSpeed === null || avgSpeed <= 5);
}
/** Badge acheteur fiable (l. 21571-21575) : ≥ 5 notes et moyenne ≥ 4. */
export function reliableBuyerQualifies(ratings: any[]): boolean | null {
  if (ratings.length < 5) return null;
  return ratings.reduce((s, r) => s + r.stars, 0) / ratings.length >= 4;
}
/** Délai de livraison en jours (l. 21624). */
export function shippingDaysFor(o: any): number | null {
  return o.deliveredAt && o.createdAt ? Math.max(0, (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
}
const fr = (n: number) => n.toLocaleString('fr-FR');

/* ============================== OUTILS SERVEUR ============================== */
/** Réglage numérique avec valeur par défaut (l. 26632-26637 : `typeof rate === 'number'`). */
async function numSetting(key: string, def: number, tx: Transaction): Promise<number> {
  const v = await kvGet<unknown>(`settings:${key}`, tx);
  return typeof v === 'number' ? v : def;
}
/** Catégorie de notification (l. 11405-11419) pour respecter les préférences du destinataire. */
const NOTIF_CATEGORY: Record<string, string> = {
  refund_requested: 'commerce', negotiation_offer: 'commerce', negotiation_accepted: 'commerce', negotiation_rejected: 'commerce', auction_outbid: 'commerce',
  stock_low: 'commerce', stock_out: 'commerce', order_cancelled: 'commerce', order_cancelled_by_seller: 'commerce', verified_delivery_badge_lost: 'commerce',
  dispute_resolved_buyer: 'commerce', dispute_resolved_seller: 'commerce',
};
/** Notifications écrites en transaction : les destinataires sont lus d'abord (phase de lecture), écrits ensuite. */
class Notifier {
  private users = new Map<string, any>();
  constructor(private tx: Transaction, private touched: string[]) {}
  async load(...names: (string | null | undefined)[]) {
    for (const n of names) if (n && !this.users.has(n)) this.users.set(n, await kvGet(`user:${n}`, this.tx));
    return this;
  }
  user(name: string) { return this.users.get(name) ?? null; }
  /** createNotification l. 11452-11462 : rien si auto-notification, destinataire inconnu ou catégorie désactivée. */
  send(toUser: string | null | undefined, type: string, fromUser: string, postId: string | null, text: string | null) {
    if (!toUser || toUser === fromUser) return;
    const target = this.users.get(toUser);
    if (!target) return;
    const category = NOTIF_CATEGORY[type] || 'other';
    if (target.notificationPreferences && target.notificationPreferences[category] === false) return;
    const id = genId('notif');
    kvSet(`notif:${id}`, { id, toUser, type, fromUser, postId: postId || null, text: text || '', read: false, createdAt: nowIso() }, this.tx, 'server');
    this.touched.push(`notif:${id}`);
  }
}
async function kvWhere(prefix: string, field: string, value: unknown): Promise<any[]> {
  const snap = await db().collection(`kv_${prefix}`).where(`data.${field}`, '==', value).get();
  return snap.docs.map((d) => d.data().data);
}
/** Recalcule le badge « livraison vérifiée » d'un vendeur (l. 22997-23017). Renvoie les clés touchées. */
async function checkVerifiedDeliveryBadge(sellerUsername: string): Promise<string[]> {
  const orders = await kvWhere('order', 'sellerUsername', sellerUsername);
  const ev = verifiedDeliveryEvaluation(orders);
  if (!ev) return [];
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const u = await kvGet<any>(`user:${sellerUsername}`, tx);
    if (!u) return;
    const notifier = await new Notifier(tx, touched).load(sellerUsername);
    if (ev.qualifies && !u.verifiedDeliveryBadge) {
      kvSet(`user:${sellerUsername}`, { ...u, verifiedDeliveryBadge: true }, tx); touched.push(`user:${sellerUsername}`);
      notifier.send(sellerUsername, 'verified_delivery_badge', 'Suktum', null, null);
    } else if (!ev.qualifies && u.verifiedDeliveryBadge) {
      kvSet(`user:${sellerUsername}`, { ...u, verifiedDeliveryBadge: false }, tx); touched.push(`user:${sellerUsername}`);
      notifier.send(sellerUsername, 'verified_delivery_badge_lost', 'Suktum', null, Math.round(ev.rate * 100) + '%');
    }
  });
  return touched;
}
/** Badge vendeur recommandé (l. 22084-22100) / acheteur fiable (l. 21571-21580). */
async function checkReputationBadge(kind: 'seller' | 'buyer', username: string): Promise<string[]> {
  const ratings = kind === 'seller' ? await kvWhere('sellerrating', 'sellerUsername', username) : await kvWhere('buyerrating', 'buyerUsername', username);
  const qualifies = kind === 'seller' ? recommendedSellerQualifies(ratings) : reliableBuyerQualifies(ratings);
  if (qualifies === null) return [];
  const flag = kind === 'seller' ? 'recommendedSeller' : 'reliableBuyer';
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const u = await kvGet<any>(`user:${username}`, tx);
    if (!u) return;
    const notifier = await new Notifier(tx, touched).load(username);
    if (qualifies && !u[flag]) {
      kvSet(`user:${username}`, { ...u, [flag]: true }, tx); touched.push(`user:${username}`);
      notifier.send(username, kind === 'seller' ? 'recommended_seller_badge' : 'reliable_buyer_badge', 'Suktum', null, null);
    } else if (!qualifies && u[flag]) {
      kvSet(`user:${username}`, { ...u, [flag]: false }, tx); touched.push(`user:${username}`);
    }
  });
  return touched;
}
const parse = <T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpsError('invalid-argument', r.error.issues[0]?.message || 'Données invalides');
  return r.data;
};
const username = z.string().min(1, 'Nom d’utilisateur requis').max(60);
const id = z.string().min(1).max(200);
const ADMIN_FINANCE: Parameters<typeof requireRole>[1] = ['superadmin', 'dg', 'payouts'];
const ADMIN_DISPUTES: Parameters<typeof requireRole>[1] = ['superadmin', 'dg', 'moderator'];
const ADMIN_SHOP: Parameters<typeof requireRole>[1] = ['superadmin', 'dg'];

/* ============================== COMMANDES ============================== */
const CreateOrder = z.object({
  currentUser: username, productId: id,
  quantity: z.number().int().min(1).max(10000).default(1),
  buyerName: z.string().trim().max(200).default(''), buyerPhone: z.string().trim().max(60).default(''), buyerAddress: z.string().trim().max(500).default(''),
  promoCode: z.string().trim().max(60).nullish(), useLoyaltyPoints: z.boolean().default(false),
  selectedVariants: z.record(z.string().max(200)).nullish(),
  flashSaleLiveId: id.nullish(), negotiatedPrice: z.number().int().positive().nullish(), auctionWinningBid: z.number().int().positive().nullish(),
  affiliateCreator: username.nullish(), sourceLiveId: id.nullish(),
});
/** submitOrder l. 27168-27300 : prix (normal / flash / négocié / enchère), promo, fidélité, commission, stock, affiliation, alerte grosse commande. */
export const createOrder = onCall({ region: REGION }, async (req) => {
  const a = parse(CreateOrder, req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const warnings: string[] = [];
  const result = await db().runTransaction(async (tx) => {
    // ---- lectures (l. 27169-27178) ----
    if (await kvGet('settings:transactionsFrozen', tx)) throw new HttpsError('failed-precondition', 'Les nouvelles commandes sont temporairement suspendues par la direction — réessayez plus tard');
    const me = await kvGet<any>(`user:${a.currentUser}`, tx);
    const country: string | null = me?.country ?? null;
    const readOnlyCountries = (await kvGet<string[]>('settings:readOnlyCountries', tx)) || [];
    if (country && readOnlyCountries.includes(country)) throw new HttpsError('failed-precondition', 'Les commandes sont temporairement en lecture seule pour ' + country + ' — réessayez plus tard');
    const readOnlyDomains = (await kvGet<string[]>('settings:readOnlyDomains', tx)) || [];
    if (readOnlyDomains.includes('marketplace')) throw new HttpsError('failed-precondition', 'Le département Marketplace est temporairement en lecture seule — réessayez plus tard');
    if (isInQuarantine(me)) throw new HttpsError('failed-precondition', 'Les nouveaux comptes très actifs doivent patienter avant leur premier achat — réessayez dans quelques minutes');
    if (!a.buyerName || !a.buyerPhone || !a.buyerAddress) throw new HttpsError('invalid-argument', 'Renseignez votre nom, téléphone et adresse');
    const product = await kvGet<any>(`product:${a.productId}`, tx);
    if (!product) throw new HttpsError('not-found', 'Produit introuvable');
    const qty = a.quantity;
    const stockManaged = product.stock !== null && product.stock !== undefined;
    if (stockManaged) {
      if (product.stock <= 0) throw new HttpsError('failed-precondition', 'Ce produit est en rupture de stock');
      if (qty > product.stock) throw new HttpsError('failed-precondition', 'Il ne reste que ' + product.stock + ' en stock');
    }
    // ---- prix unitaire (l. 27187-27216) ----
    let unitPrice: number = Number(product.price) || 0;
    if (a.flashSaleLiveId) {
      const live = await kvGet<any>(`live:${a.flashSaleLiveId}`, tx);
      if (live && live.flashSale && live.flashSale.productId === product.id && new Date(live.flashSale.expiresAt) > new Date()) unitPrice = Number(live.flashSale.discountedPrice);
      else warnings.push('La vente flash est terminée — prix normal appliqué');
    } else if (a.negotiatedPrice) {
      const neg = await kvGet<any>(`negotiation:${product.id}__${a.currentUser}`, tx);
      if (neg && neg.status === 'accepted' && neg.offers?.length > 0 && neg.offers[neg.offers.length - 1].amount === a.negotiatedPrice) unitPrice = a.negotiatedPrice;
      else warnings.push('Ce prix négocié n’est plus valide — prix normal appliqué');
    } else if (a.auctionWinningBid) {
      if (product.isAuction && product.auctionHighestBidder === a.currentUser && product.auctionCurrentBid === a.auctionWinningBid && new Date(product.auctionEndTime) <= new Date()) unitPrice = a.auctionWinningBid;
      else throw new HttpsError('failed-precondition', 'Cette mise gagnante n’est plus valide — commande annulée');
    }
    // ---- promo (l. 27219-27229), fidélité (l. 27230), commission (l. 27232-27234) ----
    let promo: Promo = null; let appliedPromoCodeForOrder: string | null = null;
    if (a.promoCode) {
      const code = a.promoCode.toUpperCase();
      const p = await kvGet<Promo>(`promocode:${product.sellerUsername}__${code}`, tx);
      if (promoIsValid(p)) { promo = p; appliedPromoCodeForOrder = code; } else warnings.push('Le code promo n’est plus valide — non appliqué');
    }
    const loyaltyPoints = a.useLoyaltyPoints ? (Number(await kvGet<number>(`loyaltypoints:${a.currentUser}`, tx)) || 0) : 0;
    const commissionRate = await numSetting('commission_rate', DEFAULT_COMMISSION_RATE, tx);
    const m = computeOrderAmounts({ unitPrice, quantity: qty, promo, loyaltyPoints, useLoyalty: a.useLoyaltyPoints, commissionRate });
    const bigOrderThreshold = await numSetting('bigOrderThreshold', DEFAULT_BIG_ORDER_THRESHOLD, tx);
    const affiliatePercent = a.affiliateCreator && product.affiliateCommissionPercent ? Number(product.affiliateCommissionPercent) : 0;
    const platformFeePercent = affiliatePercent ? await numSetting('affiliatePlatformFeePercent', DEFAULT_AFFILIATE_PLATFORM_FEE, tx) : 0;
    const notifier = await new Notifier(tx, touched).load(product.sellerUsername, affiliatePercent ? a.affiliateCreator : null);
    const seller = product.sellerUsername ? notifier.user(product.sellerUsername) : null;
    // ---- écritures ----
    const orderId = 'order_' + Date.now();
    const selectedVariants = a.selectedVariants && Object.keys(a.selectedVariants).length > 0 ? a.selectedVariants : null;
    kvSet(`order:${orderId}`, {
      id: orderId, productId: product.id, productName: product.name,
      unitPrice, quantity: qty, total: m.total, subtotal: m.subtotal, loyaltyDiscount: m.discount, loyaltyPointsUsed: m.pointsUsed,
      promoCodeApplied: appliedPromoCodeForOrder, promoDiscount: m.promoDiscount, selectedVariants,
      buyerUsername: a.currentUser, buyerName: a.buyerName, buyerPhone: a.buyerPhone, buyerAddress: a.buyerAddress,
      sellerUsername: product.sellerUsername || null,
      country, commissionRate, commissionAmount: m.commissionAmount, netAmount: m.netAmount,
      status: 'pending', createdAt: nowIso(), sourceLiveId: a.sourceLiveId ?? null, server: true,
    }, tx, uid);
    touched.push(`order:${orderId}`);
    if (m.total >= bigOrderThreshold) { // checkBigOrderAlert l. 29592-29596
      const alertId = 'importantalert_' + Date.now();
      kvSet(`importantalert:${alertId}`, { id: alertId, type: 'big_order', orderId, amount: m.total, productName: product.name, buyerUsername: a.currentUser, seen: false, createdAt: nowIso() }, tx, 'server');
      touched.push(`importantalert:${alertId}`);
    }
    if (affiliatePercent) { // l. 27249-27262
      const af = affiliateAmounts(m.total, affiliatePercent, platformFeePercent);
      kvSet(`affiliatesale:${orderId}`, { orderId, productId: product.id, creatorUsername: a.affiliateCreator, sellerUsername: product.sellerUsername, grossCommissionAmount: af.grossCommissionAmount, platformFeePercent, platformFeeAmount: af.platformFeeAmount, commissionAmount: af.commissionAmount, createdAt: nowIso() }, tx, 'server');
      touched.push(`affiliatesale:${orderId}`);
      notifier.send(a.affiliateCreator, 'affiliate_sale', a.currentUser, product.id, fr(af.commissionAmount));
    }
    // fidélité (l. 27269-27276) : débit des points utilisés puis crédit des points gagnés, en une seule écriture atomique
    if (m.pointsUsed > 0 || m.earnedPoints > 0) {
      const current = a.useLoyaltyPoints ? loyaltyPoints : (Number(await kvGet<number>(`loyaltypoints:${a.currentUser}`, tx)) || 0);
      kvSet(`loyaltypoints:${a.currentUser}`, Math.max(0, current - m.pointsUsed) + m.earnedPoints, tx, uid);
      touched.push(`loyaltypoints:${a.currentUser}`);
    }
    if (stockManaged) { // l. 27279-27290
      const stock = Math.max(0, product.stock - qty);
      kvSet(`product:${product.id}`, { ...product, stock }, tx);
      touched.push(`product:${product.id}`);
      if (stock === 0 && product.sellerUsername) notifier.send(product.sellerUsername, 'stock_out', a.currentUser, product.id, product.name);
      else if (product.sellerUsername) {
        const threshold = seller && seller.lowStockThreshold !== null && seller.lowStockThreshold !== undefined ? seller.lowStockThreshold : 2;
        if (stock <= threshold) notifier.send(product.sellerUsername, 'stock_low', a.currentUser, product.id, product.name + '__' + stock);
      }
    }
    return { orderId, total: m.total, earnedPoints: m.earnedPoints, productName: product.name };
  });
  return { ok: true, touched, ...result, reference: result.orderId.slice(-6).toUpperCase(), warnings };
});

const CheckoutCart = z.object({ currentUser: username, buyerName: z.string().trim().max(200).default(''), buyerPhone: z.string().trim().max(60).default(''), buyerAddress: z.string().trim().max(500).default('') });
/** submitCartCheckout l. 14684-14727 : une commande par article, remise sur lot par vendeur, commission. */
export const checkoutCart = onCall({ region: REGION }, async (req) => {
  const a = parse(CheckoutCart, req.data);
  const uid = await requireUsername(req, a.currentUser);
  if (!a.buyerName || !a.buyerPhone || !a.buyerAddress) throw new HttpsError('invalid-argument', 'Renseignez votre nom, téléphone et adresse');
  const touched: string[] = [];
  const result = await db().runTransaction(async (tx) => {
    const cart = ((await kvGet<any[]>(`cart:${a.currentUser}`, tx)) || []).filter((it) => it && typeof it.productId === 'string');
    if (cart.length === 0) return { orderIds: [] as string[], totalDiscountApplied: 0 };
    const me = await kvGet<any>(`user:${a.currentUser}`, tx);
    const commissionRate = await numSetting('commission_rate', DEFAULT_COMMISSION_RATE, tx);
    const products = new Map<string, any>();
    for (const it of cart) if (!products.has(it.productId)) products.set(it.productId, await kvGet(`product:${it.productId}`, tx));
    const quantityBySeller: Record<string, number> = {};
    for (const it of cart) { const p = products.get(it.productId); if (!p || !p.sellerUsername) continue; quantityBySeller[p.sellerUsername] = (quantityBySeller[p.sellerUsername] || 0) + (Number(it.quantity) || 0); }
    const bundleDiscountsBySeller: Record<string, number> = {};
    for (const seller of Object.keys(quantityBySeller)) {
      const b = await kvGet<any>(`bundlediscount:${seller}`, tx);
      if (b && quantityBySeller[seller] >= b.minItems) bundleDiscountsBySeller[seller] = Math.min(90, Math.max(0, Number(b.percent) || 0)); // bornes l. 26848-26849
    }
    const orderIds: string[] = []; let totalDiscountApplied = 0;
    for (const it of cart) {
      const p = products.get(it.productId); if (!p) continue;
      const quantity = Math.max(1, Math.floor(Number(it.quantity) || 1));
      const discountPercent = p.sellerUsername ? bundleDiscountsBySeller[p.sellerUsername] || 0 : 0;
      const m = cartLineAmounts(Number(p.price) || 0, quantity, discountPercent, commissionRate);
      totalDiscountApplied += m.discountAmount;
      const orderId = genId('order');
      kvSet(`order:${orderId}`, {
        id: orderId, productId: p.id, productName: p.name, unitPrice: p.price, quantity, total: m.total,
        bundleDiscountPercent: discountPercent || null, bundleDiscountAmount: m.discountAmount || null,
        buyerUsername: a.currentUser, buyerName: a.buyerName, buyerPhone: a.buyerPhone, buyerAddress: a.buyerAddress,
        sellerUsername: p.sellerUsername || null, country: me?.country ?? null,
        commissionRate, commissionAmount: m.commissionAmount, netAmount: m.netAmount, status: 'pending', createdAt: nowIso(), server: true,
      }, tx, uid);
      orderIds.push(orderId); touched.push(`order:${orderId}`);
    }
    kvSet(`cart:${a.currentUser}`, [], tx, uid); touched.push(`cart:${a.currentUser}`);
    return { orderIds, totalDiscountApplied };
  });
  return { ok: true, touched, ...result };
});

/* ============================== STATUTS DE COMMANDE ============================== */
const OrderRef = z.object({ currentUser: username, orderId: id });
/** setOrderShipmentStage l. 22362-22374 : seul le vendeur ; livraison ⇒ deliveredAt + enquête satisfaction. */
export const updateShipment = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef.extend({ stage: z.enum(['prepared', 'shipped', 'delivered']) }), req.data);
  await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    if (o.sellerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    const notifier = await new Notifier(tx, touched).load(o.buyerUsername);
    const next = { ...o, shipmentStage: a.stage };
    if (a.stage === 'delivered' && !o.deliveredAt) next.deliveredAt = nowIso();
    kvSet(`order:${a.orderId}`, next, tx); touched.push(`order:${a.orderId}`);
    notifier.send(o.buyerUsername, 'shipment_update', a.currentUser, a.orderId, o.productName + '__' + a.stage);
    if (a.stage === 'delivered') notifier.send(o.buyerUsername, 'satisfaction_survey', a.currentUser, a.orderId, 'order');
  });
  return { ok: true, touched };
});
/** sellerCancelOrder l. 22954-22967 / cancelMyOrder l. 22968-22981 : impossible après expédition. */
export const cancelOrder = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef.extend({ reason: z.string().trim().max(500).nullish() }), req.data);
  await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const role = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    const asSeller = o.sellerUsername === a.currentUser, asBuyer = o.buyerUsername === a.currentUser;
    if (!asSeller && !asBuyer) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    const shipped = o.shipmentStage === 'shipped' || o.shipmentStage === 'delivered';
    if (shipped) throw new HttpsError('failed-precondition', asSeller ? 'Trop tard — cette commande a déjà été expédiée' : 'Trop tard — votre colis a déjà été expédié');
    if (asSeller && !a.reason) throw new HttpsError('invalid-argument', 'Indiquez le motif de l’annulation');
    const notifier = await new Notifier(tx, touched).load(asSeller ? o.buyerUsername : o.sellerUsername);
    const next = { ...o, status: 'cancelled', cancelledAt: nowIso(), cancelledBy: asSeller ? 'seller' : 'buyer' };
    if (asSeller) next.cancellationReason = a.reason;
    kvSet(`order:${a.orderId}`, next, tx); touched.push(`order:${a.orderId}`);
    if (asSeller) notifier.send(o.buyerUsername, 'order_cancelled_by_seller', a.currentUser, a.orderId, o.productName + '__' + a.reason);
    else notifier.send(o.sellerUsername, 'order_cancelled', a.currentUser, a.orderId, o.productName);
    return asSeller ? 'seller' : 'buyer';
  });
  return { ok: true, touched, cancelledBy: role };
});
/** confirmOrderReceipt l. 22997-23005 : acheteur seul ; recalcule le badge livraison vérifiée du vendeur. */
export const confirmReceipt = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef, req.data);
  await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const seller = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    if (o.buyerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    kvSet(`order:${a.orderId}`, { ...o, buyerConfirmedReceipt: true, buyerConfirmedAt: nowIso() }, tx); touched.push(`order:${a.orderId}`);
    return o.sellerUsername as string | null;
  });
  if (seller) touched.push(...await checkVerifiedDeliveryBadge(seller));
  return { ok: true, touched };
});
/** markOrderFulfilled l. 31608-31615 : admin marque la commande traitée (entre dans le chiffre d'affaires). */
export const markOrderFulfilled = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_FINANCE);
  const a = parse(z.object({ orderId: id }), req.data);
  const touched: string[] = [];
  const o = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    kvSet(`order:${a.orderId}`, { ...o, status: 'fulfilled' }, tx); touched.push(`order:${a.orderId}`);
    return o;
  });
  await audit(admin.name, admin.role, 'Commande marquée traitée', o.productName + ' — @' + o.buyerUsername);
  return { ok: true, touched };
});
/** markOrderPaidOut l. 35455-35465 : reversement au vendeur marqué payé (rôle payouts / direction). */
export const markOrderPaidOut = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_FINANCE);
  const a = parse(z.object({ orderId: id, currentUser: username.nullish() }), req.data);
  if (a.currentUser) await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const o = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    kvSet(`order:${a.orderId}`, { ...o, payoutStatus: 'paid', paidOutAt: nowIso(), paidOutBy: a.currentUser || admin.name }, tx); touched.push(`order:${a.orderId}`);
    return o;
  });
  await audit(admin.name, admin.role, 'Reversement effectué', '@' + o.sellerUsername + ' — ' + fr(o.netAmount || 0) + ' FCFA (' + o.productName + ')');
  return { ok: true, touched };
});

/* ============================== ENCHÈRES ============================== */
/** placeBid l. 27000-27017 : mise ≥ courante + 1, enchère en cours, pas le vendeur ; notification du surenchéri. */
export const placeBid = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, productId: id, amount: z.number().int().nullish() }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(`product:${a.productId}`, tx);
    if (!p || !p.isAuction) throw new HttpsError('not-found', 'Produit introuvable');
    if (new Date(p.auctionEndTime) <= new Date()) throw new HttpsError('failed-precondition', 'Cette enchère est terminée');
    if (p.sellerUsername === a.currentUser) throw new HttpsError('permission-denied', 'Vous ne pouvez pas enchérir sur votre propre produit');
    const minBid = minBidFor(p.auctionCurrentBid);
    if (a.amount === null || a.amount === undefined || isNaN(a.amount) || a.amount < minBid) throw new HttpsError('invalid-argument', 'Votre mise doit être d’au moins ' + fr(minBid) + ' FCFA');
    const previousBidder = p.auctionHighestBidder;
    const notifier = await new Notifier(tx, touched).load(previousBidder);
    kvSet(`product:${a.productId}`, { ...p, auctionCurrentBid: a.amount, auctionHighestBidder: a.currentUser }, tx); touched.push(`product:${a.productId}`);
    const bidKey = `auctionbid:${a.productId}__${Date.now()}`;
    kvSet(bidKey, { bidder: a.currentUser, amount: a.amount, createdAt: nowIso() }, tx, uid); touched.push(bidKey);
    if (previousBidder && previousBidder !== a.currentUser) notifier.send(previousBidder, 'auction_outbid', a.currentUser, a.productId, fr(a.amount));
  });
  return { ok: true, touched };
});
/** proceedToAuctionCheckout l. 27019-27024 : seul le meilleur enchérisseur, enchère terminée ; fige `auctionSettled`. */
export const settleAuction = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, productId: id }), req.data);
  await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const winningBid = await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(`product:${a.productId}`, tx);
    if (!p || !p.isAuction) throw new HttpsError('not-found', 'Produit introuvable');
    if (p.auctionHighestBidder !== a.currentUser) throw new HttpsError('permission-denied', 'Vous n’avez pas remporté cette enchère');
    if (new Date(p.auctionEndTime) > new Date()) throw new HttpsError('failed-precondition', 'Cette enchère n’est pas terminée');
    kvSet(`product:${a.productId}`, { ...p, auctionSettled: true }, tx); touched.push(`product:${a.productId}`);
    return p.auctionCurrentBid as number;
  });
  return { ok: true, touched, winningBid };
});

/* ============================== NÉGOCIATION ============================== */
/** openPriceNegotiation l. 26756-26769 : crée le fil `negotiation:<produit>__<acheteur>` s'il n'existe pas. */
export const openNegotiation = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, productId: id }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const negotiationId = `${a.productId}__${a.currentUser}`;
  await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(`product:${a.productId}`, tx);
    if (!p) throw new HttpsError('not-found', 'Produit introuvable');
    if (p.sellerUsername === a.currentUser) throw new HttpsError('permission-denied', 'Vous ne pouvez pas négocier votre propre produit');
    const existing = await kvGet(`negotiation:${negotiationId}`, tx);
    if (existing) return;
    kvSet(`negotiation:${negotiationId}`, { id: negotiationId, productId: a.productId, sellerUsername: p.sellerUsername, buyerUsername: a.currentUser, offers: [], status: 'pending', createdAt: nowIso() }, tx, uid);
    touched.push(`negotiation:${negotiationId}`);
  });
  return { ok: true, touched, negotiationId };
});
/** submitNegotiationOffer l. 26770-26783 : acheteur ou vendeur du fil ; notification de l'autre partie. */
export const submitNegotiationOffer = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, negotiationId: id, amount: z.number().nullish() }), req.data);
  await requireUsername(req, a.currentUser);
  const amount = Math.floor(Number(a.amount));
  if (isNaN(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Entrez un montant valide');
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const neg = await kvGet<any>(`negotiation:${a.negotiationId}`, tx);
    if (!neg) throw new HttpsError('not-found', 'Négociation introuvable');
    if (neg.buyerUsername !== a.currentUser && neg.sellerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette négociation ne vous concerne pas');
    const otherParty = a.currentUser === neg.buyerUsername ? neg.sellerUsername : neg.buyerUsername;
    const notifier = await new Notifier(tx, touched).load(otherParty);
    kvSet(`negotiation:${a.negotiationId}`, { ...neg, offers: [...(neg.offers || []), { by: a.currentUser, amount, createdAt: nowIso() }], status: 'pending' }, tx); touched.push(`negotiation:${a.negotiationId}`);
    notifier.send(otherParty, 'negotiation_offer', a.currentUser, neg.productId, fr(amount));
  });
  return { ok: true, touched };
});
/** respondToNegotiation l. 26784-26804 : seule la partie qui n'a PAS fait la dernière offre peut accepter/refuser (garde absente du legacy, l. 26798). */
export const respondToNegotiation = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, negotiationId: id, action: z.enum(['accept', 'reject']) }), req.data);
  await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  await db().runTransaction(async (tx) => {
    const neg = await kvGet<any>(`negotiation:${a.negotiationId}`, tx);
    if (!neg || !neg.offers || neg.offers.length === 0) throw new HttpsError('failed-precondition', 'Aucune offre à traiter');
    if (neg.buyerUsername !== a.currentUser && neg.sellerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette négociation ne vous concerne pas');
    const lastOffer = neg.offers[neg.offers.length - 1];
    if (lastOffer.by === a.currentUser) throw new HttpsError('permission-denied', 'Vous ne pouvez pas répondre à votre propre offre');
    const otherParty = a.currentUser === neg.buyerUsername ? neg.sellerUsername : neg.buyerUsername;
    const notifier = await new Notifier(tx, touched).load(otherParty);
    const accepted = a.action === 'accept';
    kvSet(`negotiation:${a.negotiationId}`, { ...neg, status: accepted ? 'accepted' : 'rejected' }, tx); touched.push(`negotiation:${a.negotiationId}`);
    if (accepted) notifier.send(otherParty, 'negotiation_accepted', a.currentUser, neg.productId, fr(Number(lastOffer.amount)));
    else notifier.send(otherParty, 'negotiation_rejected', a.currentUser, neg.productId, null);
  });
  return { ok: true, touched, status: a.action === 'accept' ? 'accepted' : 'rejected' };
});

/* ============================== RÉSERVATION DE CRÉNEAU ============================== */
/** bookServiceSlot l. 27569-27581 : retrait atomique du créneau, prix figé, notification du vendeur. */
export const bookServiceSlot = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username, productId: id, slot: z.string().min(1).max(60), sourceLiveId: id.nullish() }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const bookingId = await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(`product:${a.productId}`, tx);
    if (!p || !Array.isArray(p.serviceSlots) || !p.serviceSlots.includes(a.slot)) throw new HttpsError('failed-precondition', 'Ce créneau n’est plus disponible');
    const notifier = await new Notifier(tx, touched).load(p.sellerUsername);
    kvSet(`product:${a.productId}`, { ...p, serviceSlots: p.serviceSlots.filter((s: string) => s !== a.slot) }, tx); touched.push(`product:${a.productId}`);
    const bookingId = 'servicebooking_' + Date.now();
    kvSet(`servicebooking:${bookingId}`, { id: bookingId, productId: a.productId, productName: p.name, sellerUsername: p.sellerUsername, buyerUsername: a.currentUser, price: p.price, slot: a.slot, status: 'confirmed', createdAt: nowIso(), sourceLiveId: a.sourceLiveId ?? null }, tx, uid);
    touched.push(`servicebooking:${bookingId}`);
    notifier.send(p.sellerUsername, 'service_booked', a.currentUser, a.productId, p.name + '__' + a.slot);
    return bookingId;
  });
  return { ok: true, touched, bookingId };
});

/* ============================== LITIGES / REMBOURSEMENTS ============================== */
async function createRefundRequest(a: { currentUser: string; orderId: string }, uid: string, reasonFor: (o: any) => string, notifySeller: boolean, existsMsg: string) {
  const touched: string[] = [];
  const o = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o) throw new HttpsError('not-found', 'Commande introuvable');
    if (o.buyerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    if (await kvGet(`refundrequest:${a.orderId}`, tx)) throw new HttpsError('already-exists', existsMsg);
    const notifier = await new Notifier(tx, touched).load(notifySeller ? o.sellerUsername : null);
    kvSet(`refundrequest:${a.orderId}`, { orderId: a.orderId, buyerUsername: a.currentUser, sellerUsername: o.sellerUsername, productName: o.productName, total: o.total, reason: reasonFor(o), status: 'pending', createdAt: nowIso() }, tx, uid);
    touched.push(`refundrequest:${a.orderId}`);
    if (notifySeller && o.sellerUsername) notifier.send(o.sellerUsername, 'refund_requested', a.currentUser, a.orderId, o.productName);
    return o;
  });
  return { touched, order: o };
}
/** requestRefund l. 23023-23037 : demande de remboursement de l'acheteur (une par commande). */
export const requestRefund = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef.extend({ reason: z.string().trim().min(1, 'Indiquez le motif').max(500) }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const { touched, order } = await createRefundRequest(a, uid, () => a.reason, true, 'Une demande existe déjà pour cette commande');
  await audit(a.currentUser, 'Utilisateur', 'Nouvelle demande de remboursement', '@' + a.currentUser + ' — ' + order.productName + ' (' + fr(order.total) + ' FCFA)');
  return { ok: true, touched };
});
/** reportNonReceipt l. 23006-23022 : signalement « jamais reçu » malgré le statut vendeur. */
export const reportNonReceipt = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef, req.data);
  const uid = await requireUsername(req, a.currentUser);
  const { touched, order } = await createRefundRequest(a, uid, (o) => 'Colis jamais reçu malgré le statut « ' + (o.shipmentStage || '—') + ' » déclaré par le vendeur', false, 'Un signalement existe déjà pour cette commande');
  await audit(a.currentUser, 'Utilisateur', 'Non-réception signalée par l’acheteur', '@' + a.currentUser + ' — commande de @' + order.sellerUsername + ' (' + order.productName + ')');
  return { ok: true, touched };
});
/** resolveRefundRequest l. 23097-23117 : admin ; un rejet « jamais reçu » force la réception et recalcule le badge. */
export const resolveRefund = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_DISPUTES);
  const a = parse(z.object({ orderId: id, outcome: z.enum(['upheld', 'rejected']) }), req.data);
  const touched: string[] = [];
  const { r, sellerToCheck } = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(`refundrequest:${a.orderId}`, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    const notifier = await new Notifier(tx, touched).load(r.buyerUsername, r.sellerUsername);
    kvSet(`refundrequest:${a.orderId}`, { ...r, status: 'resolved', outcome: a.outcome, resolvedAt: nowIso() }, tx); touched.push(`refundrequest:${a.orderId}`);
    let sellerToCheck: string | null = null;
    if (a.outcome === 'rejected' && r.reason && String(r.reason).includes('jamais reçu') && o && !o.buyerConfirmedReceipt) {
      kvSet(`order:${a.orderId}`, { ...o, buyerConfirmedReceipt: true, buyerConfirmedAt: nowIso(), buyerConfirmedByAdminOverride: true }, tx); touched.push(`order:${a.orderId}`);
      sellerToCheck = o.sellerUsername || null;
    }
    const from = admin.name || 'Suktum';
    notifier.send(r.buyerUsername, 'dispute_resolved_buyer', from, a.orderId, r.productName + '__' + a.outcome);
    if (r.sellerUsername) notifier.send(r.sellerUsername, 'dispute_resolved_seller', from, a.orderId, r.productName + '__' + a.outcome);
    return { r, sellerToCheck };
  });
  if (sellerToCheck) touched.push(...await checkVerifiedDeliveryBadge(sellerToCheck));
  await audit(admin.name, admin.role, 'Litige résolu — ' + (a.outcome === 'upheld' ? 'réclamation fondée' : 'réclamation infondée'), '@' + r.buyerUsername + ' — ' + r.productName);
  return { ok: true, touched };
});
/** setRefundRequestStatus l. 23118-23126 : admin passe la demande « en cours ». */
export const setRefundStatus = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_DISPUTES);
  const a = parse(z.object({ orderId: id, status: z.enum(['pending', 'processing']) }), req.data);
  const touched: string[] = [];
  const r = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(`refundrequest:${a.orderId}`, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    kvSet(`refundrequest:${a.orderId}`, { ...r, status: a.status }, tx); touched.push(`refundrequest:${a.orderId}`);
    return r;
  });
  await audit(admin.name, admin.role, 'Demande de remboursement — statut changé (' + a.status + ')', '@' + r.buyerUsername + ' — ' + r.productName);
  return { ok: true, touched };
});

/* ============================== NOTATIONS ============================== */
const stars = z.number().int().min(1).max(5);
/** rateSellerForOrder l. 21616-21630 : acheteur, commande livrée, une seule note ; `shippingDays` calculé serveur. */
export const rateSeller = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef.extend({ stars, comment: z.string().trim().max(500).nullish() }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const seller = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o || o.buyerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    if (o.shipmentStage !== 'delivered') throw new HttpsError('failed-precondition', 'Vous pourrez noter ce vendeur une fois la commande livrée');
    if (await kvGet(`sellerrating:${a.orderId}`, tx)) throw new HttpsError('already-exists', 'Vous avez déjà noté cette commande');
    kvSet(`sellerrating:${a.orderId}`, { sellerUsername: o.sellerUsername, buyerUsername: a.currentUser, stars: a.stars, orderId: a.orderId, comment: a.comment || null, shippingDays: shippingDaysFor(o), createdAt: nowIso() }, tx, uid);
    touched.push(`sellerrating:${a.orderId}`);
    return o.sellerUsername as string | null;
  });
  if (seller) touched.push(...await checkReputationBadge('seller', seller));
  return { ok: true, touched };
});
/** rateBuyerForOrder l. 21558-21570 : vendeur, commande livrée, une seule note. */
export const rateBuyer = onCall({ region: REGION }, async (req) => {
  const a = parse(OrderRef.extend({ stars }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const buyer = await db().runTransaction(async (tx) => {
    const o = await kvGet<any>(`order:${a.orderId}`, tx);
    if (!o || o.sellerUsername !== a.currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas');
    if (o.shipmentStage !== 'delivered') throw new HttpsError('failed-precondition', 'Vous pourrez noter cet acheteur une fois la commande livrée');
    if (await kvGet(`buyerrating:${a.orderId}`, tx)) throw new HttpsError('already-exists', 'Vous avez déjà noté cette commande');
    kvSet(`buyerrating:${a.orderId}`, { buyerUsername: o.buyerUsername, sellerUsername: a.currentUser, stars: a.stars, orderId: a.orderId, createdAt: nowIso() }, tx, uid);
    touched.push(`buyerrating:${a.orderId}`);
    return o.buyerUsername as string;
  });
  touched.push(...await checkReputationBadge('buyer', buyer));
  return { ok: true, touched };
});

/* ============================== ABONNEMENT BOUTIQUE ============================== */
/** subscribeToShop l. 16610-16620 : demande au prix courant `settings:shop_sub_price` (lu serveur). */
export const subscribeShop = onCall({ region: REGION }, async (req) => {
  const a = parse(z.object({ currentUser: username }), req.data);
  const uid = await requireUsername(req, a.currentUser);
  const touched: string[] = [];
  const requestId = 'shopsubreq_' + Date.now();
  const price = await db().runTransaction(async (tx) => {
    const price = await numSetting('shop_sub_price', DEFAULT_SHOP_SUB_PRICE, tx);
    const me = await kvGet<any>(`user:${a.currentUser}`, tx);
    kvSet(`shopsubrequest:${requestId}`, { id: requestId, username: a.currentUser, country: me?.country ?? null, price, status: 'pending', createdAt: nowIso() }, tx, uid);
    touched.push(`shopsubrequest:${requestId}`);
    return price;
  });
  return { ok: true, touched, requestId, price };
});
/** approveShopSubRequest l. 16628-16639 : admin ; 30 jours d'accès. */
export const approveShopSub = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_SHOP);
  const a = parse(z.object({ requestId: id }), req.data);
  const touched: string[] = [];
  const r = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(`shopsubrequest:${a.requestId}`, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    const owner = await db().doc(`usernames/${String(r.username).toLowerCase()}`).get();
    const notifier = await new Notifier(tx, touched).load(r.username);
    const expiresAt = new Date(Date.now() + SHOP_SUB_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    kvSet(`shopsubscription:${r.username}`, { username: r.username, price: r.price, country: r.country, startedAt: nowIso(), expiresAt }, tx, owner.exists ? (owner.data()!.uid as string) : 'server');
    kvSet(`shopsubrequest:${a.requestId}`, { ...r, status: 'approved' }, tx);
    touched.push(`shopsubscription:${r.username}`, `shopsubrequest:${a.requestId}`);
    notifier.send(r.username, 'shopsub_approved', 'Suktum', null, '');
    return r;
  });
  await audit(admin.name, admin.role, 'Abonnement Boutique validé', '@' + r.username + ' — ' + fr(Number(r.price) || 0) + ' FCFA');
  return { ok: true, touched };
});
/** rejectShopSubRequest l. 16640-16644 : admin supprime la demande (journalisé côté serveur). */
export const rejectShopSub = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, ADMIN_SHOP);
  const a = parse(z.object({ requestId: id }), req.data);
  const r = await kvGet<any>(`shopsubrequest:${a.requestId}`);
  kvDelete(`shopsubrequest:${a.requestId}`);
  await audit(admin.name, admin.role, 'Abonnement Boutique — demande rejetée', r ? '@' + r.username : a.requestId);
  return { ok: true, touched: [`shopsubrequest:${a.requestId}`] };
});
/** cancelShopSub l. 16526-16533 / reactivateShopSub l. 16534-16540 : bascule `cancelled` sur son propre abonnement. */
async function toggleShopSub(req: CallableRequest, cancelled: boolean) {
  const a = parse(z.object({ currentUser: username }), req.data);
  await requireUsername(req, a.currentUser);
  const expiresAt = await db().runTransaction(async (tx) => {
    const sub = await kvGet<any>(`shopsubscription:${a.currentUser}`, tx);
    if (!sub) throw new HttpsError('not-found', 'Aucun abonnement trouvé');
    kvSet(`shopsubscription:${a.currentUser}`, { ...sub, cancelled }, tx);
    return sub.expiresAt as string;
  });
  return { ok: true, touched: [`shopsubscription:${a.currentUser}`], expiresAt };
}
export const cancelShopSub = onCall({ region: REGION }, (req) => toggleShopSub(req, true));
export const reactivateShopSub = onCall({ region: REGION }, (req) => toggleShopSub(req, false));
