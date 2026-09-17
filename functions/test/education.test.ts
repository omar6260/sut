// Règles de calcul de l'Espace Éducation (fonctions pures exportées par src/education/index.ts), sans émulateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EDU_SUB_PRICE, EDU_SUB_DURATION_DAYS, TRIAL_DURATION_MS, eduSubPrice, eduSubExpiry, isTrialStillActive, isEduSubActive,
  enrollmentDecision, leaveFlags, initialCourseStatus, canManageCourse, certificateEligibility, certificateCode, scoreQcm,
  generateSingleActivationCode, notificationCategory, gradeSchema,
} from '../src/education/index.js';

const DAY = 24 * 60 * 60 * 1000;
const iso = (t: number) => new Date(t).toISOString();

test('abonnement : prix par défaut 1 000 FCFA (l. 16665-16670), expiration à 30 jours (l. 17032)', () => {
  assert.equal(DEFAULT_EDU_SUB_PRICE, 1000); assert.equal(EDU_SUB_DURATION_DAYS, 30);
  assert.equal(eduSubPrice(undefined), 1000); assert.equal(eduSubPrice(null), 1000); assert.equal(eduSubPrice('1500'), 1000); assert.equal(eduSubPrice(2500), 2500);
  const now = Date.UTC(2026, 8, 17);
  assert.equal(eduSubExpiry(now), iso(now + 30 * DAY));
});

test('essai 7 jours (l. 16709-16713) : actif jusqu’à J+7 exclu, jamais sans eduTrialStartedAt', () => {
  const now = Date.now();
  assert.equal(TRIAL_DURATION_MS, 7 * DAY);
  assert.equal(isTrialStillActive(null, now), false);
  assert.equal(isTrialStillActive({}, now), false);
  assert.equal(isTrialStillActive({ eduTrialStartedAt: iso(now - 6 * DAY) }, now), true);
  assert.equal(isTrialStillActive({ eduTrialStartedAt: iso(now - 7 * DAY) }, now), false);
});

test('accès Éducation (l. 16776-16783) : financé ‖ essai ‖ abonnement non expiré', () => {
  const now = Date.now();
  assert.equal(isEduSubActive({ stateFunded: true }, null, now), true);
  assert.equal(isEduSubActive({ eduTrialStartedAt: iso(now - DAY) }, null, now), true);
  assert.equal(isEduSubActive({ eduTrialStartedAt: iso(now - 8 * DAY) }, null, now), false);
  assert.equal(isEduSubActive({}, { expiresAt: iso(now + DAY) }, now), true);
  assert.equal(isEduSubActive({}, { expiresAt: iso(now - 1) }, now), false);
  assert.equal(isEduSubActive({}, { expiresAt: iso(now + DAY), cancelled: true }, now), true, 'annulé = accès conservé jusqu’à expiration (l. 16737)');
});

test('inscription (l. 17603-17662) : ordre financé > essai > réinscription payée > en attente', () => {
  const now = Date.now();
  assert.equal(enrollmentDecision({ stateFunded: true, eduTrialStartedAt: iso(now) }, null, [], now).outcome, 'stateFunded');
  assert.equal(enrollmentDecision({ eduTrialStartedAt: iso(now - DAY) }, null, [], now).outcome, 'trial');
  assert.equal(enrollmentDecision({ eduTrialStartedAt: iso(now - DAY) }, { expiresAt: iso(now - DAY) }, [], now).outcome, 'pending', 'un abonnement (même expiré) désactive la gratuité de l’essai (l. 17629)');
  const leaves = [{ wasPaid: true, pricePaid: 5000, leftAt: iso(now - 3 * DAY) }, { wasPaid: true, pricePaid: 7000, leftAt: iso(now - DAY) }, { wasPaid: false, pricePaid: null, leftAt: iso(now) }];
  const d = enrollmentDecision({}, null, leaves, now);
  assert.equal(d.outcome, 'reEnrollment'); assert.equal(d.priorPaidLeave.pricePaid, 7000, 'le départ payé le plus récent fixe le prix');
  assert.equal(enrollmentDecision({}, null, [{ wasPaid: false, leftAt: iso(now) }], now).outcome, 'pending');
  assert.equal(enrollmentDecision(null, null, [], now).outcome, 'pending');
});

test('départ d’un cours (l. 17394-17401) : wasPaid seulement hors financement et hors essai ; pricePaid conservé', () => {
  assert.deepEqual(leaveFlags({ price: 5000 }), { wasPaid: true, pricePaid: 5000 });
  assert.deepEqual(leaveFlags({ price: 5000, trialEnrollment: true }), { wasPaid: false, pricePaid: null });
  assert.deepEqual(leaveFlags({ price: 5000, stateFunded: true }), { wasPaid: false, pricePaid: null });
});

