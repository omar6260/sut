// Domaine « pieces » (phase 06) : pièces, cadeaux/pourboires, fonds créateur, badges/boosts/Premium payants, billets de live.
// Chaque fonction = une action utilisateur du prototype ; mêmes taux, mêmes arrondis, mêmes messages (ligne legacy citée).
// Le solde de pièces vit dans kv_coinbalance/{username} (espace partagé, écrit uniquement ici) ; le legacy le lit via
// src/platform/overrides/10-pieces.js. Toute opération dépendant d'une lecture est faite en transaction.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION, db, kvGet, kvSet, kvDelete, kvRef, decodeId, requireUsername, requireRole, audit, setting, nowIso, genId, Role } from '../lib/kv.js';

/* ---------- Constantes du prototype ---------- */
export const DEFAULT_GIFT_COMMISSION_RATE = 35; // l. 25427
export const DEFAULT_PREMIUM_PRICE = 2000;      // l. 23534
export const PREMIUM_DURATION_DAYS = 30;        // l. 23535
export const DEFAULT_BADGE_PRICE = 10000;       // l. 23901
export const DEFAULT_BOOST_PRICE = 3000;        // l. 23902
export const DEFAULT_TICKET_COMMISSION = 20;    // l. 23903
export const DEFAULT_AD_DAILY_LIMIT = 3;        // l. 34670
export const REWARDED_AD_MIN_SECONDS = 15;      // l. 34687 : durée minimale d'une publicité récompensée
export const GIFT_AMOUNTS = [100, 500, 1000, 5000]; // boutons de cadeau/pourboire/don (template l. 2651, 4961 ; battle 500 l. 4907)
export const BOOST_CHOICES: Record<string, { hours: number; setting: string; defaultPrice: number }> = { // l. 23834-23838
  '1': { hours: 24, setting: 'boost_price', defaultPrice: DEFAULT_BOOST_PRICE },
  '2': { hours: 72, setting: 'boost_price_3d', defaultPrice: DEFAULT_BOOST_PRICE * 2 },
  '3': { hours: 168, setting: 'boost_price_7d', defaultPrice: DEFAULT_BOOST_PRICE * 4 },
};
const APPROVERS: Role[] = ['superadmin', 'dg'];
const PAYOUTS: Role[] = ['superadmin', 'dg', 'payouts'];
const ADJUSTERS: Role[] = ['superadmin', 'dg', 'moderator', 'payouts'];

/* ---------- Règles de calcul pures (testées sans émulateur) ---------- */
/** Commission d'un cadeau : `Math.round(amount * rate / 100)`, net = reste (l. 24680-24682, 25564-25566). */
export function giftSplit(amount: number, rate: number) {
  const commissionAmount = Math.round(amount * rate / 100);
  return { commissionRate: rate, commissionAmount, netAmount: amount - commissionAmount };
}
/** Commission d'un billet de live (l. 25389-25393). */
export function ticketSplit(price: number, rate: number) {
  const commissionAmount = Math.round(price * rate / 100);
  return { commissionRate: rate, commissionAmount, netAmount: price - commissionAmount };
}
/** Prolongation Premium : 30 jours à partir de l'expiration en cours si encore active, sinon de maintenant (l. 23586-23588). */
export function premiumExpiry(existingExpiresAt: string | null | undefined, now: Date): Date {
  const base = existingExpiresAt && new Date(existingExpiresAt) > now ? new Date(existingExpiresAt) : now;
  return new Date(base.getTime() + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);
}
/** Vainqueur d'un battle : somme des montants par camp (l. 24685-24689). */
export function battleWinner(gifts: { battleSide?: string; amount?: number }[], streamerA: string, streamerB: string) {
  const scoreA = gifts.filter((g) => g.battleSide === 'A').reduce((s, g) => s + (g.amount || 0), 0);
  const scoreB = gifts.filter((g) => g.battleSide === 'B').reduce((s, g) => s + (g.amount || 0), 0);
  return { scoreA, scoreB, winner: scoreA > scoreB ? streamerA : scoreB > scoreA ? streamerB : null };
}
/** Ajustement admin : solde jamais négatif (l. 35209). */
export const adjustedBalance = (balance: number, amount: number) => Math.max(0, balance + amount);
/** Clé du jour (UTC) comme le prototype : `new Date().toISOString().slice(0,10)` (l. 7234, 34672). */
export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
export const monthKeyOf = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); // l. 25806

export type FundPost = { id: string; userId: string; status?: string; createdAt?: string; views?: number; type?: string; postPrivacy?: string };
export type FundEntry = { username: string; views: number; qualityMultiplier: number; rawAmount: number; finalAmount: number };
/**
 * Répartition du fonds créateur (l. 25802-25836) : vues/1000 × taux × multiplicateur qualité (0,5 + taux moyen de
 * visionnage à 50 % des vidéos du créateur ; 1 sans vidéo mesurée), plafonnée au budget par règle de trois.
 * `completions` : postId → maxCompletion de chaque spectateur (docs videocompletion:<postId>__<user>).
 */
