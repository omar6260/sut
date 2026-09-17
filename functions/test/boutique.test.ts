// Règles de calcul de la boutique (phase 06) : mêmes taux et arrondis que le legacy (lignes citées dans src/boutique/index.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  promoDiscountFor, promoIsValid, loyaltyDiscountFor, computeOrderAmounts, affiliateAmounts, cartLineAmounts, minBidFor,
  isInQuarantine, verifiedDeliveryEvaluation, recommendedSellerQualifies, reliableBuyerQualifies, shippingDaysFor,
  DEFAULT_COMMISSION_RATE, DEFAULT_AFFILIATE_PLATFORM_FEE,
} from '../src/boutique/index.js';

test('code promo : pourcentage arrondi, montant plafonné au sous-total, inactif/expiré = 0 (l. 27222-27224, 26955)', () => {
  assert.equal(promoDiscountFor({ active: true, discountType: 'percent', discountValue: 15 }, 12345), Math.round(12345 * 15 / 100));
  assert.equal(promoDiscountFor({ active: true, discountType: 'amount', discountValue: 5000 }, 3000), 3000);
  assert.equal(promoDiscountFor({ active: true, discountType: 'amount', discountValue: 5000 }, 30000), 5000);
  assert.equal(promoDiscountFor({ active: false, discountType: 'percent', discountValue: 50 }, 30000), 0);
  assert.equal(promoDiscountFor({ active: true, discountType: 'percent', discountValue: 250 }, 1000), 1000); // borné à 100 %
  assert.equal(promoDiscountFor({ active: true, discountType: 'percent', discountValue: -5 }, 1000), 0);
  assert.ok(promoIsValid({ active: true, discountType: 'percent', discountValue: 10 }));
  assert.ok(!promoIsValid({ active: true, discountType: 'percent', discountValue: 10, expiresAt: '2000-01-01T00:00:00.000Z' }));
  assert.ok(!promoIsValid(null));
});

test('fidélité : 5 FCFA par point, plafonnée au sous-total, pointsUsed = ceil(remise / 5) (l. 26749-26754)', () => {
  assert.deepEqual(loyaltyDiscountFor(100, 30000), { discount: 500, pointsUsed: 100 });
  assert.deepEqual(loyaltyDiscountFor(1000, 1234), { discount: 1234, pointsUsed: 247 });
  assert.deepEqual(loyaltyDiscountFor(0, 30000), { discount: 0, pointsUsed: 0 });
  assert.deepEqual(loyaltyDiscountFor(-5, 30000), { discount: 0, pointsUsed: 0 });
});

test('commande : total = prix × qté − promo − fidélité ; commission 5 % arrondie ; net = total − commission ; 1 point / 100 FCFA', () => {
  const m = computeOrderAmounts({ unitPrice: 15000, quantity: 2, commissionRate: DEFAULT_COMMISSION_RATE });
  assert.deepEqual(m, { subtotal: 30000, promoDiscount: 0, discount: 0, pointsUsed: 0, total: 30000, commissionAmount: 1500, netAmount: 28500, earnedPoints: 300 });
  const p = computeOrderAmounts({ unitPrice: 15000, quantity: 2, promo: { active: true, discountType: 'percent', discountValue: 10 }, loyaltyPoints: 40, useLoyalty: true, commissionRate: 7 });
  assert.equal(p.promoDiscount, 3000); assert.equal(p.subtotal, 27000); assert.equal(p.discount, 200); assert.equal(p.pointsUsed, 40);
  assert.equal(p.total, 26800); assert.equal(p.commissionAmount, Math.round(26800 * 7 / 100)); assert.equal(p.netAmount, p.total - p.commissionAmount); assert.equal(p.earnedPoints, 268);
  const q = computeOrderAmounts({ unitPrice: 15000, quantity: 2, loyaltyPoints: 40, useLoyalty: false, commissionRate: 5 });
  assert.equal(q.discount, 0); assert.equal(q.pointsUsed, 0);
  assert.ok(Number.isInteger(p.commissionAmount) && Number.isInteger(p.netAmount));
});

