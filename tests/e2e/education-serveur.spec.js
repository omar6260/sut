// Garantit (phase 06, éducation) : l'essai, l'abonnement (prix, 30 jours, auto-approbation), l'inscription (financé / essai /
// en attente), le statut initial d'un cours, le rôle formateur (champ + claim), les notes, la correction des quiz/examens
// (bonnes réponses jamais dans les documents lus par les élèves), les codes d'activation et le lien parent sont décidés par
// le serveur ; les écrans, toasts et enchaînements restent ceux du prototype ; une écriture directe de triche est refusée
// une fois les règles strictes actives.
import { test, expect, BACKEND } from '../support/fixtures.js';

test.skip(BACKEND !== 'firebase', 'logique serveur = backend firebase');

const api = (page, name, data) => page.evaluate(async ({ name, data }) => {
  try { return { ok: true, result: await window.SuktumPlatform.api.call(name, Object.assign({ currentUser: typeof currentUser !== 'undefined' ? currentUser : null }, data)) }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}, { name, data });

async function openEducationHub(page) {
  await page.locator('.tab[data-screen="profile"]').click();
  await expect(page.locator('#screen-profile')).toHaveClass(/active/);
  await page.locator('#screen-profile [onclick="go(\'profile-menu\')"]').click();
  await expect(page.locator('#screen-profile-menu')).toHaveClass(/active/);
  await page.locator('#screen-profile-menu [onclick="enterEducationSpaceNormally()"]').click();
  await expect(page.locator('#screen-education-hub')).toHaveClass(/active/);
}
async function trainerAndStudent(suktum) {
  const a = await suktum.openDevice('A');
  await suktum.signUp(a, 'Prof_Fatou');
  await suktum.dismissTour(a);
  await suktum.storage.writeJSON('user:Prof_Fatou', { ...(await suktum.storage.readJSON('user:Prof_Fatou')), isTrainer: true });
  const b = await suktum.openDevice('B');
  await suktum.signUp(b, 'Eleve_Ibou');
  await suktum.dismissTour(b);
  expect((await api(b, 'startTrial', {})).result.started).toBe(true); // l'essai de B démarre (ouverture de l'Espace Éducation)
  return { a, b };
}
async function createActiveCourse(suktum, a, { title = 'Grammaire française niveau 1', price = 5000 } = {}) {
  const r = await api(a, 'createCourse', { title, description: 'Les bases.', price });
  expect(r.ok).toBe(true);
  expect(r.result.status).toBe('pending_review');
  const course = await suktum.storage.readJSON(`course:${r.result.courseId}`);
  await suktum.storage.writeJSON(`course:${r.result.courseId}`, { ...course, status: 'active' }); // validation admin (couverte plus bas)
  return { ...course, status: 'active' };
}
async function notifs(suktum) {
  const keys = (await suktum.storage.list(null, 'notif:', true)).keys;
  return Promise.all(keys.map((k) => suktum.storage.readJSON(k)));
}

test.describe('Éducation — logique serveur', () => {
  test('essai démarré par le serveur, cours en attente puis inscription gratuite pendant l’essai ; écrans et toasts du prototype', async ({ suktum }) => {
    const { a, b } = await trainerAndStudent(suktum);

    // A entre dans l'Espace Éducation : l'essai est posé une seule fois par le serveur (startTrial).
    await openEducationHub(a);
    await expect(a.locator('#edu-trial-banner')).toContainText('Essai gratuit — 7 jour(s) restant(s)');
    const startedAt = (await suktum.storage.readJSON('user:Prof_Fatou')).eduTrialStartedAt;
    expect(startedAt).toBeTruthy();
    expect((await api(a, 'startTrial', {})).result).toMatchObject({ started: false });
    expect((await suktum.storage.readJSON('user:Prof_Fatou')).eduTrialStartedAt).toBe(startedAt);

    // A crée un cours depuis son espace : statut fixé par le serveur, document possédé par le serveur.
    await a.locator('#education-trainer-status-card [onclick="go(\'trainer-dashboard\')"]').click();
    await expect(a.locator('#screen-trainer-dashboard')).toHaveClass(/active/);
    await a.locator('#new-course-title').fill('Grammaire française niveau 1');
    await a.locator('#new-course-desc').fill('Les bases : nom, verbe, accord.');
    await a.locator('#new-course-price').fill('5000');
    await a.locator('#screen-trainer-dashboard button[onclick="createCourse()"]').click();
    await expect.poll(() => suktum.lastToast(a)).toBe('Cours envoyé pour validation avant publication ✓');
    const courseKey = (await suktum.storage.list(null, 'course:', true)).keys[0];
    const course = await suktum.storage.readJSON(courseKey);
    expect(course).toMatchObject({ trainerUsername: 'Prof_Fatou', title: 'Grammaire française niveau 1', price: 5000, status: 'pending_review', country: 'Sénégal' });
    await expect(a.locator('#trainer-courses-list')).toContainText('En attente de validation');

    // Validation par un compte d'équipe (claim serveur) : cours actif, notification et journal écrits côté serveur.
    const admin = await suktum.openDevice('ADMIN');
    await suktum.signUp(admin, 'Gorgui_Faye');
    await suktum.dismissTour(admin);
    expect(await api(admin, 'reviewCourse', { courseId: course.id, action: 'approve' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    await suktum.grantRole(admin, { superadmin: true, adminName: 'Gorgui' });
    expect((await api(admin, 'reviewCourse', { courseId: course.id, action: 'approve' })).result).toMatchObject({ ok: true, status: 'active' });
    expect((await suktum.storage.readJSON(courseKey)).status).toBe('active');
    expect((await notifs(suktum)).some((n) => n.type === 'course_approved' && n.toUser === 'Prof_Fatou' && n.fromUser === 'Suktum')).toBe(true);
    const audits = await Promise.all((await suktum.storage.list(null, 'auditlog:', true)).keys.map((k) => suktum.storage.readJSON(k)));
    expect(audits.some((e) => e.action === 'Cours validé' && e.actorName === 'Gorgui' && e.server === true)).toBe(true);

    // B (élève) trouve le cours et s'inscrit : décision « essai » prise par le serveur, abonnement au formateur, toast du prototype.
    await openEducationHub(b);
    await expect(b.locator('#edu-trial-banner')).toContainText('Essai gratuit');
    await b.locator('#screen-education-hub [onclick="go(\'education-courses\')"]').click();
    await b.locator(`#screen-education-courses [onclick="openCourseDetail('${course.id}')"]`).click();
    await expect(b.locator('#screen-course-detail')).toHaveClass(/active/);
    await b.locator(`#course-detail-content button[onclick="enrollInCourse('${course.id}')"]`).click();
    await expect.poll(() => suktum.lastToast(b)).toBe('Accès gratuit pendant votre essai — profitez-en pour découvrir ce cours ✓');
    const enrollment = await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Ibou`);
    expect(enrollment).toMatchObject({ courseId: course.id, studentUsername: 'Eleve_Ibou', trainerUsername: 'Prof_Fatou', price: 5000, status: 'approved', trialEnrollment: true });
    expect(await suktum.storage.readJSON('user:Eleve_Ibou')).toMatchObject({ isStudent: true, following: ['Prof_Fatou'] });
    expect((await suktum.storage.readJSON('user:Prof_Fatou')).followers).toEqual(['Eleve_Ibou']);
    expect(await api(b, 'enroll', { courseId: course.id })).toMatchObject({ ok: false, message: 'Vous êtes déjà inscrit(e) à ce cours' });

    // Départ : wasPaid/pricePaid fixés par le serveur (essai → non payé), notification au formateur.
    const onDialog = (d) => d.accept(d.type() === 'prompt' ? '' : undefined); // confirm « Quitter … ? » puis prompt « Un mot sur votre départ »
    b.on('dialog', onDialog);
    await b.evaluate((id) => leaveCourseAsStudent(id), course.id);
    b.off('dialog', onDialog);
    await expect.poll(() => suktum.lastToast(b)).toBe('Vous avez quitté ce cours');
    await expect(b.locator('#screen-education-hub')).toHaveClass(/active/);
    expect(await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Ibou`)).toBeNull();
    const leaves = await Promise.all((await suktum.storage.list(null, 'courseleave:', true)).keys.map((k) => suktum.storage.readJSON(k)));
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ courseId: course.id, studentUsername: 'Eleve_Ibou', wasPaid: false, pricePaid: null, reason: null });
    expect((await notifs(suktum)).some((n) => n.type === 'student_left_course' && n.toUser === 'Prof_Fatou' && n.fromUser === 'Eleve_Ibou')).toBe(true);
    expect(suktum.errors).toEqual([]);
  });

  test('inscription payante : en attente puis validée par l’admin ; financé par l’État ou auto-approbation décidés par le serveur', async ({ suktum }) => {
    const { a, b } = await trainerAndStudent(suktum);
    const course = await createActiveCourse(suktum, a);
    // Essai désactivé côté données : l'élève n'a pas d'essai (eduTrialStartedAt vieux de 8 jours) → demande en attente.
    const ibou = await suktum.storage.readJSON('user:Eleve_Ibou');
    await suktum.storage.writeJSON('user:Eleve_Ibou', { ...ibou, eduTrialStartedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString() });
    let r = await api(b, 'enroll', { courseId: course.id });
    expect(r.result).toMatchObject({ outcome: 'pending', title: 'Grammaire française niveau 1', price: 5000 });
    expect(await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Ibou`)).toMatchObject({ status: 'pending', price: 5000 });
    // Validation réservée à l'équipe (claim serveur) : abonnement au formateur et notification écrits par le serveur.
    const admin = await suktum.openDevice('ADMIN');
    await suktum.signUp(admin, 'Gorgui_Faye');
    await suktum.dismissTour(admin);
    expect(await api(admin, 'approveEnrollment', { enrollmentKey: `enrollment:${course.id}__Eleve_Ibou` })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    await suktum.grantRole(admin, { superadmin: true, adminName: 'Gorgui' });
    expect((await api(admin, 'approveEnrollment', { enrollmentKey: `enrollment:${course.id}__Eleve_Ibou` })).result).toMatchObject({ ok: true, found: true });
    expect(await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Ibou`)).toMatchObject({ status: 'approved' });
    expect((await suktum.storage.readJSON('user:Prof_Fatou')).followers).toEqual(['Eleve_Ibou']);
    expect((await notifs(suktum)).some((n) => n.type === 'course_approved' && n.toUser === 'Eleve_Ibou' && n.text === 'votre inscription')).toBe(true);

    // Accès financé accordé par l'admin → prochaine inscription validée d'office (autre cours).
    const course2 = await createActiveCourse(suktum, a, { title: 'Maths', price: 3000 });
    expect((await api(admin, 'grantStateFunded', { username: 'Eleve_Ibou' })).result).toMatchObject({ found: true });
    expect((await suktum.storage.readJSON('user:Eleve_Ibou')).stateFunded).toBe(true);
    r = await api(b, 'enroll', { courseId: course2.id });
    expect(r.result.outcome).toBe('stateFunded');
    expect(await suktum.storage.readJSON(`enrollment:${course2.id}__Eleve_Ibou`)).toMatchObject({ status: 'approved', stateFunded: true, price: 3000 });

    // Auto-approbation évaluée par le serveur (settings:autoApproveEnrollment) pour un autre élève.
    await suktum.storage.writeJSON('settings:autoApproveEnrollment', true);
    const c = await suktum.openDevice('C');
    await suktum.signUp(c, 'Eleve_Awa');
    await suktum.dismissTour(c);
    const awa = await suktum.storage.readJSON('user:Eleve_Awa');
    await suktum.storage.writeJSON('user:Eleve_Awa', { ...awa, eduTrialStartedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString() });
    r = await api(c, 'enroll', { courseId: course.id });
    expect(r.result.outcome).toBe('autoApproved');
    expect(await suktum.storage.readJSON(`enrollment:${course.id}__Eleve_Awa`)).toMatchObject({ status: 'approved', price: 5000 });
    // Le nom transmis doit appartenir au compte appelant.
    expect(await api(c, 'enroll', { courseId: course2.id, currentUser: 'Eleve_Ibou' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
  });

  test('abonnement Éducation : prix du réglage, expiration à 30 jours, achat et paiement écrits par le serveur ; codes d’activation à usage unique', async ({ suktum }) => {
    const { b } = await trainerAndStudent(suktum);
    await suktum.storage.writeJSON('settings:education_sub_price', 1500);
    let r = await api(b, 'subscribeEducation', {});
    expect(r.result).toMatchObject({ price: 1500, autoApproved: false });
    expect(await suktum.storage.readJSON(`edusubrequest:${r.result.requestId}`)).toMatchObject({ username: 'Eleve_Ibou', price: 1500, status: 'pending', country: 'Sénégal' });
    expect(await suktum.storage.readJSON('edusubscription:Eleve_Ibou')).toBeNull();

    await suktum.storage.writeJSON('settings:autoApproveEduSub', true);
    const before = Date.now();
    r = await api(b, 'subscribeEducation', {});
    expect(r.result.autoApproved).toBe(true);
    const sub = await suktum.storage.readJSON('edusubscription:Eleve_Ibou');
    expect(sub).toMatchObject({ username: 'Eleve_Ibou', price: 1500, cancelled: false });
    const days = (new Date(sub.expiresAt).getTime() - before) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(29.9); expect(days).toBeLessThan(30.1);
    const purchases = (await suktum.storage.list(null, 'edupurchase:', true)).keys;
    expect(purchases).toHaveLength(1);
    expect(await suktum.storage.readJSON(purchases[0])).toMatchObject({ username: 'Eleve_Ibou', price: 1500 });
    const payments = await Promise.all((await suktum.storage.list(null, 'edusubpayment:', true)).keys.map((k) => suktum.storage.readJSON(k)));
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ username: 'Eleve_Ibou', amount: 1500 });
    expect((await notifs(suktum)).some((n) => n.type === 'edusub_approved' && n.toUser === 'Eleve_Ibou')).toBe(true);
    // Annulation / réactivation du renouvellement : l'accès reste jusqu'à l'expiration.
    expect((await api(b, 'cancelEduSub', {})).result).toMatchObject({ found: true, expiresAt: sub.expiresAt });
    expect((await suktum.storage.readJSON('edusubscription:Eleve_Ibou')).cancelled).toBe(true);
    expect((await api(b, 'reactivateEduSub', {})).result.found).toBe(true);
    expect((await suktum.storage.readJSON('edusubscription:Eleve_Ibou')).cancelled).toBe(false);

    // Codes d'activation : générés par l'admin, activés une seule fois, accès financé accordé par le serveur.
    const admin = await suktum.openDevice('ADMIN');
    await suktum.signUp(admin, 'Gorgui_Faye');
    await suktum.dismissTour(admin);
    expect(await api(admin, 'generateActivationCodes', { count: 3, label: 'Lycée Blaise Diagne' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    await suktum.grantRole(admin, { superadmin: true, adminName: 'Gorgui' });
    r = await api(admin, 'generateActivationCodes', { count: 3, label: 'Lycée Blaise Diagne' });
    expect(r.result.count).toBe(3);
    const batch = await suktum.storage.readJSON(`activationbatch:${r.result.batchId}`);
    expect(batch.codes).toHaveLength(3);
    for (const code of batch.codes) expect(code).toMatch(/^SUKTUM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    const c = await suktum.openDevice('C');
    await suktum.signUp(c, 'Eleve_Awa');
    await suktum.dismissTour(c);
    expect(await api(c, 'redeemActivationCode', { code: 'SUKTUM-ZZZZZZZZ' })).toMatchObject({ ok: false, message: 'Code invalide' });
    expect((await api(c, 'redeemActivationCode', { code: batch.codes[0].toLowerCase() })).result).toMatchObject({ label: 'Lycée Blaise Diagne' });
    expect((await suktum.storage.readJSON('user:Eleve_Awa')).stateFunded).toBe(true);
    expect(await suktum.storage.readJSON(`activationcode:${batch.codes[0]}`)).toMatchObject({ redeemed: true, redeemedBy: 'Eleve_Awa' });
    const again = await api(b, 'redeemActivationCode', { code: batch.codes[0] });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/^Ce code a déjà été utilisé le /);
    expect((await suktum.storage.readJSON('user:Eleve_Ibou')).stateFunded).toBeFalsy();
  });

  test('formateur : approbation réservée à l’équipe, champ et claim `trainer` posés par le serveur ; sans rôle, pas de cours', async ({ suktum }) => {
    const a = await suktum.openDevice('A');
    await suktum.signUp(a, 'Cand_Moussa');
    await suktum.dismissTour(a);
    expect(await api(a, 'createCourse', { title: 'Physique', description: '', price: 2000 })).toMatchObject({ ok: false, message: 'Réservé aux formateurs validés' });
    await suktum.storage.writeJSON('trainerrequest:trainerreq_1', { id: 'trainerreq_1', username: 'Cand_Moussa', country: 'Sénégal', subject: 'Physique', bio: 'Prof depuis 10 ans', paymentNumber: '77 000 00 00', status: 'pending', createdAt: new Date().toISOString() });
    // Auto-validation IA : réglage inactif → rien ; actif sans clé (émulateur) → la candidature reste en attente.
    expect((await api(a, 'applyTrainer', { requestId: 'trainerreq_1' })).result).toMatchObject({ autoValidated: false });
    await suktum.storage.writeJSON('settings:autoValidateTrainers', true);
    expect((await api(a, 'applyTrainer', { requestId: 'trainerreq_1' })).result).toMatchObject({ autoValidated: false });
    expect((await suktum.storage.readJSON('trainerrequest:trainerreq_1')).status).toBe('pending');
    expect(await api(a, 'approveTrainer', { id: 'trainerreq_1' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });

    const admin = await suktum.openDevice('ADMIN');
    await suktum.signUp(admin, 'Gorgui_Faye');
    await suktum.dismissTour(admin);
    await suktum.grantRole(admin, { superadmin: true, adminName: 'Gorgui' });
    expect((await api(admin, 'approveTrainer', { id: 'trainerreq_1' })).result).toMatchObject({ found: true, username: 'Cand_Moussa' });
    expect(await suktum.storage.readJSON('user:Cand_Moussa')).toMatchObject({ isTrainer: true, trainerPaymentNumber: '77 000 00 00', trainerSubject: 'Physique' });
    expect((await suktum.storage.readJSON('trainerrequest:trainerreq_1')).status).toBe('approved');
    const claims = await a.evaluate(async () => (await window.SuktumPlatform.auth.currentUser.getIdTokenResult(true)).claims);
    expect(claims.trainer).toBe(true);
    expect((await notifs(suktum)).some((n) => n.type === 'trainer_approved' && n.toUser === 'Cand_Moussa' && n.text === 'Physique')).toBe(true);
    // Le formateur crée un cours : en attente de validation (jamais actif d'office).
    const r = await api(a, 'createCourse', { title: 'Physique', description: '', price: 2000 });
    expect(r.result.status).toBe('pending_review');
    // Exclusion : champ et claim retirés.
    expect((await api(admin, 'excludeTrainer', { username: 'Cand_Moussa' })).result.found).toBe(true);
    expect((await suktum.storage.readJSON('user:Cand_Moussa')).isTrainer).toBe(false);
    expect((await a.evaluate(async () => (await window.SuktumPlatform.auth.currentUser.getIdTokenResult(true)).claims)).trainer).toBeUndefined();
  });

  test('notes, quiz et examens : réservés au formateur du cours, bonnes réponses jamais dans les documents des élèves, correction serveur', async ({ suktum }) => {
    const { a, b } = await trainerAndStudent(suktum);
    const course = await createActiveCourse(suktum, a);
    expect((await api(b, 'enroll', { courseId: course.id })).result.outcome).toBe('trial');

    // Quiz : le document `quiz:` ne porte pas la bonne réponse ; l'élève est corrigé par le serveur.
    let r = await api(a, 'createQuiz', { courseId: course.id, title: 'Le nom', question: 'Lequel est un nom ?', options: ['manger', 'table', 'vite'], correctIndex: 1 });
    const quizId = r.result.quizId;
    const quizKeys = (await suktum.storage.list(null, `quiz:${course.id}__`, true)).keys;
    expect(quizKeys).toHaveLength(1);
    const quiz = await suktum.storage.readJSON(quizKeys[0]);
    expect(quiz.correctIndex).toBeUndefined();
    expect(quiz.options).toEqual(['manger', 'table', 'vite']);
    expect(await api(b, 'createQuiz', { courseId: course.id, title: 'X', question: 'Y', options: ['a', 'b'], correctIndex: 0 })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect((await api(a, 'courseAnswers', { courseId: course.id })).result.quiz).toEqual({ [quizId]: 1 });
    expect(await api(b, 'courseAnswers', { courseId: course.id })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    r = await api(b, 'answerQuiz', { quizId, courseId: course.id, selectedIndex: 2 });
    expect(r.result).toMatchObject({ correct: false, correctIndex: 1 });
    expect(await suktum.storage.readJSON(`quizsubmission:${quizId}__Eleve_Ibou`)).toMatchObject({ selectedIndex: 2, correct: false, correctIndex: 1 });

    // Examen complet : correctIndex retiré du document public ; QCM pré-corrigés par le serveur ; note finale par le formateur seul.
    r = await api(a, 'publishFullExam', { courseId: course.id, title: 'Examen 1', description: '', questions: [
      { type: 'qcm', question: 'Q1', options: ['a', 'b'], correctIndex: 1 }, { type: 'open', question: 'Q2' }, { type: 'qcm', question: 'Q3', options: ['x', 'y', 'z'], correctIndex: 0 }] });
    const examId = r.result.examId;
    const exam = await suktum.storage.readJSON(`fullexam:${course.id}__${examId}`);
    expect(exam.questions.map((q) => q.correctIndex)).toEqual([undefined, undefined, undefined]);
    expect(exam.questions[0].options).toEqual(['a', 'b']);
    expect(await api(b, 'takeFullExam', { examId, courseId: course.id, answers: [{ type: 'qcm', selectedIndex: null }, { type: 'open', text: 'r' }, { type: 'qcm', selectedIndex: 0 }] })).toMatchObject({ ok: false, message: 'Répondez à toutes les questions avant d’envoyer' });
    expect((await api(b, 'takeFullExam', { examId, courseId: course.id, answers: [{ type: 'qcm', selectedIndex: 1 }, { type: 'open', text: 'Ma réponse' }, { type: 'qcm', selectedIndex: 2 }] })).ok).toBe(true);
    expect(await suktum.storage.readJSON(`fullexamsubmission:${examId}__Eleve_Ibou`)).toMatchObject({ status: 'submitted', totalScore: null, qcmAutoScore: 1, qcmCount: 2 });
    expect(await api(b, 'gradeExam', { courseId: course.id, examId, student: 'Eleve_Ibou', score: 20 })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect(await api(a, 'gradeExam', { courseId: course.id, examId, student: 'Eleve_Ibou', score: 21 })).toMatchObject({ ok: false, message: 'Entrez une note valide entre 0 et 20' });
    expect((await api(a, 'gradeExam', { courseId: course.id, examId, student: 'Eleve_Ibou', score: 14 })).result.found).toBe(true);
    expect(await suktum.storage.readJSON(`fullexamsubmission:${examId}__Eleve_Ibou`)).toMatchObject({ status: 'graded', totalScore: 14 });

    // Exercice : note immuable sans motif ; historique de correction conservé.
    await suktum.storage.writeJSON(`submission:exercise_1__Eleve_Ibou`, { exerciseId: 'exercise_1', courseId: course.id, studentUsername: 'Eleve_Ibou', trainerUsername: 'Prof_Fatou', answer: 'x', status: 'submitted', createdAt: new Date().toISOString() });
    expect(await api(b, 'gradeSubmission', { storageKey: 'submission:exercise_1__Eleve_Ibou', score: 20, feedback: '' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect((await api(a, 'gradeSubmission', { storageKey: 'submission:exercise_1__Eleve_Ibou', score: 12, feedback: 'Bien' })).ok).toBe(true);
    expect(await api(a, 'gradeSubmission', { storageKey: 'submission:exercise_1__Eleve_Ibou', score: 15, feedback: '' })).toMatchObject({ ok: false, message: 'Correction annulée — la note validée reste inchangée' });
    expect((await api(a, 'gradeSubmission', { storageKey: 'submission:exercise_1__Eleve_Ibou', score: 15, feedback: '', justification: 'Erreur de saisie' })).ok).toBe(true);
    const graded = await suktum.storage.readJSON('submission:exercise_1__Eleve_Ibou');
    expect(graded).toMatchObject({ status: 'graded', score: 15 });
    expect(graded.gradeCorrectionHistory).toEqual([expect.objectContaining({ previousScore: 12, newScore: 15, justification: 'Erreur de saisie', correctedBy: 'Prof_Fatou' })]);
    expect((await notifs(suktum)).filter((n) => n.type === 'exercise_graded' && n.toUser === 'Eleve_Ibou')).toHaveLength(2);

    // Résultat d'examen et badge : élève inscrit seulement.
    expect(await api(a, 'recordExamResult', { courseId: course.id, studentUsername: 'Inconnu', examTitle: 'Bac blanc', score: 10, comment: '' })).toMatchObject({ ok: false, message: 'Cet élève n’est pas inscrit à ce cours' });
    expect((await api(a, 'recordExamResult', { courseId: course.id, studentUsername: 'Eleve_Ibou', examTitle: 'Bac blanc', score: 13, comment: '' })).ok).toBe(true);
    expect((await api(a, 'awardBadge', { courseId: course.id, studentUsername: 'Eleve_Ibou', badgeName: 'Assidu', message: '' })).ok).toBe(true);
    const badges = (await suktum.storage.list(null, `badge:${course.id}__Eleve_Ibou__`, true)).keys;
    expect(badges).toHaveLength(1);
    expect(await suktum.storage.readJSON(badges[0])).toMatchObject({ trainerUsername: 'Prof_Fatou', badgeName: 'Assidu' });
    expect(await api(b, 'awardBadge', { courseId: course.id, studentUsername: 'Eleve_Ibou', badgeName: 'Assidu', message: '' })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
  });

  test('attestation : seuils du cours vérifiés par le serveur, code SG- et statut ancien élève posés par le serveur', async ({ suktum }) => {
    const { a, b } = await trainerAndStudent(suktum);
    const course = await createActiveCourse(suktum, a);
    expect((await api(b, 'enroll', { courseId: course.id })).result.outcome).toBe('trial');
    expect(await api(b, 'setCertificateConditions', { courseId: course.id, certMinAverage: 12, certMinAttendance: null })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect((await api(a, 'setCertificateConditions', { courseId: course.id, certMinAverage: 25, certMinAttendance: null })).result).toMatchObject({ certMinAverage: 20, certMinAttendance: null });
    expect((await api(a, 'setCertificateConditions', { courseId: course.id, certMinAverage: 12, certMinAttendance: null })).result.certMinAverage).toBe(12);
    let r = await api(b, 'issueCertificate', { courseId: course.id });
    expect(r.result).toMatchObject({ available: false, missingReasons: ['une moyenne d’au moins 12/20 (moyenne actuelle : aucune note)'] });
    await api(a, 'recordExamResult', { courseId: course.id, studentUsername: 'Eleve_Ibou', examTitle: 'Devoir 1', score: 11, comment: '' });
    await api(a, 'recordExamResult', { courseId: course.id, studentUsername: 'Eleve_Ibou', examTitle: 'Devoir 2', score: 14, comment: '' });
    r = await api(b, 'issueCertificate', { courseId: course.id });
    expect(r.result).toMatchObject({ available: true, average: '12.5', courseTitle: 'Grammaire française niveau 1', trainerUsername: 'Prof_Fatou' });
    expect(r.result.code).toMatch(/^SG-[0-9A-F]{8}$/);
    expect(await suktum.storage.readJSON(`certcodelookup:${course.id}__Eleve_Ibou`)).toBe(r.result.code);
    expect(await suktum.storage.readJSON(`certverification:${r.result.code}`)).toMatchObject({ studentUsername: 'Eleve_Ibou', courseId: course.id, average: '12.5' });
    expect((await suktum.storage.readJSON('user:Eleve_Ibou')).isAlumnus).toBe(true);
    expect((await api(b, 'issueCertificate', { courseId: course.id })).result.code).toBe(r.result.code); // jamais réémis
  });

  test('parent / tuteur : lien approuvé par l’élève seul, Mode Familial réservé au parent lié', async ({ suktum }) => {
    const p = await suktum.openDevice('P');
    await suktum.signUp(p, 'Papa_Ndiaye');
    await suktum.dismissTour(p);
    const s = await suktum.openDevice('S');
    await suktum.signUp(s, 'Ibou_15', { minor: true });
    await suktum.dismissTour(s);
    expect(await api(p, 'requestParentLink', { studentUsername: 'Papa_Ndiaye' })).toMatchObject({ ok: false, message: 'Vous ne pouvez pas vous suivre vous-même' });
    expect(await api(p, 'requestParentLink', { studentUsername: 'Inconnu' })).toMatchObject({ ok: false, message: 'Ce compte n’existe pas' });
    expect(await api(p, 'toggleRestrictedMode', { studentUsername: 'Ibou_15', enabled: false })).toMatchObject({ ok: false, message: 'Lien parent-enfant non approuvé' });
    const r = await api(p, 'requestParentLink', { studentUsername: 'Ibou_15' });
    expect(r.ok).toBe(true);
    expect(await api(p, 'requestParentLink', { studentUsername: 'Ibou_15' })).toMatchObject({ ok: false, message: 'Une demande est déjà en attente pour cet élève' });
    const key = `parentlinkrequest:${r.result.requestId}`;
    expect(await api(p, 'respondParentLink', { storageKey: key, approve: true })).toMatchObject({ ok: false, code: 'functions/permission-denied' });
    expect((await api(s, 'respondParentLink', { storageKey: key, approve: true })).result.found).toBe(true);
    expect(await suktum.storage.readJSON('parentlink:Papa_Ndiaye__Ibou_15')).toMatchObject({ approved: true });
    expect((await notifs(suktum)).some((n) => n.type === 'parent_link_approved' && n.toUser === 'Papa_Ndiaye')).toBe(true);
    expect(await suktum.storage.readJSON('restrictedmode:Ibou_15')).toBe(true); // posé à l'inscription 13–17
    expect((await api(p, 'toggleRestrictedMode', { studentUsername: 'Ibou_15', enabled: false })).result.enabled).toBe(false);
    expect(await suktum.storage.readJSON('restrictedmode:Ibou_15')).toBe(false);
    expect((await api(p, 'toggleRestrictedMode', { studentUsername: 'Ibou_15', enabled: true })).result.enabled).toBe(true);
    expect(await suktum.storage.readJSON('restrictedmode:Ibou_15')).toBe(true);
  });

  // Règles strictes générées par l'orchestrateur : à activer pour vérifier.
  test.fixme('tentative de triche : s’accorder un abonnement, un accès financé, un rôle formateur ou une inscription est refusé', async ({ suktum }) => {
    const { a, b } = await trainerAndStudent(suktum);
    const course = await createActiveCourse(suktum, a);
    expect(await suktum.cheatWrite(b, 'edusubscription:Eleve_Ibou', { username: 'Eleve_Ibou', price: 0, expiresAt: '2099-01-01T00:00:00.000Z', cancelled: false })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'user:Eleve_Ibou', { ...(await suktum.storage.readJSON('user:Eleve_Ibou')), stateFunded: true, isTrainer: true })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, `enrollment:${course.id}__Eleve_Ibou`, { courseId: course.id, studentUsername: 'Eleve_Ibou', trainerUsername: 'Prof_Fatou', price: 0, status: 'approved' })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, `courseleave:${course.id}__Eleve_Ibou__1`, { courseId: course.id, studentUsername: 'Eleve_Ibou', wasPaid: true, pricePaid: 1, leftAt: new Date().toISOString() })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, `course:${course.id}`, { ...course, status: 'active', price: 1 })).toBe('permission-denied');
    expect(await suktum.cheatWrite(b, 'coinbalance:Awa', 999999)).toBe('permission-denied');
  });
});