export function computeCreatorFund(posts: FundPost[], completions: Map<string, number[]>, rate: number, budget: number, monthKey: string) {
  const thisMonth = posts.filter((p) => p.status === 'published' && typeof p.createdAt === 'string' && p.createdAt.slice(0, 7) === monthKey);
  const viewsByCreator: Record<string, number> = {};
  const videosByCreator: Record<string, string[]> = {};
  for (const p of thisMonth) {
    viewsByCreator[p.userId] = (viewsByCreator[p.userId] || 0) + (p.views || 0);
    if (!videosByCreator[p.userId]) videosByCreator[p.userId] = [];
    if (p.type === 'video') videosByCreator[p.userId].push(p.id);
  }
  const multiplier: Record<string, number> = {};
  for (const username of Object.keys(viewsByCreator)) {
    let totalRate = 0, counted = 0;
    for (const postId of videosByCreator[username] || []) {
      const viewers = completions.get(postId) || [];
      if (viewers.length === 0) continue;
      totalRate += viewers.filter((m) => m >= 0.5).length / viewers.length; // milestoneCounts['0.5'] / totalViewers (l. 25823)
      counted++;
    }
    multiplier[username] = counted > 0 ? 0.5 + totalRate / counted : 1;
  }
  let entries = Object.entries(viewsByCreator).map(([username, views]) => ({ username, views, qualityMultiplier: multiplier[username], rawAmount: Math.round(views / 1000 * rate * multiplier[username]) }));
  const totalRaw = entries.reduce((s, e) => s + e.rawAmount, 0);
  const scale = budget > 0 && totalRaw > budget ? budget / totalRaw : 1;
  const finals: FundEntry[] = entries.filter((e) => e.rawAmount > 0).map((e) => ({ ...e, finalAmount: Math.round(e.rawAmount * scale) }));
  finals.sort((a, b) => b.finalAmount - a.finalAmount);
  return { monthKey, rate, budget, totalRaw, scale, entries: finals };
}

/* ---------- Helpers ---------- */
const fr = (n: number) => n.toLocaleString('fr-FR');
const username = z.string().min(1).max(60);
const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpsError('invalid-argument', 'Données invalides : ' + r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join(' ; '));
  return r.data;
};
const balanceKey = (u: string) => 'coinbalance:' + u;
async function balanceOf(u: string, tx: Transaction): Promise<number> { const v = await kvGet<number>(balanceKey(u), tx); return typeof v === 'number' ? v : 0; }
function roleLabel(r: { role: string; country: string }) { // l. 28933
  return r.role === 'payouts' ? 'Spécialiste reversements' : r.role === 'moderator' ? 'Modérateur' : r.role === 'superadmin' || r.country === 'all' ? 'Propriétaire' : 'DG — ' + r.country;
}
/** Un DG ne traite que les demandes de son pays (filtre des listes admin, l. 23621, 23767, 23827). */
function checkScope(admin: { role: string; country: string }, country: unknown) {
  if (admin.role !== 'superadmin' && admin.country !== 'all' && country && country !== admin.country) throw new HttpsError('permission-denied', 'Cette demande ne relève pas de votre pays');
}
/** createNotification (l. 11452-11461) : pas d'auto-notification, destinataire existant, préférences respectées. Hors transaction. */
async function notify(toUser: string, type: string, fromUser: string, postId: string | null, text: string): Promise<string | null> {
  if (toUser === fromUser) return null;
  const target = await kvGet<any>('user:' + toUser);
  if (!target) return null;
  const category = 'other'; // getNotificationCategory : aucun de nos types n'est dans la table → 'other' (l. 11390)
  if (target.notificationPreferences && target.notificationPreferences[category] === false) return null;
  const id = genId('notif');
  await kvRef('notif:' + id).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { id, toUser, type, fromUser, postId: postId || null, text: text || '', read: false, createdAt: nowIso() } }, { merge: true });
  return 'notif:' + id;
}
/** Vidéo du fonds créateur : maxCompletion par spectateur, groupés par post (lecture unique de kv_videocompletion). */
async function loadCompletions(): Promise<Map<string, number[]>> {
  const snap = await db().collection('kv_videocompletion').get();
  const m = new Map<string, number[]>();
  for (const d of snap.docs) {
    const rec = d.data().data || {};
    const postId = rec.postId || decodeId(d.id).split('__')[0];
    if (!m.has(postId)) m.set(postId, []);
    m.get(postId)!.push(rec.maxCompletion || 0);
  }
  return m;
}
async function loadFund() {
  const [rate, budget] = await Promise.all([setting<number>('creatorFundRatePer1000Views', 0), setting<number>('creatorFundBudget', 0)]);
  const posts = (await db().collection('kv_post').get()).docs.map((d) => d.data().data as FundPost).filter((p) => p && p.userId)
    .filter((p) => !p.postPrivacy || p.postPrivacy === 'public'); // fetchPosts : les posts privés/amis d'autrui sont exclus (l. 13094-13097)
  return computeCreatorFund(posts, await loadCompletions(), rate || 0, budget || 0, monthKeyOf());
}

/* ====================================================================== PIÈCES */

