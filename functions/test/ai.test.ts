// Tests unitaires purs du domaine « ia-secrets » (sans émulateur) : liste blanche, rôles, quota, extraction des réponses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  USAGES, checkUsage, quotaKey, quotaAllows, DAILY_QUOTA, ANTHROPIC_MODEL, claudeText, geminiText, geminiEmbedding,
  visionSafeSearch, visionLabels, explicitFrames, OPERATION_NAME_RE, geoCacheKey, nominatimCountry, weatherSummary, weatherCacheKey,
} from '../src/ai/rules.js';

const code = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as { code?: string }).code ?? 'thrown'; } };

test('modèle Anthropic : claude-sonnet-5 (remplace claude-sonnet-4-6)', () => {
  assert.equal(ANTHROPIC_MODEL, 'claude-sonnet-5');
});

test('liste blanche : usage inconnu refusé, usage utilisateur accepté sans rôle', () => {
  assert.equal(code(() => checkUsage('hack', {})), 'invalid-argument');
  assert.equal(code(() => checkUsage(undefined, {})), 'invalid-argument');
  assert.equal(code(() => checkUsage('__proto__', {})), 'invalid-argument');
  assert.equal(checkUsage('lessonCheck', {}), null);
  assert.equal(checkUsage('subtitles', {}), null);
  assert.equal(checkUsage('moderationImage', {}), null);
});

test('usages admin : refusés sans rôle, acceptés avec le bon claim, refusés avec un autre rôle', () => {
  assert.equal(code(() => checkUsage('trendsReport', {})), 'permission-denied');
  assert.equal(code(() => checkUsage('trendsReport', { moderator: true })), 'permission-denied');
  assert.equal(checkUsage('trendsReport', { superadmin: true }), 'superadmin');
  assert.equal(checkUsage('platformReport', { dg: true, country: 'Sénégal' }), 'dg');
  assert.equal(checkUsage('payoutsReport', { payouts: true }), 'payouts');
  assert.equal(code(() => checkUsage('payoutsReport', { techteam: true })), 'permission-denied');
  assert.equal(checkUsage('techAgent', { techteam: true }), 'techteam');
  assert.equal(checkUsage('productReview', { moderator: true }), 'moderator');
  assert.equal(checkUsage('videoAnalysis', { moderator: true }), 'moderator');
  assert.equal(code(() => checkUsage('videoAnalysis', {})), 'permission-denied');
});

test('un usage ne peut pas être détourné vers une autre fonction (texte ≠ média ≠ vision)', () => {
  assert.equal(code(() => checkUsage('subtitles', {}, ['text'])), 'invalid-argument');
  assert.equal(code(() => checkUsage('moderationImage', {}, ['text', 'media'])), 'invalid-argument');
  assert.equal(checkUsage('captions', {}, ['text', 'media']), null);
  for (const [name, def] of Object.entries(USAGES)) assert.ok(['text', 'media', 'embedding', 'vision', 'video', 'service'].includes(def.kind), name);
});

test('quota : clé par utilisateur et par jour UTC, limite quotidienne', () => {
  assert.equal(quotaKey('uid1', Date.UTC(2026, 8, 17, 23, 59)), 'uid1_2026-09-17');
  assert.equal(quotaKey('uid1', Date.UTC(2026, 8, 18, 0, 0)), 'uid1_2026-09-18');
  assert.ok(quotaAllows(0)); assert.ok(quotaAllows(DAILY_QUOTA - 1)); assert.ok(!quotaAllows(DAILY_QUOTA)); assert.ok(!quotaAllows(DAILY_QUOTA + 5));
  assert.ok(quotaAllows(4, 5)); assert.ok(!quotaAllows(5, 5)); assert.ok(!quotaAllows(NaN));
});

test('extraction Anthropic : blocs text concaténés et trim, vide sinon (legacy l. 26608)', () => {
  assert.equal(claudeText([{ type: 'text', text: ' Bonjour ' }, { type: 'tool_use' }, { type: 'text', text: 'Awa' }]), 'Bonjour Awa');
  assert.equal(claudeText(undefined), ''); assert.equal(claudeText([]), '');
});

test('extraction Gemini : texte des parts, embedding, absents → vide/null (legacy l. 26598, 26574)', () => {
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), 'ab');
  assert.equal(geminiText({ candidates: [] }), ''); assert.equal(geminiText(null), '');
  assert.deepEqual(geminiEmbedding({ embedding: { values: [0.1, 0.2] } }), [0.1, 0.2]);
  assert.equal(geminiEmbedding({ embedding: { values: ['x'] } }), null); assert.equal(geminiEmbedding({}), null);
});

test('extraction Vision / Video Intelligence : SafeSearch, étiquettes, trames (legacy l. 26379, 26331, 26416)', () => {
  assert.deepEqual(visionSafeSearch({ responses: [{ safeSearchAnnotation: { adult: 'LIKELY', racy: 'UNLIKELY' } }] }), { adult: 'LIKELY', racy: 'UNLIKELY' });
  assert.equal(visionSafeSearch({ responses: [{}] }), null);
  assert.deepEqual(visionLabels({ responses: [{ labelAnnotations: [{ description: 'Shoe', score: 0.9 }, { score: 1 }] }] }), [{ description: 'Shoe', score: 0.9 }]);
  assert.deepEqual(visionLabels({ responses: [{}] }), []);
  assert.deepEqual(explicitFrames({ response: { annotationResults: [{ explicitAnnotation: { frames: [{ pornographyLikelihood: 'VERY_LIKELY', timeOffset: '1s' }] } }] } }), [{ pornographyLikelihood: 'VERY_LIKELY', timeOffset: '1s' }]);
  assert.equal(explicitFrames({ response: {} }), null);
  assert.ok(OPERATION_NAME_RE.test('projects/1/locations/us-east1/operations/123'));
  assert.ok(OPERATION_NAME_RE.test('operations/abc-1'));
  assert.ok(!OPERATION_NAME_RE.test('../secrets')); assert.ok(!OPERATION_NAME_RE.test('https://evil/x'));
});

test('géocodage : cache au dixième de degré, pays Nominatim (legacy l. 7719)', () => {
  assert.equal(geoCacheKey(14.6937, -17.4441), '14.7_-17.4');
  assert.equal(geoCacheKey(14.71, -17.44), geoCacheKey(14.6937, -17.4441));
  assert.equal(nominatimCountry({ address: { country: 'Sénégal' } }), 'Sénégal');
  assert.equal(nominatimCountry({ address: {} }), null); assert.equal(nominatimCountry(null), null);
});

test('météo : cod ≠ 200 → null, sinon condition/description ; cache par ville et par jour (legacy l. 21439-21442)', () => {
  assert.equal(weatherSummary({ cod: '404' }), null);
  assert.deepEqual(weatherSummary({ cod: 200, weather: [{ main: 'Rain', description: 'pluie modérée' }] }), { condition: 'Rain', description: 'pluie modérée' });
  assert.equal(weatherCacheKey('  Dakar ', Date.UTC(2026, 8, 17)), 'dakar_2026-09-17');
  assert.equal(weatherCacheKey('Saint-Louis', Date.UTC(2026, 8, 17)), 'saint_louis_2026-09-17');
});
