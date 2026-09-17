// Règles de calcul du domaine « pieces » (phase 06), sans émulateur : mêmes taux et arrondis que le prototype.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giftSplit, ticketSplit, premiumExpiry, battleWinner, adjustedBalance, computeCreatorFund, BOOST_CHOICES, GIFT_AMOUNTS,
  DEFAULT_GIFT_COMMISSION_RATE, DEFAULT_TICKET_COMMISSION, DEFAULT_BADGE_PRICE, DEFAULT_PREMIUM_PRICE, PREMIUM_DURATION_DAYS } from '../src/pieces/index.js';

test('cadeau : commission 35 % par défaut, arrondie (l. 24680-24682)', () => {
  assert.deepEqual(giftSplit(500, DEFAULT_GIFT_COMMISSION_RATE), { commissionRate: 35, commissionAmount: 175, netAmount: 325 });
  assert.deepEqual(giftSplit(100, 35), { commissionRate: 35, commissionAmount: 35, netAmount: 65 });
  assert.deepEqual(giftSplit(5000, 33), { commissionRate: 33, commissionAmount: 1650, netAmount: 3350 });
  assert.deepEqual(giftSplit(1000, 12.5), { commissionRate: 12.5, commissionAmount: 125, netAmount: 875 });
  assert.equal(giftSplit(101, 35).commissionAmount, Math.round(101 * 35 / 100)); // 35,35 → 35
  assert.deepEqual(GIFT_AMOUNTS, [100, 500, 1000, 5000]);
});

test('billet de live : commission 20 % par défaut (l. 25389-25393)', () => {
  assert.deepEqual(ticketSplit(1500, DEFAULT_TICKET_COMMISSION), { commissionRate: 20, commissionAmount: 300, netAmount: 1200 });
  assert.deepEqual(ticketSplit(999, 20), { commissionRate: 20, commissionAmount: 200, netAmount: 799 }); // 199,8 → 200
});

test('Premium : 30 jours ajoutés à l’expiration en cours si active, sinon à maintenant (l. 23586-23588)', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');
  assert.equal(premiumExpiry(null, now).toISOString(), '2026-10-17T12:00:00.000Z');
  assert.equal(premiumExpiry('2026-01-01T00:00:00.000Z', now).toISOString(), '2026-10-17T12:00:00.000Z'); // expiré → repart de maintenant
  assert.equal(premiumExpiry('2026-09-20T00:00:00.000Z', now).toISOString(), '2026-10-20T00:00:00.000Z'); // actif → prolongé
  assert.equal(PREMIUM_DURATION_DAYS, 30); assert.equal(DEFAULT_PREMIUM_PRICE, 2000); assert.equal(DEFAULT_BADGE_PRICE, 10000);
});

test('boost : 24 h / 3 j / 7 j, prix par défaut 3 000 / 6 000 / 12 000 (l. 23834-23838, 23906-23908)', () => {
  assert.deepEqual(Object.keys(BOOST_CHOICES), ['1', '2', '3']);
  assert.equal(BOOST_CHOICES['1'].hours, 24); assert.equal(BOOST_CHOICES['2'].hours, 72); assert.equal(BOOST_CHOICES['3'].hours, 168);
  assert.equal(BOOST_CHOICES['1'].defaultPrice, 3000); assert.equal(BOOST_CHOICES['2'].defaultPrice, 6000); assert.equal(BOOST_CHOICES['3'].defaultPrice, 12000);
});

test('battle : vainqueur = camp avec la plus grande somme, égalité → null (l. 24685-24689)', () => {
  const g = (side: string, amount: number) => ({ battleSide: side, amount });
  assert.equal(battleWinner([g('A', 500), g('B', 500), g('A', 500)], 'Awa', 'Ibou').winner, 'Awa');
  assert.equal(battleWinner([g('B', 500)], 'Awa', 'Ibou').winner, 'Ibou');
  assert.equal(battleWinner([g('A', 500), g('B', 500)], 'Awa', 'Ibou').winner, null);
  assert.deepEqual(battleWinner([], 'Awa', 'Ibou'), { scoreA: 0, scoreB: 0, winner: null });
});

test('ajustement admin : le solde ne descend jamais sous zéro (l. 35209)', () => {
  assert.equal(adjustedBalance(10, -50), 0); assert.equal(adjustedBalance(10, 5), 15); assert.equal(adjustedBalance(0, -1), 0);
});

test('fonds créateur : vues/1000 × taux × qualité, plafonné au budget (l. 25802-25836)', () => {
  const posts = [
    { id: 'p1', userId: 'Awa', status: 'published', createdAt: '2026-09-02T10:00:00Z', views: 4000, type: 'video' },
    { id: 'p2', userId: 'Awa', status: 'published', createdAt: '2026-09-05T10:00:00Z', views: 1000, type: 'photo' },
    { id: 'p3', userId: 'Ibou', status: 'published', createdAt: '2026-09-09T10:00:00Z', views: 2000, type: 'video' },
    { id: 'p4', userId: 'Moussa', status: 'published', createdAt: '2026-08-30T10:00:00Z', views: 9000, type: 'video' }, // mois précédent
    { id: 'p5', userId: 'Fatou', status: 'scheduled', createdAt: '2026-09-10T10:00:00Z', views: 9000, type: 'video' }, // non publié
    { id: 'p6', userId: 'Fatou', status: 'published', createdAt: '2026-09-10T10:00:00Z', views: 0, type: 'photo' }, // montant nul → exclu
  ];
  const completions = new Map<string, number[]>([['p1', [0.25, 0.75, 0.95, 0.1]], ['p3', []]]); // Awa : 50 % des spectateurs ≥ 0,5 → ×1,0 ; Ibou : aucune mesure → ×1
  const r = computeCreatorFund(posts, completions, 1000, 0, '2026-09');
  assert.equal(r.scale, 1);
  assert.deepEqual(r.entries.map((e) => [e.username, e.views, e.qualityMultiplier, e.finalAmount]), [['Awa', 5000, 1, 5000], ['Ibou', 2000, 1, 2000]]);
  // Budget insuffisant : règle de trois puis arrondi.
  const capped = computeCreatorFund(posts, completions, 1000, 3500, '2026-09');
  assert.equal(capped.totalRaw, 7000); assert.equal(capped.scale, 0.5);
  assert.deepEqual(capped.entries.map((e) => [e.username, e.finalAmount]), [['Awa', 2500], ['Ibou', 1000]]);
  // Qualité : tous les spectateurs à ≥ 0,5 → ×1,5.
  const q = computeCreatorFund(posts.slice(2, 3), new Map([['p3', [0.5, 1]]]), 1000, 0, '2026-09');
  assert.equal(q.entries[0].qualityMultiplier, 1.5); assert.equal(q.entries[0].finalAmount, 3000);
  assert.equal(computeCreatorFund(posts, completions, 0, 0, '2026-09').entries.length, 0);
});