/** Récompense quotidienne (updateDailyStreak l. 7233-7236) : +settings:dailycoinreward une fois par jour, anti-rejeu serveur. */
export const claimDailyCoins = onCall({ region: REGION }, async (req) => {
  const { username: u } = parse(z.object({ username }), req.data);
  await requireUsername(req, u);
  const today = dayKey();
  return db().runTransaction(async (tx) => {
    const reward = await setting<number>('dailycoinreward', 0, tx);
    const last = await kvGet<string>('coindailyclaim:' + u, tx);
    if (last === today) return { ok: true, claimed: false, reward: 0, touched: [] };
    if (!(typeof reward === 'number' && reward > 0)) { kvSet('coindailyclaim:' + u, today, tx, 'server'); return { ok: true, claimed: false, reward: 0, touched: [] }; }
    const balance = await balanceOf(u, tx);
    kvSet(balanceKey(u), balance + reward, tx, 'server');
    kvSet('coindailyclaim:' + u, today, tx, 'server');
    return { ok: true, claimed: true, reward, balance: balance + reward, touched: [balanceKey(u)] };
  });
});

/** Achat d'un pack (purchaseCoinPack l. 34641-34656) : pack lu dans settings:coinpacks, crédit + reçu coinpurchase. */
export const purchaseCoinPack = onCall({ region: REGION }, async (req) => {
  const { username: u, packId } = parse(z.object({ username, packId: z.string().min(1) }), req.data);
  await requireUsername(req, u);
  return db().runTransaction(async (tx) => {
    const packs = await setting<{ id: string; coins: number; priceFcfa: number }[]>('coinpacks', [], tx);
    const pack = (packs || []).find((p) => p.id === packId);
    if (!pack) throw new HttpsError('not-found', 'Ce pack n’est plus disponible');
    const balance = await balanceOf(u, tx);
    const receipt = 'coinpurchase:' + u + '__' + Date.now();
    kvSet(balanceKey(u), balance + pack.coins, tx, 'server');
    kvSet(receipt, { username: u, coins: pack.coins, priceFcfa: pack.priceFcfa, purchasedAt: nowIso() }, tx, 'server');
    return { ok: true, coins: pack.coins, balance: balance + pack.coins, touched: [balanceKey(u), receipt] };
  });
});

/** Dépense typée (unlockEpisodeWithCoins l. 34660-34664) : prix lu dans series:, débit et episodeunlock: en transaction. */
export const spendCoins = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, purpose: z.literal('episode'), seriesId: z.string().min(1), episodeIndex: z.number().int().min(0) }), req.data);
  await requireUsername(req, d.username);
  return db().runTransaction(async (tx) => {
    const s = await kvGet<any>('series:' + d.seriesId, tx);
    const ep = s && Array.isArray(s.episodes) ? s.episodes[d.episodeIndex] : null;
    if (!ep) throw new HttpsError('not-found', 'Cet épisode n’existe pas');
    const coinPrice = Number(ep.coinPrice) || 0;
    if (coinPrice <= 0) throw new HttpsError('failed-precondition', 'Cet épisode ne se débloque pas avec des pièces');
    const unlockKey = 'episodeunlock:' + d.seriesId + '__' + d.episodeIndex + '__' + d.username;
    if (await kvGet(unlockKey, tx)) return { ok: true, alreadyUnlocked: true, touched: [] };
    const balance = await balanceOf(d.username, tx);
    if (balance < coinPrice) throw new HttpsError('failed-precondition', 'Solde insuffisant — il vous manque ' + (coinPrice - balance) + ' pièces'); // l. 34659
    kvSet(balanceKey(d.username), balance - coinPrice, tx, 'server');
    kvSet(unlockKey, { unlockedAt: nowIso(), coinPrice }, tx, 'server');
    return { ok: true, balance: balance - coinPrice, touched: [balanceKey(d.username), unlockKey] };
  });
});

/** Début d'une publicité récompensée (startRewardedAd l. 34669-34676) : vérifie réglage et plafond, ouvre une session horodatée. */
export const startRewardedAd = onCall({ region: REGION }, async (req) => {
  const { username: u, adId } = parse(z.object({ username, adId: z.string().optional() }), req.data);
  await requireUsername(req, u);
  const [dailyLimit, adReward] = await Promise.all([setting<number>('adcoindailylimit', DEFAULT_AD_DAILY_LIMIT), setting<number>('adcoinreward', 0)]);
  if (!(adReward > 0)) throw new HttpsError('failed-precondition', 'Cette fonctionnalité n’est pas encore activée'); // l. 34671
  const watchKey = 'adcoinwatches:' + u + '__' + dayKey();
  const count = (await kvGet<number>(watchKey)) || 0;
  if (count >= (dailyLimit || DEFAULT_AD_DAILY_LIMIT)) throw new HttpsError('resource-exhausted', 'Vous avez atteint la limite quotidienne de publicités récompensées'); // l. 34675
  const sessionKey = 'adcoinsession:' + u;
  await kvRef(sessionKey).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { adId: adId || null, startedAt: Date.now() } });
  return { ok: true, adReward, touched: [sessionKey] };
});

