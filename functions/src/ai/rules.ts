// Règles pures du domaine « ia-secrets » (phase 06) : liste blanche des usages, rôles, quota, extraction des réponses.
// Aucune dépendance Firebase ici : tout est testable sans émulateur (functions/test/ai.test.ts).
import { HttpsError } from 'firebase-functions/v2/https';
import type { Role } from '../lib/kv.js';

export const ANTHROPIC_MODEL = 'claude-sonnet-5'; // remplace `claude-sonnet-4-6` (legacy l. 26606, 19118)
export const GEMINI_MODEL = 'gemini-2.0-flash';
export const GEMINI_EMBED_MODEL = 'text-embedding-004';
export const DAILY_QUOTA = 300; // appels IA par utilisateur et par jour (surchargeable par `settings:aiDailyQuota`)

const ADMIN_ALL: Role[] = ['superadmin', 'dg', 'moderator', 'payouts', 'techteam'];
const OWNERS: Role[] = ['superadmin', 'dg'];

/**
 * Liste blanche fermée des usages, dérivée des 28 sites de `fetch` du prototype (docs/inventaire/appels-externes.md).
 * `roles: null` = tout utilisateur connecté ; sinon rôle (custom claim) requis.
 */
export const USAGES: Record<string, { roles: Role[] | null; kind: 'text' | 'media' | 'embedding' | 'vision' | 'video' | 'service' }> = {
  // Texte (callAIProvider / callAIProviderStrict / callAIClaudeFirstWithGeminiFallback) — utilisateurs
  translateComment: { roles: null, kind: 'text' },        // translateComment l. 2170 (05)
  translateProduct: { roles: null, kind: 'text' },        // translateProduct l. 2198 (05)
  translateCaption: { roles: null, kind: 'text' },        // translateCaption l. 2351 (05)
  translateMessage: { roles: null, kind: 'text' },        // translateDirectMessage l. 62 (14)
  sellerCoach: { roles: null, kind: 'text' },             // runSellerAICoach l. 241 (14)
  courseAssistant: { roles: null, kind: 'text' },         // askCourseSearchAssistant l. 635 (13)
  courseSummary: { roles: null, kind: 'text' },           // generateCourseAISummary l. 753 (13)
  gradeSuggestion: { roles: null, kind: 'text' },         // suggestGradeWithAI l. 774 (13)
  examFeedback: { roles: null, kind: 'text' },            // suggestFullExamAnswer l. 1316 (13)
  chatModeration: { roles: null, kind: 'text' },          // checkCourseChatMessageWithAI l. 1720 (13)
  lessonCheck: { roles: null, kind: 'text' },             // checkLessonContentWithAI l. 2041 (13)
  replySuggestion: { roles: null, kind: 'text' },         // checkAiSuggestedReply l. 168 (18)
  captionSuggestion: { roles: null, kind: 'text' },       // suggestCaptionWithAI l. 3855 (19)
  soundSuggestion: { roles: null, kind: 'text' },         // suggestSoundsForVideo l. 7166 (19)
  reportTriage: { roles: null, kind: 'text' },            // maybeAutoTriageReport l. 3185 (19) — exécuté par le client du signaleur
  trainerAutoValidate: { roles: null, kind: 'text' },     // maybeAutoValidateTrainer l. 3210 (19) — exécuté par le client du candidat
  // Texte — équipe Suktum
  techAgent: { roles: ['superadmin', 'techteam'], kind: 'text' },     // runAITechAgentAnalysis l. 993 (14)
  productReview: { roles: ADMIN_ALL, kind: 'text' },                  // analyzeProductWithAI l. 1564 (19)
  askAdmin: { roles: OWNERS, kind: 'text' },                          // askAdminAIQuestion l. 2227 (19)
  liveRiskScan: { roles: ADMIN_ALL, kind: 'text' },                   // scanRecentLivesForRisk l. 2248 (19)
  payoutsReport: { roles: ['superadmin', 'dg', 'payouts'], kind: 'text' }, // generatePayoutsAIReport l. 2307 (19)
  dailySummary: { roles: OWNERS, kind: 'text' },                      // regenerateDailySummary l. 2374 (19)
  appealAnalysis: { roles: ADMIN_ALL, kind: 'text' },                 // analyzeAppealWithAI l. 3479 (19)
  accountAnalysis: { roles: ADMIN_ALL, kind: 'text' },                // analyzeUserAccountWithAI l. 5864 (19)
  payoutMessage: { roles: ['superadmin', 'dg', 'payouts'], kind: 'text' }, // draftPayoutConfirmationMessage l. 6248 (19)
  trainerSummary: { roles: OWNERS, kind: 'text' },                    // generateTrainerAISummary l. 304 (10)
  trendsReport: { roles: OWNERS, kind: 'text' },                      // generateTrendsReport l. 2186 (19)
  weeklyReport: { roles: OWNERS, kind: 'text' },                      // checkWeeklyReport l. 2340 (19)
  platformReport: { roles: OWNERS, kind: 'text' },                    // generateAIPlatformReport l. 2391 (19)
  askPlatform: { roles: OWNERS, kind: 'text' },                       // askAIAboutPlatform l. 2413 (19)
  // Gemini avec média (vidéo en base64)
  subtitles: { roles: null, kind: 'media' },              // generateVideoSubtitles l. 51 (03)
  captions: { roles: null, kind: 'media' },               // generateAnimatedCaptions l. 421 / generateAutoCaptions l. 457 (05)
  chapters: { roles: null, kind: 'media' },               // generateCourseVideoChapters l. 2730 / generateLessonChapters l. 2769 (13)
  duetSuggestion: { roles: null, kind: 'media' },         // generateDuetToOrderSuggestion l. 389 (05)
  // Embeddings
  embedding: { roles: null, kind: 'embedding' },          // getContentEmbedding l. 329 (17)
  // Google Cloud Vision / Video Intelligence
  moderationImage: { roles: null, kind: 'vision' },       // moderateImageWithCloudVision l. 131 (17), checkImageWithVisionAI l. 727 (05)
  productLabels: { roles: null, kind: 'vision' },         // analyzeProductPhotoLabels l. 81 (17)
  moderationVideo: { roles: null, kind: 'video' },        // moderateVideoWithVideoIntelligence l. 161/172 (17)
  videoAnalysis: { roles: ADMIN_ALL, kind: 'video' },     // submitVideoForAIAnalysis l. 750 / checkVideoAnalysisResult l. 767 (05) — écran admin
  // Services tiers
  weather: { roles: null, kind: 'service' },              // checkSellerWeatherAlert l. 522 (14)
  delivery: { roles: null, kind: 'service' },             // requestYangoDelivery l. 241 (17)
  geocode: { roles: null, kind: 'service' },              // attemptAutoDetectCountry l. 477 (02)
};

