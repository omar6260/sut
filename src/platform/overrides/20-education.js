// Surcharges Espace Éducation (phase 06) : abonnement/essai, accès financé, inscriptions, formateurs, cours, notes,
// quiz/examens, attestations, badges, parent/tuteur. Chargé après les scripts legacy et avant 20-init.js.
// Toute décision (statut, prix, éligibilité, bonne réponse) vient du serveur ; écrans, toasts et enchaînements sont
// ceux du prototype (fonctions de rendu legacy réutilisées ; deux rendus recopiés car la forme des données a changé :
// les bonnes réponses ne sont plus dans les documents lus par les élèves).
(function () {
  const P = window.SuktumPlatform;
  if (window.__SUKTUM_STORAGE_INJECTED || !P || !P.api || !P.env) return; // pas de plateforme (tests mémoire) → legacy intact
  const call = (name, data) => P.api.call(name, Object.assign({ currentUser, username: currentUser }, data)); // le serveur Éducation attend `username`
  const fail = (e) => { showToast(e.message || 'Erreur serveur'); };
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const clear = (...ids) => { for (const id of ids) { const el = document.getElementById(id); if (el) el.value = ''; } };
  const fr = (n) => Number(n || 0).toLocaleString('fr-FR');

  // ---- Essai gratuit (ensureTrialStarted l. 16769-16775) : posé une seule fois par le serveur ----
  window.ensureTrialStarted = async function (username) {
    if (username !== currentUser) return;
    try { await call('startTrial', {}); } catch (e) { /* hors ligne : l'essai démarrera à la prochaine ouverture */ }
  };

  // ---- Abonnement Éducation (subscribeToEducationSpace l. 17004-17018) ----
  window.subscribeToEducationSpace = async function () {
    let r;
    try { r = await call('subscribeEducation', {}); } catch (e) { fail(e); return; }
    if (r.autoApproved) { showToast('Accès Espace Éducation activé automatiquement ✓'); await renderEducationHub(); return; }
    const instructions = await getPaymentInstructions(currentUserCountry);
    alert('Pour accéder à l’Espace Éducation (' + fr(r.price) + ' FCFA/mois) :\n\n' + instructions + '\n\nVotre accès sera activé dès que votre paiement sera vérifié, et à renouveler chaque mois.');
    showToast('Demande envoyée — en attente de validation ✓');
    await renderEducationHub();
  };
  window.approveEduSubRequest = async function (id) { // l. 17028-17042
    try { await call('approveEduSub', { id }); } catch (e) { fail(e); return; }
    showToast('Accès Espace Éducation activé ✓');
    await loadEducationAdmin(); await loadEducationOverview();
  };
  window.rejectEduSubRequest = async function (id) { // l. 17044-17048
    try { await call('rejectEduSub', { id }); } catch (e) { fail(e); return; }
    showToast('Demande rejetée');
    await loadEducationAdmin();
  };
  window.cancelEduSubscription = async function () { // l. 16733-16742
    const sub = await safeGet('edusubscription:' + currentUser, true);
    if (!sub) return;
    if (!confirm('Annuler votre abonnement Espace Éducation ? Vous garderez l’accès jusqu’au ' + new Date(sub.expiresAt).toLocaleDateString('fr-FR') + ', mais il ne sera plus renouvelé après cette date.')) return;
    let r;
    try { r = await call('cancelEduSub', {}); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Abonnement annulé — accès conservé jusqu’au ' + new Date(r.expiresAt).toLocaleDateString('fr-FR'));
    await renderEduSubscriptionStatusCard(); await renderMySubscriptions();
  };
  window.reactivateEduSubscription = async function () { // l. 16743-16752
    let r;
    try { r = await call('reactivateEduSub', {}); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Renouvellement réactivé ✓');
    await renderEduSubscriptionStatusCard(); await renderMySubscriptions();
  };

  // ---- Accès financé par l'État ----
  window.submitStateFundedRequest = async function () { // l. 16793-16803
    const reason = val('state-funded-reason-input').trim();
    if (!reason) { showToast('Précisez le programme ou l’organisme'); return; }
    try { await call('requestStateFunded', { reason }); } catch (e) { fail(e); return; }
    clear('state-funded-reason-input');
    showToast('Demande envoyée à l’administration ✓');
    go('education-hub');
  };
  window.approveStateFundedRequest = async function (id) { // l. 16984-16994
    let r;
    try { r = await call('approveStateFunded', { id }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Demande approuvée — accès financé accordé ✓');
    await loadEducationAdmin();
  };
  window.rejectStateFundedRequest = async function (id) { // l. 16996-17002
    try { await call('rejectStateFunded', { id }); } catch (e) { fail(e); return; }
    showToast('Demande refusée');
    await loadEducationAdmin();
  };
  window.grantStateFundedAccess = async function () { // l. 16963-16975
    const username = val('state-funded-username').trim();
    if (!username) { showToast('Renseignez un nom d’utilisateur'); return; }
    let r;
    try { r = await call('grantStateFunded', { username }); } catch (e) { fail(e); return; }
    if (!r.found) { showToast('Ce compte n’existe pas'); return; }
    clear('state-funded-username');
    showToast('Accès financé par l’État accordé ✓');
    await loadEducationAdmin();
  };
  window.revokeStateFundedAccess = async function (username) { // l. 16976-16983
    let r;
    try { r = await call('revokeStateFunded', { username }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Accès financé retiré');
    await loadEducationAdmin();
  };
  window.redeemActivationCode = async function () { // l. 16946-16961
    const input = document.getElementById('activation-code-input');
    const code = (input ? input.value : '').trim().toUpperCase();
    if (!code) { showToast('Saisissez un code'); return; }
    try { await call('redeemActivationCode', { code }); } catch (e) { fail(e); return; }
    showToast('Code activé ✓ — accès financé accordé');
    await renderEducationHub();
  };
  window.generateActivationCodes = async function () { // l. 16853-16866
    const count = Math.max(1, Math.min(200, parseInt(val('activation-code-count'), 10) || 0));
    const label = val('activation-code-batch-label').trim() || 'Cohorte sans nom';
    if (!count) { showToast('Renseignez un nombre de codes valide'); return; }
    let r;
    try { r = await call('generateActivationCodes', { count, label }); } catch (e) { fail(e); return; }
    clear('activation-code-count', 'activation-code-batch-label');
    showToast(r.count + ' code(s) générés ✓');
    await renderActivationCodeBatches();
  };
  window.importStudentListCSV = async function () { // l. 16834-16851 (le fichier est lu ici, les comptes sont traités par le serveur)
    const fileInput = document.getElementById('csv-import-file-input');
    const courseId = val('csv-import-course-select');
    const file = fileInput && fileInput.files[0];
    if (!file) { showToast('Choisissez un fichier CSV'); return; }
    if (!courseId) { showToast('Choisissez un cours'); return; }
    const text = await file.text();
    const usernames = text.split(/\r?\n/).map((l) => l.trim().replace(/^"|"$/g, '')).filter(Boolean);
    if (usernames.length === 0) { showToast('Choisissez un fichier CSV'); return; }
    let r;
    try { r = await call('importStudents', { courseId, usernames }); } catch (e) { fail(e); return; }
    document.getElementById('csv-import-result').innerHTML =
      '<p style="margin:0 0 4px; font-size:12.5px; color:var(--lagoon);">✓ ' + r.enrolledCount + ' compte(s) trouvé(s) et inscrit(s)</p>' +
      (r.notFound.length > 0 ? '<p style="margin:0; font-size:12px; color:var(--coral);">✕ ' + r.notFound.length + ' introuvable(s) : ' + r.notFound.map(escapeHtml).join(', ') + '</p>' : '');
    fileInput.value = '';
    showToast('Import terminé ✓');
  };

  // ---- Inscriptions (enrollInCourse l. 17603-17662) ----
  window.enrollInCourse = async function (courseId) {
    const c = await safeGet('course:' + courseId, true);
    if (!c) return;
    let r;
    try { r = await call('enroll', { courseId }); } catch (e) { fail(e); return; }
    if (r.outcome === 'stateFunded') showToast('Inscription automatiquement validée — accès financé par l’État ✓');
    else if (r.outcome === 'trial') showToast('Accès gratuit pendant votre essai — profitez-en pour découvrir ce cours ✓');
    else if (r.outcome === 'reEnrollment') showToast('Réinscription validée — vous aviez déjà payé ce cours, aucun nouveau paiement requis ✓');
    else if (r.outcome === 'autoApproved') showToast('Inscription validée automatiquement ✓');
    else {
      const instructions = await getPaymentInstructions(currentUserCountry);
      alert('Pour rejoindre "' + r.title + '" (' + fr(r.price) + ' FCFA) :\n\n' + instructions);
      showToast('Inscription envoyée — en attente de validation ✓');
    }
    await openCourseDetail(courseId);
  };
  window.approveEnrollment = async function (enrollmentKey) { // l. 15453-15461
    let r;
    try { r = await call('approveEnrollment', { enrollmentKey }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Inscription validée — étudiant automatiquement abonné au formateur ✓');
    await loadEducationAdmin(); await loadEducationOverview();
  };
  window.rejectEnrollment = async function (enrollmentKey) { // l. 15463-15467
    try { await call('rejectEnrollment', { enrollmentKey }); } catch (e) { fail(e); return; }
    showToast('Inscription rejetée');
    await loadEducationAdmin();
  };
  window.leaveCourseAsStudent = async function (courseId) { // l. 17385-17406
    const enrollment = await fetchEnrollment(courseId, currentUser);
    if (!enrollment || enrollment.status !== 'approved') return;
    const c = await safeGet('course:' + courseId, true);
    if (!confirm('Quitter « ' + (c ? c.title : 'ce cours') + ' » ? Vous perdrez l’accès aux leçons et devrez vous réinscrire pour y revenir.')) return;
    const reason = prompt('Un mot sur votre départ, pour aider le formateur à s’améliorer ? (facultatif, laissez vide pour passer)');
    let r;
    try { r = await call('leaveCourse', { courseId, reason: reason && reason.trim() ? reason.trim() : null }); } catch (e) { fail(e); return; }
    if (!r.left) return;
    showToast('Vous avez quitté ce cours');
    go('education-hub');
  };
  window.requestStudentRemoval = async function (courseId, studentUsername) { // l. 20834-20842
    const reason = prompt('Pourquoi demandez-vous le retrait de @' + studentUsername + ' ? (l’administration décidera)');
    if (reason === null || !reason.trim()) return;
    try { await call('requestStudentRemoval', { courseId, studentUsername, reason: reason.trim() }); } catch (e) { fail(e); return; }
    showToast('Demande envoyée à l’administration ✓');
    await renderManageCourseStudents();
  };
  window.approveStudentRemoval = async function (storageKey) { // l. 20851-20858
    try { await call('approveStudentRemoval', { storageKey }); } catch (e) { fail(e); return; }
    showToast('Élève retiré du cours ✓');
    await loadEducationAdmin();
  };
  window.rejectStudentRemoval = async function (storageKey) { // l. 20859-20865
    try { await call('rejectStudentRemoval', { storageKey }); } catch (e) { fail(e); return; }
    showToast('Demande de retrait refusée');
    await loadEducationAdmin();
  };

  // ---- Formateurs ----
  window.maybeAutoValidateTrainer = async function (requestId) { // l. 32306-32320 : l'IA (clé serveur) décide côté serveur ; silencieux en cas d'échec
    try { await call('applyTrainer', { requestId }); } catch (e) { /* la candidature reste en attente pour un humain */ }
  };
  window.approveTrainerRequest = async function (id) { // l. 15397-15408
    let r;
    try { r = await call('approveTrainer', { id }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Formateur validé ✓');
    await loadEducationAdmin(); await loadEducationOverview();
  };
  window.rejectTrainerRequest = async function (id) { // l. 15410-15416
    try { await call('rejectTrainer', { id }); } catch (e) { fail(e); return; }
    showToast('Candidature refusée');
    await loadEducationAdmin();
  };
  window.excludeTrainer = async function (username) { // l. 15715-15725
    const ok = confirm('Exclure @' + username + ' du statut formateur ? Ses cours existants resteront visibles sauf suspension manuelle.');
    if (!ok) return;
    let r;
    try { r = await call('excludeTrainer', { username }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Formateur exclu ✓');
    go('admin');
    await renderAdminTrainersList();
  };
  // grantSelfInstantTrainer l. 16692-16702 (auto-attribution du rôle) : supprimé ; la carte n'affiche plus le bouton.
  window.grantSelfInstantTrainer = async function () { showToast('Le statut formateur s’obtient par candidature validée'); };
  window.loadInstantTrainerCard = async function () { // l. 16680-16691
    const el = document.getElementById('admin-instant-trainer-card');
    if (!el) return;
    const me = await safeGet('user:' + currentUser, true);
    el.innerHTML = me && me.isTrainer
      ? '<p style="margin:0; font-size:13px; color:var(--lagoon);">✓ Vous avez déjà le statut formateur — vos cours se publient directement, sans validation.</p>'
      : '<p style="margin:0; font-size:12.5px; color:rgba(245,239,227,0.6);">Le statut formateur s’obtient par une candidature validée par l’équipe (Espace Éducation → Devenir formateur).</p>';
  };

  // ---- Cours ----
  window.createCourse = async function () { // l. 17984-18003
    const title = val('new-course-title').trim();
    const desc = val('new-course-desc').trim();
    const price = parseInt(val('new-course-price'), 10);
    const schoolLevel = val('new-course-level');
    const schoolClass = document.getElementById('new-course-class') ? document.getElementById('new-course-class').value : '';
    const examTarget = val('new-course-exam-target');
    if (!title || isNaN(price) || price <= 0) { showToast('Renseignez au moins un titre et un prix valide'); return; }
    let r;
    try { r = await call('createCourse', { title, description: desc, price, schoolLevel: schoolLevel || null, schoolClass: schoolClass || null, examTarget: examTarget || null }); } catch (e) { fail(e); return; }
    clear('new-course-title', 'new-course-desc', 'new-course-price', 'new-course-level', 'new-course-exam-target');
    updateCourseClassOptions();
    showToast(r.status === 'active' ? 'Cours publié ✓' : 'Cours envoyé pour validation avant publication ✓');
    await renderTrainerDashboard();
  };
  window.approveCourse = async function (courseId) { // l. 15426-15437
    let r;
    try { r = await call('reviewCourse', { courseId, action: 'approve' }); } catch (e) { fail(e); return; }
    if (!r.found && r.found !== undefined) return;
    showToast('Cours validé et publié ✓');
    await loadEducationAdmin(); await loadEducationOverview();
  };
  window.suspendCourse = async function (courseId) { // l. 15438-15447
    let r;
    try { r = await call('reviewCourse', { courseId, action: 'toggleSuspend' }); } catch (e) { fail(e); return; }
    if (!r.status) return;
    showToast(r.status === 'suspended' ? 'Cours suspendu' : 'Cours réactivé ✓');
    await loadEducationAdmin();
  };
  window.deleteCourseCompletely = async function (courseId) { // l. 15448-15452
    const c = await safeGet('course:' + courseId, true);
    if (!c) return;
    const ok = confirm('Supprimer définitivement "' + c.title + '" ? Toutes ses leçons, exercices, et données seront perdus. Cette action est irréversible.');
    if (!ok) return;
    try { await call('reviewCourse', { courseId, action: 'delete' }); } catch (e) { fail(e); return; }
    showToast('Cours supprimé définitivement');
    await loadEducationAdmin();
  };
  window.assignSubstitute = async function () { // l. 19199-19213
    const username = val('substitute-username-input').trim();
    const endDate = val('substitute-end-date-input');
    if (!username || !endDate) { showToast('Renseignez le nom d’utilisateur et la date de fin'); return; }
    if (new Date(endDate) < new Date()) { showToast('La date de fin doit être dans le futur'); return; }
    try { await call('setSubstitute', { courseId: currentManagedCourseId, substitute: username, endDate }); } catch (e) { fail(e); return; }
    showToast('Remplaçant désigné ✓');
    await renderSubstituteCard();
  };
  window.removeSubstitute = async function () { // l. 19214-19221
    try { await call('setSubstitute', { courseId: currentManagedCourseId, substitute: null, endDate: null }); } catch (e) { fail(e); return; }
    showToast('Remplaçant retiré');
    await renderSubstituteCard();
  };
  window.addCoTrainer = async function () { // l. 19238-19252
    const username = val('new-co-trainer-input').trim();
    if (!username) { showToast('Renseignez un nom d’utilisateur'); return; }
    if (username === currentUser) { showToast('Vous êtes déjà le formateur principal'); return; }
    try { await call('setCoTrainer', { courseId: currentManagedCourseId, coTrainer: username, action: 'add' }); } catch (e) { fail(e); return; }
    showToast('Co-formateur ajouté ✓');
    await renderCoTrainerManager();
  };
  window.removeCoTrainer = async function (username) { // l. 19253-19259
    try { await call('setCoTrainer', { courseId: currentManagedCourseId, coTrainer: username, action: 'remove' }); } catch (e) { fail(e); return; }
    showToast('Co-formateur retiré');
    await renderCoTrainerManager();
  };
  window.saveCertificateConditions = async function () { // l. 36632-36638
    if (!currentManagedCourseId) return;
    const avgRaw = val('cert-min-average'), attRaw = val('cert-min-attendance');
    const certMinAverage = avgRaw === '' ? null : parseFloat(avgRaw);
    const certMinAttendance = attRaw === '' ? null : parseInt(attRaw, 10);
    if ((certMinAverage !== null && isNaN(certMinAverage)) || (certMinAttendance !== null && isNaN(certMinAttendance))) { showToast('Entrez des seuils valides'); return; }
    try { await call('setCertificateConditions', { courseId: currentManagedCourseId, certMinAverage, certMinAttendance }); } catch (e) { fail(e); return; }
    showToast('Conditions enregistrées ✓');
  };

  // ---- Notes ----
  window.submitGrade = async function (storageKey, studentUsername) { // l. 17887-17909
    const scoreInput = document.getElementById('grade-score-' + studentUsername);
    const feedbackInput = document.getElementById('grade-feedback-' + studentUsername);
    const score = parseFloat(scoreInput.value);
    if (isNaN(score) || score < 0 || score > 20) { showToast('Entrez une note valide entre 0 et 20'); return; }
    const s = await safeGet(storageKey, true);
    if (!s) return;
    let justification = null;
    if (s.status === 'graded' && s.score !== score) {
      justification = prompt('Cette copie a déjà une note validée (' + s.score + '/20). Les notes validées sont immuables — pour la corriger, indiquez un motif précis qui sera conservé dans l’historique :');
      if (justification === null || !justification.trim()) { showToast('Correction annulée — la note validée reste inchangée'); return; }
      justification = justification.trim();
    }
    const aiSuggestion = lastAiGradeSuggestions[studentUsername];
    if (aiSuggestion !== undefined && Math.abs(aiSuggestion - score) >= 8) {
      const ok = confirm('⚠️ Votre note (' + score + '/20) s’écarte beaucoup de la suggestion IA (' + aiSuggestion + '/20). Confirmer quand même cette note ?');
      if (!ok) return;
    }
    try { await call('gradeSubmission', { storageKey, score, feedback: feedbackInput.value.trim(), justification }); } catch (e) { fail(e); return; }
    showToast('Note enregistrée ✓');
    await renderGradeExerciseSubmissions(); await renderManageCourseExercises();
  };
  window.submitFullExamGrade = async function (examId, student) { // l. 18426-18437
    const score = parseFloat(val('examfinal-' + examId + '-' + student));
    if (isNaN(score) || score < 0 || score > 20) { showToast('Entrez une note valide entre 0 et 20'); return; }
    const exam = await findFullExam(examId);
    if (!exam) { showToast('Examen introuvable'); return; }
    let r;
    try { r = await call('gradeExam', { courseId: exam.courseId, examId, student, score }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Note enregistrée ✓');
    await openFullExamSubmissions(examId);
  };
  window.submitContestScore = async function (storageKey, studentUsername) { // l. 20014-20022
    const score = parseFloat(val('contest-score-' + studentUsername));
    if (isNaN(score) || score < 0 || score > 20) { showToast('Entrez une note valide entre 0 et 20'); return; }
    let r;
    try { r = await call('gradeContest', { storageKey, score }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Note enregistrée ✓');
    await renderManageContestEntries();
  };
  window.recordExamResult = async function () { // l. 20101-20115
    const studentUsername = val('new-exam-student');
    const examTitle = val('new-exam-title').trim();
    const score = parseFloat(val('new-exam-score'));
    const comment = val('new-exam-comment').trim();
    if (!studentUsername || !examTitle || isNaN(score) || score < 0 || score > 20) { showToast('Renseignez l’élève, le nom de l’examen, et une note valide entre 0 et 20'); return; }
    try { await call('recordExamResult', { courseId: currentManagedCourseId, studentUsername, examTitle, score, comment }); } catch (e) { fail(e); return; }
    clear('new-exam-title', 'new-exam-score', 'new-exam-comment');
    showToast('Résultat enregistré ✓');
    await renderManageCourseExamResults();
  };

  // ---- Quiz : la bonne réponse n'est plus dans le document `quiz:` (correction serveur) ----
  window.createCourseQuiz = async function () { // l. 18565-18580
    const title = val('new-quiz-title').trim();
    const question = val('new-quiz-question').trim();
    const options = [0, 1, 2, 3].map((i) => val('new-quiz-option-' + i).trim()).filter(Boolean);
    const correctIndex = parseInt(val('new-quiz-correct'), 10);
    if (!title || !question || options.length < 2) { showToast('Renseignez le titre, la question, et au moins 2 options'); return; }
    if (correctIndex >= options.length) { showToast('La bonne réponse doit correspondre à une option renseignée'); return; }
    try { await call('createQuiz', { courseId: currentManagedCourseId, title, question, options, correctIndex }); } catch (e) { fail(e); return; }
    clear('new-quiz-title', 'new-quiz-question', 'new-quiz-option-0', 'new-quiz-option-1', 'new-quiz-option-2', 'new-quiz-option-3');
    showToast('QCM créé ✓');
    await renderManageCourseQuizzes();
  };
  window.renderManageCourseQuizzes = async function () { // l. 18589-18599 : bonnes réponses demandées au serveur (gestionnaires seulement)
    const el = document.getElementById('manage-course-quizzes-list');
    if (!el) return;
    const quizzes = await fetchCourseQuizzes(currentManagedCourseId);
    if (quizzes.length === 0) { el.innerHTML = '<div class="empty">Aucun QCM pour l’instant.</div>'; return; }
    let answers = { quiz: {} };
    try { answers = await call('courseAnswers', { courseId: currentManagedCourseId }); } catch (e) { /* affichage sans la bonne réponse */ }
    el.innerHTML = quizzes.map((q) => {
      const ci = answers.quiz[q.id];
      return '<div class="card"><p style="margin:0 0 4px; font-size:13px; font-weight:600;">' + escapeHtml(q.title) + '</p>' +
        '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.6);">Bonne réponse : ' + escapeHtml(ci !== undefined && q.options[ci] !== undefined ? q.options[ci] : '—') + '</p></div>';
    }).join('');
  };
  window.openCourseQuiz = async function (quizId, courseId) { // l. 18604-18624 : après réponse, la bonne réponse vient de la copie corrigée par le serveur
    if (!(await requireEducationSubscription())) return;
    go('course-quiz');
    const el = document.getElementById('course-quiz-content');
    const quizzes = await fetchCourseQuizzes(courseId);
    const q = quizzes.find((x) => x.id === quizId);
    if (!q) { el.innerHTML = '<div class="empty">Quiz introuvable.</div>'; return; }
    const existing = await safeGet('quizsubmission:' + quizId + '__' + currentUser, true);
    const letters = ['A', 'B', 'C', 'D'];
    if (existing) {
      el.innerHTML =
        '<p style="margin:0 0 16px; font-size:14px; font-weight:600;">' + escapeHtml(q.question) + '</p>' +
        q.options.map((opt, i) => {
          const isCorrect = i === existing.correctIndex;
          const wasSelected = i === existing.selectedIndex;
          const color = isCorrect ? 'var(--lagoon)' : (wasSelected ? 'var(--coral)' : 'var(--line)');
          return '<div style="border:1px solid ' + color + '; border-radius:10px; padding:10px 12px; margin-bottom:8px; font-size:13px;">' + letters[i] + '. ' + escapeHtml(opt) + (isCorrect ? ' ✓' : (wasSelected ? ' ✕' : '')) + '</div>';
        }).join('') +
        '<p style="margin:12px 0 0; font-size:14px; color:' + (existing.correct ? 'var(--lagoon)' : 'var(--coral)') + '; font-weight:700;">' + (existing.correct ? '✓ Bonne réponse !' : '✕ Réponse incorrecte') + '</p>';
    } else {
      el.innerHTML =
        '<p style="margin:0 0 16px; font-size:14px; font-weight:600;">' + escapeHtml(q.question) + '</p>' +
        q.options.map((opt, i) =>
          '<button class="btn btn-outline" style="width:100%; margin-bottom:8px; text-align:left;" onclick="submitQuizAnswer(\'' + quizId + '\', \'' + courseId + '\', ' + i + ')">' + letters[i] + '. ' + escapeHtml(opt) + '</button>'
        ).join('');
    }
  };
  window.submitQuizAnswer = async function (quizId, courseId, selectedIndex) { // l. 18625-18634
    let r;
    try { r = await call('answerQuiz', { quizId, courseId, selectedIndex }); } catch (e) { fail(e); return; }
    showToast(r.correct ? 'Bonne réponse ✓' : 'Réponse incorrecte');
    await openCourseQuiz(quizId, courseId);
  };

  // ---- Examens complets : `questions[].correctIndex` n'est plus dans le document public ----
  async function findFullExam(examId) { // l. 18265-18269
    const keys = await safeList('fullexam:', true);
    for (const k of keys) { const e = await safeGet(k, true); if (e && e.id === examId) return e; }
    return null;
  }
  window.publishFullExam = async function () { // l. 18370-18385
    const title = val('new-exam-title-full').trim();
    const desc = val('new-exam-desc-full').trim();
    if (!title) { showToast('Donnez un titre à l’examen'); return; }
    if (examBuilderQuestions.length === 0) { showToast('Ajoutez au moins une question'); return; }
    try { await call('publishFullExam', { courseId: currentManagedCourseId, title, description: desc, questions: examBuilderQuestions }); } catch (e) { fail(e); return; }
    clear('new-exam-title-full', 'new-exam-desc-full');
    examBuilderQuestions = [];
    renderExamBuilderQuestionsList();
    showToast('Examen publié ✓');
    await renderManageCourseFullExams();
  };
  window.submitFullExam = async function () { // l. 18519-18545
    const exam = await findFullExam(currentTakeExamId);
    if (!exam) return;
    const answers = exam.questions.map((q, i) => {
      if (q.type === 'qcm') {
        const checked = document.querySelector('input[name="exam-answer-' + i + '"]:checked');
        return { type: 'qcm', selectedIndex: checked ? parseInt(checked.value, 10) : null };
      }
      return { type: 'open', text: (document.getElementById('exam-answer-' + i).value || '').trim() };
    });
    if (answers.some((a) => (a.type === 'qcm' && a.selectedIndex === null) || (a.type === 'open' && !a.text))) { showToast('Répondez à toutes les questions avant d’envoyer'); return; }
    try { await call('takeFullExam', { examId: currentTakeExamId, courseId: exam.courseId, answers }); } catch (e) { fail(e); return; }
    showToast('Copie envoyée ✓');
    setExamLockMode(false);
    await openCourseDetail(exam.courseId);
  };
  window.openFullExamSubmissions = async function (examId) { // l. 18262-18300 : les QCM sont pré-corrigés par le serveur (copie.qcmAutoScore / qcmCount)
    currentGradingExamId = examId;
    go('grade-full-exam');
    const exam = await findFullExam(examId);
    if (!exam) { showToast('Examen introuvable'); return; }
    document.getElementById('grade-exam-title').textContent = exam.title;
    const enrollmentKeys = await safeList('enrollment:' + exam.courseId + '__', true);
    const students = [];
    for (const k of enrollmentKeys) { const e = await safeGet(k, true); if (e && e.courseId === exam.courseId && e.status === 'approved') students.push(e.studentUsername); }
    const el = document.getElementById('grade-exam-submissions');
    const parts = [];
    for (const student of students) {
      const sub = await safeGet('fullexamsubmission:' + examId + '__' + student, true);
      if (!sub) continue;
      const qcmAutoScore = sub.qcmAutoScore || 0, qcmCount = sub.qcmCount || 0;
      parts.push('<div class="card"><p style="margin:0 0 8px; font-size:13px; font-weight:600;">@' + escapeHtml(student) + '</p>' +
        (qcmCount > 0 ? '<p style="margin:0 0 8px; font-size:12px; color:var(--lagoon);">✓ QCM auto-corrigés : ' + qcmAutoScore + '/' + qcmCount + ' bonnes réponses</p>' : '') +
        exam.questions.map((q, i) => q.type === 'open'
          ? '<div style="margin-bottom:10px; padding:8px; background:rgba(245,239,227,0.05); border-radius:8px;">' +
            '<p style="margin:0 0 4px; font-size:11.5px; color:rgba(245,239,227,0.5);">Q' + (i + 1) + '. ' + escapeHtml(q.question) + '</p>' +
            '<p style="margin:0 0 8px; font-size:13px;">' + escapeHtml((sub.answers[i] && sub.answers[i].text) || '') + '</p>' +
            (sub.status !== 'graded' ? '<button class="btn btn-outline btn-sm" onclick="suggestFullExamAnswer(\'' + examId + '\', \'' + escapeHtml(student) + '\', ' + i + ')">🧠 Suggestion IA</button><div id="examq-suggestion-' + examId + '-' + escapeHtml(student) + '-' + i + '" style="margin-top:6px; font-size:11.5px; color:var(--gold);"></div>' : '') +
            '</div>'
          : ''
        ).join('') +
        (sub.status === 'graded'
          ? '<p style="margin:0; font-size:13px; color:var(--lagoon); font-weight:600;">✓ Note finale : ' + sub.totalScore + '/20</p>'
          : '<label style="margin-top:0;">Note finale sur 20</label><input type="number" min="0" max="20" id="examfinal-' + examId + '-' + escapeHtml(student) + '" placeholder="Ex : 14"><button class="btn btn-primary btn-sm" style="margin-top:8px;" onclick="submitFullExamGrade(\'' + examId + '\', \'' + escapeHtml(student) + '\')">Valider la note finale</button>') +
        '</div>');
    }
    el.innerHTML = parts.length === 0 ? '<div class="empty">Aucune copie reçue pour l’instant.</div>' : parts.join('');
  };

  // ---- Attestation (openCourseCertificate l. 20653-20701) : éligibilité, moyenne, code et `isAlumnus` fixés par le serveur ----
  window.openCourseCertificate = async function (courseId) {
    if (!(await requireEducationSubscription())) return;
    const alreadySurveyed = await safeGet('coursesurvey:' + courseId + '__' + currentUser, true);
    if (!alreadySurveyed) { currentSurveyCourseId = courseId; go('course-survey'); return; }
    go('course-certificate');
    const el = document.getElementById('course-certificate-content');
    el.innerHTML = '<p style="font-size:13px; color:rgba(245,239,227,0.5);">Génération...</p>';
    let r;
    try { r = await call('issueCertificate', { courseId }); } catch (e) { el.innerHTML = '<div class="empty">Attestation indisponible.</div>'; fail(e); return; }
    if (!r.available) {
      el.innerHTML = r.missingReasons ? '<div class="empty">🔒 Attestation pas encore disponible.<br><br>Ce cours requiert : ' + escapeHtml(r.missingReasons.join(' et ')) + '.</div>' : '<div class="empty">Attestation indisponible.</div>';
      return;
    }
    const now = new Date().toLocaleDateString('fr-FR');
    el.innerHTML =
      '<div style="text-align:center; border:2px solid var(--gold); border-radius:14px; padding:28px 20px;">' +
      '<p style="margin:0; font-size:11px; color:rgba(245,239,227,0.5); letter-spacing:.1em;">SUKTUM — ESPACE ÉDUCATION</p>' +
      '<h2 style="margin:14px 0 4px; font-size:20px; font-family:\'Baloo 2\';">Attestation de suivi</h2>' +
      '<p style="margin:0 0 20px; font-size:12px; color:rgba(245,239,227,0.5);">Délivrée le ' + now + '</p>' +
      '<p style="margin:0 0 4px; font-size:13px;">Ceci atteste que</p>' +
      '<p style="margin:0 0 16px; font-size:19px; font-family:\'Baloo 2\'; font-weight:700; color:var(--gold);">@' + escapeHtml(currentUser) + '</p>' +
      '<p style="margin:0 0 4px; font-size:13px;">a suivi le cours</p>' +
      '<p style="margin:0 0 16px; font-size:16px; font-weight:700;">« ' + escapeHtml(r.courseTitle) + ' »</p>' +
      '<p style="margin:0 0 20px; font-size:13px;">dispensé par <strong>@' + escapeHtml(r.trainerUsername) + '</strong></p>' +
      (r.average ? '<p style="margin:0; font-size:13px;">Moyenne obtenue : <strong style="color:var(--gold); font-size:16px;">' + escapeHtml(r.average) + '/20</strong></p>' : '<p style="margin:0; font-size:12px; color:rgba(245,239,227,0.5);">Aucune évaluation notée pour l’instant.</p>') +
      '<p style="margin:20px 0 0; font-size:11px; color:rgba(245,239,227,0.5); border-top:1px solid var(--line); padding-top:14px;">Code de vérification</p>' +
      '<p style="margin:2px 0 10px; font-size:15px; font-family:\'Courier New\', monospace; letter-spacing:.08em; color:var(--lagoon);">' + escapeHtml(r.code) + '</p>' +
      '<img src="https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=' + encodeURIComponent('SUNU_GAAL_CERT:' + r.code) + '" style="width:130px; height:130px; border-radius:8px; background:white; padding:6px;">' +
      '<p style="margin:8px 0 0; font-size:10.5px; color:rgba(245,239,227,0.4);">Scannez ce code, ou saisissez-le sur "Vérifier une attestation" depuis Explorer.</p>' +
      '</div>';
  };
  window.ensureCertificateVerificationCode = async function (courseId, studentUsername) { // l. 20575-20592 : émis par issueCertificate
    return safeGet('certcodelookup:' + courseId + '__' + studentUsername, true);
  };

  // ---- Badges (awardStudentBadge l. 18325-18337) ----
  window.awardStudentBadge = async function () {
    const studentUsername = val('new-badge-student');
    const badgeName = val('new-badge-type');
    const message = val('new-badge-message').trim();
    if (!studentUsername || !badgeName) { showToast('Choisissez un élève et un badge'); return; }
    try { await call('awardBadge', { courseId: currentManagedCourseId, studentUsername, badgeName, message }); } catch (e) { fail(e); return; }
    clear('new-badge-message');
    showToast('Badge décerné ✓');
    await renderManageCourseBadges();
  };

  // ---- Parent / tuteur ----
  window.requestParentLink = async function () { // l. 20140-20155
    const studentUsername = val('parent-link-username').trim();
    if (!studentUsername) { showToast('Renseignez le nom d’utilisateur de l’élève'); return; }
    if (studentUsername === currentUser) { showToast('Vous ne pouvez pas vous suivre vous-même'); return; }
    try { await call('requestParentLink', { studentUsername }); } catch (e) { fail(e); return; }
    clear('parent-link-username');
    showToast('Demande envoyée — en attente d’approbation de l’élève ✓');
    await renderParentSpace();
  };
  window.approveParentLink = async function (storageKey) { // l. 20204-20214
    let r;
    try { r = await call('respondParentLink', { storageKey, approve: true }); } catch (e) { fail(e); return; }
    if (!r.found) return;
    showToast('Suivi autorisé ✓');
    await renderStudentParentRequests();
  };
  window.rejectParentLink = async function (storageKey) { // l. 20215-20220
    try { await call('respondParentLink', { storageKey, approve: false }); } catch (e) { fail(e); return; }
    showToast('Demande refusée');
    await renderStudentParentRequests();
  };
  window.toggleRestrictedMode = async function (studentUsername) { // l. 20163-20169
    const box = document.getElementById('restricted-' + studentUsername);
    const checked = !!(box && box.checked);
    try { await call('toggleRestrictedMode', { studentUsername, enabled: checked }); } catch (e) { if (box) box.checked = !checked; fail(e); return; }
    showToast(checked ? 'Mode Familial activé pour @' + studentUsername + ' ✓' : 'Mode Familial désactivé');
  };
})();
