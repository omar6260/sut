// Domaine « ia-secrets » (phase 06) : tous les appels à des API tierces (Anthropic, Gemini, Cloud Vision, Video Intelligence,
// OpenWeather, Yango, Nominatim) passent ici. Secrets via defineSecret() uniquement ; jamais de clé côté navigateur.
// Chaque fonction : authentification, usage dans la liste blanche (rules.ts), rôle pour les usages admin,
// quota par utilisateur et par jour (`ai_quota/{uid}_{jour}`), journal du coût (`ai_usage/`).
// Sans secret (émulateur) : `failed-precondition` « IA non configurée » → le client retombe sur son comportement « indisponible ».
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { FieldValue } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { REGION, db, kvGet, kvSet, requireAuth, requireRole, requireUsername, setting, nowIso } from '../lib/kv.js';
import {
  USAGES, checkUsage, quotaKey, quotaAllows, DAILY_QUOTA, ANTHROPIC_MODEL, GEMINI_MODEL, GEMINI_EMBED_MODEL,
  claudeText, geminiText, geminiEmbedding, visionSafeSearch, visionLabels, explicitFrames, OPERATION_NAME_RE,
  geoCacheKey, nominatimCountry, weatherSummary, weatherCacheKey,
} from './rules.js';

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GCP_VISION_API_KEY = defineSecret('GCP_VISION_API_KEY');
const GCP_VIDEO_API_KEY = defineSecret('GCP_VIDEO_API_KEY');
const OPENWEATHER_API_KEY = defineSecret('OPENWEATHER_API_KEY');
const YANGO_API_KEY = defineSecret('YANGO_API_KEY');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const VIDEO_BASE = 'https://videointelligence.googleapis.com/v1/';
const WEATHER_URL = 'https://api.openweathermap.org/data/2.5/weather';
const YANGO_URL = 'https://b2b.taxi.yandex.net/api/b2b/platform/requests';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

const MEDIA_OPTS = { region: REGION, memory: '1GiB' as const, timeoutSeconds: 120 };

// ---- Helpers communs ----
const BASE64 = z.string().regex(/^[A-Za-z0-9+/]+=*$/, 'Média invalide');
const parse = <T>(schema: z.ZodType<T>, data: unknown): T => {
  const r = schema.safeParse(data ?? {});
  if (!r.success) throw new HttpsError('invalid-argument', 'Requête invalide : ' + r.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join(', '));
  return r.data;
};
const claimsOf = (req: CallableRequest): Record<string, unknown> => (req.auth?.token ?? {}) as Record<string, unknown>;
function secretOrUnavailable(s: { value(): string }, message = 'IA non configurée'): string {
  const v = s.value();
  if (!v) throw new HttpsError('failed-precondition', message);
  return v;
}