/** Vérifie que `usage` est dans la liste blanche et que les claims portent le rôle requis. Renvoie le rôle trouvé (ou null). */
export function checkUsage(usage: unknown, claims: Record<string, unknown>, allowedKinds?: Array<(typeof USAGES)[string]['kind']>): Role | null {
  if (typeof usage !== 'string' || !Object.prototype.hasOwnProperty.call(USAGES, usage)) throw new HttpsError('invalid-argument', 'Usage IA inconnu');
  const def = USAGES[usage];
  if (allowedKinds && !allowedKinds.includes(def.kind)) throw new HttpsError('invalid-argument', 'Usage IA inadapté à cette fonction');
  const role = ADMIN_ALL.find((r) => claims[r] === true) ?? null;
  if (def.roles && (!role || !def.roles.includes(role))) throw new HttpsError('permission-denied', 'Accès réservé à l’équipe Suktum');
  return role;
}

/** Clé du compteur quotidien : `ai_quota/{uid}_{AAAA-MM-JJ}` (jour UTC). */
export function quotaKey(uid: string, now = Date.now()): string { return `${uid}_${new Date(now).toISOString().slice(0, 10)}`; }
/** Le prochain appel est-il autorisé ? `count` = appels déjà consommés aujourd'hui. */
export function quotaAllows(count: number, limit = DAILY_QUOTA): boolean { return Number.isFinite(count) && count < limit; }