/** Fin de la publicité (l. 34682-34700) : session ouverte depuis ≥ 15 s, plafond revérifié, crédit et compteur en transaction. */
export const rewardedAdReward = onCall({ region: REGION }, async (req) => {
  const { username: u } = parse(z.object({ username }), req.data);
  await requireUsername(req, u);
  const watchKey = 'adcoinwatches:' + u + '__' + dayKey();
  const sessionKey = 'adcoinsession:' + u;
  return db().runTransaction(async (tx) => {
    const [dailyLimit, adReward, session, count, balance] = await Promise.all([
      setting<number>('adcoindailylimit', DEFAULT_AD_DAILY_LIMIT, tx), setting<number>('adcoinreward', 0, tx),
      kvGet<{ startedAt: number }>(sessionKey, tx), kvGet<number>(watchKey, tx), balanceOf(u, tx)]);
    if (!(adReward > 0)) throw new HttpsError('failed-precondition', 'Cette fonctionnalité n’est pas encore activée');
    if (!session || Date.now() - session.startedAt < REWARDED_AD_MIN_SECONDS * 1000 - 500) throw new HttpsError('failed-precondition', 'Regardez la publicité jusqu’au bout pour recevoir vos pièces');
    if ((count || 0) >= (dailyLimit || DEFAULT_AD_DAILY_LIMIT)) throw new HttpsError('resource-exhausted', 'Vous avez atteint la limite quotidienne de publicités récompensées');
    kvSet(balanceKey(u), balance + adReward, tx, 'server');
    kvSet(watchKey, (count || 0) + 1, tx, 'server');
    kvDelete(sessionKey, tx);
    return { ok: true, adReward, balance: balance + adReward, touched: [balanceKey(u), watchKey, sessionKey] };
  });
});

/** Demande de retrait (requestCoinWithdrawal l. 35468-35486) : débit immédiat puis demande `pending`. */
export const requestCoinWithdrawal = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, amount: z.number().int(), method: z.enum(['wave', 'orange']), phone: z.string().trim().max(40) }), req.data);
  await requireUsername(req, d.username);
  if (!d.amount || d.amount <= 0) throw new HttpsError('invalid-argument', 'Entrez un nombre de pièces valide'); // l. 35463
  if (!d.phone) throw new HttpsError('invalid-argument', 'Entrez votre numéro de téléphone'); // l. 35464
  return db().runTransaction(async (tx) => {
    const balance = await balanceOf(d.username, tx);
    if (d.amount > balance) throw new HttpsError('failed-precondition', 'Vous n’avez pas assez de pièces (solde : ' + balance + ')'); // l. 35466
    const id = 'withdrawal_' + Date.now();
    kvSet(balanceKey(d.username), balance - d.amount, tx, 'server');
    kvSet('coinwithdrawal:' + id, { id, username: d.username, amount: d.amount, method: d.method, phone: d.phone, status: 'pending', createdAt: nowIso() }, tx, 'server');
    return { ok: true, id, balance: balance - d.amount, touched: [balanceKey(d.username), 'coinwithdrawal:' + id] };
  });
});

/** Marquage « payé » (markCoinWithdrawalPaid l. 35515-35523) par le spécialiste reversements. */
export const markWithdrawalPaid = onCall({ region: REGION }, async (req) => {
  const { withdrawalId } = parse(z.object({ withdrawalId: z.string().min(1) }), req.data);
  const admin = requireRole(req, PAYOUTS);
  const key = 'coinwithdrawal:' + withdrawalId;
  const w = await db().runTransaction(async (tx) => {
    const w = await kvGet<any>(key, tx);
    if (!w) throw new HttpsError('not-found', 'Demande de retrait introuvable');
    if (w.status === 'paid') return w; // idempotent
    kvSet(key, { ...w, status: 'paid', paidAt: nowIso(), paidBy: admin.name }, tx, 'server');
    return w;
  });
  await audit(admin.name, roleLabel(admin), 'Retrait de pièces payé', '@' + w.username + ' — ' + w.amount + ' pièces');
  return { ok: true, touched: [key] };
});

/** Ajustement manuel (adjustUserCoinBalance l. 35205-35214) : solde jamais négatif, motif obligatoire, journal coinadjustment + audit. */
export const adjustCoins = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, amount: z.number().int(), reason: z.string().trim().max(500) }), req.data);
  const admin = requireRole(req, ADJUSTERS);
  if (!d.amount) throw new HttpsError('invalid-argument', 'Renseignez un ajustement non nul'); // l. 35203
  if (!d.reason) throw new HttpsError('invalid-argument', 'Un motif est requis pour tout ajustement manuel'); // l. 35204
  const adjKey = 'coinadjustment:' + d.username + '__' + Date.now();
  const balance = await db().runTransaction(async (tx) => {
    const balance = await balanceOf(d.username, tx);
    const next = adjustedBalance(balance, d.amount);
    kvSet(balanceKey(d.username), next, tx, 'server');
    kvSet(adjKey, { username: d.username, amount: d.amount, reason: d.reason, adjustedBy: admin.name, createdAt: nowIso() }, tx, 'server');
    return next;
  });
  await audit(admin.name, roleLabel(admin), 'Ajustement manuel de solde de pièces', '@' + d.username + ' — ' + (d.amount > 0 ? '+' : '') + d.amount + ' pièces — ' + d.reason);
  return { ok: true, balance, touched: [balanceKey(d.username), adjKey] };
});

/* ====================================================================== CADEAUX */

const giftTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('live'), liveId: z.string().min(1) }),      // sendGift l. 25620-25628
  z.object({ kind: z.literal('post'), postId: z.string().min(1) }),      // sendPostTip l. 25575-25584
  z.object({ kind: z.literal('direct'), toUser: username }),             // sendDirectGift l. 25558-25567
  z.object({ kind: z.literal('battle'), battleId: z.string().min(1), side: z.enum(['A', 'B']) }), // sendBattleGift l. 24676-24683
]);
/** Cadeau / pourboire / don / soutien de battle : commission `settings:gift_commission_rate` (défaut 35 %) calculée serveur. */
export const sendGift = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, amount: z.number().int(), target: giftTarget }), req.data);
  await requireUsername(req, d.username);
  if (!GIFT_AMOUNTS.includes(d.amount)) throw new HttpsError('invalid-argument', 'Montant de cadeau invalide');
  const t = d.target;
  if (t.kind === 'battle' && d.amount !== 500) throw new HttpsError('invalid-argument', 'Le soutien d’un battle est de 500 FCFA');
  const me = await kvGet<any>('user:' + d.username);
  const country = (me && me.country) || null;
  const result = await db().runTransaction(async (tx) => {
    const rate = await setting<number>('gift_commission_rate', DEFAULT_GIFT_COMMISSION_RATE, tx);
    let toUser: string, extra: Record<string, unknown> = {}, postId: string | null = null;
    if (t.kind === 'live') {
      const l = await kvGet<any>('live:' + t.liveId, tx);
      if (!l) throw new HttpsError('not-found', 'Ce live n’est plus disponible');
      toUser = l.username; extra = { liveId: t.liveId };
    } else if (t.kind === 'post') {
      const p = await kvGet<any>('post:' + t.postId, tx);
      if (!p) throw new HttpsError('not-found', 'Publication introuvable');
      if (p.userId === d.username) throw new HttpsError('failed-precondition', 'Vous ne pouvez pas vous envoyer un pourboire'); // l. 25438
      toUser = p.userId; postId = t.postId; extra = { postId };
    } else if (t.kind === 'direct') {
      if (t.toUser === d.username) throw new HttpsError('failed-precondition', 'Vous ne pouvez pas vous envoyer un don à vous-même'); // l. 25446
      if (!(await kvGet('user:' + t.toUser, tx))) throw new HttpsError('not-found', 'Utilisateur introuvable');
      toUser = t.toUser; extra = { postId: null };
    } else {
      const b = await kvGet<any>('battle:' + t.battleId, tx);
      if (!b || b.status !== 'active') throw new HttpsError('failed-precondition', 'Ce battle est terminé'); // l. 24678
      toUser = t.side === 'A' ? b.streamerA : b.streamerB; extra = { postId: null, battleId: t.battleId, battleSide: t.side };
    }
    const id = 'gift_' + Date.now();
    const split = giftSplit(d.amount, typeof rate === 'number' ? rate : DEFAULT_GIFT_COMMISSION_RATE);
    kvSet('gift:' + id, { id, ...extra, fromUser: d.username, toUser, country, amount: d.amount, ...split, createdAt: nowIso() }, tx, 'server');
    return { id, toUser, postId, ...split };
  });
  const touched = ['gift:' + result.id];
  const n = t.kind === 'direct' ? await notify(result.toUser, 'direct_gift', d.username, null, fr(d.amount))
    : t.kind === 'post' ? await notify(result.toUser, 'post_tip', d.username, result.postId, fr(d.amount)) : null;
  if (n) touched.push(n);
  return { ok: true, id: result.id, toUser: result.toUser, amount: d.amount, commissionAmount: result.commissionAmount, netAmount: result.netAmount, touched };
});

/** Fin de battle (endBattle l. 24685-24695) : vainqueur calculé serveur depuis gift:, notification à l'autre streamer. */
export const endBattle = onCall({ region: REGION }, async (req) => {
  const { username: u, battleId } = parse(z.object({ username, battleId: z.string().min(1) }), req.data);
  await requireUsername(req, u);
  const key = 'battle:' + battleId;
  const gifts = (await db().collection('kv_gift').where('data.battleId', '==', battleId).get()).docs.map((g) => g.data().data);
  const b = await db().runTransaction(async (tx) => {
    const b = await kvGet<any>(key, tx);
    if (!b || (u !== b.streamerA && u !== b.streamerB)) throw new HttpsError('permission-denied', 'Seuls les participants peuvent terminer ce battle');
    const { winner } = battleWinner(gifts, b.streamerA, b.streamerB);
    const next = { ...b, status: 'finished', endedAt: nowIso(), winner };
    kvSet(key, next, tx);
    return next;
  });
  const other = u === b.streamerA ? b.streamerB : b.streamerA;
  const n = await notify(other, 'battle_finished', u, battleId, b.winner || 'égalité');
  return { ok: true, winner: b.winner, touched: [key, ...(n ? [n] : [])] };
});

/* ====================================================================== FONDS CRÉATEUR */

/** Aperçu de la répartition (computeCreatorFundDistribution l. 25802-25836), lecture seule. */
export const previewCreatorFund = onCall({ region: REGION }, async (req) => {
  requireRole(req, APPROVERS);
  return { ok: true, ...(await loadFund()), touched: [] };
});