/** Quota quotidien : lecture → contrôle → incrément, en transaction. Lève `resource-exhausted` au-delà de la limite. */
async function consumeQuota(uid: string, usage: string): Promise<void> {
  const ref = db().collection('ai_quota').doc(quotaKey(uid));
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? ((snap.data()!.count as number) ?? 0) : 0;
    const limit = await setting<number>('aiDailyQuota', DAILY_QUOTA, tx);
    if (!quotaAllows(count, typeof limit === 'number' ? limit : DAILY_QUOTA)) throw new HttpsError('resource-exhausted', 'Quota IA quotidien atteint — réessayez demain');
    tx.set(ref, { uid, day: quotaKey(uid).slice(uid.length + 1), count: FieldValue.increment(1), [`byUsage.${usage}`]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}
/** Journal du coût : usage, modèle, jetons, durée. Jamais le prompt, jamais la clé. */
async function logUsage(entry: { uid: string; usage: string; provider: string; model: string; inputTokens?: number; outputTokens?: number; ms: number; ok: boolean; error?: string }): Promise<void> {
  try { await db().collection('ai_usage').add({ ...entry, createdAt: nowIso() }); } catch { /* le journal ne doit jamais faire échouer l'appel */ }
}
/** Enchaîne contrôle d'usage → quota → appel fournisseur → journal. */
async function metered<T>(req: CallableRequest, usage: string, provider: string, model: string, kinds: Array<(typeof USAGES)[string]['kind']>,
  call: () => Promise<{ result: T; inputTokens?: number; outputTokens?: number }>): Promise<T> {
  const uid = requireAuth(req);
  checkUsage(usage, claimsOf(req), kinds);
  await consumeQuota(uid, usage);
  const t0 = Date.now();
  try {
    const { result, inputTokens, outputTokens } = await call();
    await logUsage({ uid, usage, provider, model, inputTokens, outputTokens, ms: Date.now() - t0, ok: true });
    return result;
  } catch (e) {
    await logUsage({ uid, usage, provider, model, ms: Date.now() - t0, ok: false, error: e instanceof HttpsError ? e.code : 'unavailable' });
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('unavailable', 'IA indisponible pour le moment');
  }
}
async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!r.ok) throw new HttpsError('unavailable', 'IA indisponible pour le moment');
  return r.json();
}

// ---- Anthropic ----
const claudeSchema = z.object({
  usage: z.string(), prompt: z.string().min(1).max(60_000), system: z.string().max(20_000).optional(), maxTokens: z.number().int().min(1).max(4_000),
});
/** Remplace les 8 appels `api.anthropic.com/v1/messages` du prototype. Modèle : claude-sonnet-5. Sortie : { ok, text, provider: 'claude', model }. */
export const claudeMessages = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY] }, async (req) => {
  const { usage, prompt, system, maxTokens } = parse(claudeSchema, req.data);
  return metered(req, usage, 'claude', ANTHROPIC_MODEL, ['text'], async () => {
    const client = new Anthropic({ apiKey: secretOrUnavailable(ANTHROPIC_API_KEY) });
    // Pas de `temperature` (retiré sur Sonnet 5) ; réflexion désactivée : mêmes petits max_tokens que le legacy (100 à 900).
    const res = await client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, ...(system ? { system } : {}), thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] });
    return { result: { ok: true, text: claudeText(res.content), provider: 'claude', model: ANTHROPIC_MODEL }, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  });
});