test('affiliation : brut = total × % créateur, frais plateforme 20 % du brut, net = brut − frais (l. 27251-27256)', () => {
  assert.deepEqual(affiliateAmounts(30000, 10, DEFAULT_AFFILIATE_PLATFORM_FEE), { grossCommissionAmount: 3000, platformFeeAmount: 600, commissionAmount: 2400 });
  assert.deepEqual(affiliateAmounts(12345, 7, 20), { grossCommissionAmount: 864, platformFeeAmount: 173, commissionAmount: 691 });
});

test('panier : remise sur lot par vendeur puis commission (l. 14707-14713)', () => {
  assert.deepEqual(cartLineAmounts(10000, 3, 10, 5), { rawTotal: 30000, discountAmount: 3000, total: 27000, commissionAmount: 1350, netAmount: 25650 });
  assert.deepEqual(cartLineAmounts(10000, 1, 0, 5), { rawTotal: 10000, discountAmount: 0, total: 10000, commissionAmount: 500, netAmount: 9500 });
});

test('enchère : mise minimale = mise courante + 1 (l. 27007)', () => {
  assert.equal(minBidFor(5000), 5001); assert.equal(minBidFor(0), 1);
});

test('quarantaine : compte < 1 h avec ≥ 8 actions (l. 26154-26159)', () => {
  const now = Date.now();
  assert.ok(isInQuarantine({ createdAt: new Date(now - 10 * 60_000).toISOString(), earlyActivityCount: 8 }, now));
  assert.ok(!isInQuarantine({ createdAt: new Date(now - 10 * 60_000).toISOString(), earlyActivityCount: 7 }, now));
  assert.ok(!isInQuarantine({ createdAt: new Date(now - 2 * 60 * 60_000).toISOString(), earlyActivityCount: 50 }, now));
  assert.ok(!isInQuarantine(null, now));
});

test('badge livraison vérifiée : ≥ 5 commandes traitées expédiées, ≥ 80 % confirmées (l. 23012-23016)', () => {
  const o = (confirmed: boolean, status = 'fulfilled', stage = 'shipped') => ({ status, shipmentStage: stage, buyerConfirmedReceipt: confirmed });
  assert.equal(verifiedDeliveryEvaluation([o(true), o(true), o(true), o(true)]), null);
  assert.deepEqual(verifiedDeliveryEvaluation([o(true), o(true), o(true), o(true), o(false)]), { qualifies: true, rate: 0.8 });
  assert.deepEqual(verifiedDeliveryEvaluation([o(true), o(true), o(true), o(false), o(false)]), { qualifies: false, rate: 0.6 });
  assert.equal(verifiedDeliveryEvaluation([o(true), o(true), o(true), o(true), o(true, 'pending'), o(true, 'fulfilled', 'prepared')]), null);
});

test('badges de réputation : ≥ 5 notes, moyenne ≥ 4, délai vendeur ≤ 5 j (l. 22084-22090, 21571-21575)', () => {
  const r = (stars: number, shippingDays: number | null = null) => ({ stars, shippingDays });
  assert.equal(recommendedSellerQualifies([r(5), r(5), r(5), r(5)]), null);
  assert.equal(recommendedSellerQualifies([r(5), r(4), r(4), r(4), r(3)]), true);
  assert.equal(recommendedSellerQualifies([r(5), r(4), r(4), r(3), r(3)]), false);
  assert.equal(recommendedSellerQualifies([r(5, 2), r(5, 3), r(5, 4), r(5, 9), r(5, 8)]), false); // 5,2 j en moyenne
  assert.equal(recommendedSellerQualifies([r(5, 2), r(5, 3), r(5), r(5, 9), r(5, 6)]), true); // 5 j exactement
  assert.equal(reliableBuyerQualifies([r(4), r(4), r(4), r(4)]), null);
  assert.equal(reliableBuyerQualifies([r(4), r(4), r(4), r(4), r(4)]), true);
  assert.equal(reliableBuyerQualifies([r(4), r(4), r(4), r(4), r(3)]), false);
});

test('délai de livraison en jours, jamais négatif (l. 21624)', () => {
  assert.equal(shippingDaysFor({ createdAt: '2026-01-01T00:00:00.000Z', deliveredAt: '2026-01-03T12:00:00.000Z' }), 2.5);
  assert.equal(shippingDaysFor({ createdAt: '2026-01-05T00:00:00.000Z', deliveredAt: '2026-01-03T00:00:00.000Z' }), 0);
  assert.equal(shippingDaysFor({ createdAt: '2026-01-05T00:00:00.000Z' }), null);
});