/** Distribution (confirmCreatorFundDistribution l. 25852) : un creatorfundpayout `pending` par créateur + notification + audit. */
export const distributeCreatorFund = onCall({ region: REGION }, async (req) => {
  const admin = requireRole(req, APPROVERS);
  const fund = await loadFund();
  const touched: string[] = [];
  for (const e of fund.entries) {
    const key = 'creatorfundpayout:' + fund.monthKey + '__' + e.username;
    await kvRef(key).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { username: e.username, monthKey: fund.monthKey, views: e.views, amount: e.finalAmount, status: 'pending', createdAt: nowIso() } }, { merge: true });
    touched.push(key);
    const n = await notify(e.username, 'creator_fund_payout', 'Suktum', null, fr(e.finalAmount));
    if (n) touched.push(n);
  }
  await audit(admin.name, roleLabel(admin), 'Fonds de récompense créateur distribué', fund.entries.length + ' créateur(s) — ' + fund.monthKey);
  return { ok: true, count: fund.entries.length, monthKey: fund.monthKey, touched };
});

/** Contestation par le créateur (submitPayoutDispute l. 33854-33858) : une seule fois. */
export const disputePayout = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, monthKey: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().trim().max(2000) }), req.data);
  await requireUsername(req, d.username);
  if (!d.reason) throw new HttpsError('invalid-argument', 'Expliquez la raison de votre contestation'); // l. 33850
  const key = 'creatorfundpayout:' + d.monthKey + '__' + d.username;
  await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(key, tx);
    if (!p || p.disputeStatus) throw new HttpsError('failed-precondition', 'Cette contestation ne peut pas être envoyée'); // l. 33853
    kvSet(key, { ...p, disputeStatus: 'pending', disputeReason: d.reason, disputeCreatedAt: nowIso() }, tx, 'server');
  });
  await audit(d.username, 'Créateur', 'Nouvelle contestation de versement fonds créateur', '@' + d.username + ' — ' + d.monthKey);
  return { ok: true, touched: [key] };
});

/** Examen d'une contestation (resolveFundDispute l. 33815-33817). */
export const resolvePayoutDispute = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, monthKey: z.string().regex(/^\d{4}-\d{2}$/), note: z.string().trim().max(1000).optional() }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'creatorfundpayout:' + d.monthKey + '__' + d.username;
  await db().runTransaction(async (tx) => {
    const p = await kvGet<any>(key, tx);
    if (!p) throw new HttpsError('not-found', 'Versement introuvable');
    kvSet(key, { ...p, disputeStatus: 'resolved', disputeAdminNote: d.note || null }, tx, 'server');
  });
  const n = await notify(d.username, 'fund_dispute_resolved', 'Suktum', null, d.monthKey);
  await audit(admin.name, roleLabel(admin), 'Contestation fonds créateur examinée', '@' + d.username + ' — ' + d.monthKey);
  return { ok: true, touched: [key, ...(n ? [n] : [])] };
});

/* ====================================================================== BADGE VÉRIFIÉ */

/** Demande de badge (requestVerifiedBadge l. 23772-23775) : prix `settings:badge_price` fixé serveur. */
export const requestBadge = onCall({ region: REGION }, async (req) => {
  const { username: u } = parse(z.object({ username }), req.data);
  await requireUsername(req, u);
  const me = await kvGet<any>('user:' + u);
  const price = await setting<number>('badge_price', DEFAULT_BADGE_PRICE);
  const id = 'badgereq_' + Date.now();
  await kvRef('badgerequest:' + id).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { id, username: u, country: (me && me.country) || null, price: typeof price === 'number' ? price : DEFAULT_BADGE_PRICE, status: 'pending', createdAt: nowIso() } });
  return { ok: true, id, price: typeof price === 'number' ? price : DEFAULT_BADGE_PRICE, touched: ['badgerequest:' + id] };
});

/** Validation du paiement (approveBadgeRequest l. 23789-23798) : user.verifiedBadge, badgepayment, statut, audit. */
export const approveBadge = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'badgerequest:' + id;
  const paymentId = 'badgepay_' + Date.now();
  const r = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(key, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    checkScope(admin, r.country);
    const u = await kvGet<any>('user:' + r.username, tx);
    if (u) kvSet('user:' + r.username, { ...u, verifiedBadge: true }, tx);
    kvSet('badgepayment:' + paymentId, { id: paymentId, username: r.username, country: r.country, amount: r.price, createdAt: nowIso() }, tx, 'server');
    kvSet(key, { ...r, status: 'approved' }, tx, 'server');
    return r;
  });
  await audit(admin.name, roleLabel(admin), 'Badge vérifié validé', '@' + r.username + ' — ' + fr(r.price) + ' FCFA');
  return { ok: true, touched: [key, 'user:' + r.username, 'badgepayment:' + paymentId] };
});

/** Rejet (rejectBadgeRequest l. 23802) : suppression de la demande, journalisée côté serveur. */
export const rejectBadge = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'badgerequest:' + id;
  const r = await kvGet<any>(key);
  if (r) { checkScope(admin, r.country); await kvRef(key).delete(); await audit(admin.name, roleLabel(admin), 'Demande de badge rejetée', '@' + r.username); }
  return { ok: true, touched: [key] };
});

/* ====================================================================== BOOST */