test('statut initial d’un cours (l. 17993-17998) : publication immédiate réservée à un compte d’équipe isAdminTrainer', () => {
  assert.equal(initialCourseStatus({ isAdminTrainer: true }, true), 'active');
  assert.equal(initialCourseStatus({ isAdminTrainer: true }, false), 'pending_review', 'flag client sans rôle serveur = en attente');
  assert.equal(initialCourseStatus({ isTrainer: true }, true), 'pending_review');
  assert.equal(initialCourseStatus(null, true), 'pending_review');
});

test('gestion d’un cours (l. 18206-18209) : formateur, co-formateur, remplaçant jusqu’à la date de fin', () => {
  const now = Date.now();
  const c = { trainerUsername: 'Fatou', coTrainers: ['Moussa'], substituteTrainer: 'Awa', substituteEndDate: iso(now + DAY) };
  assert.equal(canManageCourse(c, 'Fatou', now), true); assert.equal(canManageCourse(c, 'Moussa', now), true); assert.equal(canManageCourse(c, 'Awa', now), true);
  assert.equal(canManageCourse(c, 'Ibou', now), false);
  assert.equal(canManageCourse({ ...c, substituteEndDate: iso(now - 1) }, 'Awa', now), false, 'remplacement expiré');
  assert.equal(canManageCourse(null, 'Fatou', now), false);
});

test('attestation (l. 20670-20697) : moyenne à 1 décimale, présence arrondie, motifs manquants dans le texte du legacy', () => {
  const course = { certMinAverage: 12, certMinAttendance: 50 };
  const sessions = [{ attendees: ['Ibou'] }, { attendees: [] }, { attendees: ['Ibou', 'Awa'] }];
  let r = certificateEligibility(course, [14, 15, 11], sessions, 'Ibou');
  assert.equal(r.average, '13.3'); assert.equal(r.attendanceRate, 67); assert.deepEqual(r.missingReasons, []);
  r = certificateEligibility(course, [10, 11], [{ attendees: [] }], 'Ibou');
  assert.equal(r.average, '10.5'); assert.equal(r.attendanceRate, 0);
  assert.deepEqual(r.missingReasons, ['une moyenne d’au moins 12/20 (moyenne actuelle : 10.5)', 'un taux de présence d’au moins 50% (taux actuel : 0%)']);
  r = certificateEligibility(course, [], [], 'Ibou');
  assert.equal(r.average, null); assert.equal(r.attendanceRate, null);
  assert.deepEqual(r.missingReasons, ['une moyenne d’au moins 12/20 (moyenne actuelle : aucune note)', 'un taux de présence d’au moins 50% (taux actuel : aucune session tenue)']);
  assert.deepEqual(certificateEligibility({}, [], [], 'Ibou').missingReasons, [], 'sans seuil, attestation disponible même sans note');
  assert.deepEqual(certificateEligibility({ certMinAverage: null, certMinAttendance: null }, [], [], 'Ibou').missingReasons, []);
});

test('code d’attestation (l. 20579-20580) : SG- + 8 hexadécimaux majuscules, déterministe pour une même émission', () => {
  const code = certificateCode('course_1', 'Ibou', 1700000000000);
  assert.match(code, /^SG-[0-9A-F]{8}$/);
  assert.equal(code, certificateCode('course_1', 'Ibou', 1700000000000));
  assert.notEqual(code, certificateCode('course_1', 'Ibou', 1700000000001));
});

test('QCM d’examen (l. 18276-18283) : bonnes réponses / nombre de QCM, questions ouvertes ignorées', () => {
  const r = scoreQcm([1, null, 2, 0], [{ type: 'qcm', selectedIndex: 1 }, { type: 'open' }, { type: 'qcm', selectedIndex: 3 }, { type: 'qcm', selectedIndex: 0 }]);
  assert.deepEqual(r, { qcmAutoScore: 2, qcmCount: 3 });
  assert.deepEqual(scoreQcm([], []), { qcmAutoScore: 0, qcmCount: 0 });
});

test('codes d’activation (l. 16819-16824) : SUKTUM- + 8 caractères sans I, O, 0, 1', () => {
  for (let i = 0; i < 50; i++) assert.match(generateSingleActivationCode(), /^SUKTUM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(generateSingleActivationCode(() => 0), 'SUKTUM-AAAAAAAA');
});

test('notes : 0 à 20 inclus, message du legacy hors bornes (l. 17891)', () => {
  assert.equal(gradeSchema.safeParse(0).success, true); assert.equal(gradeSchema.safeParse(20).success, true); assert.equal(gradeSchema.safeParse(13.5).success, true);
  const bad = gradeSchema.safeParse(21);
  assert.equal(bad.success, false); assert.equal(bad.success ? '' : bad.error.issues[0].message, 'Entrez une note valide entre 0 et 20');
  assert.equal(gradeSchema.safeParse(-1).success, false); assert.equal(gradeSchema.safeParse('12').success, false);
});

test('préférences de notification (l. 11412-11430) : catégorie education / follows / other', () => {
  assert.equal(notificationCategory('student_left_course'), 'education'); assert.equal(notificationCategory('follow'), 'follows'); assert.equal(notificationCategory('badge_awarded'), 'other');
});