// ---- Gemini ----
const geminiSchema = z.object({
  usage: z.string(), prompt: z.string().max(60_000).optional(), system: z.string().max(20_000).optional(), maxTokens: z.number().int().min(1).max(4_000),
  temperature: z.number().min(0).max(2).optional(),
  media: z.object({ mimeType: z.string().regex(/^(video|audio|image)\/[a-z0-9.+-]+$/i), data: BASE64.max(26_000_000) }).optional(), // ≈ 19 Mo en base64 (limite legacy l. 8054, 19828)
});
/** Remplace les 12 appels Gemini `generateContent` (texte ou vidéo inline). Sortie : { ok, text, provider: 'gemini', model }. */
export const geminiGenerate = onCall({ ...MEDIA_OPTS, secrets: [GEMINI_API_KEY] }, async (req) => {
  const { usage, prompt, system, maxTokens, temperature, media } = parse(geminiSchema, req.data);
  const kind = USAGES[usage]?.kind;
  if (kind === 'media' && !media) throw new HttpsError('invalid-argument', 'Média requis pour cet usage');
  if (kind === 'text' && media) throw new HttpsError('invalid-argument', 'Cet usage n’accepte pas de média');
  if (!prompt && !media) throw new HttpsError('invalid-argument', 'Texte requis');
  return metered(req, usage, 'gemini', GEMINI_MODEL, ['text', 'media'], async () => {
    const key = secretOrUnavailable(GEMINI_API_KEY);
    const parts: unknown[] = [];
    if (prompt) parts.push({ text: prompt });
    if (media) parts.push({ inline_data: { mime_type: media.mimeType, data: media.data } });
    const body: Record<string, unknown> = { contents: [{ parts }], generationConfig: { maxOutputTokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const data = (await postJson(GEMINI_BASE + GEMINI_MODEL + ':generateContent', { 'x-goog-api-key': key }, body)) as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    return { result: { ok: true, text: geminiText(data), provider: 'gemini', model: GEMINI_MODEL }, inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount };
  });
});
/** Remplace `getContentEmbedding` (l. 26571). Sortie : { ok, values: number[] | null }. */
export const geminiEmbed = onCall({ region: REGION, secrets: [GEMINI_API_KEY] }, async (req) => {
  const { usage, text } = parse(z.object({ usage: z.string(), text: z.string().min(1).max(20_000) }), req.data);
  return metered(req, usage, 'gemini', GEMINI_EMBED_MODEL, ['embedding'], async () => {
    const key = secretOrUnavailable(GEMINI_API_KEY);
    const data = await postJson(GEMINI_BASE + GEMINI_EMBED_MODEL + ':embedContent', { 'x-goog-api-key': key }, { content: { parts: [{ text: text.slice(0, 2000) }] } }); // legacy l. 26573 : 2 000 caractères
    return { result: { ok: true, values: geminiEmbedding(data) } };
  });
});

// ---- Google Cloud Vision / Video Intelligence ----
/** Remplace les 3 appels Vision (SafeSearch ou étiquettes). Sortie : { ok, safeSearch } ou { ok, labels } — le client garde ses règles de décision. */
export const visionAnnotate = onCall({ ...MEDIA_OPTS, secrets: [GCP_VISION_API_KEY] }, async (req) => {
  const { usage, image } = parse(z.object({ usage: z.string(), image: BASE64.max(14_000_000) }), req.data);
  return metered(req, usage, 'vision', 'cloud-vision-v1', ['vision'], async () => {
    const key = secretOrUnavailable(GCP_VISION_API_KEY);
    const feature = usage === 'productLabels' ? { type: 'LABEL_DETECTION', maxResults: 5 } : { type: 'SAFE_SEARCH_DETECTION' };
    const data = await postJson(VISION_URL, { 'x-goog-api-key': key }, { requests: [{ image: { content: image }, features: [feature] }] });
    return { result: usage === 'productLabels' ? { ok: true, labels: visionLabels(data) } : { ok: true, safeSearch: visionSafeSearch(data) } };
  });
});
/** Lance une analyse Video Intelligence (contenu explicite). Sortie : { ok, operationName | null }. */
export const videoAnnotate = onCall({ ...MEDIA_OPTS, secrets: [GCP_VIDEO_API_KEY] }, async (req) => {
  const { usage, video } = parse(z.object({ usage: z.string(), video: BASE64.max(26_000_000) }), req.data);
  return metered(req, usage, 'video-intelligence', 'video-intelligence-v1', ['video'], async () => {
    const key = secretOrUnavailable(GCP_VIDEO_API_KEY);
    const data = (await postJson(VIDEO_BASE + 'videos:annotate', { 'x-goog-api-key': key }, { inputContent: video, features: ['EXPLICIT_CONTENT_DETECTION'] })) as { name?: string };
    return { result: { ok: true, operationName: typeof data.name === 'string' && OPERATION_NAME_RE.test(data.name) ? data.name : null } };
  });
});
/** Interroge une opération Video Intelligence. Sortie : { ok, done, frames | null } (le client applique LIKELY/VERY_LIKELY comme avant). */
export const videoOperation = onCall({ region: REGION, secrets: [GCP_VIDEO_API_KEY] }, async (req) => {
  const { usage, operationName } = parse(z.object({ usage: z.string(), operationName: z.string().regex(OPERATION_NAME_RE, 'Opération invalide') }), req.data);
  const uid = requireAuth(req);
  checkUsage(usage, claimsOf(req), ['video']);
  const key = secretOrUnavailable(GCP_VIDEO_API_KEY);
  const t0 = Date.now();
  const r = await fetch(VIDEO_BASE + operationName, { headers: { 'x-goog-api-key': key } }); // sondage : pas de quota, journal seulement
  if (!r.ok) { await logUsage({ uid, usage, provider: 'video-intelligence', model: 'operation', ms: Date.now() - t0, ok: false, error: 'unavailable' }); throw new HttpsError('unavailable', 'IA indisponible pour le moment'); }
  const data = (await r.json()) as { done?: boolean };
  return { ok: true, done: data.done === true, frames: data.done === true ? explicitFrames(data) : null };
});

// ---- Yango Delivery ----
/** Remplace `requestYangoDelivery` (l. 26483) : l'acheteur de la commande demande une livraison ; la référence est écrite serveur. */
export const yangoRequest = onCall({ region: REGION, secrets: [YANGO_API_KEY] }, async (req) => {
  const { orderId, currentUser } = parse(z.object({ orderId: z.string().min(1).max(200), currentUser: z.string().min(1) }), req.data);
  await requireUsername(req, currentUser);
  checkUsage('delivery', claimsOf(req));
  const key = secretOrUnavailable(YANGO_API_KEY, 'Livraison Yango pas encore activée');
  const orderKey = 'order:' + orderId;
  const o = await kvGet<Record<string, any>>(orderKey);
  if (!o) throw new HttpsError('not-found', 'Commande introuvable');
  if (o.buyerUsername !== currentUser && o.sellerUsername !== currentUser) throw new HttpsError('permission-denied', 'Cette commande ne vous concerne pas');
  if (o.yangoRequestId) return { ok: true, requestId: o.yangoRequestId, touched: [] as string[] }; // idempotent
  const uid = req.auth!.uid;
  await consumeQuota(uid, 'delivery');
  const t0 = Date.now();
  let data: { id?: string };
  try {
    // Même corps que le legacy l. 26486-26492 (coordonnées [0, 0] : intégration inachevée, voir RESTE).
    data = (await postJson(YANGO_URL, { Authorization: 'Bearer ' + key }, {
      items: [{ pickup_point: 1, droppoff_point: 2, title: o.productName, quantity: o.quantity }],
      route_points: [
        { coordinates: [0, 0], type: 'source', address: { fullname: 'Adresse du vendeur (à compléter)' } },
        { coordinates: [0, 0], type: 'destination', address: { fullname: o.buyerAddress || '' }, contact: { phone: o.buyerPhone || '', name: o.buyerName || o.buyerUsername } },
      ],
    })) as { id?: string };
  } catch (e) {
    await logUsage({ uid, usage: 'delivery', provider: 'yango', model: 'b2b-platform', ms: Date.now() - t0, ok: false, error: 'unavailable' });
    throw new HttpsError('unavailable', 'Impossible de contacter Yango pour le moment');
  }
  await logUsage({ uid, usage: 'delivery', provider: 'yango', model: 'b2b-platform', ms: Date.now() - t0, ok: true });
  const requestId = typeof data?.id === 'string' ? data.id : null;
  if (requestId) {
    await db().runTransaction(async (tx) => {
      const cur = await kvGet<Record<string, any>>(orderKey, tx);
      if (cur) kvSet(orderKey, { ...cur, yangoRequestId: requestId }, tx);
    });
  }
  return { ok: true, requestId, touched: requestId ? [orderKey] : [] };
});

// ---- OpenWeather ----
/** Remplace `checkSellerWeatherAlert` (l. 21437) : une requête par ville et par jour (cache `weather_cache/`). Sortie : { ok, weather: {condition, description} | null }. */
export const weather = onCall({ region: REGION, secrets: [OPENWEATHER_API_KEY] }, async (req) => {
  const { city } = parse(z.object({ city: z.string().trim().min(1).max(100) }), req.data);
  const uid = requireAuth(req);
  checkUsage('weather', claimsOf(req));
  const key = secretOrUnavailable(OPENWEATHER_API_KEY, 'Alerte météo non configurée');
  const ref = db().collection('weather_cache').doc(weatherCacheKey(city));
  const cached = await ref.get();
  if (cached.exists) return { ok: true, weather: cached.data()!.weather ?? null };
  await consumeQuota(uid, 'weather');
  const t0 = Date.now();
  let summary: { condition: string; description: string } | null;
  try {
    const r = await fetch(WEATHER_URL + '?q=' + encodeURIComponent(city) + '&units=metric&lang=fr&appid=' + encodeURIComponent(key));
    summary = weatherSummary(await r.json()); // `cod !== 200` → null (legacy l. 21439 : on n'affiche rien)
  } catch {
    await logUsage({ uid, usage: 'weather', provider: 'openweather', model: 'weather-2.5', ms: Date.now() - t0, ok: false, error: 'unavailable' });
    throw new HttpsError('unavailable', 'Météo indisponible pour le moment');
  }
  await logUsage({ uid, usage: 'weather', provider: 'openweather', model: 'weather-2.5', ms: Date.now() - t0, ok: true });
  await ref.set({ city, weather: summary, createdAt: nowIso() });
  return { ok: true, weather: summary };
});

// ---- Nominatim ----
/** Remplace `attemptAutoDetectCountry` (l. 7716) : relais avec User-Agent `Suktum/1.0` et cache `geo_cache/{lat,lon arrondis}`. Sortie : { ok, country | null }. */
export const reverseGeocode = onCall({ region: REGION }, async (req) => {
  const { lat, lon } = parse(z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }), req.data);
  const uid = requireAuth(req);
  checkUsage('geocode', claimsOf(req));
  const ref = db().collection('geo_cache').doc(geoCacheKey(lat, lon));
  const cached = await ref.get();
  if (cached.exists) return { ok: true, country: cached.data()!.country ?? null };
  await consumeQuota(uid, 'geocode');
  const t0 = Date.now();
  let country: string | null;
  try {
    const r = await fetch(NOMINATIM_URL + '?format=json&zoom=3&lat=' + encodeURIComponent(lat.toFixed(4)) + '&lon=' + encodeURIComponent(lon.toFixed(4)), { headers: { 'Accept-Language': 'fr', 'User-Agent': 'Suktum/1.0' } });
    if (!r.ok) throw new Error('nominatim ' + r.status);
    country = nominatimCountry(await r.json());
  } catch {
    await logUsage({ uid, usage: 'geocode', provider: 'nominatim', model: 'reverse', ms: Date.now() - t0, ok: false, error: 'unavailable' });
    throw new HttpsError('unavailable', 'Géolocalisation indisponible pour le moment');
  }
  await logUsage({ uid, usage: 'geocode', provider: 'nominatim', model: 'reverse', ms: Date.now() - t0, ok: true });
  await ref.set({ country, createdAt: nowIso() });
  return { ok: true, country };
});

// ---- Back-office : état des secrets (booléens uniquement) ----
/** Remplace les champs de saisie de clés du back-office (gabarit l. ~6138-6180 et 6545-6552). Super-admin seulement ; ne renvoie jamais une valeur. */
export const secretsStatus = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY, GCP_VISION_API_KEY, GCP_VIDEO_API_KEY, OPENWEATHER_API_KEY, YANGO_API_KEY] }, async (req) => {
  requireRole(req, ['superadmin']);
  return {
    ok: true,
    anthropic: !!ANTHROPIC_API_KEY.value(), gemini: !!GEMINI_API_KEY.value(),
    vision: !!GCP_VISION_API_KEY.value(), video: !!GCP_VIDEO_API_KEY.value(),
    weather: !!OPENWEATHER_API_KEY.value(), yango: !!YANGO_API_KEY.value(),
  };
});