/** Demande de boost (requestBoostPost l. 23832-23839) : durée choisie (1/2/3), prix `settings:boost_price*` fixé serveur. */
export const requestBoost = onCall({ region: REGION }, async (req) => {
  const d = parse(z.object({ username, postId: z.string().min(1), choice: z.enum(['1', '2', '3']) }), req.data);
  await requireUsername(req, d.username);
  const choice = BOOST_CHOICES[d.choice];
  const [me, post, price] = await Promise.all([kvGet<any>('user:' + d.username), kvGet<any>('post:' + d.postId), setting<number>(choice.setting, choice.defaultPrice)]);
  if (!post) throw new HttpsError('not-found', 'Publication introuvable');
  if (post.userId !== d.username) throw new HttpsError('permission-denied', 'Vous ne pouvez booster que vos propres publications');
  const p = typeof price === 'number' ? price : choice.defaultPrice;
  const id = 'boostreq_' + Date.now();
  await kvRef('boostrequest:' + id).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { id, postId: d.postId, username: d.username, country: (me && me.country) || null, price: p, durationHours: choice.hours, status: 'pending', createdAt: nowIso() } });
  return { ok: true, id, price: p, durationHours: choice.hours, touched: ['boostrequest:' + id] };
});

/** Activation (approveBoostRequest l. 23850-23858) : boost:<postId> avec expiration calculée serveur, boostpayment, audit. */
export const approveBoost = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'boostrequest:' + id;
  const paymentId = 'boostpay_' + Date.now();
  const r = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(key, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    checkScope(admin, r.country);
    const hours = r.durationHours || 24;
    kvSet('boost:' + r.postId, { postId: r.postId, username: r.username, expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() }, tx, 'server');
    kvSet('boostpayment:' + paymentId, { id: paymentId, username: r.username, country: r.country, amount: r.price, createdAt: nowIso() }, tx, 'server');
    kvSet(key, { ...r, status: 'approved' }, tx, 'server');
    return { ...r, hours };
  });
  await audit(admin.name, roleLabel(admin), 'Boost validé', '@' + r.username + ' — ' + fr(r.price) + ' FCFA (' + r.hours + 'h)');
  return { ok: true, touched: [key, 'boost:' + r.postId, 'boostpayment:' + paymentId] };
});

/** Rejet (rejectBoostRequest l. 23864). */
export const rejectBoost = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'boostrequest:' + id;
  const r = await kvGet<any>(key);
  if (r) { checkScope(admin, r.country); await kvRef(key).delete(); await audit(admin.name, roleLabel(admin), 'Demande de boost rejetée', '@' + r.username); }
  return { ok: true, touched: [key] };
});

/* ====================================================================== PREMIUM */

/** Activation/prolongation d'un abonnement à partir d'une demande (approvePremiumRequest l. 23583-23607), dans la transaction appelante. */
function approvePremiumInTx(tx: Transaction, reqKey: string, r: any, existing: any, now: Date) {
  const expiresAt = premiumExpiry(existing ? existing.expiresAt : null, now);
  const purchaseKey = 'premiumpurchase:' + r.username + '__' + now.getTime();
  const paymentId = 'premiumpay_' + now.getTime();
  kvSet('subscription:' + r.username, { username: r.username, country: r.country, price: r.price, startedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), cancelled: false, createdAt: existing ? existing.createdAt : now.toISOString() }, tx, 'server');
  kvSet(purchaseKey, { username: r.username, price: r.price, country: r.country, purchasedAt: now.toISOString() }, tx, 'server');
  kvSet('premiumpayment:' + paymentId, { id: paymentId, username: r.username, country: r.country, amount: r.price, createdAt: now.toISOString() }, tx, 'server');
  kvSet(reqKey, { ...r, status: 'approved' }, tx, 'server');
  return [reqKey, 'subscription:' + r.username, purchaseKey, 'premiumpayment:' + paymentId];
}

/** Demande Premium (subscribeToPremium l. 23566-23572) : prix serveur ; `settings:autoApprovePremium` évalué SERVEUR. */
export const subscribePremium = onCall({ region: REGION }, async (req) => {
  const { username: u } = parse(z.object({ username }), req.data);
  await requireUsername(req, u);
  const me = await kvGet<any>('user:' + u);
  const id = 'premiumreq_' + Date.now();
  const reqKey = 'premiumrequest:' + id;
  const out = await db().runTransaction(async (tx) => {
    const [price, auto, existing] = await Promise.all([setting<number>('premium_price', DEFAULT_PREMIUM_PRICE, tx), setting<unknown>('autoApprovePremium', false, tx), kvGet<any>('subscription:' + u, tx)]);
    const r = { id, username: u, country: (me && me.country) || null, price: typeof price === 'number' ? price : DEFAULT_PREMIUM_PRICE, status: 'pending', createdAt: nowIso() };
    kvSet(reqKey, r, tx, 'server');
    if (auto === true) return { price: r.price, autoApproved: true, touched: approvePremiumInTx(tx, reqKey, r, existing, new Date()) };
    return { price: r.price, autoApproved: false, touched: [reqKey] };
  });
  if (out.autoApproved) await audit('Suktum', 'Système', 'Abonnement Premium approuvé automatiquement', '@' + u + ' — ' + fr(out.price) + ' FCFA'); // l. 23571
  return { ok: true, id, ...out };
});