/** Texte d'une réponse Anthropic (mêmes règles que le legacy l. 26608 : blocs `text` concaténés, trim). */
export function claudeText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('').trim();
}
/** Texte d'une réponse Gemini `generateContent` (legacy l. 26598) ; '' si absent. */
export function geminiText(data: unknown): string {
  const d = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } | null;
  const parts = d?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => p.text ?? '').join('').trim();
}
/** Vecteur d'une réponse Gemini `embedContent` (legacy l. 26574) ; null si absent. */
export function geminiEmbedding(data: unknown): number[] | null {
  const v = (data as { embedding?: { values?: unknown } } | null)?.embedding?.values;
  return Array.isArray(v) && v.every((x) => typeof x === 'number') ? (v as number[]) : null;
}
/** Annotation SafeSearch de la première réponse Vision (legacy l. 26379) ; null si absente. */
export function visionSafeSearch(data: unknown): Record<string, string> | null {
  const s = (data as { responses?: Array<{ safeSearchAnnotation?: Record<string, string> }> } | null)?.responses?.[0]?.safeSearchAnnotation;
  return s && typeof s === 'object' ? s : null;
}
/** Étiquettes LABEL_DETECTION de la première réponse Vision (legacy l. 26331). */
export function visionLabels(data: unknown): Array<{ description: string; score: number }> {
  const l = (data as { responses?: Array<{ labelAnnotations?: Array<{ description?: string; score?: number }> }> } | null)?.responses?.[0]?.labelAnnotations;
  return Array.isArray(l) ? l.filter((x) => typeof x?.description === 'string').map((x) => ({ description: x.description!, score: typeof x.score === 'number' ? x.score : 0 })) : [];
}
/** Trames de contenu explicite d'une opération Video Intelligence terminée (legacy l. 26416) ; null si non fournies. */
export function explicitFrames(data: unknown): Array<{ pornographyLikelihood: string; timeOffset?: string }> | null {
  const f = (data as { response?: { annotationResults?: Array<{ explicitAnnotation?: { frames?: unknown } }> } } | null)?.response?.annotationResults?.[0]?.explicitAnnotation?.frames;
  return Array.isArray(f) ? f.map((x) => ({ pornographyLikelihood: String(x?.pornographyLikelihood ?? 'UNKNOWN'), timeOffset: x?.timeOffset })) : null;
}
/** Nom d'opération Video Intelligence accepté : `projects/.../operations/...` ou `operations/...` (jamais d'URL arbitraire). */
export const OPERATION_NAME_RE = /^(projects\/[A-Za-z0-9_-]+\/locations\/[A-Za-z0-9_-]+\/)?operations\/[A-Za-z0-9_-]+$/;

/** Clé de cache géographique : coordonnées arrondies au dixième (zoom=3 = niveau pays). */
export function geoCacheKey(lat: number, lon: number): string { return `${lat.toFixed(1)}_${lon.toFixed(1)}`; }
/** Nom du pays d'une réponse Nominatim `reverse` (legacy l. 7719) ; null si absent. */
export function nominatimCountry(data: unknown): string | null {
  const c = (data as { address?: { country?: unknown } } | null)?.address?.country;
  return typeof c === 'string' && c ? c : null;
}
/** Météo d'une réponse OpenWeather (legacy l. 21440-21442) ; null si `cod !== 200`. */
export function weatherSummary(data: unknown): { condition: string; description: string } | null {
  const d = data as { cod?: unknown; weather?: Array<{ main?: string; description?: string }> } | null;
  if (!d || d.cod !== 200) return null;
  return { condition: d.weather?.[0]?.main ?? '', description: d.weather?.[0]?.description ?? '' };
}
/** Clé du cache météo : ville normalisée + jour (une requête par ville et par jour, pas par vendeur). */
export function weatherCacheKey(city: string, now = Date.now()): string {
  return `${city.trim().toLowerCase().replace(/[^a-z0-9À-ɏ]+/gi, '_')}_${new Date(now).toISOString().slice(0, 10)}`;
}