/** Validation manuelle (approvePremiumRequest l. 23583-23607). */
export const approvePremium = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const reqKey = 'premiumrequest:' + id;
  const out = await db().runTransaction(async (tx) => {
    const r = await kvGet<any>(reqKey, tx);
    if (!r) throw new HttpsError('not-found', 'Demande introuvable');
    checkScope(admin, r.country);
    const existing = await kvGet<any>('subscription:' + r.username, tx);
    return { r, touched: approvePremiumInTx(tx, reqKey, r, existing, new Date()) };
  });
  await audit(admin.name, roleLabel(admin), 'Paiement Premium validé', '@' + out.r.username + ' — ' + fr(out.r.price) + ' FCFA');
  return { ok: true, touched: out.touched };
});

/** Rejet (rejectPremiumRequest l. 23614). */
export const rejectPremium = onCall({ region: REGION }, async (req) => {
  const { id } = parse(z.object({ id: z.string().min(1) }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'premiumrequest:' + id;
  const r = await kvGet<any>(key);
  if (r) { checkScope(admin, r.country); await kvRef(key).delete(); await audit(admin.name, roleLabel(admin), 'Demande Premium rejetée', '@' + r.username); }
  return { ok: true, touched: [key] };
});

/** Annulation / réactivation du renouvellement (cancelPremiumSubscription l. 23641, reactivatePremiumSubscription l. 23661) : seul `cancelled` change. */
async function setCancelled(req: any, cancelled: boolean) {
  const { username: u } = parse(z.object({ username }), req.data);
  await requireUsername(req, u);
  const key = 'subscription:' + u;
  const sub = await db().runTransaction(async (tx) => {
    const sub = await kvGet<any>(key, tx);
    if (!sub) return null;
    kvSet(key, { ...sub, cancelled }, tx, 'server');
    return sub;
  });
  return { ok: true, found: !!sub, expiresAt: sub ? sub.expiresAt : null, touched: sub ? [key] : [] };
}
export const cancelPremium = onCall({ region: REGION }, (req) => setCancelled(req, true));
export const reactivatePremium = onCall({ region: REGION }, (req) => setCancelled(req, false));

/* ====================================================================== BILLETS DE LIVE */

/** Achat d'un billet (buyLiveTicket l. 25371-25378) : prix = live.ticketPrice lu serveur, statut `pending`. */
export const buyLiveTicket = onCall({ region: REGION }, async (req) => {
  const { username: u, liveId } = parse(z.object({ username, liveId: z.string().min(1) }), req.data);
  await requireUsername(req, u);
  const [me, l] = await Promise.all([kvGet<any>('user:' + u), kvGet<any>('live:' + liveId)]);
  if (!l) throw new HttpsError('not-found', 'Ce live n’est plus disponible');
  const key = 'ticket:' + liveId + '__' + u;
  const existing = await kvGet<any>(key);
  if (existing && existing.status === 'approved') return { ok: true, price: l.ticketPrice, status: 'approved', touched: [] };
  await kvRef(key).set({ owner: 'server', updatedAt: FieldValue.serverTimestamp(), data: { liveId, username: u, streamerUsername: l.username, country: (me && me.country) || null, price: l.ticketPrice, status: 'pending', createdAt: nowIso() } }, { merge: true });
  return { ok: true, price: l.ticketPrice, status: 'pending', touched: [key] };
});

/** Validation (approveTicketRequest l. 25386-25397) : commission `settings:ticket_commission` (défaut 20 %), ticketpayment, audit. */
export const approveLiveTicket = onCall({ region: REGION }, async (req) => {
  const { liveId, username: u } = parse(z.object({ liveId: z.string().min(1), username }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'ticket:' + liveId + '__' + u;
  const paymentId = 'ticketpay_' + Date.now();
  const t = await db().runTransaction(async (tx) => {
    const t = await kvGet<any>(key, tx);
    if (!t) throw new HttpsError('not-found', 'Demande introuvable');
    checkScope(admin, t.country);
    const rate = await setting<number>('ticket_commission', DEFAULT_TICKET_COMMISSION, tx);
    const split = ticketSplit(t.price, typeof rate === 'number' ? rate : DEFAULT_TICKET_COMMISSION);
    kvSet(key, { ...t, status: 'approved', ...split }, tx, 'server');
    kvSet('ticketpayment:' + paymentId, { id: paymentId, username: u, country: t.country, amount: t.price, commissionAmount: split.commissionAmount, createdAt: nowIso() }, tx, 'server');
    return t;
  });
  await audit(admin.name, roleLabel(admin), 'Billet de live validé', '@' + u + ' — ' + fr(t.price) + ' FCFA');
  return { ok: true, touched: [key, 'ticketpayment:' + paymentId] };
});

/** Rejet (rejectTicketRequest l. 25403). */
export const rejectLiveTicket = onCall({ region: REGION }, async (req) => {
  const { liveId, username: u } = parse(z.object({ liveId: z.string().min(1), username }), req.data);
  const admin = requireRole(req, APPROVERS);
  const key = 'ticket:' + liveId + '__' + u;
  const t = await kvGet<any>(key);
  if (t) { checkScope(admin, t.country); await kvRef(key).delete(); await audit(admin.name, roleLabel(admin), 'Demande de billet rejetée', '@' + u); }
  return { ok: true, touched: [key] };
});
